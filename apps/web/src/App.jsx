import React, { useEffect } from 'react'
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
    initMsal().catch(error => {
      console.error('MSAL init error:', error)
    })
  }, [])

  return (
    <ErrorBoundary>
      <ReceiptProvider>
        <div className='min-h-screen md:flex'>
          <Sidebar />
          <main className='flex-1 p-4 md:ml-64'>
            <ErrorBoundary>
              <Routes>
                <Route path='/' element={<Upload />} />
                <Route path='/review' element={<Review />} />
                <Route path='/signature' element={<Signature />} />
                <Route path='/submit' element={<Submit />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </ReceiptProvider>
    </ErrorBoundary>
  )
}

function Sidebar() {
  return (
    <aside className='bg-white/10 backdrop-blur w-full md:fixed md:inset-y-0 md:w-64 p-4 flex md:flex-col gap-4'>
      <h1 className='text-xl font-semibold'>Receipt Extractor</h1>
      <nav className='flex md:flex-col gap-2 md:gap-4 w-full justify-around md:justify-start'>
        <NavLink to='/'>Upload</NavLink>
        <NavLink to='/review'>Review</NavLink>
        <NavLink to='/signature'>Signature</NavLink>
        <NavLink to='/submit'>Submit</NavLink>
      </nav>
    </aside>
  )
}

function NavLink({ to, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <button
      onClick={() => navigate(to)}
      className={`btn-primary ${isActive ? 'bg-cyan-600' : ''}`}
    >
      {children}
    </button>
  )
}
