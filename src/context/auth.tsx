import React, { createContext, useContext, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { clearSession } from "@/lib/api"

type User = {
  id?: number
  email?: string
  first_name?: string
  last_name?: string
}

type AuthContextType = {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem("user")
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem("access_token")
  })

  const navigate = useNavigate()

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "access_token") setAccessToken(e.newValue)
      if (e.key === "user") setUser(e.newValue ? JSON.parse(e.newValue) : null)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const logout = () => {
    clearSession()
    setUser(null)
    setAccessToken(null)
    navigate("/login")
  }

  const value: AuthContextType = {
    user,
    accessToken,
    isAuthenticated: !!accessToken,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
