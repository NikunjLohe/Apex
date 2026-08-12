import { useState, useMemo, useEffect } from 'react'
import { collection, doc, getDocs, setDoc, writeBatch, serverTimestamp, query, where, updateDoc } from 'firebase/firestore'
import * as xlsx from 'xlsx'
import { db } from '../../firebase'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR, fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import toast from 'react-hot-toast'
import { ICash, ICheck, IAlert, IClock, IUsers, IDoc } from '../../components/ui/icons'
import { updateDashboardSummary } from '../../lib/summary'
import { Link } from 'react-router-dom'

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const rankNumberToCode = {
  1: 'AO', 2: 'AM', 3: 'ADM', 4: 'DM', 5: 'SDM', 6: 'CM', 7: 'AGM', 8: 'GM',
  9: 'ZM', 10: 'ED', 11: 'SED', 12: 'MD', 13: 'CMD', 14: 'AVP', 15: 'VP',
  16: 'SVP', 17: 'EVP', 18: 'MGD'
}

function getAbsorbedRanksText(comm) {
  if (Array.isArray(comm.compressedFromRank) && comm.compressedFromRank.length > 0) {
    return comm.compressedFromRank.map(r => rankNumberToCode[r] || r).join(', ')
  }
  if (comm.compressionReason && comm.compressionReason.includes('+')) {
    const match = comm.compressionReason.match(/\+(.*?)\s+Vacant/i) || comm.compressionReason.match(/\((.*?)\)/)
    if (match && match[1]) return match[1].replace(/\+/g, ', ')
  }
  return comm.compression ? 'Yes' : 'None'
}

