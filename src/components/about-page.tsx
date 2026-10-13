import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth"
import { Footer } from "@/components/footer"

export function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Sticky Navigation */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 md:px-12 md:py-6 border-b border-gray-800 bg-black">
        <Link to="/" className="flex items-center gap-2">
          <img src="/aze-removebg-preview.png" alt="Athena AI Logo" className="h-10 w-10 object-contain" />
          <div className="flex flex-col">
            <span className="text-lg font-bold">Athena AI</span>
            <span className="text-xs text-gray-400">Study Smarter, Not Harder</span>
          </div>
        </Link>
        <div className="flex items-center gap-8">
          <Link to="/" className="hover:text-blue-400 transition">Home</Link>
          <a href="#about" className="text-blue-400">About</a>
          <Link to="/chat" className="hover:text-blue-400 transition">Chat</Link>
          <Link to="/contact" className="hover:text-blue-400 transition">Contact</Link>
          <AuthControls />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6">
            About Us
          </h1>
          <p className="text-xl text-gray-300">
            Discover how Athena AI is transforming education through intelligent learning solutions.
          </p>
        </div>
      </section>

      {/* Our Mission Section */}
      <section className="py-16 md:py-20 px-6 md:px-12 border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Side - Content */}
            <div className="space-y-4">
              <h2 className="text-4xl font-extrabold">Our Mission</h2>
              <p className="text-lg text-gray-300 leading-relaxed">
                We aim to make learning smarter, faster, and more personalized. By combining cutting-edge artificial intelligence with practical study tools, we help students transform complex documents into clear insights and interactive learning experiences.
              </p>
            </div>
            {/* Right Side - Geometric Shape */}
            <div className="hidden lg:flex items-center justify-center relative h-64">
              <div className="relative w-72 h-72">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-500 to-purple-900 rounded-3xl transform skew-x-12 opacity-70"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who We Are Section */}
      <section className="py-16 md:py-20 px-6 md:px-12 bg-gray-950">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-extrabold mb-6">Who We Are</h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            We are a team of passionate developers and educators dedicated to bridging the gap between technology and meaningful learning. We understand the challenges of modern education—balancing studies, work, and life—and we design solutions that make studying simpler, more efficient, and even enjoyable.
          </p>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="py-16 md:py-20 px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-extrabold mb-8">What We Do</h2>
          <p className="text-lg text-gray-300 mb-8 leading-relaxed">
            Our platform allows users to:
          </p>

          {/* Features List */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[
              {
                icon: "📤",
                title: "Upload & Interact",
                description: "Upload PDFs and instantly interact with their content.",
              },
              {
                icon: "❓",
                title: "Ask Questions",
                description: "Ask questions and receive clear, context-aware answers.",
              },
              {
                icon: "🎓",
                title: "Generate Flashcards",
                description: "Automatically generate personalized flashcards to aid memorization.",
              },
            ].map((feature, index) => (
              <div key={index} className="p-6 rounded-2xl bg-gray-950 border border-gray-800 hover:border-blue-600 transition">
                <div className="text-4xl mb-3">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>

          <p className="text-lg text-gray-300 leading-relaxed">
            All this happens through a simple, intuitive interface inspired by modern conversational systems. We want every student to feel like they have a smart, reliable study companion at their fingertips.
          </p>
        </div>
      </section>

      {/* Why It Matters Section */}
      <section className="py-16 md:py-20 px-6 md:px-12 bg-gray-950 border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Side - Geometric Shape */}
            <div className="hidden lg:flex items-center justify-center relative h-64">
              <div className="relative w-72 h-72">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-500 to-purple-900 rounded-3xl transform -skew-x-12 opacity-70"></div>
              </div>
            </div>
            {/* Right Side - Content */}
            <div className="space-y-4">
              <h2 className="text-4xl font-extrabold">Why It Matters</h2>
              <p className="text-lg text-gray-300 leading-relaxed">
                In an age where information is abundant but time is scarce, our goal is to help students focus on what truly matters: understanding, retention, and effective learning. We believe that technology should empower students, not complicate their lives.
              </p>
              <p className="text-lg text-gray-300 leading-relaxed">
                Athena AI is more than a tool—it's your dedicated learning partner, designed to make education accessible, personalized, and genuinely effective.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 px-6 md:px-12 text-center border-t border-gray-800">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-4xl font-extrabold">
            Ready to Transform Your Learning?
          </h2>
          <p className="text-lg text-gray-300">
            Join thousands of students who are already studying smarter with Athena AI.
          </p>
          <div className="flex gap-4 justify-center">
            <Link to="/signup">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-8 py-3 text-lg">
                Get Started
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" className="border-2 border-gray-500 hover:border-white text-white font-semibold rounded-full px-8 py-3 text-lg bg-transparent">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  )
}

function AuthControls() {
  const auth = useAuth()
  return auth.isAuthenticated ? (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-400 truncate max-w-[12rem]">{auth.user?.email}</span>
      <button onClick={() => auth.logout()} className="bg-gray-800 text-white px-4 py-2 rounded-full hover:bg-gray-700">Logout</button>
    </div>
  ) : (
    <Link to="/login">
      <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-6 py-2">Login</Button>
    </Link>
  )
}
