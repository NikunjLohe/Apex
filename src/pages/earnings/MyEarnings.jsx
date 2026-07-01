import { useEffect, useMemo, useState } from 'react'
import { where } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection, fetchCollection } from '../../hooks/useFirestore'
import { computeEarnings } from '../../lib/earnings'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR, formatCompactINR } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats } from '../../components/ui/LoadingSkeleton'
import { ITrophy, ICash, IShield } from '../../components/ui/icons'

export default function MyEarnings() {
  const { profile } = useAuth()
  const uid = profile?.uid
  const ownPlans = useCollection('plans', uid ? [where('agentId', '==', uid)] : [], `my-plans-${uid}`)
  const payments = useCollection('payments', uid ? [where('agentId', '==', uid)] : [], `my-pay-${uid}`)
  const [downlinePlans, setDownlinePlans] = useState([])

  // Direct downline → their plans (approx for CMD "other legs")
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    ;(async () => {
      try {
        const downline = await fetchCollection('users', [where('referredBy', '==', uid)])
        const ids = downline.map((d) => d.id).slice(0, 10)
        if (!ids.length) { if (!cancelled) setDownlinePlans([]); return }
        const plans = await fetchCollection('plans', [where('agentId', 'in', ids)])
        if (!cancelled) setDownlinePlans(plans)
      } catch {
        if (!cancelled) setDownlinePlans([])
      }
    })()
    return () => { cancelled = true }
  }, [uid])

  const { getRank, nextRank, config } = useRanks()

  const model = useMemo(
    () => computeEarnings({ rank: profile?.rank, ownPlans: ownPlans.data, payments: payments.data, downlinePlans, ranksConfig: config }),
    [profile?.rank, ownPlans.data, payments.data, downlinePlans, config]
  )

  const loading = ownPlans.loading || payments.loading
  const rank = getRank(profile?.rank)
  const next = nextRank(profile?.rank)

  if (loading) return <div className="mx-auto max-w-5xl space-y-5"><div className="card h-32" /><SkeletonStats count={4} /></div>

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Rank card */}
      <div className="card relative overflow-hidden p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-ink-1">{profile?.name}</h2>
              <RankBadge rank={profile?.rank} />
            </div>
            <p className="mt-1 text-sm text-ink-2">{rank.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-ink-2">Earnings this month</p>
            <p className="text-3xl font-extrabold text-gold">{formatINR(model.totalThisMonth)}</p>
          </div>
        </div>
        {next && (
          <div className="relative mt-5">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-ink-2">Progress to {next.code}</span>
              <span className="text-ink-2">{formatCompactINR(model.lifetimeBV)} / {formatCompactINR(model.promo.target)}</span>
            </div>
            <Bar pct={model.promo.progress} />
          </div>
        )}
      </div>

      {/* Component cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric icon={<ICash size={18} />} label="MDA (this month)" value={formatINR(model.mda)} sub={`on ${formatCompactINR(model.monthBV)} BV`} />
        <Metric icon={<ICash size={18} />} label="MFA" value={formatINR(model.mfa)} sub={<StatusBadge status="pending" label="Pending" />} />
        <Metric icon={<ICash size={18} />} label="Travel Allowance" value={formatINR(model.ta)} sub="Monthly" />
        <Metric icon={<IShield size={18} />} label="FD / Pension" value={formatINR(model.fdAccrual)} sub="Accrued" />
      </div>

      {/* Performance bonus */}
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <ITrophy size={20} className="text-gold" />
          <h3 className="font-semibold text-ink-1">Performance Bonus</h3>
        </div>
        {model.pb.target > 0 ? (
          <>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-ink-2">{formatINR(model.pb.current)} of {formatINR(model.pb.target)}</span>
              <span className={model.pb.achieved ? 'font-semibold text-ok' : 'text-ink-2'}>{model.pb.achieved ? `Earned ${formatINR(model.pb.amount)}` : `Reward ${formatINR(model.pb.amount)}`}</span>
            </div>
            <Bar pct={model.pb.progress} green={model.pb.achieved} />
          </>
        ) : (
          <p className="text-sm text-ink-2">No performance bonus target at this rank.</p>
        )}
      </div>

      {/* CMD award */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IShield size={20} className="text-gold" />
            <h3 className="font-semibold text-ink-1">CMD Award Progress</h3>
          </div>
          <StatusBadge status={model.cmd.qualified ? 'verified' : 'pending'} label={model.cmd.qualified ? 'Qualified' : 'In progress'} />
        </div>

        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-ink-2">Weighted BV {formatCompactINR(model.cmd.weightedTotal)} of {formatCompactINR(model.cmd.target)}</span>
          <span className="font-semibold text-gold">{formatINR(model.cmd.amount)}</span>
        </div>
        <Bar pct={model.cmd.progress} />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Leg label="Main Leg BV" value={model.cmd.mainLeg} ok={model.cmd.mainOk} note="≥ 80% required" />
          <Leg label="Other Legs BV" value={model.cmd.otherLegs} ok={model.cmd.otherOk} note="≥ 20% required" />
        </div>

        <div className="mt-4 rounded-card border border-navy-4 bg-navy-2 p-3 text-xs text-ink-2">
          <p className="font-semibold text-ink-1">Weighting formula</p>
          <p className="mt-1">1Y RD × 25% &nbsp;•&nbsp; 2Y RD × 50% &nbsp;•&nbsp; 3Y+ RD × 100% &nbsp;•&nbsp; FD × 100%</p>
          <p className="mt-1 text-gold">RD counted only after 12 installments paid · Target = 80% Main Leg + 20% min Other Legs</p>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon, label, value, sub }) {
  return (
    <div className="card p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-card border border-gold-1/20 bg-gold-1/10 text-gold">{icon}</span>
      <p className="mt-2 text-sm text-ink-2">{label}</p>
      <p className="text-lg font-bold text-ink-1">{value}</p>
      <div className="mt-0.5 text-xs text-ink-2">{sub}</div>
    </div>
  )
}
function Leg({ label, value, ok, note }) {
  return (
    <div className="rounded-card border border-navy-4 bg-navy-2 p-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="text-lg font-bold text-ink-1">{formatINR(value)}</p>
      <p className={`text-[11px] ${ok ? 'text-ok' : 'text-ink-2'}`}>{ok ? '✓ ' : ''}{note}</p>
    </div>
  )
}
function Bar({ pct, green }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-navy-2">
      <div className={`h-full rounded-full ${green ? 'bg-ok' : 'bg-gold-1'}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}
