import React, { useEffect, useRef, useState } from 'react'
import { useReceipt } from '../receiptContext.jsx'

export default function SignaturePage() {
  const { signatureDataUrl, setSignatureDataUrl } = useReceipt()
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
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
      setIsDrawing(true)
      const pos = getEventPos(e)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }

    function draw(e) {
      if (!isDrawing) return

      const pos = getEventPos(e)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }

    function stopDrawing(e) {
      if (!isDrawing) return
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
  }, [isDrawing, setSignatureDataUrl])

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

      <div
        ref={containerRef}
        style={{
          width: '100%',
          maxWidth: '600px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            border: '2px solid #999',
            borderRadius: '8px',
            backgroundColor: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              cursor: isDrawing ? 'crosshair' : 'crosshair',
              touchAction: 'none', // Prevent scrolling on mobile
            }}
          />

          {!signatureDataUrl && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#999',
                fontSize: '16px',
                pointerEvents: 'none',
                textAlign: 'center',
              }}
            >
              Sign here
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '12px',
            gap: '12px',
          }}
        >
          <button
            onClick={clearSignature}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = '#c82333')}
            onMouseOut={(e) => (e.target.style.backgroundColor = '#dc3545')}
          >
            Clear
          </button>

          <div
            style={{
              fontSize: '12px',
              color: '#666',
              textAlign: 'center',
              flex: 1,
            }}
          >
            {signatureDataUrl
              ? '✓ Signature captured'
              : 'Draw your signature above'}
          </div>

          <div
            style={{
              fontSize: '12px',
              color: '#999',
            }}
          >
            {canvasSize.width} × {canvasSize.height}
          </div>
        </div>
      </div>

      {signatureDataUrl && (
        <div style={{ marginTop: '24px' }}>
          <h3>Preview</h3>
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: '4px',
              padding: '16px',
              backgroundColor: '#f8f9fa',
              textAlign: 'center',
            }}
          >
            <img
              src={signatureDataUrl}
              alt="Signature preview"
              style={{
                maxWidth: '100%',
                height: 'auto',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