export default function Payouts() {
  const { config, getRank } = useRanks()
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const [loading, setLoading] = useState(false)
  const [payoutsList, setPayoutsList] = useState([])
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Load existing payouts for selected month & year
  const fetchPayouts = async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'payouts'),
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear)
      )
      const snap = await getDocs(q)
      const list = []
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() })
      })
      setPayoutsList(list)
    } catch (err) {
      console.error('Error fetching payouts:', err)
      toast.error('Failed to load payouts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPayouts()
  }, [selectedMonth, selectedYear])

  // READ-ONLY Excel Export Handler
  const handleExportExcel = async () => {
    if (payoutsList.length === 0) {
      toast.error('No payout data available for export.')
      return
    }

    setExporting(true)
    const toastId = toast.loading('Generating Payout Excel Report...')

    try {
      // 1. Fetch Commissions for selected Month & Year (Read-Only)
      const commQuery = query(
        collection(db, 'commission_ledger'),
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear)
      )
      const commSnap = await getDocs(commQuery)
      const commissions = []
      commSnap.forEach(d => commissions.push({ id: d.id, ...d.data() }))

      if (commissions.length === 0) {
        toast.error('No payout data available for export.', { id: toastId })
        setExporting(false)
        return
      }

      // 2. Fetch Users, Plans, Customers, Branches in Parallel (Read-Only)
      const [usersSnap, plansSnap, custSnap, branchSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'plans')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'branches'))
      ])

      const usersMap = {}
      usersSnap.forEach(d => { usersMap[d.id] = { id: d.id, ...d.data() } })

      const plansMap = {}
      plansSnap.forEach(d => { plansMap[d.id] = { id: d.id, ...d.data() } })

      const custMap = {}
      custSnap.forEach(d => { custMap[d.id] = { id: d.id, ...d.data() } })

      const branchMap = {}
      branchSnap.forEach(d => { branchMap[d.id] = { id: d.id, ...d.data() } })

      // Group commissions by agent
      const groupedComms = {}
      commissions.forEach(c => {
        if (!groupedComms[c.agentId]) groupedComms[c.agentId] = []
        groupedComms[c.agentId].push(c)
      })

      // Build Agent Summaries (matching Payout Engine calculations)
      const agentSummaries = []
      let totalGross = 0
      let totalTds = 0
      let totalAdmin = 0
      let totalNet = 0

      for (const agentId in groupedComms) {
        const cList = groupedComms[agentId]
        const u = usersMap[agentId] || {}
        const gross = cList.reduce((sum, c) => sum + (c.amount || 0), 0)
        const tds = gross * 0.05
        const adminCharge = gross * 0.05
        const net = gross - tds - adminCharge

        totalGross += gross
        totalTds += tds
        totalAdmin += adminCharge
        totalNet += net

        const pDoc = payoutsList.find(p => p.agentId === agentId)

        agentSummaries.push({
          agentId,
          agentCode: u.sponsorCode || u.agentCode || '—',
          agentName: u.name || cList[0].agentName || '—',
          rank: u.rank ? `${u.rank} (${rankNumberToCode[u.rank] || ''})` : `Rank ${cList[0].receivingRank || 1}`,
          pan: u.pan || u.panNumber || '—',
          accountHolder: u.bankDetails?.accountHolderName || u.name || '—',
          bankName: u.bankDetails?.bankName || '—',
          accountNumber: u.bankDetails?.accountNumber || '—',
          ifsc: u.bankDetails?.ifscCode || '—',
          branch: u.bankDetails?.branch || '—',
          policiesCount: cList.length,
          grossCommission: gross,
          tds,
          adminCharge,
          otherDeductions: 0,
          netPayable: net,
          payoutId: pDoc ? pDoc.id : '—',
          status: pDoc ? pDoc.status : 'generated'
        })
      }

      const monthLabel = (MONTHS.find(m => m.value === selectedMonth)?.label || 'Month').toUpperCase()
      const uniquePolicies = new Set(commissions.map(c => c.policyNumber || c.policyId).filter(Boolean))
      const uniqueCustomers = new Set(commissions.map(c => c.customerAccount || c.customerId).filter(Boolean))

      // ── SHEET 1: Payout Summary ───────────────────────────────────────────
      const summaryRows = [
        { 'SUMMARY METRIC': 'Payout Month', 'VALUE': MONTHS[selectedMonth - 1]?.label || selectedMonth },
        { 'SUMMARY METRIC': 'Payout Year', 'VALUE': selectedYear },
        { 'SUMMARY METRIC': 'Total Agents', 'VALUE': agentSummaries.length },
        { 'SUMMARY METRIC': 'Total Policies', 'VALUE': uniquePolicies.size },
        { 'SUMMARY METRIC': 'Total Customers', 'VALUE': uniqueCustomers.size },
        { 'SUMMARY METRIC': 'Total Ledger Entries', 'VALUE': commissions.length },
        { 'SUMMARY METRIC': 'Total Gross Commission (₹)', 'VALUE': totalGross },
        { 'SUMMARY METRIC': 'Total TDS 5% (₹)', 'VALUE': totalTds },
        { 'SUMMARY METRIC': 'Total Admin Charge 5% (₹)', 'VALUE': totalAdmin },
        { 'SUMMARY METRIC': 'Other Deductions (₹)', 'VALUE': 0 },
        { 'SUMMARY METRIC': 'Total Net Payable (₹)', 'VALUE': totalNet },
        {},
        { 'SUMMARY METRIC': '=== AGENT-WISE PAYOUT SUMMARY ===', 'VALUE': '' }
      ]

      const agentSummaryTable = agentSummaries.map(a => ({
        'Agent Code': a.agentCode,
        'Agent Name': a.agentName,
        'Rank': a.rank,
        'Entries / Policies': a.policiesCount,
        'Gross Commission (₹)': a.grossCommission,
        'TDS 5% (₹)': a.tds,
        'Admin Charge 5% (₹)': a.adminCharge,
        'Other Deductions (₹)': a.otherDeductions,
        'Net Payable (₹)': a.netPayable,
        'Status': a.status
      }))

      const ws1 = xlsx.utils.json_to_sheet(summaryRows)
      xlsx.utils.sheet_add_json(ws1, agentSummaryTable, { origin: 'A15' })

      // ── SHEET 2: Policy Details ───────────────────────────────────────────
      const policyDetailsRows = commissions.map((c, idx) => {
        const u = usersMap[c.agentId] || {}
        const plan = plansMap[c.policyId] || Object.values(plansMap).find(p => p.planAccountNumber === c.policyNumber || p.policyNumber === c.policyNumber) || {}
        const cust = custMap[c.customerId] || Object.values(custMap).find(cs => cs.customerId === c.customerAccount || cs.accountNumber === c.customerAccount) || {}
        const branch = branchMap[u.branchId || cust.branchId] || {}

        const isGap = c.compression === true || (c.commissionType === 'adjustment') || Boolean(c.compressionReason && c.compressionReason.includes('Vacant'))
        const absorbedRanksText = getAbsorbedRanksText(c)

        const commGross = c.amount || 0
        const commTds = commGross * 0.05
        const commAdmin = commGross * 0.05
        const commNet = commGross - commTds - commAdmin

        return {
          'Sr. No.': idx + 1,
          'Agent Code': u.sponsorCode || u.agentCode || c.sponsorCode || '—',
          'Agent Name': c.agentName || u.name || '—',
          'Agent Rank': c.receivingRank || u.rank || '—',
          'Agent Designation': c.receivingRankCode || rankNumberToCode[u.rank] || '—',
          'Agent Mobile': u.phone || '—',
          'Agent Email': u.email || '—',
          'Account Holder Name': u.bankDetails?.accountHolderName || u.name || '—',
          'Bank Name': u.bankDetails?.bankName || '—',
          'Account Number': u.bankDetails?.accountNumber || '—',
          'IFSC Code': u.bankDetails?.ifscCode || '—',
          'Bank Branch': u.bankDetails?.branch || '—',
          'PAN Number': u.pan || u.panNumber || '—',
          'Customer CIF ID': c.customerAccount || cust.customerId || '—',
          'Customer Name': c.customerName || cust.name || '—',
          'Customer Mobile': cust.phone || '—',
          'Customer Address': cust.address || '—',
          'Customer Branch': branch.name || cust.branchId || '—',
          'Policy Number': c.policyNumber || plan.policyNumber || '—',
          'Plan Code': c.planCode || plan.type || '—',
          'Plan Type': c.planType || plan.planType || '—',
          'Policy Start Date': plan.startDate ? (plan.startDate.toDate ? plan.startDate.toDate().toISOString().split('T')[0] : String(plan.startDate).split('T')[0]) : '—',
          'Monthly Amount (₹)': plan.monthlyAmount || 0,
          'Total Policy Amount (₹)': plan.totalPaid || plan.fdAmount || c.businessAmount || 0,
          'Policy Status': plan.status || 'active',
          'Payment Date': c.calculationDate ? (c.calculationDate.toDate ? c.calculationDate.toDate().toISOString().split('T')[0] : String(c.calculationDate).split('T')[0]) : '—',
          'Payment Business Amount (₹)': c.businessAmount || 0,
          'Installment Number': c.installment || 1,
          'Commission Type': c.commissionType || 'direct',
          'Gross Commission (₹)': commGross,
          'Gap Commission': isGap ? 'Yes' : 'No',
          'Absorbed Lower Ranks': absorbedRanksText,
          'Commission Reason': c.compressionReason || '—',
          'TDS 5% (₹)': commTds,
          'Admin Charge 5% (₹)': commAdmin,
          'Net Payable (₹)': commNet,
        }
      })

      const ws2 = xlsx.utils.json_to_sheet(policyDetailsRows)

      // ── SHEET 3: Commission Details ───────────────────────────────────────────
      const commDetailsRows = commissions.map((c, idx) => {
        const isGap = c.compression === true || (c.commissionType === 'adjustment') || Boolean(c.compressionReason && c.compressionReason.includes('Vacant'))
        return {
          'Sr. No.': idx + 1,
          'Commission Entry ID': c.id,
          'Agent Code': c.sponsorCode || '—',
          'Agent Name': c.agentName || '—',
          'Receiving Rank': `${c.receivingRank || ''} (${c.receivingRankCode || ''})`,
          'Policy Number': c.policyNumber || '—',
          'Customer Name': c.customerName || '—',
          'Plan Code': c.planCode || '—',
          'Business Amount (₹)': c.businessAmount || 0,
          'Commission Rate (%)': c.percentage,
          'Commission Amount (₹)': c.amount || 0,
          'Commission Type': c.commissionType || 'direct',
          'Gap Commission': isGap ? 'Yes' : 'No',
          'Absorbed Lower Ranks': getAbsorbedRanksText(c),
          'Compression Reason': c.compressionReason || '—',
          'Status': c.status || 'unpaid',
          'Calculation Date': c.calculationDate ? (c.calculationDate.toDate ? c.calculationDate.toDate().toISOString().split('T')[0] : String(c.calculationDate).split('T')[0]) : '—'
        }
      })

      const ws3 = xlsx.utils.json_to_sheet(commDetailsRows)

      // ── SHEET 4: Bank Payout ──────────────────────────────────────────────────
      const bankPayoutRows = agentSummaries.map((a, idx) => ({
        'Sr. No.': idx + 1,
        'Agent Code': a.agentCode,
        'Agent Name': a.agentName,
        'PAN Number': a.pan,
        'Account Holder Name': a.accountHolder,
        'Bank Name': a.bankName,
        'Account Number': a.accountNumber,
        'IFSC Code': a.ifsc,
        'Bank Branch': a.branch,
        'Gross Commission (₹)': a.grossCommission,
        'TDS 5% (₹)': a.tds,
        'Admin Charge 5% (₹)': a.adminCharge,
        'Other Deductions (₹)': a.otherDeductions,
        'Net Payable (₹)': a.netPayable,
        'Payout ID': a.payoutId
      }))

      const ws4 = xlsx.utils.json_to_sheet(bankPayoutRows)

      // ── BUILD WORKBOOK ────────────────────────────────────────────────────────
      const wb = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(wb, ws1, 'Payout Summary')
      xlsx.utils.book_append_sheet(wb, ws2, 'Policy Details')
      xlsx.utils.book_append_sheet(wb, ws3, 'Commission Details')
      xlsx.utils.book_append_sheet(wb, ws4, 'Bank Payout')

      const fileName = `APEX_PAYOUT_${monthLabel}_${selectedYear}.xlsx`
      xlsx.writeFile(wb, fileName)

      toast.success('Payout Excel exported successfully!', { id: toastId })
    } catch (err) {
      console.error('Error exporting Payout Excel:', err)
      toast.error(`Export failed: ${err.message}`, { id: toastId })
    } finally {
      setExporting(false)
    }
  }

  // Generate Payout calculation process
  const handleGeneratePayouts = async () => {
    setGenerating(true)
    const toastId = toast.loading('Calculating monthly Commission Bills...')
    try {
      // 1. Fetch all unpaid commissions for target month/year from commission_ledger
      const commQuery = query(
        collection(db, 'commission_ledger'),
        where('status', '==', 'unpaid'),
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear)
      )
      const commSnap = await getDocs(commQuery)
      const commissions = []
      commSnap.forEach(d => {
        commissions.push({ id: d.id, ...d.data() })
      })

      if (commissions.length === 0) {
        toast.error('No unpaid commissions found for selected month & year', { id: toastId })
        setGenerating(false)
        return
      }

      // 2. Fetch all users (agents) to get PAN and details
      const usersSnap = await getDocs(collection(db, 'users'))
      const usersMap = {}
      usersSnap.forEach(d => {
        usersMap[d.id] = { id: d.id, ...d.data() }
      })

      // Group commissions by agent
      const groupedComms = {}
      commissions.forEach(c => {
        if (!groupedComms[c.agentId]) {
          groupedComms[c.agentId] = []
        }
        groupedComms[c.agentId].push(c)
      })

      const batch = writeBatch(db)

      for (const agentId in groupedComms) {
        const commList = groupedComms[agentId]
        const agent = usersMap[agentId] || { name: commList[0].agentName, sponsorCode: commList[0].sponsorCode || '—', rank: 1, panNumber: 'UNASSIGNED' }
        
        const grossCommission = commList.reduce((sum, c) => sum + (c.amount || 0), 0)
        
        // Deductions: 5% TDS and 5% Admin Charge
        const tds = grossCommission * 0.05
        const adminCharge = grossCommission * 0.05
        const netPayable = grossCommission - tds - adminCharge

        // Construct Payout Document
        const payoutRef = doc(collection(db, 'payouts'))
        batch.set(payoutRef, {
          agentId,
          agentName: agent.name,
          sponsorCode: agent.sponsorCode || '—',
          panNumber: agent.panNumber || '—',
          month: selectedMonth,
          year: selectedYear,
          policiesCount: commList.length,
          grossCommission,
          tds,
          adminCharge,
          netPayable,
          status: 'generated',
          generatedDate: serverTimestamp(),
          paidDate: null,
          commissionEntryIds: commList.map(c => c.id)
        })
      }

      await batch.commit()
      toast.success('Commission Bills created successfully!', { id: toastId })
      fetchPayouts()
    } catch (err) {
      console.error('Error generating payouts:', err)
      toast.error(`Calculation failed: ${err.message}`, { id: toastId })
    } finally {
      setGenerating(false)
    }
  }

  // Update payout status
  const handleUpdateStatus = async (payoutId, nextStatus) => {
    const loader = toast.loading(`Updating payout status to ${nextStatus}...`)
    try {
      const payoutRef = doc(db, 'payouts', payoutId)
      const updateData = { status: nextStatus }
      
      if (nextStatus === 'paid') {
        updateData.paidDate = serverTimestamp()
        const currentPayout = payoutsList.find(p => p.id === payoutId)

        if (currentPayout) {
          const batch = writeBatch(db)
          let payoutTotal = currentPayout.netPayable || 0

          // Update all linked commission_ledger entries
          if (currentPayout.commissionEntryIds && currentPayout.commissionEntryIds.length > 0) {
             for (const commId of currentPayout.commissionEntryIds) {
                batch.update(doc(db, 'commission_ledger', commId), { status: 'paid' })
             }
          }

          // Trigger dashboard summary update for paid commissions (QA-002 Fix)
          await updateDashboardSummary({ totalCommission: payoutTotal })
          
          await batch.commit()
        }
      }

      await updateDoc(payoutRef, updateData)
      toast.success(`Payout successfully marked as ${nextStatus}!`, { id: loader })
      fetchPayouts()
    } catch (err) {
      console.error(err)
      toast.error('Failed to update payout status', { id: loader })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Commission Payout Engine</h2>
          <p className="text-xs text-ink-2">Generate and approve monthly Commission Bills.</p>
        </div>
      </div>

      {/* Control bar */}
      <div className="card p-5 bg-navy-3 border border-navy-4 flex flex-wrap items-end gap-4 justify-between">
        <div className="flex gap-4">
          <div className="w-44">
            <label className="label">Select Target Month</label>
            <select className="field text-xs font-semibold" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className="label">Select Year</label>
            <select className="field text-xs font-semibold" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <button 
            onClick={handleGeneratePayouts} 
            disabled={generating} 
            className="btn-gold px-6 py-2.5 text-xs uppercase tracking-wider font-bold"
          >
            {generating ? 'Calculating...' : 'Generate Commission Bills'}
          </button>

          {payoutsList.length > 0 ? (
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="btn-dark px-6 py-2.5 text-xs uppercase tracking-wider font-bold border border-gold/40 hover:border-gold text-gold flex items-center gap-2"
            >
              <IDoc size={16} />
              {exporting ? 'Exporting...' : 'Export Payout Excel'}
            </button>
          ) : (
            <button
              disabled
              title="No payout data available for export."
              className="btn-dark px-6 py-2.5 text-xs uppercase tracking-wider font-bold opacity-50 cursor-not-allowed border border-navy-4 text-ink-2 flex items-center gap-2"
            >
              <IDoc size={16} />
              Export Payout Excel
            </button>
          )}
        </div>
      </div>

      {/* Grid List */}
      {loading ? (
        <SkeletonTable rows={6} cols={9} />
      ) : payoutsList.length === 0 ? (
        <EmptyState 
          icon={<ICash size={24} />} 
          title="No Commission Bills" 
          message="Run payout generation to compute commissions for this month. (No payout data available for export.)"
        />
      ) : (
        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
              Payout Batch Summary ({payoutsList.length} Agents)
            </h3>
          </div>

          <div className="table-wrap">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th>Agent Name</th>
                  <th>Entries</th>
                  <th>Gross Comm</th>
                  <th className="text-red-400">TDS (5%)</th>
                  <th className="text-red-400">Admin (5%)</th>
                  <th className="text-gold">Net Payable</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payoutsList.map(p => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-semibold text-ink-1 block">{p.agentName}</span>
                      <span className="text-[10px] text-ink-2 font-mono">PAN: {p.panNumber}</span>
                    </td>
                    <td className="font-mono text-ink-1 font-bold">{p.policiesCount}</td>
                    <td className="text-ink-1 font-semibold">{formatINR(p.grossCommission)}</td>
                    <td className="text-red-400 font-semibold">{formatINR(p.tds)}</td>
                    <td className="text-red-400 font-semibold">{formatINR(p.adminCharge)}</td>
                    <td className="text-gold font-bold text-sm">{formatINR(p.netPayable)}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="text-right space-x-2">
                      <Link 
                        to={`/admin/commission-bill/${p.id}`} 
                        className="btn-dark py-1 px-3 text-[10px] uppercase font-bold"
                      >
                        View Bill
                      </Link>
                      {p.status === 'generated' && (
                        <button 
                          onClick={() => handleUpdateStatus(p.id, 'approved')} 
                          className="btn-gold py-1 px-3 text-[10px] uppercase font-bold"
                        >
                          Approve
                        </button>
                      )}
                      {p.status === 'approved' && (
                        <button 
                          onClick={() => handleUpdateStatus(p.id, 'paid')} 
                          className="btn-ok py-1 px-3 text-[10px] uppercase font-bold bg-ok text-white rounded hover:bg-ok/80"
                        >
                          Mark Paid
                        </button>
                      )}
                      {p.status === 'paid' && (
                        <span className="text-[10px] text-ink-2 italic font-medium block mt-1">
                          Paid {p.paidDate ? fmtDate(p.paidDate) : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
