import React from 'react'
import { useReceipt } from '../receiptContext.jsx'

export default function ReviewPage() {
  const { fields, setFields } = useReceipt()

  function update(k, v) { setFields({ ...fields, [k]: v }) }

  const keys = Object.keys(fields || {})
  return (
    <div className='max-w-screen w-full px-4 mx-auto'>
      <h2 className='text-xl sm:text-2xl md:text-3xl mb-4 sm:mb-6'>Review</h2>
      {keys.length === 0 && (
        <p className='text-sm sm:text-base'>No fields yet. Upload a receipt first.</p>
      )}
      {keys.map(k => (
        <div key={k} className='mb-2 sm:mb-4'>
          <label className='block font-semibold text-sm sm:text-base md:text-lg'>{k}</label>
          <input
            className='mt-1 w-full p-1 sm:p-2 border rounded text-sm sm:text-base md:text-lg'
            value={fields[k] ?? ''}
            onChange={e => update(k, e.target.value)}
          />
        </div>
      ))}
    </div>
  )
}
