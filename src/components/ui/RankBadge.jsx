import { useRanks } from '../../contexts/RanksContext'

const SIZES = {
  sm: 'h-6 px-2 text-[11px]',
  md: 'h-8 px-3 text-xs',
}

/** Gold badge showing rank code + name. */
export default function RankBadge({ rank, size = 'md', showName = false, className = '' }) {
  const { getRank } = useRanks()
  const r = getRank(rank)
  return (
    <span
      title={r.name}
      className={`inline-flex items-center gap-1.5 rounded-full border border-gold-1/40 bg-gold-1/10 font-bold uppercase tracking-wide text-gold ${SIZES[size]} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-gold-2" />
      {r.code}
      {showName && <span className="font-medium normal-case text-ink-2">· {r.name}</span>}
    </span>
  )
}
