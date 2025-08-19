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
        <div className='min-h-screen flex flex-col'>
          <NavBar />
          <main className='flex-1 p-4'>
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

function NavBar() {
  return (
    <nav className='bg-[#121421] text-white p-4'>
      <div className='flex items-center justify-between h-16'>
        <h1 className='text-xl font-semibold'>Receipt Extractor</h1>
        <div className='hidden md:block lg:block'>
          <div className='flex space-x-4'>
            <NavLink to='/'>Upload</NavLink>
            <NavLink to='/review'>Review</NavLink>
            <NavLink to='/signature'>Signature</NavLink>
            <NavLink to='/submit'>Submit</NavLink>
          </div>
        </div>
      </div>
      <div className='flex flex-col items-center md:hidden space-y-2 mt-2'>
        <NavLink to='/'>Upload</NavLink>
        <NavLink to='/review'>Review</NavLink>
        <NavLink to='/signature'>Signature</NavLink>
        <NavLink to='/submit'>Submit</NavLink>
      </div>
    </nav>
  )
}

function NavLink({ to, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <button
      onClick={() => navigate(to)}
      className={`px-4 py-2 rounded transition-all hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
        isActive ? 'border-b-2 border-cyan-400' : ''
      }`}
    >
      {children}
    </button>
  )
}
