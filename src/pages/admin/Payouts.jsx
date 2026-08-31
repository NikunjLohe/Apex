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
  const [usersMap, setUsersMap] = useState({})
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Load existing payouts for selected month & year along with users map for current bank details
  const fetchPayouts = async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'payouts'),
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear)
      )
      const [snap, usersSnap] = await Promise.all([
        getDocs(q),
        getDocs(collection(db, 'users'))
      ])
      const list = []
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() })
      })
      const uMap = {}
      usersSnap.forEach(d => {
        uMap[d.id] = { id: d.id, ...d.data() }
      })
      setUsersMap(uMap)
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
        const bank = u.bankDetails || {}
        const hasBankDetails = Boolean(bank.bankName?.trim() && bank.accountNumber?.trim() && bank.ifscCode?.trim())

        agentSummaries.push({
          agentId,
          agentCode: u.sponsorCode || u.agentCode || '—',
          agentName: u.name || cList[0].agentName || '—',
          rank: u.rank ? `${u.rank} (${rankNumberToCode[u.rank] || ''})` : `Rank ${cList[0].receivingRank || 1}`,
          pan: u.pan || u.panNumber || '—',
          accountHolder: bank.accountHolderName?.trim() || u.name || (hasBankDetails ? '—' : 'Bank Details Pending'),
          bankName: bank.bankName?.trim() || (hasBankDetails ? '—' : 'Bank Details Pending'),
          accountNumber: bank.accountNumber?.trim() || (hasBankDetails ? '—' : 'Bank Details Pending'),
          ifsc: bank.ifscCode?.trim() || (hasBankDetails ? '—' : 'Bank Details Pending'),
          branch: bank.branch?.trim() || (hasBankDetails ? '—' : 'Bank Details Pending'),
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
      const generatedDateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      const uniquePolicies = new Set(commissions.map(c => c.policyNumber || c.policyId).filter(Boolean))
      const uniqueCustomers = new Set(commissions.map(c => c.customerAccount || c.customerId).filter(Boolean))

      // ── HELPER: Format Cell Types & Widths ──
      const autoFitColumns = (worksheet, dataArray) => {
        if (!dataArray || dataArray.length === 0) return
        const keys = Object.keys(dataArray[0])
        const colWidths = keys.map(key => {
          let maxLen = String(key).length
          dataArray.forEach(row => {
            const val = row[key]
            if (val !== null && val !== undefined) {
              const len = String(val).length
              if (len > maxLen) maxLen = len
            }
          })
          return { wch: Math.min(Math.max(maxLen + 4, 12), 45) }
        })
        worksheet['!cols'] = colWidths
      }

      // ── SHEET 1: Payout Summary ───────────────────────────────────────────
      const summaryHeaderRows = [
        ['APEX MULTISOLUTIONS'],
        ['COMMISSION PAYOUT REPORT'],
        [''],
        ['Payout Month:', MONTHS[selectedMonth - 1]?.label || selectedMonth],
        ['Payout Year:', selectedYear],
        ['Generated Date:', generatedDateStr],
        [''],
        ['SUMMARY METRICS', 'VALUE'],
        ['Total Agents', agentSummaries.length],
        ['Total Policies', uniquePolicies.size],
        ['Total Customers', uniqueCustomers.size],
        ['Total Commission Entries', commissions.length],
        ['Total Gross Commission (₹)', totalGross],
        ['Total TDS 5% (₹)', totalTds],
        ['Total Admin Charge 5% (₹)', totalAdmin],
        ['Other Deductions (₹)', 0],
        ['TOTAL NET PAYABLE (₹)', totalNet],
        [''],
        ['AGENT-WISE PAYOUT SUMMARY'],
        []
      ]

      const agentSummaryTable = agentSummaries.map((a, idx) => ({
        'Sr. No.': idx + 1,
        'Agent Code': String(a.agentCode || '—'),
        'Agent Name': String(a.agentName || '—'),
        'Rank': String(a.rank || '—'),
        'Number of Policies / Entries': a.policiesCount,
        'Gross Commission (₹)': Number(a.grossCommission.toFixed(2)),
        'TDS 5% (₹)': Number(a.tds.toFixed(2)),
        'Admin Charge 5% (₹)': Number(a.adminCharge.toFixed(2)),
        'Other Deductions (₹)': 0,
        'Net Payable (₹)': Number(a.netPayable.toFixed(2)),
        'Status': String(a.status || 'generated')
      }))

      // Append totals row
      agentSummaryTable.push({
        'Sr. No.': '',
        'Agent Code': 'TOTALS',
        'Agent Name': '',
        'Rank': '',
        'Number of Policies / Entries': commissions.length,
        'Gross Commission (₹)': Number(totalGross.toFixed(2)),
        'TDS 5% (₹)': Number(totalTds.toFixed(2)),
        'Admin Charge 5% (₹)': Number(totalAdmin.toFixed(2)),
        'Other Deductions (₹)': 0,
        'Net Payable (₹)': Number(totalNet.toFixed(2)),
        'Status': ''
      })

      const ws1 = xlsx.utils.aoa_to_sheet(summaryHeaderRows)
      xlsx.utils.sheet_add_json(ws1, agentSummaryTable, { origin: 'A21' })
      autoFitColumns(ws1, agentSummaryTable)

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

        const bank = u.bankDetails || {}
        const hasBank = Boolean(bank.bankName?.trim() && bank.accountNumber?.trim() && bank.ifscCode?.trim())

        return {
          'Sr. No.': idx + 1,
          'Agent Code': { v: String(u.sponsorCode || u.agentCode || c.sponsorCode || '—'), t: 's' },
          'Agent Name': String(c.agentName || u.name || '—'),
          'Agent Rank': String(c.receivingRank || u.rank || '—'),
          'Agent Designation': String(c.receivingRankCode || rankNumberToCode[u.rank] || '—'),
          'Agent Mobile': String(u.phone || '—'),
          'Agent Email': String(u.email || '—'),
          'PAN Number': { v: String(u.pan || u.panNumber || '—'), t: 's' },

          'Account Holder Name': String(bank.accountHolderName?.trim() || u.name || (hasBank ? '—' : 'Bank Details Pending')),
          'Bank Name': String(bank.bankName?.trim() || (hasBank ? '—' : 'Bank Details Pending')),
          'Account Number': { v: String(bank.accountNumber?.trim() || (hasBank ? '—' : 'Bank Details Pending')), t: 's' },
          'IFSC Code': { v: String(bank.ifscCode?.trim() || (hasBank ? '—' : 'Bank Details Pending')), t: 's' },
          'Bank Branch': String(bank.branch?.trim() || (hasBank ? '—' : 'Bank Details Pending')),

          'Customer CIF ID': { v: String(c.customerAccount || cust.customerId || '—'), t: 's' },
          'Customer Name': String(c.customerName || cust.name || '—'),
          'Customer Mobile': String(cust.phone || '—'),
          'Customer Address': String(cust.address || '—'),
          'Customer Branch': String(branch.name || cust.branchId || '—'),

          'Policy Number': { v: String(c.policyNumber || plan.policyNumber || '—'), t: 's' },
          'Plan Code': String(c.planCode || plan.type || '—'),
          'Plan Type': String(c.planType || plan.planType || '—'),
          'Policy Start Date': plan.startDate ? (plan.startDate.toDate ? plan.startDate.toDate().toISOString().split('T')[0] : String(plan.startDate).split('T')[0]) : '—',
          'FD Amount (₹)': Number((plan.fdAmount || (plan.planType === 'FD' ? plan.amount : 0) || 0).toFixed(2)),
          'Maturity Amount (₹)': Number((plan.maturityAmount || 0).toFixed(2)),
          'RD Monthly Amount (₹)': Number((plan.monthlyAmount || 0).toFixed(2)),
          'Total Policy Amount (₹)': Number((plan.totalPaid || plan.fdAmount || c.businessAmount || 0).toFixed(2)),
          'Policy Status': String(plan.status || 'active'),

          'Payment Date': c.calculationDate ? (c.calculationDate.toDate ? c.calculationDate.toDate().toISOString().split('T')[0] : String(c.calculationDate).split('T')[0]) : '—',
          'Payment / Business Amount (₹)': Number((c.businessAmount || 0).toFixed(2)),
          'Installment Number': c.installment || 1,

          'Commission Type': String(c.commissionType || 'direct'),
          'Commission Rate (%)': Number((c.percentage || 0).toFixed(2)),
          'Gross Commission (₹)': Number(commGross.toFixed(2)),
          'Gap Commission': isGap ? 'Yes' : 'No',
          'Absorbed Lower Ranks': String(absorbedRanksText || '—'),
          'Commission Reason': String(c.compressionReason || '—'),

          'TDS 5% (₹)': Number(commTds.toFixed(2)),
          'Admin Charge 5% (₹)': Number(commAdmin.toFixed(2)),
          'Other Deductions (₹)': 0,
          'Net Payable (₹)': Number(commNet.toFixed(2))
        }
      })

      const ws2 = xlsx.utils.json_to_sheet(policyDetailsRows)
      autoFitColumns(ws2, policyDetailsRows)

      // ── SHEET 3: Commission Details ───────────────────────────────────────────
      const commDetailsRows = commissions.map((c, idx) => {
        const isGap = c.compression === true || (c.commissionType === 'adjustment') || Boolean(c.compressionReason && c.compressionReason.includes('Vacant'))
        return {
          'Sr. No.': idx + 1,
          'Commission Entry ID': { v: String(c.id), t: 's' },
          'Agent Code': { v: String(c.sponsorCode || '—'), t: 's' },
          'Agent Name': String(c.agentName || '—'),
          'Receiving Rank': String(`${c.receivingRank || ''} (${c.receivingRankCode || ''})`),
          'Policy Number': { v: String(c.policyNumber || '—'), t: 's' },
          'Customer Name': String(c.customerName || '—'),
          'Plan Code': String(c.planCode || '—'),
          'Plan Type': String(c.planType || '—'),
          'Business Amount (₹)': Number((c.businessAmount || 0).toFixed(2)),
          'Commission Rate (%)': Number((c.percentage || 0).toFixed(2)),
          'Commission Amount (₹)': Number((c.amount || 0).toFixed(2)),
          'Commission Type': String(c.commissionType || 'direct'),
          'Gap Commission': isGap ? 'Yes' : 'No',
          'Absorbed Lower Ranks': String(getAbsorbedRanksText(c) || '—'),
          'Compression Reason': String(c.compressionReason || '—'),
          'Status': String(c.status || 'unpaid'),
          'Calculation Date': c.calculationDate ? (c.calculationDate.toDate ? c.calculationDate.toDate().toISOString().split('T')[0] : String(c.calculationDate).split('T')[0]) : '—'
        }
      })

      const ws3 = xlsx.utils.json_to_sheet(commDetailsRows)
      autoFitColumns(ws3, commDetailsRows)

      // ── SHEET 4: Bank Payout ──────────────────────────────────────────────────
      const bankHeaderRows = [
        ['APEX MULTISOLUTIONS'],
        ['BANK PAYOUT INSTRUCTION / RECONCILIATION REPORT'],
        [''],
        ['Payout Month:', MONTHS[selectedMonth - 1]?.label || selectedMonth],
        ['Payout Year:', selectedYear],
        ['Generated Date:', generatedDateStr],
        [''],
        []
      ]

      const bankPayoutRows = agentSummaries.map((a, idx) => ({
        'Sr. No.': idx + 1,
        'Agent Code': { v: String(a.agentCode || '—'), t: 's' },
        'Agent Name': String(a.agentName || '—'),
        'PAN Number': { v: String(a.pan || '—'), t: 's' },
        'Account Holder Name': String(a.accountHolder || 'Bank Details Pending'),
        'Bank Name': String(a.bankName || 'Bank Details Pending'),
        'Account Number': { v: String(a.accountNumber || 'Bank Details Pending'), t: 's' },
        'IFSC Code': { v: String(a.ifsc || 'Bank Details Pending'), t: 's' },
        'Bank Branch': String(a.branch || 'Bank Details Pending'),
        'Gross Commission (₹)': Number(a.grossCommission.toFixed(2)),
        'TDS 5% (₹)': Number(a.tds.toFixed(2)),
        'Admin Charge 5% (₹)': Number(a.adminCharge.toFixed(2)),
        'Other Deductions (₹)': 0,
        'Net Payable (₹)': Number(a.netPayable.toFixed(2)),
        'Payout ID': { v: String(a.payoutId || '—'), t: 's' },
        'Payout Period': String(`${MONTHS[selectedMonth - 1]?.label || selectedMonth} ${selectedYear}`),
        'Status': String(a.status || 'generated')
      }))

      // Append Bank Payout Totals row
      bankPayoutRows.push({
        'Sr. No.': '',
        'Agent Code': 'TOTALS',
        'Agent Name': '',
        'PAN Number': '',
        'Account Holder Name': '',
        'Bank Name': '',
        'Account Number': '',
        'IFSC Code': '',
        'Bank Branch': '',
        'Gross Commission (₹)': Number(totalGross.toFixed(2)),
        'TDS 5% (₹)': Number(totalTds.toFixed(2)),
        'Admin Charge 5% (₹)': Number(totalAdmin.toFixed(2)),
        'Other Deductions (₹)': 0,
        'Net Payable (₹)': Number(totalNet.toFixed(2)),
        'Payout ID': '',
        'Payout Period': '',
        'Status': ''
      })

      const ws4 = xlsx.utils.aoa_to_sheet(bankHeaderRows)
      xlsx.utils.sheet_add_json(ws4, bankPayoutRows, { origin: 'A9' })
      autoFitColumns(ws4, bankPayoutRows)

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
                  <th>Agent Details</th>
                  <th>Bank Details</th>
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
                {payoutsList.map(p => {
                  const u = usersMap[p.agentId] || {}
                  const bank = u.bankDetails || {}
                  const hasBankDetails = Boolean(bank.bankName?.trim() && bank.accountNumber?.trim() && bank.ifscCode?.trim())

                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="font-semibold text-ink-1 block">{p.agentName}</span>
                        <span className="text-[10px] text-ink-2 font-mono">
                          Code: {u.sponsorCode || p.agentCode || '—'} | PAN: {u.pan || u.panNumber || p.panNumber || '—'}
                        </span>
                      </td>
                      <td>
                        {hasBankDetails ? (
                          <div className="text-[11px] leading-tight space-y-0.5">
                            <div className="font-semibold text-ink-1">{bank.bankName}</div>
                            <div className="font-mono text-ink-2 text-[10px]">A/C: {bank.accountNumber} | IFSC: {bank.ifscCode}</div>
                            <div className="text-[10px] text-ink-2">Branch: {bank.branch || '—'}</div>
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded">
                            Bank Details Pending
                          </span>
                        )}
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
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
