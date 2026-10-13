// main.tsx
import React from "react"
import ReactDOM from "react-dom/client"
import "./index.css" // Tailwind / global styles
import App from "./App"

// Create root and render the App
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
