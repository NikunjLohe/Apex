export default function Logo({ size = 38, showText = true, tagline = false, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img 
        src="/logo.png" 
        alt="Krantibhumi" 
        className="rounded-full bg-white p-0.5 object-contain" 
        style={{ width: size, height: size }}
      />
      {showText && (
        <div className="leading-tight">
          <p className="text-base font-bold font-serif tracking-tight text-ink-1 sm:text-lg">Krantibhumi</p>
          {tagline && <p className="text-[9px] font-bold uppercase tracking-widest text-ink-2 mt-0.5">Performance Portal</p>}
        </div>
      )}
    </div>
  )
}
