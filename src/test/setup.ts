import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// jsdom doesn't implement layout or navigation
Element.prototype.scrollIntoView = vi.fn()
const consoleError = console.error
console.error = (...args: unknown[]) => {
  const message = String((args[0] as Error)?.message ?? args[0])
  if (message.includes("Not implemented: navigation")) return
  consoleError(...args)
}
