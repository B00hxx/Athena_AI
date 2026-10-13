import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChatPage } from "./chat-page"
import { json, logIn, mockApi, ndjson, type MockRequest } from "@/test/api-mock"
import { renderPage } from "@/test/render"
import type { Doc } from "@/lib/api"

const doc = (overrides: Partial<Doc> = {}): Doc => ({
  id: "d1", filename: "photosynthesis.pdf", size: 3500, status: "ready", error: null, num_chunks: 3,
  created_at: "2026-10-13T10:00:00Z", ...overrides,
})

const SOURCES = [
  { text: "The enzyme RuBisCO fixes carbon dioxide in the stroma.", page: 3, section: "The Calvin Cycle", score: 0.71 },
  { text: "Photosystem II splits water.", page: 2, section: null, score: 0.4 },
]

beforeEach(() => logIn())

describe("ChatPage", () => {
  it("lists documents with their status", async () => {
    mockApi([
      ["GET", "/documents", [doc(), doc({ id: "d2", filename: "notes.pdf", status: "processing" }),
        doc({ id: "d3", filename: "scan.pdf", status: "failed", error: "No readable text" })]],
      ["GET", /\/messages$/, []],
    ])
    renderPage(<ChatPage />)

    expect(await screen.findByText("3 KB · 3 chunks")).toBeInTheDocument()
    expect(screen.getByText("notes.pdf").parentElement).toHaveTextContent("Processing…")
    expect(screen.getByText("scan.pdf").parentElement).toHaveTextContent("Failed")
  })

  it("loads the saved conversation of the selected document", async () => {
    mockApi([
      ["GET", "/documents", [doc()]],
      ["GET", "/documents/d1/messages", [
        { id: 1, role: "user", content: "What is RuBisCO?" },
        { id: 2, role: "assistant", content: "An **enzyme** [1].", sources: SOURCES },
      ]],
    ])
    renderPage(<ChatPage />)

    expect(await screen.findByText("What is RuBisCO?")).toBeInTheDocument()
    expect(screen.getByText("enzyme").tagName).toBe("STRONG") // answers render as Markdown
    expect(screen.getByText("2 passages from your document")).toBeInTheDocument()
  })

  it("streams an answer and shows its sources", async () => {
    let chatRequest: MockRequest | undefined
    mockApi([
      ["GET", "/documents", [doc()]],
      ["GET", "/documents/d1/messages", []],
      ["POST", "/chat", (req: MockRequest) => {
        chatRequest = req
        return ndjson([
          { type: "sources", sources: SOURCES, web: [] },
          { type: "token", content: "RuBisCO works " },
          { type: "token", content: "in the stroma [1]." },
          { type: "done", message_id: 9 },
        ])
      }],
    ])
    renderPage(<ChatPage />)

    const input = await screen.findByPlaceholderText("Ask a question about your PDF…")
    await userEvent.type(input, "Where does RuBisCO work?{Enter}")

    expect(await screen.findByText("RuBisCO works in the stroma [1].")).toBeInTheDocument()
    expect(chatRequest?.body).toEqual({ document_id: "d1", question: "Where does RuBisCO work?", enable_search: false })
    expect(input).toHaveValue("")

    await userEvent.click(screen.getByText("2 passages from your document"))
    expect(screen.getByText(/\[1\] Page 3 · The Calvin Cycle/)).toBeInTheDocument()
    expect(screen.getByText("relevance 71%", { exact: false })).toBeInTheDocument()
    expect(screen.getByText(SOURCES[0].text)).toBeInTheDocument()
  })

  it("sends a suggested question with one click", async () => {
    const { requests } = mockApi([
      ["GET", "/documents", [doc()]],
      ["GET", "/documents/d1/messages", []],
      ["POST", "/chat", () => ndjson([{ type: "sources", sources: [], web: [] }, { type: "done", message_id: 1 }])],
    ])
    renderPage(<ChatPage />)

    await userEvent.click(await screen.findByText("Summarize the key ideas of this document"))

    await waitFor(() => expect(requests.find((r) => r.path === "/chat")?.body)
      .toMatchObject({ question: "Summarize the key ideas of this document" }))
  })

  it("includes web search when toggled on", async () => {
    const { requests } = mockApi([
      ["GET", "/documents", [doc()]],
      ["GET", "/documents/d1/messages", []],
      ["POST", "/chat", () => ndjson([
        { type: "sources", sources: SOURCES, web: [{ title: "Calvin cycle - Wiki", url: "https://example.org", snippet: "..." }] },
        { type: "token", content: "Answer." },
        { type: "done", message_id: 1 },
      ])],
    ])
    renderPage(<ChatPage />)

    await userEvent.click(await screen.findByTitle("Complement answers with web search results"))
    await userEvent.type(screen.getByPlaceholderText("Ask a question about your PDF…"), "q{Enter}")

    expect(await screen.findByText(/1 web result/)).toBeInTheDocument()
    expect(requests.find((r) => r.path === "/chat")?.body).toMatchObject({ enable_search: true })
  })

  it("shows the error when the model fails mid-answer", async () => {
    mockApi([
      ["GET", "/documents", [doc()]],
      ["GET", "/documents/d1/messages", []],
      ["POST", "/chat", () => ndjson([
        { type: "sources", sources: SOURCES, web: [] },
        { type: "error", detail: "The language model failed to answer: timeout" },
      ])],
    ])
    renderPage(<ChatPage />)

    await userEvent.type(await screen.findByPlaceholderText("Ask a question about your PDF…"), "q{Enter}")

    expect(await screen.findByText(/Sorry, I couldn't answer that. The language model failed to answer: timeout/))
      .toBeInTheDocument()
  })

  it("uploads a PDF and selects it while it is processed", async () => {
    const { requests } = mockApi([
      ["GET", "/documents", []],
      ["POST", "/documents", () => json(doc({ id: "new", filename: "lecture.pdf", status: "processing" }), 202)],
      ["GET", "/documents/new/messages", []],
    ])
    const { container } = renderPage(<ChatPage />)
    await screen.findByText("No documents yet.")

    const file = new File(["%PDF-1.4"], "lecture.pdf", { type: "application/pdf" })
    await userEvent.upload(container.querySelector('input[type="file"]')!, file)

    expect(await screen.findByText("Reading your PDF…")).toBeInTheDocument()
    const upload = requests.find((r) => r.method === "POST" && r.path === "/documents")!
    expect((upload.body as FormData).get("file")).toBeInstanceOf(File)
    expect(screen.getByPlaceholderText("Upload a PDF to start chatting…")).toBeDisabled()
  })

  it("rejects non-PDF files without uploading", async () => {
    const { requests } = mockApi([["GET", "/documents", []]])
    const { container } = renderPage(<ChatPage />)
    await screen.findByText("No documents yet.")

    const user = userEvent.setup({ applyAccept: false })
    await user.upload(container.querySelector('input[type="file"]')!, new File(["hi"], "notes.txt", { type: "text/plain" }))

    expect(screen.getByText("Only PDF files are allowed")).toBeInTheDocument()
    expect(requests.filter((r) => r.method === "POST")).toHaveLength(0)
  })

  it("shows upload errors from the server", async () => {
    mockApi([
      ["GET", "/documents", []],
      ["POST", "/documents", () => json({ detail: "File is not a valid PDF" }, 400)],
    ])
    const { container } = renderPage(<ChatPage />)
    await screen.findByText("No documents yet.")

    await userEvent.upload(container.querySelector('input[type="file"]')!, new File(["x"], "a.pdf", { type: "application/pdf" }))

    expect(await screen.findByText("File is not a valid PDF")).toBeInTheDocument()
  })

  it("polls processing documents until they are ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    mockApi([
      ["GET", "/documents", () => json([doc({ status: ++calls > 1 ? "ready" : "processing" })])],
      ["GET", "/documents/d1/messages", []],
    ])
    renderPage(<ChatPage />)
    expect(await screen.findByText("Reading your PDF…")).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(3100)

    expect(await screen.findByText("Ask anything about this document")).toBeInTheDocument()
    vi.useRealTimers()
  })

  it("offers a retry for failed documents", async () => {
    const { requests } = mockApi([
      ["GET", "/documents", [doc({ status: "failed", error: "No readable text found in this PDF." })]],
      ["GET", "/documents/d1/messages", []],
      ["POST", "/documents/d1/reprocess", () => json(doc({ status: "processing" }), 202)],
    ])
    renderPage(<ChatPage />)

    expect(await screen.findByText("No readable text found in this PDF.")).toBeInTheDocument()
    await userEvent.click(screen.getByText("Try again"))

    expect(await screen.findByText("Reading your PDF…")).toBeInTheDocument()
    expect(requests.some((r) => r.method === "POST" && r.path === "/documents/d1/reprocess")).toBe(true)
  })

  it("deletes a document after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const { requests } = mockApi([
      ["GET", "/documents", [doc(), doc({ id: "d2", filename: "other.pdf" })]],
      ["GET", /\/messages$/, []],
      ["DELETE", "/documents/d1", () => json(null, 204)],
    ])
    renderPage(<ChatPage />)

    const row = (await screen.findAllByText("photosynthesis.pdf")).find((el) => el.closest(".group"))!.closest(".group") as HTMLElement
    await userEvent.click(within(row).getByTitle("Delete document"))

    await waitFor(() => expect(screen.queryAllByText("photosynthesis.pdf")).toHaveLength(0))
    expect(requests.some((r) => r.method === "DELETE")).toBe(true)
    expect(screen.getAllByText("other.pdf").length).toBeGreaterThan(0) // next document becomes selected
  })

  it("keeps the document when deletion is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false)
    const { requests } = mockApi([["GET", "/documents", [doc()]], ["GET", /\/messages$/, []]])
    renderPage(<ChatPage />)

    await userEvent.click(await screen.findByTitle("Delete document"))

    expect(requests.some((r) => r.method === "DELETE")).toBe(false)
  })
})

describe("ChatPage queue", () => {
  it("tells the user when a document is waiting behind others", async () => {
    logIn()
    mockApi([
      ["GET", "/documents", [doc({ id: "late", filename: "late.pdf", status: "processing", queue_position: 2 }),
        doc({ id: "now", filename: "now.pdf", status: "processing", queue_position: 0 })]],
      ["GET", /\/messages$/, []],
    ])
    renderPage(<ChatPage />)

    expect(await screen.findByText("Waiting in line…")).toBeInTheDocument()
    expect(screen.getByText(/2 documents are being processed before this one/)).toBeInTheDocument()
    const sidebar = within(document.querySelector("aside")!)
    expect(sidebar.getByText("late.pdf").parentElement).toHaveTextContent("Queued…")
    expect(sidebar.getByText("now.pdf").parentElement).toHaveTextContent("Processing…")
  })
})
