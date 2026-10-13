import type { ReactElement } from "react"
import { render } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { AuthProvider } from "@/context/auth"

/** Render a page inside the router and auth context, at the given URL. */
export function renderPage(element: ReactElement, { path = "/", url }: { path?: string; url?: string } = {}) {
  url ??= path
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <Routes>
          <Route path={path} element={element} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}
