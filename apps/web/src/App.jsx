import React, { useEffect } from 'react'
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import Upload from './pages/UploadPage.jsx'
import Review from './pages/ReviewPage.jsx'
import Signature from './pages/SignaturePage.jsx'
import Submit from './pages/SubmitPage.jsx'
import { msalInstance, login } from './msal.js'
import { ReceiptProvider } from './receiptContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

export default function App() {
  useEffect(() => {
    msalInstance
      .handleRedirectPromise()
      .then(async () => {
        const accounts = msalInstance.getAllAccounts()
        if (accounts.length === 0) {
          await login()
        }
      })
      .catch(error => {
        console.error('MSAL redirect error:', error)
      })
  }, [])

  return (
    <ErrorBoundary>
      <ReceiptProvider>
        <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
          <header
            style={{
              padding: '16px',
              backgroundColor: '#fff',
              borderBottom: '2px solid #e9ecef',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <nav
              style={{
                display: 'flex',
                gap: '24px',
                alignItems: 'center',
                maxWidth: '1200px',
                margin: '0 auto'
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: '24px',
                  color: '#343a40',
                  fontWeight: '600'
                }}
              >
                Receipt Extractor
              </h1>

              <div style={{ display: 'flex', gap: '16px', marginLeft: 'auto' }}>
                <NavLink to="/">Upload</NavLink>
                <NavLink to="/review">Review</NavLink>
                <NavLink to="/signature">Signature</NavLink>
                <NavLink to="/submit">Submit</NavLink>
              </div>
            </nav>
          </header>

          <main
            style={{
              padding: '24px 16px',
              maxWidth: '1200px',
              margin: '0 auto'
            }}
          >
            <ErrorBoundary>
              <Routes>
                <Route
                  path="/"
                  element=
                    {
                      <ErrorBoundary>
                        <Upload />
                      </ErrorBoundary>
                    }
                />
                <Route
                  path="/review"
                  element=
                    {
                      <ErrorBoundary>
                        <Review />
                      </ErrorBoundary>
                    }
                />
                <Route
                  path="/signature"
                  element=
                    {
                      <ErrorBoundary>
                        <Signature />
                      </ErrorBoundary>
                    }
                />
                <Route
                  path="/submit"
                  element=
                    {
                      <ErrorBoundary>
                        <Submit />
                      </ErrorBoundary>
                    }
                />
              </Routes>
            </ErrorBoundary>
          </main>

          <footer
            style={{
              padding: '16px',
              textAlign: 'center',
              color: '#6c757d',
              fontSize: '14px',
              borderTop: '1px solid #e9ecef',
              marginTop: '40px'
            }}
          >
            <p>Receipt Extractor - Secure document processing with Azure</p>
          </footer>
        </div>
      </ReceiptProvider>
    </ErrorBoundary>
  )
}

function NavLink({ to, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <button
      onClick={() => navigate(to)}
      style={{
        padding: '8px 16px',
        backgroundColor: isActive ? '#007bff' : 'transparent',
        color: isActive ? 'white' : '#007bff',
        border: '2px solid #007bff',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'all 0.2s ease'
      }}
      onMouseOver={e => {
        if (!isActive) {
          e.target.style.backgroundColor = '#007bff'
          e.target.style.color = 'white'
        }
      }}
      onMouseOut={e => {
        if (!isActive) {
          e.target.style.backgroundColor = 'transparent'
          e.target.style.color = '#007bff'
        }
      }}
    >
      {children}
    </button>
  )
}
