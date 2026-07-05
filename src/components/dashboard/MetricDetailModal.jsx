import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { startOfMonth, format, addYears } from 'date-fns'
import { useCollection } from '../../hooks/useFirestore'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR, fmtDate, fmtDateTime, toDate } from '../../utils/format'
import { IClose, ISearch, IChevron } from '../ui/icons'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

const PAGE_SIZE = 10

export default function MetricDetailModal({ open, metricType, onClose }) {
  const navigate = useNavigate()
  const { config: ranksConfig } = useRanks()

  // 1. Determine which collections are needed based on active metric type
  const isPlansCollectionNeeded = ['total-business', 'monthly-business', 'active-policies'].includes(metricType)
  const isCommissionNeeded = metricType === 'total-commissions'
  const isUsersNeeded = ['active-agents', 'total-business', 'monthly-business', 'active-policies', 'approved-promotions'].includes(metricType)
  const isPromotionsNeeded = metricType === 'approved-promotions'
  const isImportsNeeded = metricType === 'import-errors'
  const isBranchesNeeded = metricType === 'active-agents'

  // 2. Query Firestore collections conditionally
  const plans = useCollection(isPlansCollectionNeeded && open ? 'plans' : null)
  const commissions = useCollection(isCommissionNeeded && open ? 'commission_ledger' : null)
  const users = useCollection(isUsersNeeded && open ? 'users' : null)
  const promotions = useCollection(isPromotionsNeeded && open ? 'promotions_history' : null)
  const imports = useCollection(isImportsNeeded && open ? 'imports' : null)
  const branches = useCollection(isBranchesNeeded && open ? 'branches' : null)

  // 3. Navigation map for branch and member profiles
  const branchMap = useMemo(() => {
    const map = {}
    if (branches.data) {
      branches.data.forEach((b) => {
        map[b.id] = b.name
      })
    }
    return map
  }, [branches.data])

  // 4. State for UI controls
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('')
  const [sortOrder, setSortOrder] = useState('desc') // 'asc' | 'desc'
  const [currentPage, setCurrentPage] = useState(1)

  // Reset controls when modal opens or metric changes
  useEffect(() => {
    setSearch('')
    setSortField('')
    setSortOrder('desc')
    setCurrentPage(1)
  }, [open, metricType])

  // 5. Determine loading state
  const loading = useMemo(() => {
    if (!open) return false
    switch (metricType) {
      case 'total-business':
      case 'monthly-business':
        return plans.loading || users.loading
      case 'total-commissions':
        return commissions.loading
      case 'active-agents':
        return users.loading || branches.loading
      case 'active-policies':
        return plans.loading || users.loading
      case 'approved-promotions':
        return promotions.loading
      case 'import-errors':
        return imports.loading
      default:
        return false
    }
  }, [open, metricType, plans.loading, commissions.loading, users.loading, promotions.loading, imports.loading, branches.loading])

  // 6. Gather and process raw records for the active metric
  const processedRecords = useMemo(() => {
    if (!open || loading) return []

    switch (metricType) {
      case 'total-business': {
        // Chronological sort to calculate correct cumulative running total
        const sortedPlans = [...plans.data].sort((a, b) => {
          const tA = toDate(a.startDate)?.getTime() || 0
          const tB = toDate(b.startDate)?.getTime() || 0
          return tA - tB
        })

        let runSum = 0
        const mapped = sortedPlans.map((p) => {
          const amount = p.planType === 'RD' ? (p.monthlyAmount || 0) : (p.fdAmount || 0)
          runSum += amount
          return {
            id: p.id,
            date: p.startDate,
            agent: p.agentName || '—',
            client: p.customerName || '—',
            policyId: p.policyNumber || '—',
            amount,
            runningTotal: runSum,
          }
        })
        // Return latest first by default
        return mapped.reverse()
      }

      case 'monthly-business': {
        const startOfCurrMonth = startOfMonth(new Date())
        const filtered = plans.data.filter((p) => {
          const d = toDate(p.startDate)
          return d && d >= startOfCurrMonth
        })

        // Sort chronologically
        const sortedPlans = [...filtered].sort((a, b) => {
          const tA = toDate(a.startDate)?.getTime() || 0
          const tB = toDate(b.startDate)?.getTime() || 0
          return tA - tB
        })

        return sortedPlans.map((p) => {
          const amount = p.planType === 'RD' ? (p.monthlyAmount || 0) : (p.fdAmount || 0)
          return {
            id: p.id,
            date: p.startDate,
            agent: p.agentName || '—',
            client: p.customerName || '—',
            policyId: p.policyNumber || '—',
            amount,
          }
        }).reverse()
      }

      case 'total-commissions': {
        return commissions.data.map((c) => ({
          id: c.id,
          agent: c.agentName || '—',
          date: c.createdAt,
          policyRef: c.policyNumber || '—',
          amount: c.amount || 0,
          status: c.status === 'unpaid' ? 'pending' : 'paid',
        }))
      }

      case 'active-agents': {
        const filteredUsers = users.data.filter((u) => u.status === 'active' && !u.isSuperAdmin)
        return filteredUsers.map((u) => ({
          id: u.id,
          name: u.name || '—',
          branch: branchMap[u.branchId] || '—',
          joinDate: u.joinDate || u.createdAt,
          policiesSold: u.activePolicies || 0,
          lastActivityDate: u.recentImportDate || u.joinDate || u.createdAt,
        }))
      }

      case 'active-policies': {
        const filtered = plans.data.filter((p) => p.status === 'active')
        return filtered.map((p) => {
          // Calculate maturityDate if not explicitly defined
          let matDate = p.maturityDate
          if (!matDate && p.startDate && p.duration) {
            const start = toDate(p.startDate)
            matDate = addYears(start, p.duration)
          }

          return {
            id: p.id,
            policyId: p.policyNumber || '—',
            client: p.customerName || '—',
            agent: p.agentName || '—',
            startDate: p.startDate,
            maturityDate: matDate,
            amount: p.planType === 'RD' ? (p.monthlyAmount || 0) : (p.fdAmount || 0),
            planType: p.planType || '—',
            status: p.status || 'active',
          }
        })
      }

      case 'approved-promotions': {
        const filtered = promotions.data.filter((pr) => pr.status === 'approved')
        return filtered.map((h) => {
          // Look up rank reward value
          const rankNum = Number(h.newRank)
          const rewardValue = ranksConfig?.PB_AMOUNT?.[rankNum - 1] || 0

          return {
            id: h.id,
            agent: h.agentName || '—',
            sponsorCode: h.sponsorCode || '—',
            promotionName: h.newRankCode || '—',
            approvalDate: h.approvedDate || h.createdAt,
            approvedBy: h.approvedBy || '—',
            rewardValue,
          }
        })
      }

      case 'import-errors': {
        const errors = []
        imports.data.forEach((imp) => {
          if (imp.logs && imp.logs.length > 0) {
            imp.logs.forEach((log, index) => {
              if (log.level === 'error') {
                errors.push({
                  id: `${imp.id}-${log.row}-${index}`,
                  fileName: imp.fileName || '—',
                  row: log.row || '—',
                  message: log.message || '—',
                  triggeredBy: imp.triggeredBy || 'Administrator',
                  importDate: imp.importDate,
                })
              }
            })
          }
        })
        return errors
      }

      default:
        return []
    }
  }, [open, loading, metricType, plans.data, commissions.data, users.data, promotions.data, imports.data, branchMap, ranksConfig])

  // 7. Calculate Monthly subtotal chart data (MTD Monthly Business only)
  const monthlyChartData = useMemo(() => {
    if (metricType !== 'monthly-business' || processedRecords.length === 0) return []

    const dailyMap = {}
    processedRecords.forEach((r) => {
      const d = toDate(r.date)
      if (!d) return
      const dayStr = format(d, 'dd MMM')
      dailyMap[dayStr] = (dailyMap[dayStr] || 0) + r.amount
    })

    // Sort chronologically by parsing date keys back
    return Object.entries(dailyMap)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => {
        const parseDate = (str) => new Date(`${str} ${new Date().getFullYear()}`)
        return parseDate(a.date) - parseDate(b.date)
      })
  }, [processedRecords, metricType])

  // 8. Filter records using in-memory search
  const filteredRecords = useMemo(() => {
    const queryStr = search.trim().toLowerCase()
    if (!queryStr) return processedRecords

    return processedRecords.filter((r) => {
      return Object.values(r).some((val) => {
        if (val === null || val === undefined) return false
        if (typeof val === 'object' && val.seconds) {
          // Format Firestore timestamp for searching
          return fmtDate(val).toLowerCase().includes(queryStr)
        }
        return String(val).toLowerCase().includes(queryStr)
      })
    })
  }, [processedRecords, search])

  // 9. Sort records using selected sorting criteria
  const sortedRecords = useMemo(() => {
    if (!sortField) return filteredRecords

    return [...filteredRecords].sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      // Handle FireStore Timestamps or Date objects
      if (valA && typeof valA === 'object' && valA.seconds) {
        valA = valA.seconds
      }
      if (valB && typeof valB === 'object' && valB.seconds) {
        valB = valB.seconds
      }

      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA)
      }

      // Default numeric/date sort
      const numA = Number(valA) || 0
      const numB = Number(valB) || 0
      return sortOrder === 'asc' ? numA - numB : numB - numA
    })
  }, [filteredRecords, sortField, sortOrder])

  // 10. Paginate records
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    return sortedRecords.slice(startIndex, startIndex + PAGE_SIZE)
  }, [sortedRecords, currentPage])

  const totalPages = Math.ceil(sortedRecords.length / PAGE_SIZE)

  // Toggle sort order helper
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
    setCurrentPage(1)
  }

  // Escape key support
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  // Render Modal Title & Column Headers Configuration
  const meta = useMemo(() => {
    switch (metricType) {
      case 'total-business':
        return {
          title: 'Total Business Volume Ledger',
          iconColor: 'text-[#A3906B]',
          headers: [
            { label: 'Date', key: 'date' },
            { label: 'Agent Name', key: 'agent' },
            { label: 'Client Name', key: 'client' },
            { label: 'Policy Number', key: 'policyId' },
            { label: 'Amount', key: 'amount' },
            { label: 'Running Total', key: 'runningTotal' },
          ],
        }
      case 'monthly-business':
        return {
          title: 'MTD Monthly Business Performance',
          iconColor: 'text-[#7A8E6E]',
          headers: [
            { label: 'Date', key: 'date' },
            { label: 'Agent Name', key: 'agent' },
            { label: 'Client Name', key: 'client' },
            { label: 'Policy Number', key: 'policyId' },
            { label: 'Amount', key: 'amount' },
          ],
        }
      case 'total-commissions':
        return {
          title: 'Commissions Ledgers Activity',
          iconColor: 'text-[#BF8955]',
          headers: [
            { label: 'Agent Name', key: 'agent' },
            { label: 'Payout Date', key: 'date' },
            { label: 'Policy Reference', key: 'policyRef' },
            { label: 'Commission', key: 'amount' },
            { label: 'Status', key: 'status' },
          ],
        }
      case 'active-agents':
        return {
          title: 'Active Agents Ledger',
          iconColor: 'text-gold',
          headers: [
            { label: 'Agent Name', key: 'name' },
            { label: 'Branch Office', key: 'branch' },
            { label: 'Join Date', key: 'joinDate' },
            { label: 'Policies Sold', key: 'policiesSold' },
            { label: 'Last Active', key: 'lastActivityDate' },
          ],
        }
      case 'active-policies':
        return {
          title: 'Active Policies Registry',
          iconColor: 'text-ok',
          headers: [
            { label: 'Policy ID', key: 'policyId' },
            { label: 'Client Name', key: 'client' },
            { label: 'Agent Assigned', key: 'agent' },
            { label: 'Start Date', key: 'startDate' },
            { label: 'Matures', key: 'maturityDate' },
            { label: 'Premium Amount', key: 'amount' },
            { label: 'Status', key: 'status' },
          ],
        }
      case 'approved-promotions':
        return {
          title: 'Approved Promotions & Rewards Logs',
          iconColor: 'text-gold-1',
          headers: [
            { label: 'Agent Name', key: 'agent' },
            { label: 'Promotion Name', key: 'promotionName' },
            { label: 'Approval Date', key: 'approvalDate' },
            { label: 'Approved By', key: 'approvedBy' },
            { label: 'Reward Value', key: 'rewardValue' },
          ],
        }
      case 'import-errors':
        return {
          title: 'Pending Import Failures & Diagnostics',
          iconColor: 'text-danger',
          headers: [
            { label: 'File Name', key: 'fileName' },
            { label: 'Row', key: 'row' },
            { label: 'Error Reason', key: 'message' },
            { label: 'Uploaded By', key: 'triggeredBy' },
            { label: 'Timestamp', key: 'importDate' },
            { label: '', key: 'action' },
          ],
        }
      default:
        return { title: 'Metric Details', iconColor: 'text-gold', headers: [] }
    }
  }, [metricType])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Blur Backdrop */}
          <div
            className="absolute inset-0 bg-navy-1/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 15 }}
            className="card relative z-10 w-full max-w-5xl p-6 max-h-[92vh] flex flex-col overflow-hidden bg-navy-3 border border-navy-4"
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between border-b border-navy-4/50 pb-3">
              <div>
                <h3 className={`font-serif text-lg sm:text-xl font-bold tracking-tight text-ink-1 flex items-center gap-2`}>
                  <span className={meta.iconColor}>◈</span> {meta.title}
                </h3>
                <p className="text-xs text-ink-2 mt-0.5">
                  Showing detailed record breakdown contributing to the dashboard metrics summary.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-navy-4 bg-navy-2 p-1.5 text-ink-2 hover:bg-navy-1 hover:text-ink-1 transition-colors"
              >
                <IClose size={16} />
              </button>
            </div>

            {/* MTD Daily subtotal chart */}
            {metricType === 'monthly-business' && !loading && sortedRecords.length > 0 && (
              <div className="mb-5 bg-navy-2/40 border border-navy-4 p-4 rounded-card">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan mb-3">
                  Daily Business Sub-Total Chart (Current Month)
                </h4>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#253545" />
                      <XAxis dataKey="date" stroke="#7A8E9E" fontSize={10} />
                      <YAxis stroke="#7A8E9E" fontSize={10} tickFormatter={(val) => `₹${val}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#132230', borderColor: '#253545', borderRadius: '8px' }}
                        labelStyle={{ color: '#7A8E9E', fontWeight: 'bold' }}
                        itemStyle={{ color: '#7A8E6E' }}
                        formatter={(val) => formatINR(val)}
                      />
                      <Bar dataKey="amount" fill="#7A8E6E" radius={[3, 3, 0, 0]} maxBarSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Search Filters */}
            {!loading && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <ISearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setCurrentPage(1)
                    }}
                    placeholder="Quick filter records..."
                    className="field pl-9 text-xs py-1.5"
                  />
                </div>
                <div className="text-xs text-ink-2 font-mono">
                  {sortedRecords.length} records found
                </div>
              </div>
            )}

            {/* Main content table area */}
            <div className="flex-1 overflow-y-auto min-h-[220px]">
              {loading ? (
                <div className="flex h-48 flex-col items-center justify-center space-y-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                  <span className="text-xs text-ink-2 font-medium tracking-wider uppercase">Querying Firestore...</span>
                </div>
              ) : sortedRecords.length === 0 ? (
                <div className="flex h-44 flex-col items-center justify-center text-center p-6 border border-dashed border-navy-4/70 rounded bg-navy-2/20">
                  <span className="text-xs italic text-ink-2 font-mono">No records found.</span>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="tbl text-xs">
                    <thead>
                      <tr>
                        {meta.headers.map((h) => (
                          <th
                            key={h.label || h.key}
                            onClick={() => h.key && h.key !== 'action' && handleSort(h.key)}
                            className={h.key && h.key !== 'action' ? 'cursor-pointer hover:bg-navy-2 select-none whitespace-nowrap' : 'whitespace-nowrap'}
                          >
                            <span className="flex items-center gap-1">
                              {h.label}
                              {sortField === h.key && (
                                <span className="text-[10px] text-gold font-mono">
                                  {sortOrder === 'asc' ? '▲' : '▼'}
                                </span>
                              )}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRecords.map((r) => {
                        // Render Row dynamically depending on metricType
                        if (metricType === 'total-business' || metricType === 'monthly-business') {
                          return (
                            <tr key={r.id} className="hover:bg-navy-2/20">
                              <td className="font-mono text-ink-2">{r.date ? fmtDate(r.date) : '—'}</td>
                              <td className="font-semibold text-ink-1">{r.agent}</td>
                              <td className="text-ink-1 font-medium">{r.client}</td>
                              <td className="font-mono text-gold">{r.policyId}</td>
                              <td className="font-semibold text-ink-1 font-mono">{formatINR(r.amount)}</td>
                              {metricType === 'total-business' && (
                                <td className="font-bold text-gold-tan font-mono">{formatINR(r.runningTotal)}</td>
                              )}
                            </tr>
                          )
                        }

                        if (metricType === 'total-commissions') {
                          return (
                            <tr key={r.id} className="hover:bg-navy-2/20">
                              <td className="font-semibold text-ink-1">{r.agent}</td>
                              <td className="font-mono text-ink-2">{r.date ? fmtDate(r.date) : '—'}</td>
                              <td className="font-mono text-gold">{r.policyRef}</td>
                              <td className="font-semibold text-gold font-mono">{formatINR(r.amount)}</td>
                              <td>
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                                  r.status === 'paid' ? 'bg-ok/10 text-ok' : 'bg-gold-1/10 text-gold-1'
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          )
                        }

                        if (metricType === 'active-agents') {
                          return (
                            <tr
                              key={r.id}
                              className="hover:bg-navy-2/30 cursor-pointer"
                              onClick={() => {
                                onClose()
                                navigate(`/admin/members/${r.id}`)
                              }}
                            >
                              <td className="font-semibold text-gold hover:underline">{r.name}</td>
                              <td className="text-ink-2 font-medium">{r.branch}</td>
                              <td className="text-ink-2 font-mono">{r.joinDate ? fmtDate(r.joinDate) : '—'}</td>
                              <td className="font-bold text-ink-1 font-mono">{r.policiesSold}</td>
                              <td className="text-ink-2 font-mono">{r.lastActivityDate ? fmtDate(r.lastActivityDate) : '—'}</td>
                            </tr>
                          )
                        }

                        if (metricType === 'active-policies') {
                          return (
                            <tr key={r.id} className="hover:bg-navy-2/20">
                              <td className="font-mono font-semibold text-gold">{r.policyId}</td>
                              <td className="font-semibold text-ink-1">{r.client}</td>
                              <td className="text-ink-2 font-medium">{r.agent}</td>
                              <td className="text-ink-2 font-mono">{r.startDate ? fmtDate(r.startDate) : '—'}</td>
                              <td className="text-ink-2 font-mono">{r.maturityDate ? fmtDate(r.maturityDate) : '—'}</td>
                              <td className="font-semibold text-ink-1 font-mono">
                                {formatINR(r.amount)}
                                <span className="text-[9px] font-normal text-ink-2 ml-0.5 uppercase">
                                  {r.planType === 'RD' ? '/mo' : ' total'}
                                </span>
                              </td>
                              <td>
                                <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[9px] font-bold text-ok uppercase">
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          )
                        }

                        if (metricType === 'approved-promotions') {
                          return (
                            <tr key={r.id} className="hover:bg-navy-2/20">
                              <td>
                                <span className="font-semibold text-ink-1 block">{r.agent}</span>
                                <span className="text-[9px] text-ink-2 font-mono font-medium">{r.sponsorCode}</span>
                              </td>
                              <td className="font-bold text-gold">{r.promotionName}</td>
                              <td className="font-mono text-ink-2">{r.approvalDate ? fmtDate(r.approvalDate) : '—'}</td>
                              <td className="text-ink-2 font-semibold">{r.approvedBy}</td>
                              <td className="font-bold text-gold-tan font-mono">{formatINR(r.rewardValue)}</td>
                            </tr>
                          )
                        }

                        if (metricType === 'import-errors') {
                          return (
                            <tr key={r.id} className="hover:bg-navy-2/20">
                              <td className="font-mono font-semibold text-ink-1">{r.fileName}</td>
                              <td className="font-mono font-bold text-danger text-center bg-danger/5 rounded-sm">{r.row}</td>
                              <td className="text-ink-2 font-medium whitespace-pre-wrap">{r.message}</td>
                              <td className="text-ink-2">{r.triggeredBy}</td>
                              <td className="font-mono text-ink-2">{r.importDate ? fmtDateTime(r.importDate) : '—'}</td>
                              <td className="text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose()
                                    navigate('/admin/import')
                                  }}
                                  className="btn-gold text-[10px] py-1 px-2.5 font-bold uppercase tracking-wide hover:scale-105 active:scale-95 transition-all shadow-sm"
                                >
                                  Retry
                                </button>
                              </td>
                            </tr>
                          )
                        }

                        return null
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination footer */}
            {!loading && totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-navy-4/50 pt-3">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="btn-ghost py-1.5 px-3 text-xs disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <span className="scale-x-[-1] inline-block"><IChevron size={12} /></span> Previous
                </button>
                <span className="text-xs text-ink-2 font-semibold font-mono">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="btn-ghost py-1.5 px-3 text-xs disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  Next <IChevron size={12} />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
