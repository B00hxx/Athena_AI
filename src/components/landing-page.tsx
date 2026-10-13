import { Link } from "react-router-dom"
import { useAuth } from "@/context/auth"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/footer"
import "./landing-page.css"

export function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation Header - Sticky */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 md:px-12 md:py-6 border-b border-gray-800 bg-black">
        <Link to="/" className="flex items-center gap-2">
          <img src="/aze-removebg-preview.png" alt="Athena AI Logo" className="h-10 w-10 object-contain" />
          <div className="flex flex-col">
            <span className="text-lg font-bold">Athena AI</span>
            <span className="text-xs text-gray-400">Study Smarter, Not Harder</span>
          </div>
        </Link>
        <div className="flex items-center gap-8">
          <a href="#home" className="hover:text-blue-400 transition">Home</a>
          <Link to="/about" className="hover:text-blue-400 transition">About</Link>
          <Link to="/chat" className="hover:text-blue-400 transition">Chat</Link>
          <Link to="/contact" className="hover:text-blue-400 transition">Contact</Link>
          {/* Auth controls */}
          <AuthControls />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex items-center min-h-[calc(100vh-80px)]">
        {/* Left Side - Brand Logo */}
        <div className="hidden lg:flex w-1/2 h-full items-center justify-center relative">
          <div className="relative w-96 h-96 flex items-center justify-center">
            <img
              src="/aze-removebg-preview.png"
              alt="Athena AI Logo"
              className="w-full h-full object-contain drop-shadow-2xl animate-float"
            />
          </div>
        </div>

        {/* Right Side - Content */}
        <div className="w-full lg:w-1/2 px-6 md:px-12 py-12">
          <div className="max-w-2xl space-y-6">
            <h1 className="text-5xl md:text-6xl font-extrabold leading-tight">
              Athena AI
            </h1>
            <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
              Welcome to your personal AI learning companion! Upload any PDF and start exploring your documents like never before. Ask questions, get instant answers, and transform important content into interactive flashcards, all in one simple, intuitive platform. Whether you're studying for exams, working on a project, or just trying to stay on top of your learning, our tool makes understanding and retaining information faster, smarter, and more fun.
            </p>

            {/* CTA Buttons */}
            <AuthHeroCtas />
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section className="py-20 md:py-32 px-6 md:px-12 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Left Side - Title */}
            <div className="relative">
              <div className="hidden lg:block absolute -left-96 top-0 w-80 h-80">
                <div className="relative w-full h-full">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-500 to-purple-900 rounded-3xl transform -skew-x-12 opacity-70"></div>
                </div>
              </div>
              <h2 className="text-5xl md:text-6xl font-extrabold leading-tight relative z-10">
                Core<br />Features
              </h2>
            </div>

            {/* Right Side - Description and Features */}
            <div className="space-y-8">
              <p className="text-lg text-gray-300 leading-relaxed">
                Our platform is designed to make learning simple, interactive, and efficient. With just a few clicks, users can upload PDFs, interact with an AI-powered chat to understand content, and automatically generate personalized flashcards for easy review. Each feature is built to help students save time, retain knowledge effectively, and turn complex documents into manageable learning experiences.
              </p>

              {/* Feature Cards */}
              <div className="grid grid-cols-3 gap-6">
                {[
                  {
                    icon: "📄",
                    label: "PDF Upload",
                    title: "Upload & Analyze",
                    description: "Instantly upload any PDF document and our AI analyzes it for you.",
                  },
                  {
                    icon: "🤖",
                    label: "AI Chat",
                    title: "Ask Questions",
                    description: "Interact with an intelligent chatbot to get instant answers about your documents.",
                  },
                  {
                    icon: "📚",
                    label: "Flashcards",
                    title: "Study Smart",
                    description: "Auto-generate personalized flashcards to boost retention and learning.",
                  },
                ].map((feature, index) => (
                  <div key={index} className="flex flex-col items-center text-center space-y-3">
                    <div className="w-24 h-24 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center text-4xl">
                      {feature.icon}
                    </div>
                    <h4 className="font-semibold text-white">{feature.label}</h4>
                    <p className="text-sm text-gray-400">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 md:py-32 px-6 md:px-12 bg-black relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col items-center text-center mb-16">
            <h2 className="text-5xl md:text-6xl font-extrabold mb-4">
              Meet the team<br />behind Athena AI
            </h2>
          </div>

          {/* Team Members Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: "Mohamed Baha Riahi", image: "Mohamed Baha Riahi.jpg", linkedin: "https://www.linkedin.com/in/mohamedbahariahi/" },
              { name: "Mohamed Aziz Merichkou", image: "Mohamed Aziz Merichkou.jpg", linkedin: "https://www.linkedin.com/in/mohamed-aziz-merichkou-98b1a322a/" },
              { name: "Dhia Dachraoui", image: "Dhia Dachraoui.jpg", linkedin: "https://www.linkedin.com/in/dhia-dachraoui-65bb14338/" },
              { name: "Omar Chaaar", image: "Omar Chaaar.jpg", linkedin: "https://www.linkedin.com/in/omar-chaar-827a03281/" },
            ].map((member, index) => (
              <a
                key={index}
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="team-member-card relative rounded-lg overflow-hidden h-80 cursor-pointer block"
              >
                {/* Team member image */}
                <img
                  src={`/${member.image}`}
                  alt={member.name}
                  className="team-member-image"
                />
                {/* Overlay gradient */}
                <div className="team-member-overlay"></div>
                {/* Name text */}
                <div className="team-member-name">
                  <h3>{member.name}</h3>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Geometric accent on right */}
        <div className="absolute right-0 top-1/2 transform translate-x-1/4 pointer-events-none">
          <div className="relative w-96 h-96">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-500 to-purple-900 rounded-3xl transform skew-x-12 opacity-30"></div>
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
    <>
      <Link to="/login">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-6 py-2">
          Login
        </Button>
      </Link>
    </>
  )
}

function AuthHeroCtas() {
  const auth = useAuth()
  return auth.isAuthenticated ? (
    <div className="flex gap-4 pt-8 items-center">
      <Link to="/chat">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-8 py-3 text-lg">
          Open Chat
        </Button>
      </Link>
      <button onClick={() => auth.logout()} className="bg-gray-800 text-white px-6 py-3 rounded-full hover:bg-gray-700">Logout</button>
    </div>
  ) : (
    <div className="flex gap-4 pt-8">
      <Link to="/login">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-8 py-3 text-lg">
          Login
        </Button>
      </Link>
      <Link to="/signup">
        <Button variant="outline" className="border-2 border-gray-500 hover:border-white text-white font-semibold rounded-full px-8 py-3 text-lg bg-transparent">
          Sign Up
        </Button>
      </Link>
    </div>
  )
}
