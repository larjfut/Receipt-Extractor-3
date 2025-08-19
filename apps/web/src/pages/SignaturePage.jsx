import React, { useEffect, useRef, useState } from 'react'
import { useReceipt } from '../receiptContext.jsx'

export default function SignaturePage() {
  const { signatureDataUrl, setSignatureDataUrl } = useReceipt()
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const isDrawingRef = useRef(false)
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 200 })

  // Handle canvas resizing
  useEffect(() => {
    function updateCanvasSize() {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth
        const maxWidth = Math.min(containerWidth - 32, 600)
        const height = Math.max(200, Math.min(maxWidth * 0.33, 250))

        setCanvasSize({ width: maxWidth, height })
      }
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)
    return () => window.removeEventListener('resize', updateCanvasSize)
  }, [])

  // Drawing functionality
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')

    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000000'

    function getEventPos(e) {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      let clientX, clientY

      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX
        clientY = e.touches[0].clientY
        e.preventDefault()
      } else {
        clientX = e.clientX
        clientY = e.clientY
      }

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      }
    }

    function startDrawing(e) {
      isDrawingRef.current = true
      setIsDrawing(true)
      const pos = getEventPos(e)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }

    function draw(e) {
      if (!isDrawingRef.current) return

      const pos = getEventPos(e)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }

    function stopDrawing(e) {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false
      setIsDrawing(false)
      ctx.beginPath()

      setSignatureDataUrl(canvas.toDataURL('image/png'))
    }

    canvas.addEventListener('mousedown', startDrawing)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDrawing)
    canvas.addEventListener('mouseout', stopDrawing)

    canvas.addEventListener('touchstart', startDrawing, { passive: false })
    canvas.addEventListener('touchmove', draw, { passive: false })
    canvas.addEventListener('touchend', stopDrawing)
    canvas.addEventListener('touchcancel', stopDrawing)

    return () => {
      canvas.removeEventListener('mousedown', startDrawing)
      canvas.removeEventListener('mousemove', draw)
      canvas.removeEventListener('mouseup', stopDrawing)
      canvas.removeEventListener('mouseout', stopDrawing)
      canvas.removeEventListener('touchstart', startDrawing)
      canvas.removeEventListener('touchmove', draw)
      canvas.removeEventListener('touchend', stopDrawing)
      canvas.removeEventListener('touchcancel', stopDrawing)
    }
  }, [setSignatureDataUrl])

  function clearSignature() {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setSignatureDataUrl(null)
    }
  }

  return (
    <div>
      <h2>Signature</h2>

      <div ref={containerRef} className='w-full max-w-md mx-auto'>
        <div className='relative w-full border-2 border-gray-400 rounded-lg bg-white shadow-md'>
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className='w-full h-auto block cursor-crosshair touch-none'
          />

          {!signatureDataUrl && (
            <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none text-center'>
              Sign here
            </div>
          )}
        </div>

        <div className='flex justify-between items-center mt-3 gap-3'>
          <button
            onClick={clearSignature}
            className='bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-all focus:outline-none focus:ring-2 focus:ring-red-400 text-sm'
          >
            Clear
          </button>

          <div className='text-xs text-gray-600 text-center flex-1'>
            {signatureDataUrl ? '✓ Signature captured' : 'Draw your signature above'}
          </div>

          <div className='text-xs text-gray-400'>
            {canvasSize.width} × {canvasSize.height}
          </div>
        </div>
      </div>

      {signatureDataUrl && (
        <div className='mt-6'>
          <h3>Preview</h3>
          <div className='border border-gray-300 rounded p-4 bg-gray-100 text-center'>
            <img
              src={signatureDataUrl}
              alt="Signature preview"
              className='max-w-full h-auto border border-gray-300 rounded'
            />
          </div>
        </div>
      )}
    </div>
  )
}

