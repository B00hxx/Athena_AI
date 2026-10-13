import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { SignupForm } from "./signup-form"
import { json, mockApi } from "@/test/api-mock"
import { renderPage } from "@/test/render"

async function fillForm({ password = "password123", confirm }: { password?: string; confirm?: string } = {}) {
  confirm ??= password
  await userEvent.type(screen.getByLabelText("Full Name"), "Ada Lovelace")
  await userEvent.type(screen.getByLabelText("Email"), "ada@example.com")
  await userEvent.type(screen.getByLabelText("Password"), password)
  await userEvent.type(screen.getByLabelText("Confirm Password"), confirm)
  await userEvent.click(document.querySelector('button[type="submit"]')!)
}

describe("SignupForm", () => {
  it("checks that the passwords match", async () => {
    const { requests } = mockApi([])
    renderPage(<SignupForm />)

    await fillForm({ password: "password123", confirm: "password124" })

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })

  it("creates the account and stores the session", async () => {
    const { requests } = mockApi([
      ["POST", "/auth/signup", { access: "a1", refresh: "r1", user: { id: 1, email: "ada@example.com" } }],
    ])
    renderPage(<SignupForm />)

    await fillForm()

    expect(await screen.findByText("Account created successfully! Redirecting...")).toBeInTheDocument()
    expect(requests[0].body).toEqual({ email: "ada@example.com", password: "password123" })
    expect(localStorage.getItem("access_token")).toBe("a1")
  })

  it("shows a taken email under the email field", async () => {
    mockApi([["POST", "/auth/signup", () => json({ detail: "Email already registered" }, 400)]])
    renderPage(<SignupForm />)

    await fillForm()

    expect(await screen.findByText("Email already registered")).toBeInTheDocument()
  })

  it("shows server-side password validation under the password field", async () => {
    mockApi([["POST", "/auth/signup", () => json({
      detail: [{ loc: ["body", "password"], msg: "Value error, Password is too long (max 72 bytes)" }],
    }, 422)]])
    renderPage(<SignupForm />)

    await fillForm()

    const message = await screen.findByText("Password is too long (max 72 bytes)")
    expect(message.previousElementSibling).toHaveAttribute("id", "password")
  })
})
