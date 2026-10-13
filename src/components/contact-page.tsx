import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth"
import { Footer } from "@/components/footer"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ContactPage() {
  const auth = useAuth()
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
          <Link to="/about" className="hover:text-blue-400 transition">About</Link>
          <Link to="/chat" className="hover:text-blue-400 transition">Chat</Link>
          <a href="#contact" className="text-blue-400">Contact</a>
          <AuthControls />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6">
            Get in Touch
          </h1>
          <p className="text-xl text-gray-300">
            Have questions or feedback? We'd love to hear from you. Reach out to our team and we'll get back to you as soon as possible.
          </p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 md:py-24 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left Side - Contact Form */}
            <div className="space-y-6">
              <h2 className="text-3xl font-extrabold">Send us a Message</h2>
              <form className="space-y-4">
                <FieldGroup className="space-y-4">
                  <Field>
                    <FieldLabel htmlFor="name" className="text-white">Full Name</FieldLabel>
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      required
                      className="rounded-xl border-gray-700 bg-gray-900 text-white placeholder-gray-500 focus:ring-blue-400 focus:border-blue-400"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="email" className="text-white">Email Address</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      required
                      className="rounded-xl border-gray-700 bg-gray-900 text-white placeholder-gray-500 focus:ring-blue-400 focus:border-blue-400"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="subject" className="text-white">Subject</FieldLabel>
                    <Input
                      id="subject"
                      type="text"
                      placeholder="How can we help?"
                      required
                      className="rounded-xl border-gray-700 bg-gray-900 text-white placeholder-gray-500 focus:ring-blue-400 focus:border-blue-400"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="message" className="text-white">Message</FieldLabel>
                    <textarea
                      id="message"
                      placeholder="Tell us more about your inquiry..."
                      required
                      rows={6}
                      className="rounded-xl border border-gray-700 bg-gray-900 text-white placeholder-gray-500 focus:ring-blue-400 focus:border-blue-400 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400/50"
                    />
                  </Field>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all py-3"
                  >
                    Send Message
                  </Button>
                </FieldGroup>
              </form>
            </div>

            {/* Right Side - Contact Info & Geometric Shape */}
            <div className="space-y-8">
              {/* Contact Information */}
              <div className="space-y-6">
                <h2 className="text-3xl font-extrabold">Other Ways to Reach Us</h2>

                <div className="space-y-4">
                  {[
                    {
                      icon: "📧",
                      title: "Email",
                      description: "support@athenaai.com",
                      link: "mailto:support@athenaai.com",
                    },
                    {
                      icon: "🤝",
                      title: "Social Media",
                      description: "Follow us on LinkedIn and Twitter for updates",
                      link: "#",
                    },
                    {
                      icon: "⏱️",
                      title: "Response Time",
                      description: "We typically respond within 24-48 hours",
                      link: "#",
                    },
                  ].map((contact, index) => (
                    <a
                      key={index}
                      href={contact.link}
                      className="p-4 rounded-xl bg-gray-950 border border-gray-800 hover:border-blue-600 transition block"
                    >
                      <div className="text-2xl mb-2">{contact.icon}</div>
                      <h3 className="font-semibold text-lg mb-1">{contact.title}</h3>
                      <p className="text-gray-400">{contact.description}</p>
                    </a>
                  ))}
                </div>
              </div>

              {/* Geometric Shape */}
              <div className="hidden lg:block relative h-64 mt-8">
                <div className="relative w-full h-full">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-500 to-purple-900 rounded-3xl transform skew-x-12 opacity-50"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 px-6 md:px-12 bg-gray-950 border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-extrabold mb-8 text-center">Frequently Asked Questions</h2>

          <div className="space-y-4">
            {[
              {
                question: "How quickly do you respond to inquiries?",
                answer: "We aim to respond to all inquiries within 24-48 hours. For urgent matters, please mark your email as priority.",
              },
              {
                question: "Can I schedule a demo?",
                answer: "Absolutely! Please include your preferred time in your message and we'll work with you to schedule a suitable time.",
              },
              {
                question: "Do you offer enterprise solutions?",
                answer: "Yes, we provide customized solutions for educational institutions and organizations. Contact us for more details.",
              },
              {
                question: "What languages does Athena AI support?",
                answer: "Currently, Athena AI supports English. We're working on adding additional languages soon.",
              },
            ].map((faq, index) => (
              <details key={index} className="group p-4 rounded-xl bg-black border border-gray-800 hover:border-blue-600 transition cursor-pointer">
                <summary className="font-semibold flex items-center justify-between">
                  {faq.question}
                  <span className="text-blue-400 group-open:rotate-180 transition">▼</span>
                </summary>
                <p className="text-gray-400 mt-3 leading-relaxed">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 px-6 md:px-12 text-center border-t border-gray-800">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-4xl font-extrabold">
            Ready to Get Started?
          </h2>
          <p className="text-lg text-gray-300">
            Join Athena AI and transform the way you learn.
          </p>
          <div className="flex gap-4 justify-center">
            {auth.isAuthenticated ? (
              <>
                <Link to="/chat">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-8 py-3 text-lg">
                    Open Chat
                  </Button>
                </Link>
                <button onClick={() => auth.logout()} className="bg-gray-800 text-white font-semibold rounded-full px-8 py-3 hover:bg-gray-700">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/signup">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-8 py-3 text-lg">
                    Sign Up
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="outline" className="border-2 border-gray-500 hover:border-white text-white font-semibold rounded-full px-8 py-3 text-lg bg-transparent">
                    Sign In
                  </Button>
                </Link>
              </>
            )}
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
