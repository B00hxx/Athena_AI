import type { ReactElement } from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { AboutPage } from "./about-page"
import { ContactPage } from "./contact-page"
import { LandingPage } from "./landing-page"
import { logIn } from "@/test/api-mock"
import { renderPage } from "@/test/render"

const pages: [string, () => ReactElement, string][] = [
  ["landing", () => <LandingPage />, "Mohamed Baha Riahi"],
  ["about", () => <AboutPage />, "Our Mission"],
  ["contact", () => <ContactPage />, "Frequently Asked Questions"],
]

describe.each(pages)("%s page", (_name, page, landmark) => {
  it("renders for visitors with a login link", () => {
    renderPage(page())
    expect(screen.getByText(landmark)).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: /login/i })[0]).toHaveAttribute("href", "/login")
  })

  it("shows the account and logs out for signed-in users", async () => {
    logIn("ada@example.com")
    renderPage(page())

    expect(screen.getAllByText("ada@example.com")[0]).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole("button", { name: "Logout" })[0])

    expect(await screen.findByText("login page")).toBeInTheDocument()
    expect(localStorage.getItem("access_token")).toBeNull()
  })
})

describe("landing page", () => {
  it("offers sign up to visitors and the chat to members", () => {
    const { unmount } = renderPage(<LandingPage />)
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", "/signup")
    unmount()

    logIn()
    renderPage(<LandingPage />)
    expect(screen.getByRole("link", { name: "Open Chat" })).toHaveAttribute("href", "/chat")
  })
})
