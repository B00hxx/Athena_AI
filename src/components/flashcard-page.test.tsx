import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { FlashcardPage } from "./flashcard-page"
import { json, logIn, mockApi, type MockRequest } from "@/test/api-mock"
import { renderPage } from "@/test/render"
import type { Doc, Flashcard } from "@/lib/api"

const DOCS: Doc[] = [
  { id: "d1", filename: "photosynthesis.pdf", size: 3500, status: "ready", error: null, num_chunks: 3, created_at: "" },
  { id: "d2", filename: "genetics.pdf", size: 9000, status: "ready", error: null, num_chunks: 9, created_at: "" },
]

const card = (id: number, overrides: Partial<Flashcard> = {}): Flashcard => ({
  id, question: `Question ${id}?`, answer: `Answer ${id}.`, needs_review: false, times_reviewed: 0, last_reviewed: null,
  ...overrides,
})

/** Mock the API with a server-side card store that PATCH updates. */
function mockCards(cards: Flashcard[], extra: Parameters<typeof mockApi>[0] = []) {
  return mockApi([
    ["GET", "/documents", DOCS],
    ["GET", "/flashcards/d1", () => json(cards)],
    ["GET", "/flashcards/d2", []],
    ["PATCH", /^\/flashcards\/\d+$/, (req: MockRequest) => {
      const id = Number(req.path.split("/").pop())
      const c = cards.find((x) => x.id === id)!
      Object.assign(c, { needs_review: (req.body as { needs_review: boolean }).needs_review, times_reviewed: c.times_reviewed + 1 })
      return json({ ...c })
    }],
    ...extra,
  ])
}

const renderFlashcards = (url = "/flashcards?doc=d1") => renderPage(<FlashcardPage />, { path: "/flashcards", url })

beforeEach(() => logIn())

describe("FlashcardPage", () => {
  it("asks for an upload when there are no ready documents", async () => {
    mockApi([["GET", "/documents", [{ ...DOCS[0], status: "processing" }]]])
    renderFlashcards("/flashcards")

    expect(await screen.findByText("No PDF Found")).toBeInTheDocument()
  })

  it("shows the saved set of the document from the URL", async () => {
    mockCards([card(1), card(2)])
    renderFlashcards()

    expect(await screen.findByText("Question 1?")).toBeInTheDocument()
    expect(screen.getByText("Answer 1.")).toBeInTheDocument()
    expect(screen.getByText("Card 1 of 2")).toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveValue("d1")
  })

  it("defaults to the first ready document", async () => {
    mockCards([card(1)])
    renderFlashcards("/flashcards")
    expect(await screen.findByText("Question 1?")).toBeInTheDocument()
  })

  it("switches documents from the picker", async () => {
    mockCards([card(1)])
    renderFlashcards()
    await screen.findByText("Question 1?")

    await userEvent.selectOptions(screen.getByRole("combobox"), "d2")

    expect(await screen.findByText("Generate a flashcard set")).toBeInTheDocument()
  })

  it("records answers, advances and tracks progress", async () => {
    const { requests } = mockCards([card(1), card(2)])
    renderFlashcards()
    await screen.findByText("Card 1 of 2")

    await userEvent.click(screen.getByText("Got it!"))

    expect(await screen.findByText("Card 2 of 2")).toBeInTheDocument()
    expect(screen.getByText("50% Mastered")).toBeInTheDocument()
    const patch = requests.find((r) => r.method === "PATCH")!
    expect(patch.path).toBe("/flashcards/1")
    expect(patch.body).toEqual({ needs_review: false })
  })

  it("navigates with previous and next", async () => {
    mockCards([card(1), card(2), card(3)])
    renderFlashcards()
    await screen.findByText("Card 1 of 3")

    expect(screen.getByText("Previous").closest("button")).toBeDisabled()
    await userEvent.click(screen.getByText("Next"))
    await userEvent.click(screen.getByText("Next"))
    expect(screen.getByText("Card 3 of 3")).toBeInTheDocument()
    expect(screen.getByText("Next").closest("button")).toBeDisabled()
    await userEvent.click(screen.getByText("Previous"))
    expect(screen.getByText("Card 2 of 3")).toBeInTheDocument()
  })

  it("review mode shows only cards that need review", async () => {
    mockCards([card(1, { needs_review: true, times_reviewed: 1 }), card(2), card(3, { needs_review: true, times_reviewed: 1 })])
    renderFlashcards()
    await screen.findByText("Card 1 of 3")

    await userEvent.click(screen.getByText("Review Only"))
    expect(screen.getByText("Card 1 of 2")).toBeInTheDocument()

    // Mastering a card removes it from the review list
    await userEvent.click(screen.getByText("Got it!"))
    await waitFor(() => expect(screen.getByText("Card 1 of 1")).toBeInTheDocument())
    expect(screen.getByText("Question 3?")).toBeInTheDocument()

    await userEvent.click(screen.getByText("Got it!"))
    expect(await screen.findByText("No cards need review. Nice work! 🎉")).toBeInTheDocument()
  })

  it("generates a set with the chosen size and topic", async () => {
    const generated = [card(10), card(11)]
    let generateBody: unknown
    mockCards([], [["POST", "/flashcards/generate", (req: MockRequest) => { generateBody = req.body; return json(generated) }]])
    renderFlashcards()

    await screen.findByText("Generate a flashcard set")
    await userEvent.click(screen.getByRole("button", { name: "5" }))
    await userEvent.type(screen.getByPlaceholderText("e.g. the Calvin cycle"), "enzymes")
    await userEvent.click(screen.getByRole("button", { name: "Generate" }))

    expect(await screen.findByText("Question 10?")).toBeInTheDocument()
    expect(generateBody).toEqual({ document_id: "d1", num_cards: 5, topic: "enzymes" })
  })

  it("can replace an existing set and cancel back to it", async () => {
    mockCards([card(1)])
    renderFlashcards()
    await screen.findByText("Question 1?")

    await userEvent.click(screen.getByText("New Set"))
    expect(screen.getByText("Generate a flashcard set")).toBeInTheDocument()
    await userEvent.click(screen.getByText("Cancel"))
    expect(screen.getByText("Question 1?")).toBeInTheDocument()
  })

  it("shows generation errors and lets the user retry", async () => {
    mockCards([], [["POST", "/flashcards/generate", () =>
      json({ detail: "The model returned no usable flashcards. Please try again." }, 502)]])
    renderFlashcards()

    await userEvent.click(await screen.findByRole("button", { name: "Generate" }))

    expect(await screen.findByText("The model returned no usable flashcards. Please try again.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled()
  })
})
