import React from 'react'
import { useReceipt } from '../receiptContext.jsx'

export default function ReviewPage() {
  const { fields, setFields } = useReceipt()

  function update(k, v) { setFields({ ...fields, [k]: v }) }

  const keys = Object.keys(fields || {})
  return (
    <div>
      <h2>Review</h2>
      {keys.length === 0 && <p>No fields yet. Upload a receipt first.</p>}
      {keys.map(k => (
        <div key={k} style={{marginBottom:8}}>
          <label style={{display:'block', fontWeight:600}}>{k}</label>
          <input value={fields[k] ?? ''} onChange={e => update(k, e.target.value)} />
        </div>
      ))}
    </div>
  )
}
