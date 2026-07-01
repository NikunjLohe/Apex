export default function Logo({ size = 38, showText = true, tagline = false, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span 
        className="flex items-center justify-center rounded-[8px] bg-gold-1 text-white font-serif font-extrabold" 
        style={{ width: size, height: size, fontSize: size * 0.58, lineHeight: 1 }}
      >
        S
      </span>
      {showText && (
        <div className="leading-tight">
          <p className="text-base font-bold font-serif tracking-tight text-ink-1 sm:text-lg">Sahaayak</p>
          {tagline && <p className="text-[9px] font-bold uppercase tracking-widest text-ink-2 mt-0.5">Collections Ledger</p>}
        </div>
      )}
    </div>
  )
}
