import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import App from "./App"
import { logIn, mockApi } from "@/test/api-mock"

const visit = (path: string) => {
  window.history.pushState({}, "", path)
  return render(<App />)
}

describe("routing", () => {
  it.each(["/chat", "/flashcards"])("sends logged-out visitors from %s to the login page", async (path) => {
    visit(path)
    expect(await screen.findByLabelText("Email")).toBeInTheDocument()
    expect(window.location.pathname).toBe("/login")
  })

  it("lets logged-in users into the chat", async () => {
    logIn()
    mockApi([["GET", "/documents", []]])
    visit("/chat")
    expect(await screen.findByText("Drop a PDF here or click to upload")).toBeInTheDocument()
  })
})
