import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight canvas signature pad. Calls onChange(blob|null) as the user
 * draws/clears. Also supports an alternative file upload (handled by parent).
 */
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#F0F4FF'
  }, [])

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const point = e.touches ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  const start = (e) => {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasInk(true)
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    canvasRef.current.toBlob((blob) => onChange?.(blob), 'image/png')
  }

  const clear = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange?.(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={500}
        height={160}
        className="h-40 w-full touch-none rounded-card border border-navy-4 bg-navy-2"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-ink-2">{hasInk ? 'Signature captured' : 'Draw signature above'}</span>
        <button type="button" onClick={clear} className="text-xs text-gold hover:underline">Clear</button>
      </div>
    </div>
  )
}
