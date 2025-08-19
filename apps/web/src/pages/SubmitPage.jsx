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
    <div className='max-w-screen w-full px-4 mx-auto'>
      {message && (
        <Alert type='success' className='mb-4 sm:mb-6 md:mb-8'>
          {message}
        </Alert>
      )}
      {error && (
        <Alert type='error' className='mb-4 sm:mb-6 md:mb-8'>
          {error}
        </Alert>
      )}
      <h2 className='text-xl sm:text-2xl md:text-3xl mb-4 sm:mb-6'>Submit</h2>
      <p className='mb-2 sm:mb-3 text-sm sm:text-base'>Files: {files.map(f => f.name).join(', ') || 'None'}</p>
      <p className='mb-4 sm:mb-6 text-sm sm:text-base'>Batch: {batchId || 'n/a'}</p>
      <button className='btn-primary text-sm sm:text-base' onClick={onSubmit}>Submit</button>
    </div>
  )
}
