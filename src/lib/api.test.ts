import { describe, expect, it, vi } from "vitest"
import { apiFetch, apiJson, errorMessage, streamChat, type ChatEvent } from "./api"
import { json, logIn, mockApi, ndjson } from "@/test/api-mock"

describe("errorMessage", () => {
  it("uses a string detail as is", () => {
    expect(errorMessage({ detail: "Email already registered" }, "fallback")).toBe("Email already registered")
  })

  it("joins FastAPI validation errors and drops the 'Value error' prefix", () => {
    const body = { detail: [{ msg: "Value error, Password must be at least 8 characters long" }, { msg: "field required" }] }
    expect(errorMessage(body, "fallback")).toBe("Password must be at least 8 characters long, field required")
  })

  it.each([null, {}, { detail: [] }, "oops"])("falls back for %j", (body) => {
    expect(errorMessage(body, "fallback")).toBe("fallback")
  })
})

describe("apiFetch", () => {
  it("sends the access token and a JSON content type for string bodies", async () => {
    logIn()
    const { requests } = mockApi([["POST", "/chat", {}]])

    await apiFetch("/chat", { method: "POST", body: JSON.stringify({ a: 1 }) })

    expect(requests[0].headers.get("Authorization")).toBe("Bearer access-token")
    expect(requests[0].headers.get("Content-Type")).toBe("application/json")
  })

  it("leaves the content type to the browser for uploads", async () => {
    logIn()
    const { requests } = mockApi([["POST", "/documents", {}]])

    await apiFetch("/documents", { method: "POST", body: new FormData() })

    expect(requests[0].headers.get("Content-Type")).toBeNull()
  })

  it("refreshes an expired access token once and retries", async () => {
    logIn()
    const { requests } = mockApi([
      ["GET", "/documents", (req: { headers: Headers }) =>
        req.headers.get("Authorization") === "Bearer new-access" ? json([{ id: "d1" }]) : json({ detail: "expired" }, 401)],
      ["POST", "/auth/refresh", { access: "new-access", refresh: "new-refresh" }],
    ])

    const response = await apiFetch("/documents")

    expect(response.status).toBe(200)
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /documents", "POST /auth/refresh", "GET /documents"])
    expect(requests[1].body).toEqual({ refresh: "refresh-token" })
    expect(localStorage.getItem("access_token")).toBe("new-access")
    expect(localStorage.getItem("refresh_token")).toBe("new-refresh")
  })

  it("logs out when the refresh token is rejected too", async () => {
    logIn()
    mockApi([
      ["GET", "/documents", json({ detail: "expired" }, 401)],
      ["POST", "/auth/refresh", () => json({ detail: "expired" }, 401)],
    ])

    const response = await apiFetch("/documents")

    expect(response.status).toBe(401)
    expect(localStorage.getItem("access_token")).toBeNull()
    expect(localStorage.getItem("user")).toBeNull()
  })
})

describe("apiJson", () => {
  it("returns parsed JSON", async () => {
    mockApi([["GET", "/documents", [{ id: "d1" }]]])
    await expect(apiJson("/documents")).resolves.toEqual([{ id: "d1" }])
  })

  it("returns null for 204 responses", async () => {
    mockApi([["DELETE", "/documents/d1", () => json(null, 204)]])
    await expect(apiJson("/documents/d1", { method: "DELETE" })).resolves.toBeNull()
  })

  it("throws the backend's error message", async () => {
    mockApi([["GET", "/documents/x", () => json({ detail: "Document not found" }, 404)]])
    await expect(apiJson("/documents/x")).rejects.toThrow("Document not found")
  })
})

describe("streamChat", () => {
  const events: ChatEvent[] = [
    { type: "sources", sources: [{ text: "RuBisCO...", page: 3 }], web: [] },
    { type: "token", content: "RuBisCO " },
    { type: "token", content: "fixes CO2 [1]." },
    { type: "done", message_id: 7 },
  ]

  it.each([1, 7, 1000])("delivers every event in order when chunks are %i bytes", async (chunkSize) => {
    mockApi([["POST", "/chat", () => ndjson(events, chunkSize)]])
    const received: ChatEvent[] = []

    await streamChat({ document_id: "d1", question: "q", enable_search: false }, (e) => received.push(e))

    expect(received).toEqual(events)
  })

  it("posts the question as JSON", async () => {
    const { requests } = mockApi([["POST", "/chat", () => ndjson([])]])
    await streamChat({ document_id: "d1", question: "Why?", enable_search: true }, vi.fn())
    expect(requests[0].body).toEqual({ document_id: "d1", question: "Why?", enable_search: true })
  })

  it("throws the backend's message when the request is refused", async () => {
    mockApi([["POST", "/chat", () => json({ detail: "This document is still being processed." }, 409)]])
    await expect(streamChat({ document_id: "d1", question: "q", enable_search: false }, vi.fn()))
      .rejects.toThrow("still being processed")
  })
})
