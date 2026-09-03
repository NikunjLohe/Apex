import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { useCollection } from '../../hooks/useFirestore'
import { formatINR, fmtDate, toDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import toast from 'react-hot-toast'
import * as xlsx from 'xlsx'
import {
  ICalendar,
  IReport,
  IDownload,
  ISearch,
  ICash,
  IDoc,
  IUsers,
  IChevronDown,
} from '../../components/ui/icons'

/** Helper to derive standardized term label from plan type and installments */
function formatTerm(plan) {
  const type = String(plan?.type || '').toUpperCase()
  if (type === 'PENS' || plan?.planType === 'PENS') return 'Pension'

  const match = type.match(/(\d+)Y$/)
  if (match) {
    const years = match[1]
    const prefix = type.startsWith('FD') ? 'FD' : 'RD'
    return `${prefix} ${years} Year${Number(years) > 1 ? 's' : ''}`
  }

  // Fallback using totalInstallments
  if (plan?.totalInstallments) {
    const years = Math.max(1, Math.round(plan.totalInstallments / 12))
    const prefix = plan?.planType === 'FD' ? 'FD' : 'RD'
    return `${prefix} ${years} Year${years > 1 ? 's' : ''}`
  }

  return type || 'Standard'
}

/** Determine category: 'RD' | 'FD' | 'PENS' */
function getCategory(plan, payment) {
  const type = String(plan?.type || payment?.planType || '').toUpperCase()
  if (type.startsWith('PENS') || plan?.planType === 'PENS') return 'PENS'
  if (type.startsWith('FD') || plan?.planType === 'FD') return 'FD'
  return 'RD'
}

export default function MonthlyBusiness() {
  const paymentsCollection = useCollection('payments')
  const plansCollection = useCollection('plans')
  const usersCollection = useCollection('users')

  const loading = paymentsCollection.loading || plansCollection.loading || usersCollection.loading

  const currentMonthStr = format(new Date(), 'yyyy-MM')
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterTerm, setFilterTerm] = useState('all')

  // Map plans by ID and by planAccountNumber
  const planMaps = useMemo(() => {
    const byId = {}
    const byAcc = {}
    plansCollection.data.forEach((p) => {
      byId[p.id] = p
      if (p.policyNumber) byAcc[p.policyNumber] = p
      if (p.planAccountNumber) byAcc[p.planAccountNumber] = p
    })
    return { byId, byAcc }
  }, [plansCollection.data])

  // Derive available months from payments data (up to current month)
  const availableMonths = useMemo(() => {
    const set = new Set()
    set.add(currentMonthStr)

    paymentsCollection.data.forEach((p) => {
      const d = toDate(p.paidDate)
      if (d) {
        const m = format(d, 'yyyy-MM')
        if (m <= currentMonthStr) {
          set.add(m)
        }
      }
    })

    return Array.from(set).sort().reverse()
  }, [paymentsCollection.data, currentMonthStr])

  // Process business data for selected month
  const monthlyData = useMemo(() => {
    if (loading) {
      return {
        paymentsCount: 0,
        rdDetailItems: [],
        fdDetailItems: [],
        pensDetailItems: [],
        allDetailItems: [],
        rdTermSummary: [],
        fdTermSummary: [],
        pensSummary: [],
        overallSummary: [],
        topSummary: {
          totalBusiness: 0,
          totalPolicies: 0,
          rdBusiness: 0,
          rdPolicies: 0,
          fdBusiness: 0,
          fdPolicies: 0,
          pensBusiness: 0,
          pensPolicies: 0,
        },
      }
    }

    const [year, month] = selectedMonth.split('-').map(Number)
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endDate = endOfMonth(startDate)
    endDate.setHours(23, 59, 59, 999)

    // Filter payments falling in selected month
    const monthPayments = paymentsCollection.data.filter((p) => {
      const d = toDate(p.paidDate)
      return d && d >= startDate && d <= endDate
    })

    // Grouping & Deduplication
    const rdDetailItems = []
    const fdPolicyMap = new Map()
    const pensPolicyMap = new Map()

    monthPayments.forEach((pay) => {
      const plan = planMaps.byId[pay.planId] || planMaps.byAcc[pay.planAccountNumber] || {}
      const category = getCategory(plan, pay)
      const termLabel = formatTerm(plan)
      const policyNumber = pay.planAccountNumber || plan.policyNumber || plan.planAccountNumber || '—'
      const customerName = pay.customerName || plan.customerName || '—'
      const agentName = pay.agentName || plan.agentName || '—'
      const businessDate = pay.paidDate

      if (category === 'RD') {
        const amount = Number(pay.amount) || Number(plan.monthlyAmount) || 0
        rdDetailItems.push({
          id: pay.id,
          policyNumber,
          customerName,
          agentName,
          planCode: plan.type || 'RD',
          category: 'RD',
          term: termLabel,
          businessDate,
          businessAmount: amount,
          status: pay.status || plan.status || 'active',
          planId: plan.id || pay.planId,
        })
      } else if (category === 'FD') {
        const planKey = plan.id || policyNumber
        if (!fdPolicyMap.has(planKey)) {
          const amount = Number(plan.fdAmount) || Number(pay.amount) || 0
          fdPolicyMap.set(planKey, {
            id: pay.id,
            policyNumber,
            customerName,
            agentName,
            planCode: plan.type || 'FD',
            category: 'FD',
            term: termLabel,
            businessDate,
            businessAmount: amount,
            status: pay.status || plan.status || 'active',
            planId: plan.id || pay.planId,
          })
        }
      } else if (category === 'PENS') {
        const planKey = plan.id || policyNumber
        if (!pensPolicyMap.has(planKey)) {
          const amount = Number(plan.fdAmount) || Number(pay.amount) || 0
          pensPolicyMap.set(planKey, {
            id: pay.id,
            policyNumber,
            customerName,
            agentName,
            planCode: plan.type || 'PENS',
            category: 'PENS',
            term: termLabel,
            businessDate,
            businessAmount: amount,
            status: pay.status || plan.status || 'active',
            planId: plan.id || pay.planId,
          })
        }
      }
    })

    const fdDetailItems = Array.from(fdPolicyMap.values())
    const pensDetailItems = Array.from(pensPolicyMap.values())
    const allDetailItems = [...rdDetailItems, ...fdDetailItems, ...pensDetailItems]

    // RD Term Summaries
    const rdTermMap = {}
    rdDetailItems.forEach((item) => {
      if (!rdTermMap[item.term]) {
        rdTermMap[item.term] = { term: item.term, policiesSet: new Set(), business: 0 }
      }
      rdTermMap[item.term].policiesSet.add(item.planId || item.policyNumber)
      rdTermMap[item.term].business += item.businessAmount
    })
    const rdTermSummary = Object.values(rdTermMap).map((t) => ({
      term: t.term,
      policies: t.policiesSet.size,
      business: t.business,
    })).sort((a, b) => a.term.localeCompare(b.term))

    // FD Term Summaries
    const fdTermMap = {}
    fdDetailItems.forEach((item) => {
      if (!fdTermMap[item.term]) {
        fdTermMap[item.term] = { term: item.term, policies: 0, business: 0 }
      }
      fdTermMap[item.term].policies += 1
      fdTermMap[item.term].business += item.businessAmount
    })
    const fdTermSummary = Object.values(fdTermMap).map((t) => ({
      term: t.term,
      policies: t.policies,
      business: t.business,
    })).sort((a, b) => a.term.localeCompare(b.term))

    // Pension Summaries
    const pensTermMap = {}
    pensDetailItems.forEach((item) => {
      const prod = 'Pension'
      if (!pensTermMap[prod]) {
        pensTermMap[prod] = { product: prod, policies: 0, business: 0 }
      }
      pensTermMap[prod].policies += 1
      pensTermMap[prod].business += item.businessAmount
    })
    const pensSummary = Object.values(pensTermMap)

    // Totals per category
    const rdPoliciesCount = new Set(rdDetailItems.map((i) => i.planId || i.policyNumber)).size
    const rdBusinessTotal = rdDetailItems.reduce((s, i) => s + i.businessAmount, 0)

    const fdPoliciesCount = fdDetailItems.length
    const fdBusinessTotal = fdDetailItems.reduce((s, i) => s + i.businessAmount, 0)

    const pensPoliciesCount = pensDetailItems.length
    const pensBusinessTotal = pensDetailItems.reduce((s, i) => s + i.businessAmount, 0)

    const totalBusiness = rdBusinessTotal + fdBusinessTotal + pensBusinessTotal
    const totalPolicies = rdPoliciesCount + fdPoliciesCount + pensPoliciesCount

    const overallSummary = [
      { type: 'RD', name: 'Recurring Deposit (RD)', policies: rdPoliciesCount, business: rdBusinessTotal },
      { type: 'FD', name: 'Fixed Deposit (FD)', policies: fdPoliciesCount, business: fdBusinessTotal },
      { type: 'PENS', name: 'Pension Plan', policies: pensPoliciesCount, business: pensBusinessTotal },
    ]

    const topSummary = {
      totalBusiness,
      totalPolicies,
      rdBusiness: rdBusinessTotal,
      rdPolicies: rdPoliciesCount,
      fdBusiness: fdBusinessTotal,
      fdPolicies: fdPoliciesCount,
      pensBusiness: pensBusinessTotal,
      pensPolicies: pensPoliciesCount,
    }

    return {
      paymentsCount: monthPayments.length,
      rdDetailItems,
      fdDetailItems,
      pensDetailItems,
      allDetailItems,
      rdTermSummary,
      fdTermSummary,
      pensSummary,
      overallSummary,
      topSummary,
    }
  }, [selectedMonth, paymentsCollection.data, planMaps, loading])

  // Filtered detail list based on search & dropdown filters
  const filteredDetails = useMemo(() => {
    return monthlyData.allDetailItems.filter((item) => {
      if (filterCategory !== 'all' && item.category !== filterCategory) return false
      if (filterTerm !== 'all' && item.term !== filterTerm) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesPolicy = item.policyNumber.toLowerCase().includes(q)
        const matchesCustomer = item.customerName.toLowerCase().includes(q)
        const matchesAgent = item.agentName.toLowerCase().includes(q)
        if (!matchesPolicy && !matchesCustomer && !matchesAgent) return false
      }
      return true
    })
  }, [monthlyData.allDetailItems, filterCategory, filterTerm, searchQuery])

  // Available Terms for the term filter dropdown
  const availableTermOptions = useMemo(() => {
    const set = new Set()
    monthlyData.allDetailItems.forEach((i) => set.add(i.term))
    return Array.from(set).sort()
  }, [monthlyData.allDetailItems])

  // Format month name for display (e.g., "August 2026")
  const selectedMonthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    return format(new Date(y, m - 1, 1), 'MMMM yyyy')
  }, [selectedMonth])

  // Export Excel handler
  const handleExportExcel = () => {
    if (monthlyData.allDetailItems.length === 0) {
      toast.error('No business data to export for this month.')
      return
    }

    const wb = xlsx.utils.book_new()

    // Sheet 1: Monthly Summary
    const summaryRows = [
      { Metric: 'Selected Month', Value: selectedMonthLabel },
      { Metric: 'Total Business', Value: monthlyData.topSummary.totalBusiness },
      { Metric: 'Total Policies', Value: monthlyData.topSummary.totalPolicies },
      { Metric: 'RD Business', Value: monthlyData.topSummary.rdBusiness },
      { Metric: 'RD Policies', Value: monthlyData.topSummary.rdPolicies },
      { Metric: 'FD Business', Value: monthlyData.topSummary.fdBusiness },
      { Metric: 'FD Policies', Value: monthlyData.topSummary.fdPolicies },
      { Metric: 'Pension Business', Value: monthlyData.topSummary.pensBusiness },
      { Metric: 'Pension Policies', Value: monthlyData.topSummary.pensPolicies },
    ]
    const wsSummary = xlsx.utils.json_to_sheet(summaryRows)
    xlsx.utils.book_append_sheet(wb, wsSummary, 'Monthly Summary')

    // Sheet 2: Term Breakdown
    const termBreakdownRows = [
      ...monthlyData.rdTermSummary.map((r) => ({
        'Business Type': 'RD',
        Term: r.term,
        Policies: r.policies,
        'Business Amount': r.business,
      })),
      ...monthlyData.fdTermSummary.map((f) => ({
        'Business Type': 'FD',
        Term: f.term,
        Policies: f.policies,
        'Business Amount': f.business,
      })),
      ...monthlyData.pensSummary.map((p) => ({
        'Business Type': 'Pension',
        Term: p.product,
        Policies: p.policies,
        'Business Amount': p.business,
      })),
    ]
    const wsTerm = xlsx.utils.json_to_sheet(termBreakdownRows)
    xlsx.utils.book_append_sheet(wb, wsTerm, 'Term Breakdown')

    // Sheet 3: Policy Details
    const detailRows = monthlyData.allDetailItems.map((item, idx) => ({
      'Sr. No.': idx + 1,
      'Policy Number': item.policyNumber,
      'Customer Name': item.customerName,
      Plan: item.planCode,
      Term: item.term,
      'Selling Agent': item.agentName,
      'Business Date': fmtDate(item.businessDate),
      'Business Amount': item.businessAmount,
      Status: item.status,
    }))
    const wsDetail = xlsx.utils.json_to_sheet(detailRows)
    xlsx.utils.book_append_sheet(wb, wsDetail, 'Policy Details')

    const fileName = `apex-monthly-business-${selectedMonth}.xlsx`
    xlsx.writeFile(wb, fileName)
    toast.success(`Exported ${fileName} successfully!`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header & Month Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight flex items-center gap-2">
            <ICalendar className="text-gold-1" size={26} /> Monthly Business
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Admin reporting dashboard for monthly RD, FD, and Pension business breakdown.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="field text-sm font-semibold text-gold bg-navy-3 border-gold-1/40 pr-8 cursor-pointer w-full"
            >
              {availableMonths.map((m) => {
                const [y, mm] = m.split('-').map(Number)
                const label = format(new Date(y, mm - 1, 1), 'MMMM yyyy')
                return (
                  <option key={m} value={m}>
                    {label}
                  </option>
                )
              })}
            </select>
          </div>

          <button
            onClick={handleExportExcel}
            className="btn-gold py-2 px-3.5 text-xs flex justify-center items-center gap-1.5 uppercase font-bold tracking-wide"
            title="Export Excel Report"
          >
            <IDownload size={15} /> Export Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <SkeletonStats count={4} />
          <SkeletonTable rows={6} cols={4} />
        </div>
      ) : (
        <>
          {/* Top Summary Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="card p-4 border border-gold-1/30 bg-navy-3/80 shadow-lg">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">TOTAL BUSINESS</p>
              <p className="mt-1 text-2xl font-bold font-mono text-gold">{formatINR(monthlyData.topSummary.totalBusiness)}</p>
              <p className="mt-1 text-xs text-ink-2 font-medium">{monthlyData.topSummary.totalPolicies} Total Policies</p>
            </div>

            <div className="card p-4 border border-navy-4 bg-navy-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">RD BUSINESS</p>
              <p className="mt-1 text-2xl font-bold font-mono text-ink-1">{formatINR(monthlyData.topSummary.rdBusiness)}</p>
              <p className="mt-1 text-xs text-ink-2 font-medium">{monthlyData.topSummary.rdPolicies} RD Policies</p>
            </div>

            <div className="card p-4 border border-navy-4 bg-navy-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">FD BUSINESS</p>
              <p className="mt-1 text-2xl font-bold font-mono text-ink-1">{formatINR(monthlyData.topSummary.fdBusiness)}</p>
              <p className="mt-1 text-xs text-ink-2 font-medium">{monthlyData.topSummary.fdPolicies} FD Policies</p>
            </div>

            <div className="card p-4 border border-navy-4 bg-navy-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">PENSION BUSINESS</p>
              <p className="mt-1 text-2xl font-bold font-mono text-ink-1">{formatINR(monthlyData.topSummary.pensBusiness)}</p>
              <p className="mt-1 text-xs text-ink-2 font-medium">{monthlyData.topSummary.pensPolicies} Pension Policies</p>
            </div>
          </div>

          {monthlyData.allDetailItems.length === 0 ? (
            <div className="card p-8 text-center my-6">
              <EmptyState
                icon={<IReport size={32} className="text-gold-1 mx-auto" />}
                title={`No business recorded for ${selectedMonthLabel}`}
                message="There were no payments or investments logged in Firestore for this selected month."
              />
            </div>
          ) : (
            <>
              {/* Product Term-Wise Breakdowns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* RD Term Breakdown */}
                <div className="card p-5 border border-navy-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-2 border-b border-navy-4/50 flex justify-between items-center">
                    <span>RD Term Breakdown</span>
                    <span className="font-mono text-ink-2">{monthlyData.topSummary.rdPolicies} Policies</span>
                  </h3>
                  <div className="table-wrap mt-3">
                    <table className="tbl text-xs">
                      <thead>
                        <tr>
                          <th>RD Term</th>
                          <th className="text-right">Policies</th>
                          <th className="text-right">Business Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyData.rdTermSummary.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-center text-ink-2 py-3">No RD business in this month</td>
                          </tr>
                        ) : (
                          monthlyData.rdTermSummary.map((row) => (
                            <tr key={row.term}>
                              <td className="font-semibold text-ink-1">{row.term}</td>
                              <td className="text-right font-mono">{row.policies}</td>
                              <td className="text-right font-mono font-bold text-gold">{formatINR(row.business)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-navy-2/60 font-bold border-t border-navy-4">
                          <td className="text-gold">TOTAL RD</td>
                          <td className="text-right font-mono text-ink-1">{monthlyData.topSummary.rdPolicies}</td>
                          <td className="text-right font-mono text-gold">{formatINR(monthlyData.topSummary.rdBusiness)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* FD Term Breakdown */}
                <div className="card p-5 border border-navy-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-2 border-b border-navy-4/50 flex justify-between items-center">
                    <span>FD Term Breakdown</span>
                    <span className="font-mono text-ink-2">{monthlyData.topSummary.fdPolicies} Policies</span>
                  </h3>
                  <div className="table-wrap mt-3">
                    <table className="tbl text-xs">
                      <thead>
                        <tr>
                          <th>FD Term</th>
                          <th className="text-right">Policies</th>
                          <th className="text-right">Business Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyData.fdTermSummary.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-center text-ink-2 py-3">No FD business in this month</td>
                          </tr>
                        ) : (
                          monthlyData.fdTermSummary.map((row) => (
                            <tr key={row.term}>
                              <td className="font-semibold text-ink-1">{row.term}</td>
                              <td className="text-right font-mono">{row.policies}</td>
                              <td className="text-right font-mono font-bold text-gold">{formatINR(row.business)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-navy-2/60 font-bold border-t border-navy-4">
                          <td className="text-gold">TOTAL FD</td>
                          <td className="text-right font-mono text-ink-1">{monthlyData.topSummary.fdPolicies}</td>
                          <td className="text-right font-mono text-gold">{formatINR(monthlyData.topSummary.fdBusiness)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Pension Breakdown */}
                <div className="card p-5 border border-navy-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-2 border-b border-navy-4/50 flex justify-between items-center">
                    <span>Pension Breakdown</span>
                    <span className="font-mono text-ink-2">{monthlyData.topSummary.pensPolicies} Policies</span>
                  </h3>
                  <div className="table-wrap mt-3">
                    <table className="tbl text-xs">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th className="text-right">Policies</th>
                          <th className="text-right">Business Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyData.pensSummary.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-center text-ink-2 py-3">No Pension business in this month</td>
                          </tr>
                        ) : (
                          monthlyData.pensSummary.map((row) => (
                            <tr key={row.product}>
                              <td className="font-semibold text-ink-1">{row.product}</td>
                              <td className="text-right font-mono">{row.policies}</td>
                              <td className="text-right font-mono font-bold text-gold">{formatINR(row.business)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-navy-2/60 font-bold border-t border-navy-4">
                          <td className="text-gold">TOTAL PENSION</td>
                          <td className="text-right font-mono text-ink-1">{monthlyData.topSummary.pensPolicies}</td>
                          <td className="text-right font-mono text-gold">{formatINR(monthlyData.topSummary.pensBusiness)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Overall Business Summary */}
                <div className="card p-5 border border-navy-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-2 border-b border-navy-4/50 flex justify-between items-center">
                    <span>Overall Business Summary</span>
                    <span className="font-mono text-ink-2">{selectedMonthLabel}</span>
                  </h3>
                  <div className="table-wrap mt-3">
                    <table className="tbl text-xs">
                      <thead>
                        <tr>
                          <th>Business Type</th>
                          <th className="text-right">Policies</th>
                          <th className="text-right">Business Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyData.overallSummary.map((row) => (
                          <tr key={row.type}>
                            <td className="font-semibold text-ink-1">{row.name}</td>
                            <td className="text-right font-mono">{row.policies}</td>
                            <td className="text-right font-mono font-bold text-gold">{formatINR(row.business)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-navy-2/60 font-bold border-t border-navy-4">
                          <td className="text-gold">TOTAL</td>
                          <td className="text-right font-mono text-ink-1">{monthlyData.topSummary.totalPolicies}</td>
                          <td className="text-right font-mono text-gold">{formatINR(monthlyData.topSummary.totalBusiness)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Policy Detail Table & Search/Filter Section */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <h3 className="text-lg font-bold text-ink-1 tracking-tight font-serif">
                    Contributing Policy Details ({filteredDetails.length})
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {/* Search Bar */}
                    <div className="relative flex-1 md:w-64">
                      <input
                        type="text"
                        placeholder="Search policy, client, agent..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="field text-xs pl-8 w-full"
                      />
                      <ISearch size={14} className="absolute left-2.5 top-2.5 text-ink-2" />
                    </div>

                    {/* Type Filter */}
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="field text-xs w-28"
                    >
                      <option value="all">All Types</option>
                      <option value="RD">RD Only</option>
                      <option value="FD">FD Only</option>
                      <option value="PENS">Pension</option>
                    </select>

                    {/* Term Filter */}
                    <select
                      value={filterTerm}
                      onChange={(e) => setFilterTerm(e.target.value)}
                      className="field text-xs w-32"
                    >
                      <option value="all">All Terms</option>
                      {availableTermOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="card p-5">
                  {filteredDetails.length === 0 ? (
                    <EmptyState
                      title="No matching policy records"
                      message="Try relaxing your search or filter settings."
                    />
                  ) : (
                    <div className="table-wrap">
                      <table className="tbl text-xs">
                        <thead>
                          <tr>
                            <th className="w-12">Sr. No.</th>
                            <th>Policy Number</th>
                            <th>Customer Name</th>
                            <th>Plan</th>
                            <th>Term</th>
                            <th>Selling Agent</th>
                            <th>Business Date</th>
                            <th className="text-right">Business Amount</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDetails.map((item, idx) => (
                            <tr key={`${item.id}-${idx}`}>
                              <td className="text-ink-2 font-mono text-[11px]">{idx + 1}</td>
                              <td className="font-mono text-gold font-semibold">{item.policyNumber}</td>
                              <td className="font-semibold text-ink-1">{item.customerName}</td>
                              <td className="uppercase font-semibold text-ink-2">{item.planCode}</td>
                              <td>{item.term}</td>
                              <td className="text-ink-2">{item.agentName}</td>
                              <td className="text-ink-2 font-mono">{fmtDate(item.businessDate)}</td>
                              <td className="text-right font-mono font-bold text-gold">
                                {formatINR(item.businessAmount)}
                              </td>
                              <td>
                                <StatusBadge status={item.status || 'active'} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
