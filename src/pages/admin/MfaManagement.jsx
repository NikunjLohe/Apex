import { useEffect, useMemo, useState } from 'react'
import * as xlsx from 'xlsx'
import toast from 'react-hot-toast'
import { mfaAPI } from '../../lib/supabase'
import {
  getCurrentIstPeriod,
  isClosedMfaPeriod,
  isFutureMfaPeriod,
  getMfaSubtreeIds,
  filterMfaRecordsForView,
  filterPolicyTracesForView,
  buildMfaExcelSheetsData,
} from '../../lib/mfa'
import { MFA_SLABS } from '../../data/compensation'
import { formatINR, fmtDate } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import {
  ITrophy, ISearch, IDownload, ICalendar, IUsers, ICheck, IAlert, IClock, IClose, INetwork, IShield,
} from '../../components/ui/icons'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const ALLOCATION_LABELS = {
  self_own: 'Own Target',
  cascading_from_downline: 'Cascading Received',
  pass_through: 'Pass-Through (100%)',
  skipped_inactive: 'Skipped (Inactive)',
  unallocated_excess: 'Unallocated (Chain End)',
}

const ALLOCATION_STYLES = {
  self_own: 'bg-gold/15 text-gold-1 border-gold/35',
  cascading_from_downline: 'bg-sky-50 text-sky-800 border-sky-200',
  pass_through: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  skipped_inactive: 'bg-red-50 text-red-700 border-red-200',
  unallocated_excess: 'bg-amber-50 text-amber-800 border-amber-300',
}

