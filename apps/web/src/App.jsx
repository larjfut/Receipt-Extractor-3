import React, { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Upload from './pages/UploadPage.jsx'
import Review from './pages/ReviewPage.jsx'
import Signature from './pages/SignaturePage.jsx'
import Submit from './pages/SubmitPage.jsx'
import { initMsal } from './msal.js'
import { ReceiptProvider } from './receiptContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

export default function App() {
  useEffect(() => {
    if (import.meta.env.VITE_E2E !== 'true') {
      initMsal().catch((error) => {
        console.error('MSAL init error:', error)
      })
    }
  }, [])

  return (
    <ErrorBoundary>
      <ReceiptProvider>
        <div className="min-h-screen flex flex-col">
          <NavBar />
          <main className="flex-1 p-4">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Upload />} />
                <Route path="/review" element={<Review />} />
                <Route path="/signature" element={<Signature />} />
                <Route path="/submit" element={<Submit />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </ReceiptProvider>
    </ErrorBoundary>
  )
}

function NavBar() {
  const [open, setOpen] = useState(false)

  const links = [
    { to: '/', label: 'Upload', variant: 'primary' },
    { to: '/review', label: 'Review', variant: 'secondary' },
    { to: '/signature', label: 'Signature', variant: 'secondary' },
    { to: '/submit', label: 'Submit', variant: 'primary' },
  ]

  return (
    <nav className="bg-[#121421] text-white p-4 md:flex md:items-center md:justify-between">
      <div className="flex items-center justify-between h-16">
        <h1 className="text-xl font-semibold">Receipt Extractor</h1>
        <button
          onClick={() => setOpen((o) => !o)}
          className="md:hidden rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
          aria-controls="main-menu"
          aria-expanded={open}
        >
          <span className="sr-only">Toggle menu</span>
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>
      <ul
        id="main-menu"
        className={`${
          open
            ? 'max-h-40 opacity-100 visible sm:block'
            : 'max-h-0 opacity-0 invisible sm:hidden'
        } md:opacity-100 md:max-h-none md:visible md:flex md:flex-row transition-all duration-300 ease-in-out overflow-hidden flex flex-col md:space-x-4 items-center space-y-2 md:space-y-0 mt-2 md:mt-0`}
      >
        {links.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} variant={link.variant}>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function NavLink({ to, children, variant }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = location.pathname === to
  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'secondary'
        ? 'btn-secondary'
        : 'btn-tertiary'

  return (
    <button
      onClick={() => navigate(to)}
      className={`${variantClass} ${isActive ? 'border-b-2 border-cyan-500' : ''}`}
    >
      {children}
    </button>
  )
}
