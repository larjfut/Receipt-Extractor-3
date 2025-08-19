import React, { useState } from 'react'
import axios from 'axios'
import { useReceipt } from '../receiptContext.jsx'
import { getToken } from '../msal.js'

export default function SubmitPage() {
  const { files, fields, signatureDataUrl, batchId } = useReceipt()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function onSubmit() {
    setMessage(''); setError('')
    try {
      const token = await getToken()
      const res = await axios.post('/api/submit', { fields, signatureDataUrl, batchId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setMessage(`Submitted. Item ID: ${res.data.itemId}`)
    } catch (e) {
      setError(e?.response?.data?.message || e.message)
    }
  }

  return (
    <div>
      <h2>Submit</h2>
      <p>Files: {files.map(f => f.name).join(', ') || 'None'}</p>
      <p>Batch: {batchId || 'n/a'}</p>
      <button className='btn-primary' onClick={onSubmit}>Submit</button>
      {message && (
        <p className='bg-green-600 text-white p-4 rounded-lg mt-4'>{message}</p>
      )}
      {error && (
        <p className='bg-red-600 text-white p-4 rounded-lg mt-4'>{error}</p>
      )}
    </div>
  )
}
