import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { mfaAPI } from '../../lib/supabase'
import { getMfaStatusMessage, getCurrentIstPeriod, isClosedMfaPeriod, isFutureMfaPeriod } from '../../lib/mfa'
import { MFA_SLABS } from '../../data/compensation'
import { formatINR, fmtDate } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import RankBadge from '../../components/ui/RankBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ITrophy, ICalendar, ICheck, IClock, IShield, INetwork, IAlert } from '../../components/ui/icons'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const UNALLOCATED_LABELS = {
  no_superior: 'Top of hierarchy (no superior above)',
  no_eligible_mfa_superior: 'Senior above Rank 10 (no MFA target)',
  missing_superior: 'Reporting superior unavailable',
  self_referential_cycle: 'Halted (hierarchy loop safeguard)',
  hierarchy_cycle_detected: 'Halted (hierarchy cycle safeguard)',
  admin_in_hierarchy: 'Reached admin account boundary',
  max_depth_exceeded: 'Maximum hierarchy depth reached',
}

function MfaStatusBadge({ status }) {
  const styles = {
    achieved: 'bg-ok/15 text-ok border-ok/30',
    in_progress: 'bg-gold-1/15 text-gold-tan border-gold-1/30',
    missed: 'bg-red-50 text-red-700 border-red-200',
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

function OutgoingTypePill({ item }) {
  if (item.allocationType === 'unallocated_excess') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-amber-50 text-amber-800 border-amber-300">
        Unallocated (Chain End)
      </span>
    )
  }
  if (item.allocationType === 'skipped_inactive') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-red-50 text-red-700 border-red-200">
        Skipped Inactive Senior
      </span>
    )
  }
  if (item.allocationType === 'pass_through') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-sky-50 text-sky-700 border-sky-200">
        Pass-Through (100%)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-ok/10 text-ok border-ok/30">
      Cascaded to Senior
    </span>
  )
}

