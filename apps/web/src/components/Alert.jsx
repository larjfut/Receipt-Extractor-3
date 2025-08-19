import React from 'react'

function XCircleIcon({ className }) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      fill='none'
      viewBox='0 0 24 24'
      strokeWidth={1.5}
      stroke='currentColor'
      className={className}
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
      />
    </svg>
  )
}

function CheckCircleIcon({ className }) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      fill='none'
      viewBox='0 0 24 24'
      strokeWidth={1.5}
      stroke='currentColor'
      className={className}
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M9 12.75l2.25 2.25L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
      />
    </svg>
  )
}

export default function Alert({ type = 'success', className = '', children }) {
  const Icon = type === 'error' ? XCircleIcon : CheckCircleIcon
  const bg = type === 'error' ? 'bg-red-600' : 'bg-green-600'
  return (
    <div
      className={`${bg} text-white p-4 rounded-lg flex items-start gap-2 ${className}`}
      role='alert'
    >
      <Icon className='h-5 w-5 shrink-0 mt-0.5' />
      <div className='flex-1'>{children}</div>
    </div>
  )
}
