import { useState, useRef, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Upload, FileText, Globe, BookOpen, Trash2, RotateCcw, Loader2, AlertTriangle, ChevronDown, Send, LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/auth"
import { apiFetch, apiJson, errorMessage, streamChat, type ChatMessage, type Doc, type Source } from "@/lib/api"

const MAX_UPLOAD_MB = 10

const SUGGESTIONS = [
  "Summarize the key ideas of this document",
  "What are the most important definitions?",
  "Explain the hardest concept in simple terms",
  "Quiz me with 3 questions on this material",
]

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function ChatPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [documents, setDocuments] = useState<Doc[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isAnswering, setIsAnswering] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enableWebSearch, setEnableWebSearch] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selected = documents.find((d) => d.id === selectedId) ?? null

  const showError = (message: string) => {
    setError(message)
    setTimeout(() => setError(null), 5000)
  }

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await apiJson<Doc[]>("/documents")
      setDocuments(docs)
      setSelectedId((current) => current ?? docs[0]?.id ?? null)
    } catch (e) {
      console.error("Failed to load documents", e)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  // Poll while any document is still being ingested
  const anyProcessing = documents.some((d) => d.status === "processing")
  useEffect(() => {
    if (!anyProcessing) return
    const timer = setInterval(loadDocuments, 3000)
    return () => clearInterval(timer)
  }, [anyProcessing, loadDocuments])

  // Load the conversation of the selected document
  useEffect(() => {
    setMessages([])
    if (!selectedId) return
    let cancelled = false
    apiJson<ChatMessage[]>(`/documents/${selectedId}/messages`)
      .then((m) => { if (!cancelled) setMessages(m) })
      .catch((e) => console.error("Failed to load messages", e))
    return () => { cancelled = true }
  }, [selectedId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const uploadFile = async (file: File) => {
    if (file.type !== "application/pdf") return showError("Only PDF files are allowed")
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return showError(`File size must be less than ${MAX_UPLOAD_MB}MB`)

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await apiFetch("/documents", { method: "POST", body: formData })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorMessage(data, "Upload failed"))
      setDocuments((docs) => [data as Doc, ...docs])
      setSelectedId((data as Doc).id)
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to upload file. Please try again.")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const deleteDocument = async (doc: Doc) => {
    if (!confirm(`Delete "${doc.filename}" and its conversation and flashcards?`)) return
    try {
      await apiJson(`/documents/${doc.id}`, { method: "DELETE" })
      const rest = documents.filter((d) => d.id !== doc.id)
      setDocuments(rest)
      if (selectedId === doc.id) setSelectedId(rest[0]?.id ?? null)
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to delete document")
    }
  }

  const reprocessDocument = async (doc: Doc) => {
    try {
      const updated = await apiJson<Doc>(`/documents/${doc.id}/reprocess`, { method: "POST" })
      setDocuments((docs) => docs.map((d) => (d.id === doc.id ? updated : d)))
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to reprocess document")
    }
  }

  const sendMessage = async (text = input) => {
    const question = text.trim()
    if (!question || !selected || selected.status !== "ready" || isAnswering) return

    const assistantId = `pending-${Date.now()}`
    setMessages((m) => [
      ...m,
      { id: `user-${Date.now()}`, role: "user", content: question },
      { id: assistantId, role: "assistant", content: "", sources: null },
    ])
    setInput("")
    setIsAnswering(true)

    const updateAssistant = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((all) => all.map((m) => (m.id === assistantId ? fn(m) : m)))

    try {
      await streamChat({ document_id: selected.id, question, enable_search: enableWebSearch }, (event) => {
        if (event.type === "sources") {
          updateAssistant((m) => ({ ...m, sources: [...event.sources, ...event.web.map((w) => ({ ...w, web: true }))] }))
        } else if (event.type === "token") {
          updateAssistant((m) => ({ ...m, content: m.content + event.content }))
        } else if (event.type === "error") {
          throw new Error(event.detail)
        }
      })
    } catch (e) {
      updateAssistant((m) => ({
        ...m,
        content: `⚠️ Sorry, I couldn't answer that. ${e instanceof Error ? e.message : "Please try again."}`,
        sources: null,
      }))
    } finally {
      setIsAnswering(false)
    }
  }

  return (
    <div className="h-screen bg-black text-white flex">
      {/* Sidebar: documents */}
      <aside className="w-80 shrink-0 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/aze-removebg-preview.png" alt="Athena AI Logo" className="h-8 w-8 object-contain" />
            <span className="font-bold">Athena AI</span>
          </Link>
          <button onClick={auth.logout} className="text-gray-500 hover:text-white" title="Log out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {isUploading ? "Uploading…" : "Upload PDF"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
            className="hidden"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {documents.length === 0 && <p className="text-sm text-gray-500 text-center mt-6">No documents yet.</p>}
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => setSelectedId(doc.id)}
              className={`group p-3 rounded-lg cursor-pointer border transition ${doc.id === selectedId ? "bg-blue-950/60 border-blue-700" : "bg-gray-950 border-gray-800 hover:border-gray-700"}`}
            >
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{doc.filename}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                    {doc.status === "processing" && <><Loader2 className="w-3 h-3 animate-spin text-amber-400" /> {doc.queue_position ? "Queued…" : "Processing…"}</>}
                    {doc.status === "failed" && <><AlertTriangle className="w-3 h-3 text-red-400" /> Failed</>}
                    {doc.status === "ready" && <>{formatSize(doc.size)} · {doc.num_chunks} chunks</>}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteDocument(doc) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition"
                  title="Delete document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main: conversation */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{selected ? selected.filename : "Chat with your PDFs"}</h1>
            <p className="text-sm text-gray-400">Answers are grounded in your document, with page citations.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate(selected ? `/flashcards?doc=${selected.id}` : "/flashcards")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition"
              title="Practice with flashcards"
            >
              <BookOpen className="w-4 h-4" />
              <span className="text-xs font-medium">Flashcards</span>
            </button>
            <button
              onClick={() => setEnableWebSearch(!enableWebSearch)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${enableWebSearch ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
              title="Complement answers with web search results"
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium">Web {enableWebSearch ? "ON" : "OFF"}</span>
            </button>
            <div className="text-sm text-gray-400 hidden lg:block">{auth.user?.email}</div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {!selected && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]) }}
                onClick={() => fileInputRef.current?.click()}
                className="mt-16 border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-2xl p-12 text-center cursor-pointer transition"
              >
                <Upload className="w-14 h-14 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Drop a PDF here or click to upload</h3>
                <p className="text-gray-400">Lecture notes, papers, textbook chapters, up to {MAX_UPLOAD_MB}MB.</p>
              </div>
            )}

            {selected?.status === "processing" && (
              <div className="mt-16 text-center space-y-3">
                <Loader2 className="w-12 h-12 text-blue-400 mx-auto animate-spin" />
                {selected.queue_position ? (
                  <>
                    <h3 className="text-xl font-semibold">Waiting in line…</h3>
                    <p className="text-gray-400 max-w-md mx-auto text-sm">
                      {selected.queue_position} document{selected.queue_position === 1 ? " is" : "s are"} being
                      processed before this one. PDFs are read one at a time.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-semibold">Reading your PDF…</h3>
                    <p className="text-gray-400 max-w-md mx-auto text-sm">
                      Extracting text and layout, splitting it into passages and indexing them for search.
                      This takes a few seconds per page (longer the very first time, while models load).
                    </p>
                  </>
                )}
              </div>
            )}

            {selected?.status === "failed" && (
              <div className="mt-16 text-center space-y-3">
                <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
                <h3 className="text-xl font-semibold">We couldn't process this PDF</h3>
                <p className="text-gray-400 text-sm">{selected.error}</p>
                <Button onClick={() => reprocessDocument(selected)} variant="outline" className="border-gray-700">
                  <RotateCcw className="w-4 h-4 mr-2" /> Try again
                </Button>
              </div>
            )}

            {selected?.status === "ready" && messages.length === 0 && (
              <div className="mt-12 text-center">
                <h3 className="text-xl font-semibold mb-1">Ask anything about this document</h3>
                <p className="text-gray-400 text-sm mb-6">Or start with one of these:</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-left text-sm p-3 rounded-lg border border-gray-800 bg-gray-950 hover:border-blue-600 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selected?.status === "ready" && messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-blue-600 text-white">{m.content}</div>
                ) : (
                  <div className="max-w-full">
                    {m.content ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {m.sources ? "Thinking…" : "Searching your document…"}
                      </div>
                    )}
                    {m.sources && m.sources.length > 0 && <SourceList sources={m.sources} />}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-2 p-3 bg-red-900/20 border border-red-600 rounded-lg text-red-400 text-sm">{error}</div>
        )}

        <div className="px-6 pb-6">
          <div className="max-w-3xl mx-auto flex gap-3">
            <Input
              placeholder={selected?.status === "ready" ? "Ask a question about your PDF…" : "Upload a PDF to start chatting…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage() } }}
              disabled={selected?.status !== "ready"}
              className="flex-1 h-11 rounded-xl bg-gray-900 border border-gray-800 text-white disabled:opacity-50"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={isAnswering || !input.trim() || selected?.status !== "ready"}
              className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700"
            >
              {isAnswering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function SourceList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false)
  const docSources = sources.filter((s) => !s.web)
  const webSources = sources.filter((s) => s.web)

  return (
    <div className="mt-3 text-sm">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-gray-400 hover:text-white transition">
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        {docSources.length} passage{docSources.length === 1 ? "" : "s"} from your document
        {webSources.length > 0 && ` · ${webSources.length} web result${webSources.length === 1 ? "" : "s"}`}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {docSources.map((s, i) => (
            <div key={i} className="p-3 rounded-lg bg-gray-950 border border-gray-800">
              <div className="text-xs text-blue-400 mb-1">
                [{i + 1}] Page {s.page}{s.section ? ` · ${s.section}` : ""}
                {s.score !== undefined && <span className="text-gray-600"> · relevance {Math.round(s.score * 100)}%</span>}
              </div>
              <p className="text-gray-400 text-xs leading-relaxed line-clamp-4 whitespace-pre-line">{s.text}</p>
            </div>
          ))}
          {webSources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" className="block p-3 rounded-lg bg-gray-950 border border-gray-800 hover:border-gray-600">
              <div className="text-xs text-emerald-400 mb-1">[W{i + 1}] {s.title}</div>
              <p className="text-gray-400 text-xs line-clamp-2">{s.snippet}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default ChatPage
