import { vi } from "vitest"

export type MockRequest = { method: string; path: string; body: unknown; headers: Headers }
type Handler = (req: MockRequest) => Response | Promise<Response>
type Route = [method: string, path: string | RegExp, handler: Handler | unknown]

export const json = (data: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

/** A streaming NDJSON response. Lines are re-chunked at arbitrary points to exercise the client's buffering. */
export function ndjson(events: unknown[], chunkSize = 7) {
  const text = events.map((e) => JSON.stringify(e) + "\n").join("")
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < text.length; i += chunkSize) controller.enqueue(encoder.encode(text.slice(i, i + chunkSize)))
        controller.close()
      },
    }),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  )
}

/**
 * Replace global fetch with a router over the /api endpoints. A route's handler can be a function
 * (receives method, path without /api, parsed JSON or FormData body, headers), a Response, or a plain value returned as JSON.
 * Returns the vi.fn plus a list of the requests made.
 */
export function mockApi(routes: Route[]) {
  const requests: MockRequest[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase()
    const path = String(input).replace(/^\/api/, "")
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body
    const req = { method, path, body, headers: new Headers(init.headers) }
    requests.push(req)
    const route = routes.find(([m, p]) => m === method && (typeof p === "string" ? p === path : p.test(path)))
    if (!route) return json({ detail: `No mock for ${method} ${path}` }, 500)
    const handler = route[2]
    if (typeof handler === "function") return (handler as Handler)(req)
    return handler instanceof Response ? handler.clone() : json(handler)
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, requests }
}

export function logIn(email = "student@example.com") {
  localStorage.setItem("access_token", "access-token")
  localStorage.setItem("refresh_token", "refresh-token")
  localStorage.setItem("user", JSON.stringify({ id: 1, email }))
}
