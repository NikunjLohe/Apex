import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { mfaAPI } from '../../lib/supabase'
import { getMfaStatusMessage } from '../../lib/mfa'
import { MFA_SLABS } from '../../data/compensation'
import { formatINR, fmtDate } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import RankBadge from '../../components/ui/RankBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ITrophy, ICalendar, ICheck, IClock, IShield } from '../../components/ui/icons'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function MfaStatusBadge({ status }) {
  const styles = {
    achieved: 'bg-ok/15 text-ok border-ok/30',
    in_progress: 'bg-gold-1/15 text-gold-tan border-gold-1/30',
    missed: 'bg-red-500/15 text-red-400 border-red-500/30',
    not_applicable: 'bg-navy-2 text-ink-2 border-navy-4',
  }
  const labels = {
    achieved: 'Achieved',
    in_progress: 'In Progress',
    missed: 'Not Achieved',
    not_applicable: 'Not Applicable',
  }
  const key = status || 'in_progress'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border ${styles[key] || styles.in_progress}`}>
      {labels[key] || key}
    </span>
  )
}

export default function MyMfa() {
  const { profile } = useAuth()
  const nowYear = useMemo(() => new Date().getFullYear(), [])
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(nowYear)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    backendReady: true,
    currentRecord: null,
    contributions: [],
    history: [],
  })

  useEffect(() => {
    if (!profile?.id) return
    let active = true
    setLoading(true)

    mfaAPI
      .getAgentMfaDashboardData({
        agentProfile: profile,
        month: selectedMonth,
        year: selectedYear,
        autoSync: true,
      })
      .then((res) => {
        if (!active) return
        setData(res)
      })
      .catch((err) => {
        console.error('[MyMfa] Failed to load MFA data:', err)
        toast.error(err.message || 'Could not load Monthly MFA data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [profile, selectedMonth, selectedYear])

  const yearOptions = useMemo(() => {
    const set = new Set([nowYear - 1, nowYear, nowYear + 1])
    ;(data.history || []).forEach((h) => {
      if (h.year) set.add(Number(h.year))
    })
    return Array.from(set).sort((a, b) => b - a)
  }, [data.history, nowYear])

  const rec = data.currentRecord
  const contributions = useMemo(() => data.contributions || [], [data.contributions])
  const history = data.history || []
  const monthLabel = `${MONTH_NAMES[selectedMonth - 1] || selectedMonth} ${selectedYear}`
  const progressWidth = rec ? Math.min(100, Math.max(0, Number(rec.achievementPct || 0))) : 0

  const contributionTotals = useMemo(() => {
    return contributions.reduce(
      (acc, c) => ({
        raw: acc.raw + Number(c.businessAmount || 0),
        credit: acc.credit + Number(c.mfaCredit || 0),
      }),
      { raw: 0, credit: 0 }
    )
  }, [contributions])

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={4} />
        <SkeletonTable rows={4} cols={5} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header & Period Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-navy-4/50 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-extrabold text-ink-1 tracking-tight flex items-center gap-2">
            <ITrophy size={22} className="text-gold" /> Monthly Field Allowance (MFA)
          </h1>
          <p className="text-xs text-ink-2 mt-0.5">
            Track your monthly personal business MFA progress, duration credits, reward eligibility, and history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-ink-2">
            <ICalendar size={14} className="text-gold-tan" />
            <span>Period:</span>
          </div>
          <select
            aria-label="MFA Month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="field py-1.5 text-xs w-36"
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx + 1}>{name}</option>
            ))}
          </select>
          <select
            aria-label="MFA Year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="field py-1.5 text-xs w-24 font-mono"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Monthly MFA Dashboard Card */}
      {rec ? (
        <div className="card p-6 space-y-5 border-l-4 border-gold-1 bg-navy-3">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-navy-4/50 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-serif text-lg font-bold text-ink-1">
                  Monthly MFA &ndash; {monthLabel}
                </h2>
                <RankBadge rank={rec.rankSnapshot || profile?.rank} />
                <MfaStatusBadge status={rec.status} />
              </div>
              <p className="text-xs text-ink-2">
                Agent: <span className="text-ink-1 font-semibold">{profile?.name}</span>{' '}
                {profile?.sponsorCode && <span className="font-mono text-gold">({profile.sponsorCode})</span>}
                {' · '}Rank for Month: <strong className="text-ink-1">{rec.rankCodeSnapshot}</strong>
              </p>
            </div>

            {rec.applicable && (
              <div className="text-right">
                <span className="block text-[10px] uppercase tracking-wider text-ink-2">Reward on 100% Target</span>
                <span className="text-xl font-extrabold font-serif text-gold">{formatINR(rec.mfaReward)}</span>
              </div>
            )}
          </div>

          {rec.applicable ? (
            <>
              {/* 4 KPI Tiles */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="p-3.5 rounded-card bg-navy-2/60 border border-navy-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">Monthly Target</span>
                  <span className="text-lg font-extrabold text-ink-1 font-serif mt-1 block">{formatINR(rec.mfaTarget)}</span>
                </div>
                <div className="p-3.5 rounded-card bg-navy-2/60 border border-navy-4 border-l-2 border-l-gold-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">MFA Achieved</span>
                  <span className="text-lg font-extrabold text-gold font-serif mt-1 block">{formatINR(rec.totalMfaCredit)}</span>
                </div>
                <div className="p-3.5 rounded-card bg-navy-2/60 border border-navy-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">Remaining Target</span>
                  <span className="text-lg font-extrabold text-ink-1 font-serif mt-1 block">{formatINR(rec.remainingAmount)}</span>
                </div>
                <div className={`p-3.5 rounded-card border ${rec.isQualified ? 'bg-ok/10 border-ok/30' : 'bg-navy-2/60 border-navy-4'}`}>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">Reward Earned</span>
                  <span className={`text-lg font-extrabold font-serif mt-1 block ${rec.isQualified ? 'text-ok' : 'text-ink-2'}`}>
                    {formatINR(rec.rewardEarned)}
                  </span>
                </div>
              </div>

              {/* Progress Bar & Summary Line */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-bold text-ink-1">
                    {formatINR(rec.totalMfaCredit)} / {formatINR(rec.mfaTarget)}
                  </span>
                  <span className={`font-mono font-bold ${rec.isQualified ? 'text-ok' : 'text-gold'}`}>
                    {Number(rec.achievementPct || 0).toFixed(0)}% Achieved
                  </span>
                </div>

                <div className="w-full h-3 bg-navy-2 rounded-full overflow-hidden border border-navy-4">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${rec.isQualified ? 'bg-ok' : 'bg-gold'}`}
                    style={{ width: `${progressWidth}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-2">
                  <span>{formatINR(rec.remainingAmount)} Remaining</span>
                  <span>Reward on achievement: <strong className="text-ink-1">{formatINR(rec.mfaReward)}</strong></span>
                </div>
              </div>

              {/* Clear Status Message */}
              <div className={`p-3.5 rounded-card border flex items-center gap-2.5 text-xs ${
                rec.status === 'achieved'
                  ? 'bg-ok/10 border-ok/30 text-ok'
                  : rec.status === 'missed'
                    ? 'bg-red-500/10 border-red-500/25 text-red-400'
                    : 'bg-gold-1/10 border-gold-1/25 text-ink-1'
              }`}>
                {rec.status === 'achieved' ? <ICheck size={16} /> : <IClock size={16} />}
                <p className="font-semibold">
                  {getMfaStatusMessage({
                    status: rec.status,
                    remainingAmount: rec.remainingAmount,
                    rewardAmount: rec.mfaReward,
                    mfaTarget: rec.mfaTarget,
                  })}
                </p>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-card bg-navy-2/50 border border-navy-4 text-xs text-ink-2 flex items-center gap-2">
              <IShield size={16} className="text-gold-tan" />
              <span>
                Monthly MFA targets and rewards apply to Ranks 1&ndash;10 (AO to ED). Your snapshotted rank for {monthLabel} is <strong className="text-ink-1">{rec.rankCodeSnapshot}</strong>.
              </span>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<ITrophy size={24} />}
          title={`No MFA Record for ${monthLabel}`}
          message="Select another month or bring qualifying personal business to begin tracking Monthly MFA."
        />
      )}

      {/* Duration Credit Rules Reference Strip */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3 text-xs bg-navy-2/40">
        <div className="flex items-center gap-2 text-ink-1 font-semibold">
          <IShield size={15} className="text-gold" />
          <span>Duration-Based MFA Credit Rules:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="px-2.5 py-1 rounded bg-navy-3 border border-navy-4 font-mono text-[11px]">
            1 Year = <strong className="text-gold">25%</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-navy-3 border border-navy-4 font-mono text-[11px]">
            2 Years = <strong className="text-gold">50%</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-navy-3 border border-navy-4 font-mono text-[11px]">
            3+ Years = <strong className="text-ok">100%</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-navy-3 border border-navy-4 text-[11px] text-ink-2">
            Full reward earned at 100%+ &middot; Resets monthly
          </span>
        </div>
      </div>

      {/* Business Contribution Breakdown Table */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-navy-4/50">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
              MFA Business Breakdown &mdash; {monthLabel}
            </h3>
            <p className="text-[11px] text-ink-2">
              Personal qualifying policies counted once each toward {monthLabel} MFA credit.
            </p>
          </div>
          <span className="text-xs font-mono text-ink-2">
            {contributions.length} {contributions.length === 1 ? 'Policy' : 'Policies'}
          </span>
        </div>

        {contributions.length > 0 ? (
          <div className="table-wrap overflow-x-auto">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th>Business / Policy</th>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Date</th>
                  <th className="text-right">Business Amount</th>
                  <th className="text-center">Duration</th>
                  <th className="text-center">MFA %</th>
                  <th className="text-right">MFA Credit</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c.policyId || c.id}>
                    <td className="font-mono font-bold text-gold">{c.policyNumber}</td>
                    <td className="font-semibold text-ink-1">{c.customerName || '—'}</td>
                    <td className="uppercase font-semibold text-ink-2">{c.planCode || c.planType}</td>
                    <td className="font-mono text-ink-2">{c.businessDate ? fmtDate(c.businessDate) : '—'}</td>
                    <td className="text-right font-mono text-ink-1">{formatINR(c.businessAmount)}</td>
                    <td className="text-center text-ink-2">{c.durationYears} {c.durationYears === 1 ? 'Year' : 'Years'}</td>
                    <td className="text-center font-mono font-bold text-gold-tan">{c.mfaPercentage}%</td>
                    <td className="text-right font-mono font-bold text-ok">{formatINR(c.mfaCredit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy-2/60 font-bold border-t border-navy-4">
                  <td colSpan={4} className="text-ink-1 uppercase text-[11px]">Total Qualifying Business ({monthLabel})</td>
                  <td className="text-right font-mono text-ink-1">{formatINR(contributionTotals.raw)}</td>
                  <td colSpan={2} />
                  <td className="text-right font-mono text-gold">{formatINR(contributionTotals.credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-xs text-ink-2 italic py-6 text-center">
            No qualifying personal policies recorded for {monthLabel}.
          </p>
        )}
      </div>

      {/* Historical Monthly Records */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-navy-4/50">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
              Monthly MFA History
            </h3>
            <p className="text-[11px] text-ink-2">
              Each month resets to zero on the 1st and retains its snapshotted rank, target, and reward status.
            </p>
          </div>
        </div>

        {history.length > 0 ? (
          <div className="table-wrap overflow-x-auto">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Rank Snapshot</th>
                  <th className="text-right">Monthly Target</th>
                  <th className="text-right">MFA Achieved</th>
                  <th className="text-right">Remaining</th>
                  <th className="text-center">Progress</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Reward Earned</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const isCurrentSelection = h.month === selectedMonth && h.year === selectedYear
                  return (
                    <tr
                      key={`${h.year}-${h.month}`}
                      onClick={() => {
                        setSelectedMonth(h.month)
                        setSelectedYear(h.year)
                      }}
                      className={`cursor-pointer ${isCurrentSelection ? 'bg-gold-1/10' : 'hover:bg-navy-2/40'}`}
                    >
                      <td className="font-semibold text-ink-1">
                        {MONTH_NAMES[h.month - 1] || h.month} {h.year}
                      </td>
                      <td className="font-mono font-semibold text-gold-tan">{h.rankCodeSnapshot}</td>
                      <td className="text-right font-mono text-ink-2">
                        {h.mfaTarget > 0 ? formatINR(h.mfaTarget) : '—'}
                      </td>
                      <td className="text-right font-mono font-bold text-ink-1">{formatINR(h.totalMfaCredit)}</td>
                      <td className="text-right font-mono text-ink-2">
                        {h.mfaTarget > 0 ? formatINR(h.remainingAmount) : '—'}
                      </td>
                      <td className="text-center font-mono text-ink-1">
                        {h.mfaTarget > 0 ? `${Number(h.achievementPct || 0).toFixed(0)}%` : '—'}
                      </td>
                      <td className="text-center"><MfaStatusBadge status={h.status} /></td>
                      <td className={`text-right font-mono font-bold ${h.isQualified ? 'text-ok' : 'text-ink-2'}`}>
                        {formatINR(h.rewardEarned)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-ink-2 italic py-4 text-center">No historical MFA records available yet.</p>
        )}
      </div>

      {/* Rank-Wise Reference Chart (Ranks 1–10) */}
      <div className="card p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
          Rank-Wise Monthly MFA Structure (AO &ndash; ED)
        </h3>
        <div className="table-wrap overflow-x-auto">
          <table className="tbl text-xs">
            <thead>
              <tr>
                <th>Rank</th>
                <th className="text-right">Monthly MFA Target</th>
                <th className="text-right">Monthly MFA Reward</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(MFA_SLABS).map((s) => (
                <tr key={s.rank} className={Number(profile?.rank) === s.rank ? 'bg-gold-1/10' : ''}>
                  <td className="font-semibold text-ink-1">
                    {s.code} <span className="text-ink-2 font-normal">&mdash; {s.name}</span>
                  </td>
                  <td className="text-right font-mono text-ink-1">{formatINR(s.mfaTarget)}</td>
                  <td className="text-right font-mono font-bold text-gold">{formatINR(s.mfaReward)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
