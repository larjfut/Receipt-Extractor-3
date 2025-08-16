import React, { useEffect, useRef } from 'react'
import { useReceipt } from '../receiptContext.jsx'

export default function SignaturePage() {
  const { signatureDataUrl, setSignatureDataUrl } = useReceipt()
  const canvasRef = useRef(null)
  let drawing = false

  useEffect(() => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    const start = e => { drawing = true; draw(e) }
    const end = () => { drawing = false; ctx.beginPath(); setSignatureDataUrl(c.toDataURL('image/png')) }
    const draw = e => {
      if (!drawing) return
      const rect = c.getBoundingClientRect()
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
      ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y)
    }
    c.addEventListener('mousedown', start)
    c.addEventListener('mouseup', end)
    c.addEventListener('mousemove', draw)
    c.addEventListener('touchstart', start)
    c.addEventListener('touchend', end)
    c.addEventListener('touchmove', draw)
    return () => {
      c.removeEventListener('mousedown', start)
      c.removeEventListener('mouseup', end)
      c.removeEventListener('mousemove', draw)
      c.removeEventListener('touchstart', start)
      c.removeEventListener('touchend', end)
      c.removeEventListener('touchmove', draw)
    }
  }, [])

  return (
    <div>
      <h2>Signature</h2>
      <canvas ref={canvasRef} width="600" height="200" style={{border:'1px solid #999'}}></canvas>
      {signatureDataUrl && <>
        <p>Captured.</p>
        <img src={signatureDataUrl} alt="signature preview" style={{maxWidth:'100%'}} />
      </>}
    </div>
  )
}