export default function MyMfa() {
  const { profile } = useAuth()
  const istNow = useMemo(() => getCurrentIstPeriod(), [])
  const nowYear = istNow.year
  const [selectedMonth, setSelectedMonth] = useState(istNow.month)
  const [selectedYear, setSelectedYear] = useState(nowYear)
  const [activeTab, setActiveTab] = useState('own')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    backendReady: true,
    cascadingReady: true,
    isClosedPeriod: false,
    isFuturePeriod: false,
    periodLocked: false,
    currentRecord: null,
    contributions: [],
    cascadingIncoming: [],
    cascadingOutgoing: [],
    history: [],
  })

  const selectedClosed = useMemo(
    () => isClosedMfaPeriod(selectedMonth, selectedYear),
    [selectedMonth, selectedYear]
  )
  const selectedFuture = useMemo(
    () => isFutureMfaPeriod(selectedMonth, selectedYear),
    [selectedMonth, selectedYear]
  )

  useEffect(() => {
    if (!profile?.id) return
    let active = true
    setLoading(true)

    const shouldAutoSync = !isClosedMfaPeriod(selectedMonth, selectedYear) && !isFutureMfaPeriod(selectedMonth, selectedYear)

    mfaAPI
      .getAgentMfaDashboardData({
        agentProfile: profile,
        month: selectedMonth,
        year: selectedYear,
        autoSync: shouldAutoSync,
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
  const cascadingIncoming = useMemo(() => data.cascadingIncoming || [], [data.cascadingIncoming])
  const cascadingOutgoing = useMemo(() => data.cascadingOutgoing || [], [data.cascadingOutgoing])
  const history = data.history || []
  const monthLabel = `${MONTH_NAMES[selectedMonth - 1] || selectedMonth} ${selectedYear}`

  const targetVal = Number(rec?.mfaTarget || 0)
  const ownApplied = Number(rec?.ownMfaCreditApplied ?? rec?.totalMfaCredit ?? 0)
  const ownGenerated = Number(rec?.ownMfaCreditGenerated ?? rec?.totalMfaCredit ?? 0)
  const cascadeReceived = Number(rec?.cascadingMfaCreditReceived ?? 0)
  const excessPassedUp = Number(rec?.excessCreditPassedUp ?? 0)
  const excessUnallocated = Number(rec?.excessUnallocatedCredit ?? 0)

  const ownPctBar = targetVal > 0 ? Math.min(100, Math.max(0, (ownApplied / targetVal) * 100)) : 0
  const cascadePctBar = targetVal > 0 ? Math.min(100 - ownPctBar, Math.max(0, (cascadeReceived / targetVal) * 100)) : 0

  const contributionTotals = useMemo(() => {
    return contributions.reduce(
      (acc, c) => ({
        raw: acc.raw + Number(c.businessAmount || 0),
        credit: acc.credit + Number(c.mfaCredit || 0),
        applied: acc.applied + Number(c.appliedToSelf ?? c.mfaCredit ?? 0),
        excess: acc.excess + Number(c.excessPassedUp ?? 0),
      }),
      { raw: 0, credit: 0, applied: 0, excess: 0 }
    )
  }, [contributions])

  const incomingTotals = useMemo(() => {
    return cascadingIncoming.reduce(
      (acc, item) => ({
        incoming: acc.incoming + Number(item.incomingCredit || 0),
        applied: acc.applied + Number(item.appliedAmount || 0),
        passed: acc.passed + Number(item.excessPassedUp || 0),
      }),
      { incoming: 0, applied: 0, passed: 0 }
    )
  }, [cascadingIncoming])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={6} />
        <SkeletonTable rows={4} cols={5} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header & Period Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-navy-4/50 pb-4">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-extrabold text-ink-1 tracking-tight flex items-center gap-2">
            <ITrophy size={22} className="text-gold shrink-0" /> Monthly Field Allowance (MFA)
          </h1>
          <p className="text-xs text-ink-2 mt-0.5">
            Track your personal business MFA credits, cascading downline credits received, upward excess flow, and monthly reward eligibility.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-ink-2">
            <ICalendar size={14} className="text-gold-tan" />
            <span>Period:</span>
          </div>
          <select
            aria-label="MFA Month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="field py-1.5 text-xs flex-1 sm:flex-initial sm:w-36"
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

      {data.backendReady && !data.cascadingReady && (
        <div className="rounded-card border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <IAlert size={16} className="shrink-0 mt-0.5 text-amber-700" />
          <span>
            Cascading MFA database update is pending activation on this environment. Showing standard personal MFA figures until the administrator runs the latest migration.
          </span>
        </div>
      )}

      {(data.periodLocked || selectedClosed) && (
        <div className="rounded-card border border-navy-4 bg-navy-2/70 px-3.5 py-2.5 text-xs text-ink-1 flex items-center gap-2">
          <IShield size={15} className="shrink-0 text-gold-1" />
          <span>
            <strong className="font-semibold">Closed &amp; Locked Snapshot:</strong>{' '}
            {monthLabel} has ended and its rank, sponsor, agent status, and cascading totals are preserved read-only.
          </span>
        </div>
      )}

      {(data.isFuturePeriod || selectedFuture) && (
        <div className="rounded-card border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-sky-900 flex items-center gap-2">
          <IClock size={15} className="shrink-0 text-sky-700" />
          <span>
            <strong className="font-semibold">Future Cycle ({monthLabel}):</strong>{' '}
            Monthly tracking begins on the 1st of the month. Auto-sync is paused until the cycle opens.
          </span>
        </div>
      )}

      {/* Main Monthly MFA Dashboard Card */}
      {rec ? (
        <div className="card p-4 sm:p-6 space-y-5 border-l-4 border-gold-1 bg-navy-3">
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
              <div className="text-left sm:text-right">
                <span className="block text-[10px] uppercase tracking-wider text-ink-2">Reward on 100% Target</span>
                <span className="text-xl font-extrabold font-serif text-gold">{formatINR(rec.mfaReward)}</span>
              </div>
            )}
          </div>

          {rec.applicable ? (
            <>
              {/* 6-Tile Cascading MFA Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">Monthly Target</span>
                  <span className="text-base sm:text-lg font-extrabold text-ink-1 font-serif mt-1 block">
                    {formatINR(rec.mfaTarget)}
                  </span>
                </div>

                <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4 border-l-2 border-l-gold">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">Own Business Credit</span>
                  <span className="text-base sm:text-lg font-extrabold text-gold mt-1 font-serif block">
                    {formatINR(ownApplied)}
                  </span>
                  {ownGenerated > ownApplied && (
                    <span className="text-[10px] text-ink-2 block mt-0.5 font-mono">
                      Generated: {formatINR(ownGenerated)}
                    </span>
                  )}
                </div>

                <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4 border-l-2 border-l-sky-700">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">Cascading Received</span>
                  <span className="text-base sm:text-lg font-extrabold text-sky-700 font-serif mt-1 block">
                    {formatINR(cascadeReceived)}
                  </span>
                  <span className="text-[10px] text-ink-2 block mt-0.5">
                    {cascadingIncoming.length} {cascadingIncoming.length === 1 ? 'credit' : 'credits'}
                  </span>
                </div>

                <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4 border-l-2 border-l-gold-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">Total Achieved</span>
                  <span className="text-base sm:text-lg font-extrabold text-ink-1 font-serif mt-1 block">
                    {formatINR(rec.totalMfaCredit)}
                  </span>
                  <span className={`text-[10px] font-mono font-bold block mt-0.5 ${rec.isQualified ? 'text-ok' : 'text-gold-tan'}`}>
                    {Number(rec.achievementPct || 0).toFixed(1)}% of target
                  </span>
                </div>

                <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">Excess Passed Up</span>
                  <span className="text-base sm:text-lg font-extrabold text-gold-tan font-serif mt-1 block">
                    {formatINR(excessPassedUp)}
                  </span>
                  {excessUnallocated > 0 && (
                    <span className="text-[10px] text-amber-800 block mt-0.5 font-mono">
                      Unallocated: {formatINR(excessUnallocated)}
                    </span>
                  )}
                </div>

                <div className={`p-3 rounded-card border ${rec.isQualified ? 'bg-ok/10 border-ok/30' : 'bg-navy-2/60 border-navy-4'}`}>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2 block">Reward Earned</span>
                  <span className={`text-base sm:text-lg font-extrabold font-serif mt-1 block ${rec.isQualified ? 'text-ok' : 'text-ink-2'}`}>
                    {formatINR(rec.rewardEarned)}
                  </span>
                  <span className="text-[10px] text-ink-2 block mt-0.5">
                    Remaining: {formatINR(rec.remainingAmount)}
                  </span>
                </div>
              </div>

              {/* Dual-Segment Progress Bar (Own + Cascading) */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-bold text-ink-1">
                    {formatINR(rec.totalMfaCredit)} / {formatINR(rec.mfaTarget)}
                  </span>
                  <span className={`font-mono font-bold ${rec.isQualified ? 'text-ok' : 'text-gold'}`}>
                    {Number(rec.achievementPct || 0).toFixed(1)}% Achieved
                  </span>
                </div>

                <div className="w-full h-3 bg-navy-2 rounded-full overflow-hidden border border-navy-4 flex">
                  {ownPctBar > 0 && (
                    <div
                      className="h-full bg-gold transition-all duration-500"
                      style={{ width: `${ownPctBar}%` }}
                      title={`Own Business Credit Applied: ${formatINR(ownApplied)}`}
                    />
                  )}
                  {cascadePctBar > 0 && (
                    <div
                      className="h-full bg-sky-600 transition-all duration-500"
                      style={{ width: `${cascadePctBar}%` }}
                      title={`Cascading Credit Received: ${formatINR(cascadeReceived)}`}
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-gold inline-block" /> Own Applied ({formatINR(ownApplied)})
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-sky-600 inline-block" /> Cascading Received ({formatINR(cascadeReceived)})
                    </span>
                  </div>
                  <span>{formatINR(rec.remainingAmount)} Remaining</span>
                </div>
              </div>

              {/* Status Banner */}
              <div className={`p-3.5 rounded-card border flex items-center gap-2.5 text-xs ${
                rec.status === 'achieved'
                  ? 'bg-ok/10 border-ok/30 text-ok'
                  : rec.status === 'missed'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-gold-1/10 border-gold-1/25 text-ink-1'
              }`}>
                {rec.status === 'achieved' ? <ICheck size={16} className="shrink-0" /> : <IClock size={16} className="shrink-0" />}
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
              <IShield size={16} className="text-gold-tan shrink-0" />
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

      {/* Duration Credit & Cascading Rules Reference Strip */}
      <div className="card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs bg-navy-2/40">
        <div className="flex items-center gap-2 text-ink-1 font-semibold">
          <INetwork size={15} className="text-gold shrink-0" />
          <span>Duration Credit &amp; Cascading Hierarchy Rules:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="px-2.5 py-1 rounded bg-navy-3 border border-navy-4 font-mono text-[11px]">
            1Y = <strong className="text-gold">25%</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-navy-3 border border-navy-4 font-mono text-[11px]">
            2Y = <strong className="text-gold">50%</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-navy-3 border border-navy-4 font-mono text-[11px]">
            3Y+ = <strong className="text-ok">100%</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-navy-3 border border-navy-4 text-[11px] text-ink-2">
            Excess above 100% flows upward &middot; Resets monthly
          </span>
        </div>
      </div>

      {/* Tabbed MFA Business & Cascading Breakdown */}
      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-navy-4/50 pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
              MFA Contribution Breakdown &mdash; {monthLabel}
            </h3>
            <p className="text-[11px] text-ink-2">
              Original Business Amount determines duration-weighted Qualifying MFA Credit before own target allocation and upward cascading.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 bg-navy-2 p-1 rounded-card border border-navy-4">
            <button
              type="button"
              onClick={() => setActiveTab('own')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === 'own' ? 'bg-gold-1 text-white' : 'text-ink-2 hover:text-ink-1'
              }`}
            >
              Own Business ({contributions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cascading')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === 'cascading' ? 'bg-sky-700 text-white' : 'text-ink-2 hover:text-ink-1'
              }`}
            >
              Cascading Received ({cascadingIncoming.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('outgoing')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === 'outgoing' ? 'bg-amber-800 text-white' : 'text-ink-2 hover:text-ink-1'
              }`}
            >
              Passed Upward ({cascadingOutgoing.length})
            </button>
          </div>
        </div>

        {/* Tab 1: Own Business Contributions */}
        {activeTab === 'own' && (
          contributions.length > 0 ? (
            <>
              <div className="hidden md:block table-wrap overflow-x-auto">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Policy Ref</th>
                      <th>Customer</th>
                      <th>Plan</th>
                      <th>Date</th>
                      <th className="text-right">Original Business</th>
                      <th className="text-center">Duration</th>
                      <th className="text-center">MFA %</th>
                      <th className="text-right">Qualifying Credit</th>
                      <th className="text-right">Applied to Own</th>
                      <th className="text-right">Excess Passed Up</th>
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
                        <td className="text-center text-ink-2">{c.durationYears} Yr</td>
                        <td className="text-center font-mono font-bold text-gold-tan">{c.mfaPercentage}%</td>
                        <td className="text-right font-mono font-bold text-ink-1">{formatINR(c.mfaCredit)}</td>
                        <td className="text-right font-mono font-bold text-ok">{formatINR(c.appliedToSelf ?? c.mfaCredit)}</td>
                        <td className="text-right font-mono font-bold text-gold">{formatINR(c.excessPassedUp ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy-2/60 font-bold border-t border-navy-4">
                      <td colSpan={4} className="text-ink-1 uppercase text-[11px]">Totals ({monthLabel})</td>
                      <td className="text-right font-mono text-ink-1">{formatINR(contributionTotals.raw)}</td>
                      <td colSpan={2} />
                      <td className="text-right font-mono text-ink-1">{formatINR(contributionTotals.credit)}</td>
                      <td className="text-right font-mono text-ok">{formatINR(contributionTotals.applied)}</td>
                      <td className="text-right font-mono text-gold">{formatINR(contributionTotals.excess)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Cards (< md) */}
              <div className="md:hidden space-y-3">
                {contributions.map((c) => (
                  <div key={c.policyId || c.id} className="p-3.5 rounded-card bg-navy-2/60 border border-navy-4 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-gold block">{c.policyNumber}</span>
                        <span className="text-ink-1 font-semibold">{c.customerName || '—'}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-navy-3 border border-navy-4 font-mono text-[10px] font-bold text-gold-tan">
                        {c.planCode} &middot; {c.mfaPercentage}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-navy-4/50">
                      <div>
                        <span className="text-[10px] text-ink-2 block">Original Business</span>
                        <span className="font-mono text-ink-1 font-semibold">{formatINR(c.businessAmount)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Qualifying Credit ({c.durationYears}Y)</span>
                        <span className="font-mono text-ink-1 font-bold">{formatINR(c.mfaCredit)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Applied to Own</span>
                        <span className="font-mono text-ok font-bold">{formatINR(c.appliedToSelf ?? c.mfaCredit)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Excess Passed Up</span>
                        <span className="font-mono text-gold font-bold">{formatINR(c.excessPassedUp ?? 0)}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-ink-2 font-mono">
                      Business Date: {c.businessDate ? fmtDate(c.businessDate) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-ink-2 italic py-6 text-center">
              No qualifying personal policies recorded for {monthLabel}.
            </p>
          )
        )}

        {/* Tab 2: Cascading Contribution Received */}
        {activeTab === 'cascading' && (
          cascadingIncoming.length > 0 ? (
            <>
              <div className="hidden md:block table-wrap overflow-x-auto">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Direct Source Downline</th>
                      <th>Originating Agent / Policy</th>
                      <th>Date</th>
                      <th className="text-right">Orig. Business</th>
                      <th className="text-center">MFA %</th>
                      <th className="text-right">Incoming Credit</th>
                      <th className="text-right">Applied to Target</th>
                      <th className="text-right">Forwarded Upward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cascadingIncoming.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="font-semibold text-ink-1 block">{item.sourceAgentName}</span>
                          <span className="font-mono text-[10px] text-gold">{item.sourceAgentCode}</span>
                        </td>
                        <td>
                          <span className="font-mono font-bold text-gold block">{item.policyNumber}</span>
                          <span className="text-[10px] text-ink-2">
                            By {item.originatingAgentName} ({item.originatingAgentCode})
                          </span>
                        </td>
                        <td className="font-mono text-ink-2">{item.businessDate ? fmtDate(item.businessDate) : '—'}</td>
                        <td className="text-right font-mono text-ink-2">{formatINR(item.originalBusinessAmount)}</td>
                        <td className="text-center font-mono text-gold-tan font-bold">
                          {item.durationYears}Y ({item.mfaPercentage}%)
                        </td>
                        <td className="text-right font-mono text-ink-1">{formatINR(item.incomingCredit)}</td>
                        <td className="text-right font-mono font-bold text-sky-700">{formatINR(item.appliedAmount)}</td>
                        <td className="text-right font-mono font-bold text-gold">{formatINR(item.excessPassedUp)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy-2/60 font-bold border-t border-navy-4">
                      <td colSpan={5} className="text-ink-1 uppercase text-[11px]">Total Cascading Credits ({monthLabel})</td>
                      <td className="text-right font-mono text-ink-1">{formatINR(incomingTotals.incoming)}</td>
                      <td className="text-right font-mono text-sky-700">{formatINR(incomingTotals.applied)}</td>
                      <td className="text-right font-mono text-gold">{formatINR(incomingTotals.passed)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {cascadingIncoming.map((item) => (
                  <div key={item.id} className="p-3.5 rounded-card bg-navy-2/60 border border-navy-4 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold text-ink-1 block">{item.sourceAgentName}</span>
                        <span className="font-mono text-[10px] text-gold">{item.sourceAgentCode}</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-gold">{item.policyNumber}</span>
                    </div>
                    <p className="text-[11px] text-ink-2">
                      Origin: {item.originatingAgentName} ({item.originatingAgentCode}) &middot; {item.durationYears}Y ({item.mfaPercentage}%)
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-navy-4/50">
                      <div>
                        <span className="text-[10px] text-ink-2 block">Incoming</span>
                        <span className="font-mono text-ink-1 font-semibold">{formatINR(item.incomingCredit)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Applied</span>
                        <span className="font-mono text-sky-700 font-bold">{formatINR(item.appliedAmount)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Passed Up</span>
                        <span className="font-mono text-gold font-bold">{formatINR(item.excessPassedUp)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-ink-2 italic py-6 text-center">
              No cascading MFA credits received from downline excess during {monthLabel}.
            </p>
          )
        )}

        {/* Tab 3: Outgoing Excess Trace */}
        {activeTab === 'outgoing' && (
          cascadingOutgoing.length > 0 ? (
            <>
              <div className="hidden md:block table-wrap overflow-x-auto">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Policy Ref</th>
                      <th>Date</th>
                      <th>Recipient / Destination</th>
                      <th>Step Type</th>
                      <th className="text-right">Credit Forwarded</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cascadingOutgoing.map((item) => (
                      <tr key={item.id}>
                        <td className="font-mono font-bold text-gold">{item.policyNumber}</td>
                        <td className="font-mono text-ink-2">{item.businessDate ? fmtDate(item.businessDate) : '—'}</td>
                        <td>
                          {item.recipientAgentId ? (
                            <div>
                              <span className="font-semibold text-ink-1 block">{item.recipientAgentName}</span>
                              <span className="font-mono text-[10px] text-gold-tan">
                                {item.recipientAgentCode} {item.recipientRankCodeSnapshot ? `(${item.recipientRankCodeSnapshot})` : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-ink-2 italic">Hierarchy Boundary</span>
                          )}
                        </td>
                        <td><OutgoingTypePill item={item} /></td>
                        <td className="text-right font-mono font-bold text-gold-tan">
                          {formatINR(item.allocationType === 'unallocated_excess' ? item.unallocatedAmount : item.incomingCredit)}
                        </td>
                        <td className="text-ink-2">
                          {item.allocationType === 'unallocated_excess'
                            ? (UNALLOCATED_LABELS[item.unallocatedReason] || item.unallocatedReason || 'Unallocated')
                            : item.allocationType === 'pass_through'
                              ? 'Senior already at 100%; passed upward'
                              : item.allocationType === 'skipped_inactive'
                                ? 'Skipped inactive senior'
                                : `Applied ${formatINR(item.appliedAmount)} to senior target`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {cascadingOutgoing.map((item) => (
                  <div key={item.id} className="p-3.5 rounded-card bg-navy-2/60 border border-navy-4 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono font-bold text-gold">{item.policyNumber}</span>
                      <OutgoingTypePill item={item} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-ink-1 font-semibold">
                        {item.recipientAgentName ? `${item.recipientAgentName} (${item.recipientAgentCode})` : 'Hierarchy Boundary'}
                      </span>
                      <span className="font-mono font-bold text-gold-tan">
                        {formatINR(item.allocationType === 'unallocated_excess' ? item.unallocatedAmount : item.incomingCredit)}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-2">
                      {item.allocationType === 'unallocated_excess'
                        ? (UNALLOCATED_LABELS[item.unallocatedReason] || item.unallocatedReason || 'Unallocated')
                        : `Senior Applied: ${formatINR(item.appliedAmount)}`}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-ink-2 italic py-6 text-center">
              No excess MFA credit passed upward in {monthLabel}.
            </p>
          )
        )}
      </div>

      {/* Historical Monthly Records */}
      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-navy-4/50">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
              Monthly MFA History
            </h3>
            <p className="text-[11px] text-ink-2">
              Each month resets cleanly to zero on the 1st and retains its snapshotted rank, target, reward, and hierarchy breakdown.
            </p>
          </div>
        </div>

        {history.length > 0 ? (
          <div className="table-wrap overflow-x-auto">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Rank</th>
                  <th className="text-right">Target</th>
                  <th className="text-right">Own Applied</th>
                  <th className="text-right">Cascading</th>
                  <th className="text-right">Total Achieved</th>
                  <th className="text-right">Remaining</th>
                  <th className="text-center">Progress</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Reward</th>
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
                      <td className="font-semibold text-ink-1 whitespace-nowrap">
                        {MONTH_NAMES[h.month - 1] || h.month} {h.year}
                      </td>
                      <td className="font-mono font-semibold text-gold-tan">{h.rankCodeSnapshot}</td>
                      <td className="text-right font-mono text-ink-2">
                        {h.mfaTarget > 0 ? formatINR(h.mfaTarget) : '—'}
                      </td>
                      <td className="text-right font-mono text-ink-1">
                        {formatINR(h.ownMfaCreditApplied ?? h.totalMfaCredit)}
                      </td>
                      <td className="text-right font-mono text-sky-700">
                        {formatINR(h.cascadingMfaCreditReceived ?? 0)}
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
      <div className="card p-4 sm:p-5 space-y-3">
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
