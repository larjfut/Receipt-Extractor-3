import React, { useState } from 'react'
import axios from 'axios'
import { useReceipt } from '../receiptContext.jsx'
import { getToken } from '../msal.js'
import Alert from '../components/Alert.jsx'

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
      {message && (
        <Alert type='success' className='mb-4'>
          {message}
        </Alert>
      )}
      {error && (
        <Alert type='error' className='mb-4'>
          {error}
        </Alert>
      )}
      <h2>Submit</h2>
      <p>Files: {files.map(f => f.name).join(', ') || 'None'}</p>
      <p>Batch: {batchId || 'n/a'}</p>
      <button className='btn-primary' onClick={onSubmit}>Submit</button>
    </div>
  )
}
