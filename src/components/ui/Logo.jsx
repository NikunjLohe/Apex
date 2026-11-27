export default function Logo({ size = 38, showText = true, tagline = false, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src="/logo.png?v=2"
        alt="Apex Multi Solutions Business Group"
        className="shrink-0 rounded-xl bg-white p-0.5 object-contain shadow-sm ring-1 ring-black/10"
        style={{ width: size, height: size }}
      />
      {showText && (
        <div className="leading-tight">
          <p className="text-base font-bold font-serif tracking-tight text-ink-1 sm:text-lg">Apex Multisolutions</p>
          {tagline && <p className="text-[9px] font-bold uppercase tracking-widest text-ink-2 mt-0.5">Performance Portal</p>}
        </div>
      )}
    </div>
  )
}