function StatusPill({ status }) {
  const styles = {
    achieved: 'bg-ok/15 text-ok border-ok/30',
    in_progress: 'bg-gold-1/15 text-gold-tan border-gold-1/30',
    missed: 'bg-red-50 text-red-700 border-red-200',
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
  const istNow = useMemo(() => getCurrentIstPeriod(), [])
  const [selectedMonth, setSelectedMonth] = useState(istNow.month)
  const [selectedYear, setSelectedYear] = useState(istNow.year)
  const [activeTab, setActiveTab] = useState('records') // 'records' | 'cascading' | 'issues'
  const [rankFilter, setRankFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [uplineFilter, setUplineFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [cycle, setCycle] = useState({
    backendReady: true,
    cascadingReady: true,
    isClosedPeriod: false,
    isFuturePeriod: false,
    periodLocked: false,
    records: [],
    contribByAgent: {},
    allocations: [],
    allocationsByPolicy: {},
    allocationsByAgent: {},
    hierarchyIssues: [],
    profiles: [],
    totalTracked: 0,
    achievedCount: 0,
    notAchievedCount: 0,
    totalRewardsEarned: 0,
    totalCascadedCredit: 0,
    totalUnallocatedCredit: 0,
  })

  // Modal states: agent inspector & policy cascade trace drawer
  const [selectedAgentRecord, setSelectedAgentRecord] = useState(null)
  const [agentHistory, setAgentHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedPolicyTraceId, setSelectedPolicyTraceId] = useState(null)

  const selectedClosed = useMemo(
    () => isClosedMfaPeriod(selectedMonth, selectedYear),
    [selectedMonth, selectedYear]
  )
  const selectedFuture = useMemo(
    () => isFutureMfaPeriod(selectedMonth, selectedYear),
    [selectedMonth, selectedYear]
  )
  const isPeriodLocked = Boolean(cycle.periodLocked || selectedClosed)

  const loadCycle = async (autoSync = true) => {
    setLoading(true)
    try {
      const canSync = autoSync && !isClosedMfaPeriod(selectedMonth, selectedYear) && !isFutureMfaPeriod(selectedMonth, selectedYear)
      const res = await mfaAPI.listAdminMfaCycle({
        month: selectedMonth,
        year: selectedYear,
        autoSync: canSync,
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
    loadCycle(!selectedClosed && !selectedFuture)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear])

  const handleRecalculate = async () => {
    const session = JSON.parse(sessionStorage.getItem('apex_impersonation') || '{}')
    if (session?.active || session?.is_read_only) {
      toast.error('READ-ONLY: Sync is disabled in View As Agent mode.')
      return
    }
    if (isPeriodLocked) {
      toast.error(`${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} is closed and locked (read-only).`)
      return
    }
    if (selectedFuture) {
      toast.error(`${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} has not started yet.`)
      return
    }
    setSyncing(true)
    const tid = toast.loading(`Synchronizing Cascading MFA records for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}...`)
    try {
      const res = await mfaAPI.syncMonthlyMfaCycle(selectedMonth, selectedYear)
      if (res?.locked || res?.futurePeriod || res?.readOnlySkipped) {
        toast.error(
          res?.locked
            ? 'Period is locked and read-only; historical records were not overwritten.'
            : 'Future period sync skipped; cycle opens on the 1st of the month.',
          { id: tid }
        )
      } else if (!res?.backendReady || !res?.cascadingReady) {
        toast.success('Refreshed live Cascading MFA preview (apply SQL migrations in Supabase to persist).', { id: tid })
      } else {
        toast.success(
          `Synchronized ${res.records_synced || 0} agents (${res.policies_processed || 0} policies processed).`,
          { id: tid }
        )
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

  const uplineOptions = useMemo(() => {
    return (cycle.profiles || [])
      .filter((p) => !p.isAdmin && !p.isSuperAdmin && Number(p.rank || 1) >= 2 && Number(p.rank || 1) <= 10)
      .sort((a, b) => (Number(b.rank) - Number(a.rank)) || String(a.sponsorCode || '').localeCompare(String(b.sponsorCode || '')))
  }, [cycle.profiles])

  const subtreeIds = useMemo(
    () => getMfaSubtreeIds(uplineFilter, cycle.profiles, cycle.records, isPeriodLocked),
    [uplineFilter, cycle.profiles, cycle.records, isPeriodLocked]
  )

  const filteredRecords = useMemo(
    () =>
      filterMfaRecordsForView({
        records: cycle.records,
        subtreeIds,
        rankFilter,
        statusFilter,
        search,
      }),
    [cycle.records, subtreeIds, rankFilter, statusFilter, search]
  )

  // Policy-level Cascading Traces built & filtered consistently with active UI filters
  const policyTraces = useMemo(
    () =>
      filterPolicyTracesForView({
        allocationsByPolicy: cycle.allocationsByPolicy,
        records: cycle.records,
        subtreeIds,
        rankFilter,
        statusFilter,
        search,
      }),
    [cycle.allocationsByPolicy, cycle.records, subtreeIds, rankFilter, statusFilter, search]
  )

  const rankSummary = useMemo(() => {
    return Object.values(MFA_SLABS).map((slab) => {
      const matching = (cycle.records || []).filter((r) => Number(r.rankSnapshot) === slab.rank)
      const achieved = matching.filter((r) => r.isQualified)
      return {
        ...slab,
        trackedCount: matching.length,
        achievedCount: achieved.length,
        notAchievedCount: matching.length - achieved.length,
        totalOwnCredit: matching.reduce((s, r) => s + Number(r.ownMfaCreditApplied ?? r.totalMfaCredit ?? 0), 0),
        totalCascadingCredit: matching.reduce((s, r) => s + Number(r.cascadingMfaCreditReceived ?? 0), 0),
        totalCredit: matching.reduce((s, r) => s + Number(r.totalMfaCredit || 0), 0),
        totalRewards: achieved.reduce((s, r) => s + Number(r.rewardEarned || 0), 0),
      }
    })
  }, [cycle.records])

  const selectedPolicyTrace = useMemo(() => {
    if (!selectedPolicyTraceId) return null
    return policyTraces.find((t) => t.policyId === selectedPolicyTraceId) || null
  }, [policyTraces, selectedPolicyTraceId])

  const selectedAgentAllocations = useMemo(() => {
    if (!selectedAgentRecord) return { incoming: [], outgoing: [] }
    const aid = selectedAgentRecord.agentId
    const incoming = (cycle.allocations || []).filter(
      (a) => a.recipientAgentId === aid && a.allocationType === 'cascading_from_downline'
    )
    const outgoing = (cycle.allocations || []).filter(
      (a) => a.sourceAgentId === aid && a.allocationType !== 'self_own'
    )
    return { incoming, outgoing }
  }, [selectedAgentRecord, cycle.allocations])

  const handleExportExcel = () => {
    if (!filteredRecords.length && !policyTraces.length) {
      toast.error('No MFA records match current filters to export.')
      return
    }
    const { summaryRows, contribRows, cascadeRows } = buildMfaExcelSheetsData({
      filteredRecords,
      contribByAgent: cycle.contribByAgent,
      filteredPolicyTraces: policyTraces,
      monthLabel: `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
      allocationLabels: ALLOCATION_LABELS,
    })

    const wb = xlsx.utils.book_new()
    if (summaryRows.length > 0) {
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(summaryRows), 'MFA Summary')
    }
    if (contribRows.length > 0) {
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(contribRows), 'Business Breakdown')
    }
    if (cascadeRows.length > 0) {
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(cascadeRows), 'Cascading Allocations')
    }

    xlsx.writeFile(wb, `MFA_Cascading_Report_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.xlsx`)
    toast.success('Cascading MFA Report exported cleanly.')
  }

  const yearOptions = [istNow.year - 1, istNow.year, istNow.year + 1]
  const monthLabel = `${MONTH_NAMES[selectedMonth - 1] || selectedMonth} ${selectedYear}`
  const issuesCount = (cycle.hierarchyIssues || []).length

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-ink-1 tracking-tight flex items-center gap-2">
            <ITrophy size={22} className="text-gold shrink-0" /> Monthly MFA &amp; Cascading Management
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Monitor personal business credits, hierarchical cascading allocations (AO &rarr; ED), reward qualification, and hierarchy audit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-ink-2">
            <ICalendar size={14} className="text-gold-tan" />
          </div>
          <select
            aria-label="Month Filter"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="field py-1.5 text-xs flex-1 sm:flex-initial sm:w-36"
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
            disabled={syncing || isPeriodLocked || selectedFuture}
            title={
              isPeriodLocked
                ? 'Closed & locked historical period (read-only)'
                : selectedFuture
                  ? 'Future cycle opens on the 1st of the month'
                  : 'Synchronize and recalculate live month cascades'
            }
            className="btn-ghost border border-navy-4 py-1.5 px-3 text-xs flex-1 sm:flex-initial justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing
              ? 'Syncing...'
              : isPeriodLocked
                ? 'Locked (Read-Only)'
                : selectedFuture
                  ? 'Future Cycle'
                  : 'Sync Month'}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading || (!filteredRecords.length && !policyTraces.length)}
            className="btn-gold py-1.5 px-3 text-xs flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
          >
            <IDownload size={14} /> Export Excel
          </button>
        </div>
      </div>

      {(!cycle.backendReady || !cycle.cascadingReady) && (
        <div className="rounded-card border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <IAlert size={16} className="shrink-0 mt-0.5 text-amber-700" />
          <div>
            <strong>Cascading SQL Migration Pending:</strong> Showing live calculated Cascading MFA preview. Run{' '}
            <code className="font-mono text-gold-1">supabase/migrations/20261126_cascading_mfa.sql</code> in the Supabase SQL Editor to persist cascading allocation logs, hierarchy audit warnings, and backend triggers.
          </div>
        </div>
      )}

      {isPeriodLocked && (
        <div className="rounded-card border border-navy-4 bg-navy-2/80 p-3 text-xs text-ink-1 flex items-start gap-2.5">
          <IShield size={16} className="shrink-0 mt-0.5 text-gold-1" />
          <div>
            <strong>Closed &amp; Locked Historical Snapshot ({monthLabel}):</strong> This monthly cycle is finalized read-only. Rank, sponsor, agent status snapshots, contributions, and cascading allocations cannot be overwritten by sync or auto-recalculation.
          </div>
        </div>
      )}

      {!isPeriodLocked && selectedFuture && (
        <div className="rounded-card border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 flex items-start gap-2.5">
          <IClock size={16} className="shrink-0 mt-0.5 text-sky-700" />
          <div>
            <strong>Future MFA Cycle ({monthLabel}):</strong> Monthly business accumulation starts on the 1st of the month. Auto-sync and bulk record creation are disabled until {monthLabel} opens.
          </div>
        </div>
      )}

      {/* Summary Dashboard Cards */}
      {loading ? (
        <SkeletonStats count={5} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="card p-4 border-l-4 border-l-gold-1">
            <div className="flex items-center justify-between text-ink-2 text-[10px] sm:text-[11px] uppercase font-bold tracking-wider">
              <span>Agents Tracked</span>
              <IUsers size={15} className="text-gold" />
            </div>
            <p className="text-xl sm:text-2xl font-extrabold font-serif text-ink-1 mt-1.5">{cycle.totalTracked}</p>
            <p className="text-[11px] text-ink-2 mt-0.5">Ranks AO&ndash;ED &middot; {monthLabel}</p>
          </div>

          <div className="card p-4 border-l-4 border-l-emerald-500">
            <div className="flex items-center justify-between text-ink-2 text-[10px] sm:text-[11px] uppercase font-bold tracking-wider">
              <span>Achieved Target</span>
              <ICheck size={15} className="text-ok" />
            </div>
            <p className="text-xl sm:text-2xl font-extrabold font-serif text-ok mt-1.5">{cycle.achievedCount}</p>
            <p className="text-[11px] text-ink-2 mt-0.5">
              {cycle.totalTracked > 0 ? `${Math.round((cycle.achievedCount / cycle.totalTracked) * 100)}% qualified` : 'No tracked agents'}
            </p>
          </div>

          <div className="card p-4 border-l-4 border-l-sky-700">
            <div className="flex items-center justify-between text-ink-2 text-[10px] sm:text-[11px] uppercase font-bold tracking-wider">
              <span>Cascading Credit</span>
              <INetwork size={15} className="text-sky-700" />
            </div>
            <p className="text-xl sm:text-2xl font-extrabold font-serif text-sky-700 mt-1.5">{formatINR(cycle.totalCascadedCredit || 0)}</p>
            <p className="text-[11px] text-ink-2 mt-0.5">Applied up hierarchy</p>
          </div>

          <div className="card p-4 border-l-4 border-l-amber-500">
            <div className="flex items-center justify-between text-ink-2 text-[10px] sm:text-[11px] uppercase font-bold tracking-wider">
              <span>Unallocated Top</span>
              <IClock size={15} className="text-gold-tan" />
            </div>
            <p className="text-xl sm:text-2xl font-extrabold font-serif text-ink-1 mt-1.5">{formatINR(cycle.totalUnallocatedCredit || 0)}</p>
            <p className="text-[11px] text-ink-2 mt-0.5">{issuesCount > 0 ? `${issuesCount} hierarchy alert(s)` : 'Hierarchy boundary excess'}</p>
          </div>

          <div className="card p-4 border-l-4 border-l-gold col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-ink-2 text-[10px] sm:text-[11px] uppercase font-bold tracking-wider">
              <span>Total MFA Rewards</span>
              <ITrophy size={15} className="text-gold" />
            </div>
            <p className="text-xl sm:text-2xl font-extrabold font-serif text-gold mt-1.5">{formatINR(cycle.totalRewardsEarned)}</p>
            <p className="text-[11px] text-ink-2 mt-0.5">Earned for {monthLabel}</p>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3 items-center">
        <div className="relative sm:col-span-2">
          <ISearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Agent ID, Name, Email, or Policy #..."
            className="field pl-9 py-1.5 text-xs w-full"
          />
        </div>

        <select
          aria-label="Filter Rank"
          value={rankFilter}
          onChange={(e) => setRankFilter(e.target.value)}
          className="field py-1.5 text-xs w-full"
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
          className="field py-1.5 text-xs w-full"
        >
          <option value="all">All Statuses</option>
          <option value="achieved">Achieved Only</option>
          <option value="not_achieved">Not Achieved (&lt;100%)</option>
          <option value="in_progress">In Progress</option>
          <option value="missed">Missed (Past Month)</option>
        </select>

        <select
          aria-label="Filter Reporting Hierarchy"
          value={uplineFilter}
          onChange={(e) => setUplineFilter(e.target.value)}
          className="field py-1.5 text-xs w-full"
        >
          <option value="all">All Hierarchies</option>
          {uplineOptions.map((u) => (
            <option key={u.id} value={u.id}>
              Team: {u.sponsorCode} &mdash; {u.name}
            </option>
          ))}
        </select>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-navy-4/60 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('records')}
          className={`px-3.5 py-2 rounded-card text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'records' ? 'bg-gold-1 text-white' : 'bg-navy-2 text-ink-2 hover:text-ink-1'
          }`}
        >
          Agent MFA Ledger ({filteredRecords.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cascading')}
          className={`px-3.5 py-2 rounded-card text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'cascading' ? 'bg-sky-700 text-white' : 'bg-navy-2 text-ink-2 hover:text-ink-1'
          }`}
        >
          Cascading Trace History ({policyTraces.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('issues')}
          className={`px-3.5 py-2 rounded-card text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
            activeTab === 'issues' ? 'bg-amber-700 text-white' : 'bg-navy-2 text-ink-2 hover:text-ink-1'
          }`}
        >
          <span>Hierarchy Audit Warnings</span>
          {issuesCount > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'issues' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900 border border-amber-300'
            }`}>
              {issuesCount}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Agent MFA Tracking Table + Mobile Cards */}
      {activeTab === 'records' && (
        <div className="card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-navy-4/50">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
              Agent MFA Records &mdash; {monthLabel} ({filteredRecords.length})
            </h3>
          </div>

          {loading ? (
            <SkeletonTable rows={6} cols={10} />
          ) : filteredRecords.length > 0 ? (
            <>
              <div className="hidden md:block table-wrap overflow-x-auto">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Rank</th>
                      <th className="text-right">Target</th>
                      <th className="text-right">Own MFA Credit</th>
                      <th className="text-right">Cascading Credit</th>
                      <th className="text-right">Total Applied</th>
                      <th className="text-right">Remaining</th>
                      <th className="text-right">Excess Passed Up</th>
                      <th className="text-center">Progress</th>
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
                        <td className="text-right font-mono">
                          <span className="text-ink-1 font-semibold block">{formatINR(r.ownMfaCreditApplied ?? r.totalMfaCredit)}</span>
                          {(r.ownMfaCreditGenerated || 0) > (r.ownMfaCreditApplied || 0) && (
                            <span className="text-[10px] text-ink-2">Gen: {formatINR(r.ownMfaCreditGenerated)}</span>
                          )}
                        </td>
                        <td className="text-right font-mono font-bold text-sky-700">
                          {formatINR(r.cascadingMfaCreditReceived ?? 0)}
                        </td>
                        <td className="text-right font-mono font-bold text-gold">{formatINR(r.totalMfaCredit)}</td>
                        <td className="text-right font-mono text-ink-2">{formatINR(r.remainingAmount)}</td>
                        <td className="text-right font-mono font-semibold text-gold-tan">
                          {formatINR(r.excessCreditPassedUp ?? 0)}
                        </td>
                        <td className="text-center">
                          <div className="flex flex-col items-center gap-1 min-w-[74px]">
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
                        <td className="text-center"><StatusPill status={r.status} /></td>
                        <td className={`text-right font-mono font-bold ${r.isQualified ? 'text-ok' : 'text-ink-2'}`}>
                          {formatINR(r.rewardEarned)}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => handleInspectAgent(r)}
                            className="text-gold font-bold hover:underline text-[11px] uppercase whitespace-nowrap"
                          >
                            Inspect ({r.contributionsCount + (r.cascadingInCount || 0)})
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List (< md) */}
              <div className="md:hidden space-y-3">
                {filteredRecords.map((r) => (
                  <div key={r.agentId} className="p-3.5 rounded-card bg-navy-2/60 border border-navy-4 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold text-ink-1 block">{r.agentName}</span>
                        <span className="font-mono text-[11px] text-gold">
                          {r.sponsorCode} &middot; {r.rankCodeSnapshot}
                        </span>
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-navy-4/50">
                      <div>
                        <span className="text-[10px] text-ink-2 block">Target</span>
                        <span className="font-mono font-semibold text-ink-1">{formatINR(r.mfaTarget)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Total Applied ({Number(r.achievementPct || 0).toFixed(0)}%)</span>
                        <span className="font-mono font-bold text-gold">{formatINR(r.totalMfaCredit)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Own / Cascading</span>
                        <span className="font-mono text-ink-1">
                          {formatINR(r.ownMfaCreditApplied ?? 0)} / <span className="text-sky-700">{formatINR(r.cascadingMfaCreditReceived ?? 0)}</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Excess Up / Reward</span>
                        <span className="font-mono text-gold-tan">
                          {formatINR(r.excessCreditPassedUp ?? 0)} / <strong className={r.isQualified ? 'text-ok' : 'text-ink-2'}>{formatINR(r.rewardEarned)}</strong>
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInspectAgent(r)}
                      className="btn-ghost w-full border border-navy-4 py-1.5 text-[11px] font-bold text-gold uppercase"
                    >
                      Inspect Breakdown &amp; Cascade
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<ITrophy size={24} />}
              title="No Matching MFA Records"
              message="Adjust rank, status, hierarchy, search filters, or period to inspect agents."
            />
          )}
        </div>
      )}

      {/* TAB 2: Cascading Allocation History & Policy Trace */}
      {activeTab === 'cascading' && (
        <div className="card p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-navy-4/50">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
                Policy-Wise Cascading Allocation Lineage &mdash; {monthLabel}
              </h3>
              <p className="text-[11px] text-ink-2">
                Chronological trace from originating business credit through every reporting senior in the hierarchy.
              </p>
            </div>
          </div>

          {policyTraces.length > 0 ? (
            <div className="space-y-3">
              {policyTraces.map((trace) => (
                <div key={trace.policyId} className="p-3.5 sm:p-4 rounded-card bg-navy-2/50 border border-navy-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-gold text-sm">{trace.policyNumber}</span>
                        <span className="px-2 py-0.5 rounded bg-navy-3 border border-navy-4 font-mono text-[10px] font-bold text-ink-1">
                          {trace.planCode} &middot; {trace.durationYears}Y ({trace.mfaPercentage}%)
                        </span>
                        <span className="text-[11px] font-mono text-ink-2">
                          {trace.businessDate ? fmtDate(trace.businessDate) : '—'}
                        </span>
                      </div>
                      <p className="text-xs text-ink-2 mt-1">
                        Origin: <strong className="text-ink-1">{trace.originatingAgentName}</strong> ({trace.originatingAgentCode})
                        {' · '}Business: <strong className="font-mono text-ink-1">{formatINR(trace.originalBusinessAmount)}</strong>
                        {' · '}Qualifying Credit: <strong className="font-mono text-gold">{formatINR(trace.originatingMfaCredit)}</strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedPolicyTraceId(trace.policyId)}
                      className="btn-ghost border border-gold-1/40 text-gold text-xs py-1 px-3"
                    >
                      Trace Steps ({trace.steps.length})
                    </button>
                  </div>

                  {/* Step Flow Strip */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {trace.steps.map((step, idx) => (
                      <div key={step.id} className="flex items-center gap-1.5">
                        {idx > 0 && <span className="text-ink-2 font-bold">&rarr;</span>}
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono ${
                          ALLOCATION_STYLES[step.allocationType] || 'bg-navy-3 border-navy-4 text-ink-1'
                        }`}>
                          {step.allocationType === 'unallocated_excess' ? (
                            <span>Unallocated: {formatINR(step.unallocatedAmount)}</span>
                          ) : (
                            <span>
                              {step.recipientAgentCode || '—'} ({step.recipientRankCodeSnapshot || '—'}):{' '}
                              <strong>
                                {step.allocationType === 'pass_through'
                                  ? 'Pass 100%'
                                  : step.allocationType === 'skipped_inactive'
                                    ? 'Skipped'
                                    : `+${formatINR(step.appliedAmount)}`}
                              </strong>
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<INetwork size={24} />}
              title={`No Qualifying Policies in ${monthLabel}`}
              message="No policy allocations matched the current period or search criteria."
            />
          )}
        </div>
      )}

      {/* TAB 3: Hierarchy Audit Warnings */}
      {activeTab === 'issues' && (
        <div className="card p-4 sm:p-5 space-y-4">
          <div className="pb-2 border-b border-navy-4/50">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
              Hierarchy Safeguard &amp; Anomaly Log &mdash; {monthLabel}
            </h3>
            <p className="text-[11px] text-ink-2">
              Broken sponsor links, cycles, admin stops, or inactive/suspended superiors detected safely without crashing valid allocations.
            </p>
          </div>

          {issuesCount > 0 ? (
            <div className="table-wrap overflow-x-auto">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Policy Ref</th>
                    <th>Issue Type</th>
                    <th>Agent UUID</th>
                    <th>Sponsor UUID</th>
                    <th className="text-right">Affected Credit</th>
                    <th>Detected At</th>
                  </tr>
                </thead>
                <tbody>
                  {(cycle.hierarchyIssues || []).map((issue, i) => (
                    <tr key={issue.id || `${issue.policyId}-${i}`}>
                      <td className="font-mono font-bold text-gold">{issue.policyNumber || '—'}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-800 font-mono text-[10px] uppercase font-bold">
                          {issue.issueType}
                        </span>
                      </td>
                      <td className="font-mono text-ink-1 text-[11px]">{issue.agentId}</td>
                      <td className="font-mono text-ink-2 text-[11px]">{issue.sponsorId || '—'}</td>
                      <td className="text-right font-mono font-bold text-amber-800">{formatINR(issue.affectedCredit)}</td>
                      <td className="font-mono text-ink-2">{issue.detectedAt ? fmtDate(issue.detectedAt) : 'Live'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<ICheck size={24} />}
              title="Clean Reporting Hierarchy"
              message={`Zero hierarchy cycles, broken sponsor links, or inactive-manager anomalies recorded in ${monthLabel}.`}
            />
          )}
        </div>
      )}

      {/* Rank-Wise Achievement Summary */}
      <div className="card p-4 sm:p-5 space-y-3">
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
                <th className="text-center">Tracked</th>
                <th className="text-center">Achieved</th>
                <th className="text-right">Own Applied</th>
                <th className="text-right">Cascading Applied</th>
                <th className="text-right">Total Applied</th>
                <th className="text-right">Total Rewards</th>
              </tr>
            </thead>
            <tbody>
              {rankSummary.map((row) => (
                <tr key={row.rank}>
                  <td className="font-semibold text-ink-1 whitespace-nowrap">
                    {row.code} <span className="text-ink-2 font-normal">&mdash; {row.name}</span>
                  </td>
                  <td className="text-right font-mono text-ink-2">{formatINR(row.mfaTarget)}</td>
                  <td className="text-right font-mono text-gold-tan">{formatINR(row.mfaReward)}</td>
                  <td className="text-center font-mono text-ink-1">{row.trackedCount}</td>
                  <td className="text-center font-mono font-bold text-ok">{row.achievedCount}</td>
                  <td className="text-right font-mono text-ink-1">{formatINR(row.totalOwnCredit)}</td>
                  <td className="text-right font-mono text-sky-700">{formatINR(row.totalCascadingCredit)}</td>
                  <td className="text-right font-mono font-bold text-ink-1">{formatINR(row.totalCredit)}</td>
                  <td className="text-right font-mono font-bold text-gold">{formatINR(row.totalRewards)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent Breakdown & Historical Modal */}
      {selectedAgentRecord && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/75 p-2.5 sm:p-4 overflow-y-auto">
          <div className="card max-w-5xl w-full p-4 sm:p-6 space-y-5 border border-gold-1/30 my-auto max-h-[92dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-navy-4/50 pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-ink-1">
                  {selectedAgentRecord.agentName} &mdash; {monthLabel}
                </h3>
                <p className="text-xs text-ink-2 font-mono">
                  {selectedAgentRecord.sponsorCode} &middot; Snapshot Rank: {selectedAgentRecord.rankCodeSnapshot} &middot; Target: {formatINR(selectedAgentRecord.mfaTarget)} &middot; Achieved: {formatINR(selectedAgentRecord.totalMfaCredit)} ({Number(selectedAgentRecord.achievementPct || 0).toFixed(1)}%)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgentRecord(null)}
                className="btn-ghost p-1.5 text-ink-2 hover:text-ink-1"
                aria-label="Close agent modal"
              >
                <IClose size={18} />
              </button>
            </div>

            {/* Agent KPI Breakdown Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase font-bold block">Own Applied</span>
                <span className="font-mono font-bold text-gold mt-0.5 block">
                  {formatINR(selectedAgentRecord.ownMfaCreditApplied ?? 0)}
                </span>
              </div>
              <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase font-bold block">Cascading Received</span>
                <span className="font-mono font-bold text-sky-700 mt-0.5 block">
                  {formatINR(selectedAgentRecord.cascadingMfaCreditReceived ?? 0)}
                </span>
              </div>
              <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase font-bold block">Total Applied</span>
                <span className="font-mono font-bold text-ink-1 mt-0.5 block">
                  {formatINR(selectedAgentRecord.totalMfaCredit)}
                </span>
              </div>
              <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase font-bold block">Excess Passed Up</span>
                <span className="font-mono font-bold text-gold-tan mt-0.5 block">
                  {formatINR(selectedAgentRecord.excessCreditPassedUp ?? 0)}
                </span>
              </div>
              <div className="p-3 rounded-card bg-navy-2/60 border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase font-bold block">Reward Earned</span>
                <span className={`font-mono font-bold mt-0.5 block ${selectedAgentRecord.isQualified ? 'text-ok' : 'text-ink-2'}`}>
                  {formatINR(selectedAgentRecord.rewardEarned)}
                </span>
              </div>
            </div>

            {/* Own Policies */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
                Own Contributing Policies ({monthLabel})
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
                        <th className="text-right">Orig. Business</th>
                        <th className="text-center">MFA %</th>
                        <th className="text-right">Qualifying Credit</th>
                        <th className="text-right">Applied Self</th>
                        <th className="text-right">Excess Up</th>
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
                          <td className="text-center font-mono text-gold-tan font-bold">{c.mfaPercentage}%</td>
                          <td className="text-right font-mono text-ink-1">{formatINR(c.mfaCredit)}</td>
                          <td className="text-right font-mono font-bold text-ok">{formatINR(c.appliedToSelf ?? c.mfaCredit)}</td>
                          <td className="text-right font-mono font-bold text-gold">{formatINR(c.excessPassedUp ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic py-2">No qualifying personal business contributed this month.</p>
              )}
            </div>

            {/* Incoming Cascading Credits */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-sky-700">
                Cascading Credits Received From Downline ({selectedAgentAllocations.incoming.length})
              </h4>
              {selectedAgentAllocations.incoming.length > 0 ? (
                <div className="table-wrap overflow-x-auto">
                  <table className="tbl text-xs">
                    <thead>
                      <tr>
                        <th>Direct Downline</th>
                        <th>Policy # &amp; Origin</th>
                        <th>Date</th>
                        <th className="text-right">Incoming</th>
                        <th className="text-right">Applied</th>
                        <th className="text-right">Forwarded Up</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAgentAllocations.incoming.map((a) => (
                        <tr key={a.id}>
                          <td className="font-semibold text-ink-1">
                            {a.sourceAgentName} <span className="font-mono text-gold text-[10px]">({a.sourceAgentCode})</span>
                          </td>
                          <td>
                            <span className="font-mono font-bold text-gold">{a.policyNumber}</span>{' '}
                            <span className="text-[10px] text-ink-2">by {a.originatingAgentCode}</span>
                          </td>
                          <td className="font-mono text-ink-2">{a.businessDate ? fmtDate(a.businessDate) : '—'}</td>
                          <td className="text-right font-mono text-ink-1">{formatINR(a.incomingCredit)}</td>
                          <td className="text-right font-mono font-bold text-sky-700">{formatINR(a.appliedAmount)}</td>
                          <td className="text-right font-mono text-gold-tan">{formatINR(a.excessPassedUp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic py-2">No incoming cascading credits received in {monthLabel}.</p>
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
                        <th>Rank</th>
                        <th className="text-right">Target</th>
                        <th className="text-right">Own Applied</th>
                        <th className="text-right">Cascading</th>
                        <th className="text-right">Total Achieved</th>
                        <th className="text-center">%</th>
                        <th className="text-center">Status</th>
                        <th className="text-right">Reward</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentHistory.map((h) => (
                        <tr key={`${h.year}-${h.month}`}>
                          <td className="font-semibold text-ink-1">{MONTH_NAMES[h.month - 1]} {h.year}</td>
                          <td className="font-mono font-bold text-gold-tan">{h.rankCodeSnapshot}</td>
                          <td className="text-right font-mono text-ink-2">{formatINR(h.mfaTarget)}</td>
                          <td className="text-right font-mono text-ink-1">{formatINR(h.ownMfaCreditApplied ?? h.totalMfaCredit)}</td>
                          <td className="text-right font-mono text-sky-700">{formatINR(h.cascadingMfaCreditReceived ?? 0)}</td>
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

      {/* Policy Cascade Step-by-Step Lineage Drawer/Modal */}
      {selectedPolicyTrace && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/75 p-2.5 sm:p-4 overflow-y-auto">
          <div className="card max-w-4xl w-full p-4 sm:p-6 space-y-4 border border-sky-300 my-auto max-h-[92dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-navy-4/50 pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-ink-1">
                  Policy Cascade Trace &mdash; <span className="text-gold font-mono">{selectedPolicyTrace.policyNumber}</span>
                </h3>
                <p className="text-xs text-ink-2 mt-0.5">
                  Origin: <strong>{selectedPolicyTrace.originatingAgentName}</strong> ({selectedPolicyTrace.originatingAgentCode})
                  {' · '}Business: {formatINR(selectedPolicyTrace.originalBusinessAmount)} &middot; Duration: {selectedPolicyTrace.durationYears}Y ({selectedPolicyTrace.mfaPercentage}%) &middot; Qualifying Credit: <strong className="text-gold">{formatINR(selectedPolicyTrace.originatingMfaCredit)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPolicyTraceId(null)}
                className="btn-ghost p-1.5 text-ink-2 hover:text-ink-1"
                aria-label="Close trace modal"
              >
                <IClose size={18} />
              </button>
            </div>

            <div className="table-wrap overflow-x-auto">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th className="text-center">Seq</th>
                    <th>Step Type</th>
                    <th>From Source</th>
                    <th>To Recipient (Snapshot)</th>
                    <th className="text-right">Incoming</th>
                    <th className="text-right">Applied</th>
                    <th className="text-right">Passed Up</th>
                    <th className="text-right">Unallocated</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPolicyTrace.steps.map((s) => (
                    <tr key={s.id}>
                      <td className="text-center font-mono font-bold text-gold-tan">#{s.allocationSequence}</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          ALLOCATION_STYLES[s.allocationType] || 'bg-navy-3 border-navy-4 text-ink-1'
                        }`}>
                          {ALLOCATION_LABELS[s.allocationType] || s.allocationType}
                        </span>
                      </td>
                      <td>
                        <span className="text-ink-1 font-semibold block">{s.sourceAgentName}</span>
                        <span className="font-mono text-[10px] text-ink-2">{s.sourceAgentCode}</span>
                      </td>
                      <td>
                        {s.recipientAgentId ? (
                          <div>
                            <span className="text-ink-1 font-semibold block">{s.recipientAgentName}</span>
                            <span className="font-mono text-[10px] text-gold">
                              {s.recipientAgentCode} &middot; {s.recipientRankCodeSnapshot} (Target: {formatINR(s.recipientTargetSnapshot)})
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-amber-800 font-semibold block">Hierarchy End</span>
                            <span className="text-[10px] text-ink-2 font-mono">{s.unallocatedReason || '—'}</span>
                          </div>
                        )}
                      </td>
                      <td className="text-right font-mono text-ink-1">{formatINR(s.incomingCredit)}</td>
                      <td className="text-right font-mono font-bold text-ok">{formatINR(s.appliedAmount)}</td>
                      <td className="text-right font-mono font-bold text-gold-tan">{formatINR(s.excessPassedUp)}</td>
                      <td className="text-right font-mono text-amber-800">{formatINR(s.unallocatedAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-navy-4/50">
              <button type="button" onClick={() => setSelectedPolicyTraceId(null)} className="btn-gold py-1.5 px-4 text-xs">
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
