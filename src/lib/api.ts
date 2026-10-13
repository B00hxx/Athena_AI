// "/api" is proxied to the backend by Vite in development and by nginx in Docker
export const API_URL = import.meta.env.VITE_API_URL ?? "/api"

// ---- Types mirroring backend/schemas.py ----

export type DocumentStatus = "processing" | "ready" | "failed"

export type Doc = {
  id: string
  filename: string
  size: number
  status: DocumentStatus
  error: string | null
  num_chunks: number
  created_at: string
}

/** A retrieved document chunk, or a web result (web: true) that backed an answer. */
export type Source = {
  text?: string
  page?: number
  section?: string | null
  score?: number
  web?: boolean
  title?: string
  url?: string
  snippet?: string
}

export type ChatMessage = {
  id: number | string
  role: "user" | "assistant"
  content: string
  sources?: Source[] | null
}

export type Flashcard = {
  id: number
  question: string
  answer: string
  needs_review: boolean
  times_reviewed: number
  last_reviewed: string | null
}

// ---- Auth-aware fetch ----

export function clearSession() {
  localStorage.removeItem("access_token")
  localStorage.removeItem("refresh_token")
  localStorage.removeItem("user")
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = localStorage.getItem("refresh_token")
  if (!refresh) return false
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    })
    if (!response.ok) return false
    const data = await response.json()
    localStorage.setItem("access_token", data.access)
    localStorage.setItem("refresh_token", data.refresh)
    return true
  } catch {
    return false
  }
}

/** Fetch an authenticated API endpoint, refreshing the access token once if it expired. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const headers = new Headers(init.headers)
    const token = localStorage.getItem("access_token")
    if (token) headers.set("Authorization", `Bearer ${token}`)
    if (typeof init.body === "string") headers.set("Content-Type", "application/json")
    return fetch(`${API_URL}${path}`, { ...init, headers })
  }

  let response = await send()
  if (response.status === 401) {
    if (await refreshAccessToken()) {
      response = await send()
    }
    if (response.status === 401) {
      clearSession()
      window.location.href = "/login"
    }
  }
  return response
}

/** Turn a FastAPI error body ({detail: string | [{msg}]}) into a readable message. */
export function errorMessage(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null)?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => String(d?.msg ?? d).replace(/^Value error, /, "")).join(", ")
  }
  return fallback
}

/** apiFetch + JSON parsing; throws an Error with the backend's message on failure. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init)
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorMessage(data, `Request failed (${response.status})`))
  return data as T
}

// ---- Streaming chat ----

export type ChatEvent =
  | { type: "sources"; sources: Source[]; web: Source[] }
  | { type: "token"; content: string }
  | { type: "done"; message_id: number }
  | { type: "error"; detail: string }

/** POST /chat and invoke onEvent for each newline-delimited JSON event as it arrives. */
export async function streamChat(
  body: { document_id: string; question: string; enable_search: boolean },
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const response = await apiFetch("/chat", { method: "POST", body: JSON.stringify(body) })
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null)
    throw new Error(errorMessage(data, "Failed to get an answer"))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) onEvent(JSON.parse(line))
    }
  }
}
