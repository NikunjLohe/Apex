import { useEffect, useMemo, useState } from 'react'
import * as xlsx from 'xlsx'
import toast from 'react-hot-toast'
import { mfaAPI } from '../../lib/supabase'
import { MFA_SLABS } from '../../data/compensation'
import { formatINR, fmtDate } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ITrophy, ISearch, IDownload, ICalendar, IUsers, ICheck, IAlert, IClock, IClose } from '../../components/ui/icons'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function StatusPill({ status }) {
  const styles = {
    achieved: 'bg-ok/15 text-ok border-ok/30',
    in_progress: 'bg-gold-1/15 text-gold-tan border-gold-1/30',
    missed: 'bg-red-500/15 text-red-400 border-red-500/30',
    not_applicable: 'bg-navy-2 text-ink-2 border-navy-4',
  }
  const labels = {
    achieved: 'Achieved',
    in_progress: 'In Progress',
    missed: 'Missed',
    not_applicable: 'N/A',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${styles[status] || styles.in_progress}`}>
      {labels[status] || status}
    </span>
  )
}

export default function MfaManagement() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [rankFilter, setRankFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [cycle, setCycle] = useState({
    backendReady: true,
    records: [],
    contribByAgent: {},
    totalTracked: 0,
    achievedCount: 0,
    notAchievedCount: 0,
    totalRewardsEarned: 0,
  })

  // Modal state for inspecting an agent's business breakdown & history
  const [selectedAgentRecord, setSelectedAgentRecord] = useState(null)
  const [agentHistory, setAgentHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadCycle = async (autoSync = true) => {
    setLoading(true)
    try {
      const res = await mfaAPI.listAdminMfaCycle({
        month: selectedMonth,
        year: selectedYear,
        autoSync,
      })
      setCycle(res)
    } catch (err) {
      console.error('[MfaManagement] Load error:', err)
      toast.error(err.message || 'Could not load MFA management cycle.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCycle(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear])

  const handleRecalculate = async () => {
    const session = JSON.parse(sessionStorage.getItem('apex_impersonation') || '{}')
    if (session?.active || session?.is_read_only) {
      toast.error('READ-ONLY: Sync is disabled in View As Agent mode.')
      return
    }
    setSyncing(true)
    const tid = toast.loading(`Synchronizing MFA records for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}...`)
    try {
      const res = await mfaAPI.syncMonthlyMfaCycle(selectedMonth, selectedYear)
      if (!res?.backendReady) {
        toast.success('Refreshed mirror preview (run SQL migration to activate backend sync).', { id: tid })
      } else {
        toast.success(`Synchronized ${res.records_synced || 0} agent MFA records.`, { id: tid })
      }
      await loadCycle(false)
    } catch (err) {
      toast.error(err.message || 'MFA sync failed', { id: tid })
    } finally {
      setSyncing(false)
    }
  }

  const handleInspectAgent = async (rec) => {
    setSelectedAgentRecord(rec)
    setAgentHistory([])
    setHistoryLoading(true)
    try {
      const hist = await mfaAPI.getAgentMfaHistoryAdmin(rec.agentId, {
        id: rec.agentId,
        rank: rec.currentRank || rec.rankSnapshot,
        name: rec.agentName,
        sponsorCode: rec.sponsorCode,
      })
      setAgentHistory(hist || [])
    } catch (err) {
      console.error('[MfaManagement] History fetch error:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (cycle.records || []).filter((r) => {
      if (rankFilter !== 'all' && String(r.rankSnapshot) !== String(rankFilter)) return false
      if (statusFilter === 'achieved' && !r.isQualified) return false
      if (statusFilter === 'not_achieved' && (r.isQualified || !r.applicable)) return false
      if (statusFilter === 'in_progress' && r.status !== 'in_progress') return false
      if (statusFilter === 'missed' && r.status !== 'missed') return false
      if (q) {
        const hay = `${r.agentName || ''} ${r.sponsorCode || ''} ${r.email || ''} ${r.phone || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [cycle.records, rankFilter, statusFilter, search])

  const rankSummary = useMemo(() => {
    return Object.values(MFA_SLABS).map((slab) => {
      const matching = (cycle.records || []).filter((r) => Number(r.rankSnapshot) === slab.rank)
      const achieved = matching.filter((r) => r.isQualified)
      return {
        ...slab,
        trackedCount: matching.length,
        achievedCount: achieved.length,
        notAchievedCount: matching.length - achieved.length,
        totalCredit: matching.reduce((s, r) => s + Number(r.totalMfaCredit || 0), 0),
        totalRewards: achieved.reduce((s, r) => s + Number(r.rewardEarned || 0), 0),
      }
    })
  }, [cycle.records])

  const handleExportExcel = () => {
    if (!filteredRecords.length) {
      toast.error('No MFA records match current filters to export.')
      return
    }
    const wb = xlsx.utils.book_new()
    const summaryRows = filteredRecords.map((r, i) => ({
      'Sr. No.': i + 1,
      'Agent Code': r.sponsorCode || '—',
      'Agent Name': r.agentName || '—',
      'Rank (Snapshot)': r.rankCodeSnapshot,
      'Month': `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
      'MFA Target (₹)': r.mfaTarget,
      'MFA Credit Achieved (₹)': r.totalMfaCredit,
      'Remaining (₹)': r.remainingAmount,
      'Achievement %': r.achievementPct,
      'Rank Reward (₹)': r.mfaReward,
      'Status': r.status,
      'Reward Earned (₹)': r.rewardEarned,
      'Qualifying Policies': r.contributionsCount,
    }))
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(summaryRows), 'MFA Summary')

    const contribRows = []
    filteredRecords.forEach((r) => {
      const list = cycle.contribByAgent?.[r.agentId] || []
      list.forEach((c) => {
        contribRows.push({
          'Agent Code': r.sponsorCode || '—',
          'Agent Name': r.agentName || '—',
          'Policy Number': c.policyNumber,
          'Customer Name': c.customerName || '—',
          'Plan': c.planCode,
          'Duration (Years)': c.durationYears,
          'Business Date': c.businessDate,
          'Business Amount (₹)': c.businessAmount,
          'MFA %': c.mfaPercentage,
          'MFA Credit (₹)': c.mfaCredit,
        })
      })
    })
    if (contribRows.length > 0) {
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(contribRows), 'Business Breakdown')
    }

    xlsx.writeFile(wb, `MFA_Report_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.xlsx`)
    toast.success('MFA Report exported cleanly.')
  }

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
  const monthLabel = `${MONTH_NAMES[selectedMonth - 1] || selectedMonth} ${selectedYear}`

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight flex items-center gap-2">
            <ITrophy size={22} className="text-gold" /> Monthly MFA Management
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Track monthly rank-based MFA targets (Ranks 1&ndash;10), duration credits (25% / 50% / 100%), and reward eligibility.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-ink-2">
            <ICalendar size={14} className="text-gold-tan" />
          </div>
          <select
            aria-label="Month Filter"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="field py-1.5 text-xs w-36"
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx + 1}>{name}</option>
            ))}
          </select>
          <select
            aria-label="Year Filter"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="field py-1.5 text-xs w-24 font-mono"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleRecalculate}
            disabled={syncing}
            className="btn-ghost border border-navy-4 py-1.5 px-3 text-xs"
          >
            {syncing ? 'Syncing...' : 'Sync Month'}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading || !filteredRecords.length}
            className="btn-gold py-1.5 px-3 text-xs flex items-center gap-1.5"
          >
            <IDownload size={14} /> Export Excel
          </button>
        </div>
      </div>

      {!cycle.backendReady && (
        <div className="rounded-card border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200 flex items-start gap-2.5">
          <IAlert size={16} className="shrink-0 mt-0.5 text-amber-400" />
          <div>
            <strong>Database Migration Pending:</strong> Live tables (<code className="font-mono">agent_mfa_records</code>, <code className="font-mono">agent_mfa_contributions</code>) are not yet installed in Supabase. Showing live calculated preview &mdash; run{' '}
            <code className="font-mono text-gold">supabase/migrations/20261125_mfa_system.sql</code> in Supabase SQL Editor to enable persistent monthly rank snapshots, triggers, and backend RLS.
          </div>
        </div>
      )}

      {/* Summary Dashboard Cards */}
      {loading ? (
        <SkeletonStats count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="card p-4 border-l-4 border-l-gold-1">
            <div className="flex items-center justify-between text-ink-2 text-[11px] uppercase font-bold tracking-wider">
              <span>Agents Tracked</span>
              <IUsers size={16} className="text-gold" />
            </div>
            <p className="text-2xl font-extrabold font-serif text-ink-1 mt-1.5">{cycle.totalTracked}</p>
            <p className="text-[11px] text-ink-2 mt-0.5">Ranks AO&ndash;ED in {monthLabel}</p>
          </div>

          <div className="card p-4 border-l-4 border-l-emerald-500">
            <div className="flex items-center justify-between text-ink-2 text-[11px] uppercase font-bold tracking-wider">
              <span>Achieved Target</span>
              <ICheck size={16} className="text-ok" />
            </div>
            <p className="text-2xl font-extrabold font-serif text-ok mt-1.5">{cycle.achievedCount}</p>
            <p className="text-[11px] text-ink-2 mt-0.5">
              {cycle.totalTracked > 0 ? `${Math.round((cycle.achievedCount / cycle.totalTracked) * 100)}% qualification rate` : 'No tracked agents'}
            </p>
          </div>

          <div className="card p-4 border-l-4 border-l-amber-500">
            <div className="flex items-center justify-between text-ink-2 text-[11px] uppercase font-bold tracking-wider">
              <span>Not Yet Qualified</span>
              <IClock size={16} className="text-gold-tan" />
            </div>
            <p className="text-2xl font-extrabold font-serif text-ink-1 mt-1.5">{cycle.notAchievedCount}</p>
            <p className="text-[11px] text-ink-2 mt-0.5">Below 100% (no partial reward)</p>
          </div>

          <div className="card p-4 border-l-4 border-l-gold">
            <div className="flex items-center justify-between text-ink-2 text-[11px] uppercase font-bold tracking-wider">
              <span>Total MFA Rewards</span>
              <ITrophy size={16} className="text-gold" />
            </div>
            <p className="text-2xl font-extrabold font-serif text-gold mt-1.5">{formatINR(cycle.totalRewardsEarned)}</p>
            <p className="text-[11px] text-ink-2 mt-0.5">Earned for {monthLabel}</p>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <ISearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Agent ID, Name, Email, or Phone..."
            className="field pl-9 py-1.5 text-xs w-full"
          />
        </div>
        <select
          aria-label="Filter Rank"
          value={rankFilter}
          onChange={(e) => setRankFilter(e.target.value)}
          className="field py-1.5 text-xs w-40"
        >
          <option value="all">All Ranks (1&ndash;10)</option>
          {Object.values(MFA_SLABS).map((s) => (
            <option key={s.rank} value={s.rank}>
              {s.rank}. {s.code} ({formatINR(s.mfaTarget)})
            </option>
          ))}
        </select>
        <select
          aria-label="Filter Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="field py-1.5 text-xs w-44"
        >
          <option value="all">All Statuses</option>
          <option value="achieved">Achieved Only</option>
          <option value="not_achieved">Not Achieved (&lt;100%)</option>
          <option value="in_progress">In Progress</option>
          <option value="missed">Missed (Past Month)</option>
        </select>
      </div>

      {/* Main Agent MFA Tracking Table */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-navy-4/50">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
            Agent MFA Records &mdash; {monthLabel} ({filteredRecords.length})
          </h3>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={8} />
        ) : filteredRecords.length > 0 ? (
          <div className="table-wrap overflow-x-auto">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Rank</th>
                  <th className="text-right">Monthly Target</th>
                  <th className="text-right">MFA Achieved</th>
                  <th className="text-right">Remaining</th>
                  <th className="text-center">Progress</th>
                  <th className="text-right">Rank Reward</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Reward Earned</th>
                  <th className="text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.agentId} className="hover:bg-navy-2/40">
                    <td>
                      <span className="font-semibold text-ink-1 block">{r.agentName}</span>
                      <span className="font-mono text-[10px] text-gold">{r.sponsorCode}</span>
                    </td>
                    <td>
                      <span className="px-2 py-0.5 rounded bg-navy-2 border border-navy-4 font-mono font-bold text-ink-1">
                        {r.rankCodeSnapshot}
                      </span>
                    </td>
                    <td className="text-right font-mono text-ink-1">{formatINR(r.mfaTarget)}</td>
                    <td className="text-right font-mono font-bold text-gold">{formatINR(r.totalMfaCredit)}</td>
                    <td className="text-right font-mono text-ink-2">{formatINR(r.remainingAmount)}</td>
                    <td className="text-center">
                      <div className="flex flex-col items-center gap-1 min-w-[80px]">
                        <span className={`font-mono font-bold ${r.isQualified ? 'text-ok' : 'text-ink-1'}`}>
                          {Number(r.achievementPct || 0).toFixed(0)}%
                        </span>
                        <div className="w-full h-1.5 bg-navy-2 rounded-full overflow-hidden border border-navy-4">
                          <div
                            className={`h-full rounded-full ${r.isQualified ? 'bg-ok' : 'bg-gold'}`}
                            style={{ width: `${Math.min(100, Number(r.achievementPct || 0))}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-mono text-ink-2">{formatINR(r.mfaReward)}</td>
                    <td className="text-center"><StatusPill status={r.status} /></td>
                    <td className={`text-right font-mono font-bold ${r.isQualified ? 'text-ok' : 'text-ink-2'}`}>
                      {formatINR(r.rewardEarned)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => handleInspectAgent(r)}
                        className="text-gold font-bold hover:underline text-[11px] uppercase"
                      >
                        Breakdown ({r.contributionsCount})
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<ITrophy size={24} />}
            title="No Matching MFA Records"
            message="Adjust rank, status, search filters, or period to inspect agents."
          />
        )}
      </div>

      {/* Rank-Wise Achievement Summary */}
      <div className="card p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
          Rank-Wise Achievement Summary ({monthLabel})
        </h3>
        <div className="table-wrap overflow-x-auto">
          <table className="tbl text-xs">
            <thead>
              <tr>
                <th>Rank</th>
                <th className="text-right">Monthly Target</th>
                <th className="text-right">Rank Reward</th>
                <th className="text-center">Tracked Agents</th>
                <th className="text-center">Achieved</th>
                <th className="text-center">Not Achieved</th>
                <th className="text-right">Total MFA Credit</th>
                <th className="text-right">Total Rewards Earned</th>
              </tr>
            </thead>
            <tbody>
              {rankSummary.map((row) => (
                <tr key={row.rank}>
                  <td className="font-semibold text-ink-1">
                    {row.code} <span className="text-ink-2 font-normal">&mdash; {row.name}</span>
                  </td>
                  <td className="text-right font-mono text-ink-2">{formatINR(row.mfaTarget)}</td>
                  <td className="text-right font-mono text-gold-tan">{formatINR(row.mfaReward)}</td>
                  <td className="text-center font-mono text-ink-1">{row.trackedCount}</td>
                  <td className="text-center font-mono font-bold text-ok">{row.achievedCount}</td>
                  <td className="text-center font-mono text-ink-2">{row.notAchievedCount}</td>
                  <td className="text-right font-mono text-ink-1">{formatINR(row.totalCredit)}</td>
                  <td className="text-right font-mono font-bold text-gold">{formatINR(row.totalRewards)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent Breakdown & Historical Modal */}
      {selectedAgentRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="card max-w-4xl w-full p-6 space-y-5 border border-gold-1/30 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-navy-4/50 pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-ink-1">
                  {selectedAgentRecord.agentName} &mdash; {monthLabel}
                </h3>
                <p className="text-xs text-ink-2 font-mono">
                  {selectedAgentRecord.sponsorCode} &middot; Snapshot Rank: {selectedAgentRecord.rankCodeSnapshot} &middot; Target: {formatINR(selectedAgentRecord.mfaTarget)} &middot; Achieved: {formatINR(selectedAgentRecord.totalMfaCredit)} ({Number(selectedAgentRecord.achievementPct || 0).toFixed(0)}%)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgentRecord(null)}
                className="btn-ghost p-1.5 text-ink-2 hover:text-ink-1"
                aria-label="Close modal"
              >
                <IClose size={18} />
              </button>
            </div>

            {/* Contributing Policies for Month */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
                Contributing Business Records ({monthLabel})
              </h4>
              {(cycle.contribByAgent?.[selectedAgentRecord.agentId] || []).length > 0 ? (
                <div className="table-wrap overflow-x-auto">
                  <table className="tbl text-xs">
                    <thead>
                      <tr>
                        <th>Policy No.</th>
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
                      {(cycle.contribByAgent?.[selectedAgentRecord.agentId] || []).map((c) => (
                        <tr key={c.policyId || c.id}>
                          <td className="font-mono font-bold text-gold">{c.policyNumber}</td>
                          <td className="font-semibold text-ink-1">{c.customerName || '—'}</td>
                          <td className="uppercase text-ink-2">{c.planCode}</td>
                          <td className="font-mono text-ink-2">{c.businessDate ? fmtDate(c.businessDate) : '—'}</td>
                          <td className="text-right font-mono text-ink-1">{formatINR(c.businessAmount)}</td>
                          <td className="text-center text-ink-2">{c.durationYears} Yr</td>
                          <td className="text-center font-mono text-gold-tan font-bold">{c.mfaPercentage}%</td>
                          <td className="text-right font-mono font-bold text-ok">{formatINR(c.mfaCredit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic py-3">No qualifying personal business contributed this month.</p>
              )}
            </div>

            {/* Historical Snapshots */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
                Historical Monthly MFA Snapshots
              </h4>
              {historyLoading ? (
                <p className="text-xs text-ink-2">Loading history...</p>
              ) : agentHistory.length > 0 ? (
                <div className="table-wrap overflow-x-auto">
                  <table className="tbl text-xs">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Rank Snapshot</th>
                        <th className="text-right">Target Snapshot</th>
                        <th className="text-right">Achieved</th>
                        <th className="text-center">%</th>
                        <th className="text-center">Status</th>
                        <th className="text-right">Reward Earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentHistory.map((h) => (
                        <tr key={`${h.year}-${h.month}`}>
                          <td className="font-semibold text-ink-1">{MONTH_NAMES[h.month - 1]} {h.year}</td>
                          <td className="font-mono font-bold text-gold-tan">{h.rankCodeSnapshot}</td>
                          <td className="text-right font-mono text-ink-2">{formatINR(h.mfaTarget)}</td>
                          <td className="text-right font-mono font-bold text-ink-1">{formatINR(h.totalMfaCredit)}</td>
                          <td className="text-center font-mono text-ink-1">{Number(h.achievementPct || 0).toFixed(0)}%</td>
                          <td className="text-center"><StatusPill status={h.status} /></td>
                          <td className={`text-right font-mono font-bold ${h.isQualified ? 'text-ok' : 'text-ink-2'}`}>
                            {formatINR(h.rewardEarned)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic py-2">No historical monthly records found.</p>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-navy-4/50">
              <button type="button" onClick={() => setSelectedAgentRecord(null)} className="btn-gold py-1.5 px-4 text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
