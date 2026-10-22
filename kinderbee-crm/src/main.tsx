import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { brand } from './config/brand'
import { AuthProvider } from './auth'
import App from './App'
import './index.css'

const root = document.documentElement
root.style.setProperty('--brand-primary', brand.colors.primary)
root.style.setProperty('--brand-charcoal', brand.colors.charcoal)
root.style.setProperty('--brand-cream', brand.colors.cream)
document.title = brand.name

let theme: string | null = null
try { theme = localStorage.getItem('theme') } catch { /* storage blocked */ }
if (theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches)) root.classList.add('dark')

// After a redeploy, an open tab asks for page chunks that no longer exist: reload once to pick up the new build
window.addEventListener('vite:preloadError', (e) => {
  let last = 0
  try { last = Number(sessionStorage.getItem('chunk-reload')) || 0 } catch { /* storage blocked */ }
  if (Date.now() - last < 10_000) return // reloaded just now and still failing: let the error page show
  e.preventDefault()
  try { sessionStorage.setItem('chunk-reload', String(Date.now())) } catch { /* storage blocked */ }
  location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
