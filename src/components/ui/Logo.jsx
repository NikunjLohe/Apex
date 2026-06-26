export default function Logo({ size = 38, showText = true, tagline = false, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex items-center justify-center rounded-card bg-gold-1" style={{ width: size, height: size }}>
        <svg viewBox="0 0 64 64" style={{ width: size * 0.56, height: size * 0.56 }}>
          <path d="M32 12L48 46H40L32 28L24 46H16L32 12Z" fill="#0A0F1E" />
        </svg>
      </span>
      {showText && (
        <div className="leading-tight">
          <p className="text-lg font-extrabold tracking-tight text-ink-1">APEX</p>
          {tagline && <p className="-mt-0.5 text-[10px] font-medium uppercase tracking-wider text-gold">Performance Portal</p>}
        </div>
      )}
    </div>
  )
}
