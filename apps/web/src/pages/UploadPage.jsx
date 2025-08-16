import React, { useState } from 'react'
import axios from 'axios'
import { useReceipt } from '../receiptContext.jsx'
import { getToken } from '../msal.js'
import { useNavigate } from 'react-router-dom'

export default function UploadPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { setFiles, setFields, setBatchId } = useReceipt()
  const navigate = useNavigate()

  async function onSelect(e) {
    const fl = Array.from(e.target.files || [])
    if (fl.length === 0) return
    setFiles(fl)
    setBusy(true); setError('')
    try {
      const token = await getToken()
      const fd = new FormData()
      fl.forEach(f => fd.append('files', f, f.name))
      const res = await axios.post('/api/upload', fd, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setFields(res.data.fields || {})
      setBatchId(res.data.batchId || null)
      navigate('/review')
    } catch (err) {
      console.error(err)
      setError(err?.response?.data?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2>Upload Receipts</h2>
      <input type="file" accept="image/*,application/pdf" multiple onChange={onSelect} />
      {busy && <p>Extracting...</p>}
      {error && <p style={{color:'crimson'}}>{error}</p>}
    </div>
  )
}
