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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
