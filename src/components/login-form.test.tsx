import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { LoginForm } from "./login-form"
import { json, mockApi } from "@/test/api-mock"
import { renderPage } from "@/test/render"

const submit = () => userEvent.click(document.querySelector('button[type="submit"]')!)

describe("LoginForm", () => {
  it("validates the password before calling the API", async () => {
    // Empty fields are already blocked by the inputs' native `required` attribute
    const { requests } = mockApi([])
    renderPage(<LoginForm />)

    await userEvent.type(screen.getByLabelText("Email"), "me@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "abc")
    await submit()

    expect(screen.getByText("Password must be at least 6 characters")).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })

  it("clears a field's error while the user corrects it", async () => {
    mockApi([])
    renderPage(<LoginForm />)

    await userEvent.type(screen.getByLabelText("Email"), "me@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "abc")
    await submit()
    await userEvent.type(screen.getByLabelText("Password"), "defgh")

    expect(screen.queryByText("Password must be at least 6 characters")).not.toBeInTheDocument()
  })

  it("stores the session on success", async () => {
    const { requests } = mockApi([
      ["POST", "/auth/login", { access: "a1", refresh: "r1", user: { id: 1, email: "me@example.com" } }],
    ])
    renderPage(<LoginForm />)

    await userEvent.type(screen.getByLabelText("Email"), "me@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "password123")
    await submit()

    expect(await screen.findByText("Login successful! Welcome back.")).toBeInTheDocument()
    expect(requests[0].body).toEqual({ email: "me@example.com", password: "password123" })
    expect(localStorage.getItem("access_token")).toBe("a1")
    expect(JSON.parse(localStorage.getItem("user")!)).toEqual({ id: 1, email: "me@example.com" })
  })

  it("shows the server's error for wrong credentials", async () => {
    mockApi([["POST", "/auth/login", () => json({ detail: "Incorrect username or password" }, 401)]])
    renderPage(<LoginForm />)

    await userEvent.type(screen.getByLabelText("Email"), "me@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass")
    await submit()

    expect(await screen.findByText("Incorrect username or password")).toBeInTheDocument()
    expect(localStorage.getItem("access_token")).toBeNull()
  })

  it("reports when the server is unreachable", async () => {
    mockApi([["POST", "/auth/login", () => Promise.reject(new TypeError("Failed to fetch"))]])
    renderPage(<LoginForm />)

    await userEvent.type(screen.getByLabelText("Email"), "me@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "password123")
    await submit()

    expect(await screen.findByText("Unable to connect to server")).toBeInTheDocument()
  })
})
