import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/auth"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Link } from "react-router-dom"
import { Footer } from "@/components/footer"
import { API_URL, errorMessage } from "@/lib/api"

interface SignupErrors {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
  const auth = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate('/chat')
    }
  }, [auth.isAuthenticated, navigate])

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  })
  const [errors, setErrors] = useState<SignupErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")

  const validateForm = () => {
    const newErrors: SignupErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = "Full name is required"
    }

    if (!formData.email) {
      newErrors.email = "Email is required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email"
    }

    if (!formData.password) {
      newErrors.password = "Password is required"
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters"
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password"
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData(prev => ({
      ...prev,
      [id]: value,
    }))
    // Clear error for this field when user starts typing
    if (errors[id as keyof SignupErrors]) {
      setErrors(prev => ({
        ...prev,
        [id]: undefined,
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        // Store tokens in localStorage
        localStorage.setItem('access_token', data.access)
        localStorage.setItem('refresh_token', data.refresh)
        localStorage.setItem('user', JSON.stringify(data.user))

        setSuccessMessage("Account created successfully! Redirecting...")
        setFormData({ name: "", email: "", password: "", confirmPassword: "" })

        // Redirect to home after 2 seconds
        setTimeout(() => {
          window.location.href = '/'
        }, 2000)
      } else {
        const errorData = await response.json()
        // FastAPI returns {detail: string} or validation errors {detail: [{loc, msg}]}
        const message = errorMessage(errorData, 'Signup failed')
        const isPasswordError = Array.isArray(errorData?.detail) &&
          errorData.detail.some((d: { loc?: string[] }) => d.loc?.includes('password'))
        setErrors(isPasswordError ? { password: message } : { email: message })
      }
    } catch (error) {
      setErrors({
        email: 'Unable to connect to server',
      })
      console.error('Signup error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
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
          <Link to="/contact" className="hover:text-blue-400 transition">Contact</Link>
          {auth.isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 truncate max-w-[12rem]">{auth.user?.email}</span>
              <button onClick={() => auth.logout()} className="bg-gray-800 text-white px-4 py-2 rounded-full hover:bg-gray-700">Logout</button>
            </div>
          ) : (
            <Link to="/login">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-6 py-2">
                Login
              </Button>
            </Link>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="flex flex-col lg:flex-row items-center justify-center gap-12 w-full">
          {/* Left Side - Geometric Shape */}
          <div className="hidden lg:flex w-1/2 items-center justify-center relative">
            <div className="relative w-96 h-96">
              {/* Outer gradient shape */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-500 to-purple-900 rounded-3xl transform -skew-x-12 opacity-90"></div>
              {/* Inner darker shape for depth */}
              <div className="absolute inset-4 bg-gradient-to-br from-gray-900 to-black rounded-2xl transform -skew-x-12"></div>
            </div>
          </div>

          {/* Right Side - Signup Card */}
          <div className="w-full lg:w-1/2 flex items-center justify-center">
            <Card
              {...props}
              className="max-w-md w-full rounded-3xl shadow-2xl border border-gray-800 bg-gray-950"
            >
              <CardHeader className="text-center space-y-4">
                <div className="flex justify-center mb-2">
                  <img src="/aze-removebg-preview.png" alt="Athena AI Logo" className="h-16 w-16 object-contain" />
                </div>
                <CardTitle className="text-3xl font-extrabold text-white">
                  Create an Account
                </CardTitle>
                <CardDescription className="text-gray-400 text-sm">
                  Join us and start learning smarter today
                </CardDescription>
              </CardHeader>
              <CardContent>
                {successMessage && (
                  <div className="mb-4 p-3 bg-green-900/20 border border-green-600 rounded-lg text-green-400 text-sm text-center">
                    {successMessage}
                  </div>
                )}
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <FieldGroup className="space-y-4">
                    <Field>
                      <FieldLabel htmlFor="name" className="text-white">Full Name</FieldLabel>
                      <Input
                        id="name"
                        type="text"
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="rounded-xl border-gray-700 bg-gray-900 text-white placeholder-gray-500 focus:ring-blue-400 focus:border-blue-400"
                      />
                      {errors.name && (
                        <p className="text-red-400 text-sm mt-1">{errors.name}</p>
                      )}
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="email" className="text-white">Email</FieldLabel>
                      <Input
                        id="email"
                        type="email"
                        placeholder="m@example.com"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        className="rounded-xl border-gray-700 bg-gray-900 text-white placeholder-gray-500 focus:ring-blue-400 focus:border-blue-400"
                      />
                      {errors.email && (
                        <p className="text-red-400 text-sm mt-1">{errors.email}</p>
                      )}
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="password" className="text-white">Password</FieldLabel>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        className="rounded-xl border-gray-700 bg-gray-900 text-white placeholder-gray-500 focus:ring-blue-400 focus:border-blue-400"
                      />
                      {errors.password && (
                        <p className="text-red-400 text-sm mt-1">{errors.password}</p>
                      )}
                      <p className="text-gray-500 text-xs mt-1">
                        Must be at least 8 characters long.
                      </p>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="confirmPassword" className="text-white">Confirm Password</FieldLabel>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        required
                        className="rounded-xl border-gray-700 bg-gray-900 text-white placeholder-gray-500 focus:ring-blue-400 focus:border-blue-400"
                      />
                      {errors.confirmPassword && (
                        <p className="text-red-400 text-sm mt-1">{errors.confirmPassword}</p>
                      )}
                    </Field>

                    <FieldGroup className="space-y-3 mt-4">
                      <Field>
                        <Button
                          type="submit"
                          disabled={isLoading}
                          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isLoading ? "Creating Account..." : "Create Account"}
                        </Button>
                        <p className="text-center text-gray-400 mt-2 text-sm">
                          Already have an account?{" "}
                          <Link to="/login" className="text-blue-400 hover:underline">
                            Sign in
                          </Link>
                        </p>
                      </Field>
                    </FieldGroup>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  )
}
