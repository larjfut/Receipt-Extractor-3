import React, { useEffect } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import Upload from './pages/UploadPage.jsx'
import Review from './pages/ReviewPage.jsx'
import Signature from './pages/SignaturePage.jsx'
import Submit from './pages/SubmitPage.jsx'
import { msalInstance, login } from './msal.js'
import { ReceiptProvider } from './receiptContext.jsx'

export default function App() {
  useEffect(() => {
    msalInstance.handleRedirectPromise().then(async () => {
      const accounts = msalInstance.getAllAccounts()
      if (accounts.length === 0) {
        await login()
      }
    })
  }, [])

  return (
    <ReceiptProvider>
      <header style={{padding:'12px', borderBottom:'1px solid #eee'}}>
        <nav style={{display:'flex', gap:12}}>
          <Link to="/">Upload</Link>
          <Link to="/review">Review</Link>
          <Link to="/signature">Signature</Link>
          <Link to="/submit">Submit</Link>
        </nav>
      </header>
      <main style={{padding: '16px'}}>
        <Routes>
          <Route path="/" element={<Upload />} />
          <Route path="/review" element={<Review />} />
          <Route path="/signature" element={<Signature />} />
          <Route path="/submit" element={<Submit />} />
        </Routes>
      </main>
    </ReceiptProvider>
  )
}
