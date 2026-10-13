import React from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { LandingPage } from "./components/landing-page"
import { AboutPage } from "./components/about-page"
import { ContactPage } from "./components/contact-page"
import { LoginForm } from "./components/login-form"
import { SignupForm } from "./components/signup-form"
import { ChatPage } from "./components/chat-page"
import { FlashcardPage } from "./components/flashcard-page"
import { AuthProvider, useAuth } from "./context/auth"

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/login" element={<LoginForm />} />
          <Route path="/signup" element={<SignupForm />} />
          <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
          <Route path="/flashcards" element={<ProtectedRoute><FlashcardPage /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
