import { useState, useEffect } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from "lucide-react"
import { apiJson, type Doc, type Flashcard } from "@/lib/api"

const CARD_COUNTS = [5, 10, 15, 20]

export function FlashcardPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [documents, setDocuments] = useState<Doc[] | null>(null)
    const [flashcards, setFlashcards] = useState<Flashcard[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [showReviewOnly, setShowReviewOnly] = useState(false)
    const [showGenerator, setShowGenerator] = useState(false)
    const [numCards, setNumCards] = useState(10)
    const [topic, setTopic] = useState("")
    const [error, setError] = useState<string | null>(null)

    const readyDocs = (documents ?? []).filter(d => d.status === "ready")
    const documentId = searchParams.get("doc") ?? readyDocs[0]?.id ?? null

    useEffect(() => {
        apiJson<Doc[]>("/documents")
            .then(setDocuments)
            .catch(e => setError(e instanceof Error ? e.message : "Failed to load documents"))
    }, [])

    // Load the saved set of the selected document
    useEffect(() => {
        if (!documentId) return
        let cancelled = false
        setFlashcards([])
        setCurrentIndex(0)
        setIsFlipped(false)
        setShowReviewOnly(false)
        setError(null)
        apiJson<Flashcard[]>(`/flashcards/${documentId}`)
            .then(cards => {
                if (cancelled) return
                setFlashcards(cards)
                setShowGenerator(cards.length === 0)
            })
            .catch(e => !cancelled && setError(e instanceof Error ? e.message : "Failed to load flashcards"))
        return () => { cancelled = true }
    }, [documentId])

    const generateFlashcards = async () => {
        if (!documentId || isGenerating) return

        setIsGenerating(true)
        setError(null)
        try {
            const cards = await apiJson<Flashcard[]>("/flashcards/generate", {
                method: "POST",
                body: JSON.stringify({ document_id: documentId, num_cards: numCards, topic }),
            })
            setFlashcards(cards)
            setCurrentIndex(0)
            setIsFlipped(false)
            setShowReviewOnly(false)
            setShowGenerator(false)
        } catch (e) {
            console.error("Generation error:", e)
            setError(e instanceof Error ? e.message : "Failed to generate flashcards. Please try again.")
        } finally {
            setIsGenerating(false)
        }
    }

    const filteredCards = showReviewOnly ? flashcards.filter(c => c.needs_review) : flashcards

    // Keep the index valid when the filtered list shrinks
    useEffect(() => {
        if (currentIndex > 0 && currentIndex >= filteredCards.length) {
            setCurrentIndex(Math.max(filteredCards.length - 1, 0))
        }
    }, [currentIndex, filteredCards.length])

    const currentCard = filteredCards[Math.min(currentIndex, filteredCards.length - 1)]
    const mastered = flashcards.filter(c => c.times_reviewed > 0 && !c.needs_review).length
    const progress = flashcards.length > 0 ? Math.round((mastered / flashcards.length) * 100) : 0

    const goTo = (index: number) => {
        setCurrentIndex(index)
        setIsFlipped(false)
    }

    const markCard = async (needsReview: boolean) => {
        const card = currentCard
        if (!card) return

        try {
            const updated = await apiJson<Flashcard>(`/flashcards/${card.id}`, {
                method: "PATCH",
                body: JSON.stringify({ needs_review: needsReview }),
            })
            setFlashcards(prev => prev.map(c => (c.id === card.id ? updated : c)))

            // In review mode a mastered card drops out of the list, so the next card
            // slides into the current index; otherwise advance
            if (showReviewOnly && !needsReview) {
                setIsFlipped(false)
            } else if (currentIndex < filteredCards.length - 1) {
                goTo(currentIndex + 1)
            }
        } catch (e) {
            console.error("Update error:", e)
            setError(e instanceof Error ? e.message : "Failed to save your answer")
        }
    }

    return (
        <div className="min-h-screen bg-black text-white p-6">
            <div className="max-w-4xl mx-auto">
                <Link to="/chat" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-6">
                    <ArrowLeft className="w-4 h-4" /> Back to chat
                </Link>

                <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-bold mb-2">📚 Flashcards</h1>
                        <p className="text-gray-400">Study cards generated from your PDFs</p>
                    </div>
                    {readyDocs.length > 0 && (
                        <select
                            value={documentId ?? ""}
                            onChange={e => setSearchParams({ doc: e.target.value })}
                            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm max-w-xs"
                        >
                            {readyDocs.map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}
                        </select>
                    )}
                </div>

                {error && (
                    <div className="mb-6 p-3 bg-red-900/20 border border-red-600 rounded-lg text-red-400 text-sm">{error}</div>
                )}

                {documents !== null && readyDocs.length === 0 ? (
                    <Card className="bg-gray-950 border border-gray-800">
                        <CardContent className="p-12">
                            <div className="flex flex-col items-center justify-center space-y-4">
                                <div className="text-6xl">📄</div>
                                <h3 className="text-2xl font-bold">No PDF Found</h3>
                                <p className="text-gray-400 text-center">
                                    Upload a PDF in the Chat page first, then come back here to generate flashcards.
                                </p>
                                <Link to="/chat"><Button className="bg-blue-600 hover:bg-blue-700">Go to Chat</Button></Link>
                            </div>
                        </CardContent>
                    </Card>
                ) : isGenerating ? (
                    <Card className="bg-gray-950 border border-gray-800">
                        <CardContent className="p-12">
                            <div className="flex flex-col items-center justify-center space-y-4">
                                <RotateCcw className="w-16 h-16 text-blue-500 animate-spin" />
                                <h3 className="text-2xl font-bold">Generating Flashcards...</h3>
                                <p className="text-gray-400 text-center">
                                    Selecting key passages from your PDF and writing questions. This can take a minute.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : showGenerator && documentId ? (
                    <Card className="bg-gray-950 border border-gray-800">
                        <CardContent className="p-10 space-y-6">
                            <div className="text-center">
                                <Sparkles className="w-10 h-10 text-purple-400 mx-auto mb-3" />
                                <h3 className="text-2xl font-bold">Generate a flashcard set</h3>
                                <p className="text-gray-400 text-sm mt-1">
                                    Cards cover the whole document, or focus on a topic you choose.
                                </p>
                            </div>
                            <div className="max-w-md mx-auto space-y-4">
                                <div>
                                    <div className="text-sm text-gray-400 mb-2">Number of cards</div>
                                    <div className="flex gap-2">
                                        {CARD_COUNTS.map(n => (
                                            <button
                                                key={n}
                                                onClick={() => setNumCards(n)}
                                                className={`flex-1 py-2 rounded-lg border text-sm transition ${numCards === n ? "bg-purple-600 border-purple-500" : "border-gray-700 hover:border-gray-500"}`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-400 mb-2">Topic (optional)</div>
                                    <Input
                                        value={topic}
                                        onChange={e => setTopic(e.target.value)}
                                        placeholder="e.g. the Calvin cycle"
                                        className="bg-gray-900 border-gray-800"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    {flashcards.length > 0 && (
                                        <Button variant="outline" onClick={() => setShowGenerator(false)} className="border-gray-700">
                                            Cancel
                                        </Button>
                                    )}
                                    <Button onClick={generateFlashcards} className="flex-1 bg-purple-600 hover:bg-purple-700">
                                        Generate
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ) : flashcards.length > 0 ? (
                    <div className="space-y-6">
                        {/* Progress Bar */}
                        <div className="bg-gray-900 p-4 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium">Progress</span>
                                <span className="text-sm text-gray-400">{progress}% Mastered</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-2">
                                <div
                                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="flex gap-2 mt-3">
                                <Button
                                    onClick={() => {
                                        setShowReviewOnly(!showReviewOnly)
                                        goTo(0)
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className={`transition-all duration-200 ${showReviewOnly
                                        ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/20"
                                        : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-800/50"
                                        }`}
                                >
                                    {showReviewOnly ? "Show All" : "Review Only"}
                                </Button>
                                <Button onClick={() => setShowGenerator(true)} variant="outline" size="sm">
                                    New Set
                                </Button>
                            </div>
                        </div>

                        {showReviewOnly && filteredCards.length === 0 && (
                            <div className="text-center text-gray-400 py-12">No cards need review. Nice work! 🎉</div>
                        )}

                        {/* Flashcard */}
                        {currentCard && (
                            <div className="space-y-4">
                                <div className="text-center text-gray-400 text-sm">
                                    Card {Math.min(currentIndex, filteredCards.length - 1) + 1} of {filteredCards.length}
                                </div>

                                <div
                                    onClick={() => setIsFlipped(!isFlipped)}
                                    className="relative h-96 cursor-pointer perspective-1000"
                                >
                                    <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
                                        {/* Front (Question) */}
                                        <div className="absolute w-full h-full backface-hidden">
                                            <Card className="w-full h-full bg-gradient-to-br from-gray-900 to-gray-950 border-gray-800 flex items-center justify-center p-8 shadow-2xl">
                                                <div className="text-center">
                                                    <div className="text-sm font-medium text-blue-400 mb-4 uppercase tracking-wider">Question</div>
                                                    <div className="text-2xl font-medium text-gray-100">{currentCard.question}</div>
                                                    <div className="text-sm text-gray-500 mt-8 animate-pulse">Click to reveal answer</div>
                                                </div>
                                            </Card>
                                        </div>

                                        {/* Back (Answer) */}
                                        <div className="absolute w-full h-full backface-hidden rotate-y-180">
                                            <Card className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800 flex items-center justify-center p-8 shadow-2xl">
                                                <div className="text-center">
                                                    <div className="text-sm font-medium text-purple-400 mb-4 uppercase tracking-wider">Answer</div>
                                                    <div className="text-xl text-gray-200 leading-relaxed">{currentCard.answer}</div>
                                                </div>
                                            </Card>
                                        </div>
                                    </div>
                                </div>

                                {/* Controls */}
                                <div className="flex justify-between items-center">
                                    <Button
                                        onClick={() => goTo(currentIndex - 1)}
                                        disabled={currentIndex === 0}
                                        variant="outline"
                                        className="border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-800/50 transition-all"
                                    >
                                        <ChevronLeft className="w-4 h-4 mr-2" />
                                        Previous
                                    </Button>

                                    <div className="flex gap-2">
                                        <Button
                                            onClick={() => markCard(true)}
                                            className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white shadow-lg shadow-red-900/20 transition-all duration-200 hover:scale-105 border-0"
                                        >
                                            Need Review
                                        </Button>
                                        <Button
                                            onClick={() => markCard(false)}
                                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-900/20 transition-all duration-200 hover:scale-105 border-0"
                                        >
                                            Got it!
                                        </Button>
                                    </div>

                                    <Button
                                        onClick={() => goTo(currentIndex + 1)}
                                        disabled={currentIndex >= filteredCards.length - 1}
                                        variant="outline"
                                        className="border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-800/50 transition-all"
                                    >
                                        Next
                                        <ChevronRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
