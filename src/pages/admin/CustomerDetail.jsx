import { useMemo, useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { addMonths } from 'date-fns'
import * as xlsx from 'xlsx'
import toast from 'react-hot-toast'
import {
  customersAPI,
  policiesAPI,
  paymentsAPI,
  profilesAPI,
  masterDataAPI,
  auditAPI
} from '../../lib/supabase'
import { fmtDate, formatINR, toDate, daysBetween } from '../../utils/format'
import { isRD } from '../../data/compensation'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import {
  IUsers,
  IDoc,
  IBuilding,
  IClock,
  ISettings,
  ICash,
  IDownload,
  ISearch,
  ICheck,
  IAlert,
  IPrint
} from '../../components/ui/icons'
import { useAuth } from '../../contexts/AuthContext'
import { usePermission } from '../../hooks/usePermission'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

export default function CustomerDetail() {
  const { id } = useParams()
  const { user, profile, isViewingAs } = useAuth()
  const { can, CAP, isSuperAdmin } = usePermission()
  const canEdit = isSuperAdmin || can(CAP.ADMIN)

  const [loading, setLoading] = useState(true)
  const [c, setC] = useState(null)
  const [plansData, setPlansData] = useState([])
  const [paymentsData, setPaymentsData] = useState([])
  const [usersData, setUsersData] = useState([])
  const [branchesData, setBranchesData] = useState([])

  // RD Section State
  const [selectedRDPolicyId, setSelectedRDPolicyId] = useState('all')
  const [rdViewTab, setRdViewTab] = useState('history') // 'history' | 'schedule'
  const [historySearch, setHistorySearch] = useState('')
  const [exportingExcel, setExportingExcel] = useState(false)

  // Reversal State
  const [reverseModalOpen, setReverseModalOpen] = useState(false)
  const [reversingPayment, setReversingPayment] = useState(null)
  const [reversalReason, setReversalReason] = useState('')
  const [reversing, setReversing] = useState(false)

  // Edit / Correction State
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', customerId: '' })
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchCustomerData = async () => {
    setLoading(true)
    try {
      const [cust, pols, pays, profs, branches] = await Promise.all([
        customersAPI.getCustomer(id),
        policiesAPI.listPolicies({ customerId: id }).catch(() => []),
        paymentsAPI.listPayments({ customerId: id }).catch(() => []),
        profilesAPI.listProfiles().catch(() => []),
        masterDataAPI.getBranches().catch(() => [])
      ])
      setC(cust)
      setPlansData(pols || [])
      setPaymentsData(pays || [])
      setUsersData(profs || [])
      setBranchesData(branches || [])
    } catch (err) {
      console.error('Error loading customer:', err)
      toast.error('Failed to load customer details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) fetchCustomerData()
  }, [id])

  // Pre-fill edit form when modal opens
  useEffect(() => {
    if (c) {
      setEditForm({
        name: c.name || '',
        phone: c.phone || '',
        address: c.address || '',
        customerId: c.customerId || ''
      })
      setReason('')
    }
  }, [c, editOpen])

  // Get assigned agent details
  const agent = useMemo(() => {
    if (!c?.enrolledBy || !usersData) return null
    return usersData.find(u => u.id === c.enrolledBy)
  }, [c?.enrolledBy, usersData])

  // Get branch details
  const branchName = useMemo(() => {
    if (!c?.branchId || !branchesData) return '—'
    return branchesData.find(b => b.id === c.branchId)?.name || '—'
  }, [c?.branchId, branchesData])

  // Filter RD Policies specifically
  const rdPolicies = useMemo(() => {
    return (plansData || []).filter(p => {
      const typeStr = String(p.planType || p.type || p.planCode || '').toUpperCase()
      return typeStr === 'RD' || typeStr.startsWith('RD')
    })
  }, [plansData])

  // Active RD policy selection for schedule/history inspection
  const activeSelectedRDPolicy = useMemo(() => {
    if (selectedRDPolicyId === 'all') {
      return rdPolicies.length > 0 ? rdPolicies[0] : null
    }
    return rdPolicies.find(p => p.id === selectedRDPolicyId) || rdPolicies[0] || null
  }, [selectedRDPolicyId, rdPolicies])

  // ───────────────────────────────────────────────────────────────────────────
  // RD Installment Summary Cards Metrics (Actual Policy & Payment calculations)
  // ───────────────────────────────────────────────────────────────────────────
  const rdSummary = useMemo(() => {
    let totalExpectedInstallments = 0
    let totalPaidInstallments = 0
    let totalExpectedAmount = 0
    let totalAmountCollected = 0

    rdPolicies.forEach(p => {
      const monthly = Number(p.monthlyAmount ?? p.monthly_amount ?? 0)
      const totalInst = Number(p.totalInstallments ?? p.total_installments ?? 1)
      const paidInst = Number(p.paidInstallments ?? p.paid_installments ?? 0)

      totalExpectedInstallments += totalInst
      totalPaidInstallments += paidInst
      totalExpectedAmount += (monthly * totalInst)
      totalAmountCollected += Number(p.totalPaid ?? p.total_paid ?? (monthly * paidInst))
    })

    const totalRemainingInstallments = Math.max(0, totalExpectedInstallments - totalPaidInstallments)
    const totalOutstandingAmount = Math.max(0, totalExpectedAmount - totalAmountCollected)

    return {
      totalRDPolicies: rdPolicies.length,
      totalExpectedInstallments,
      totalPaidInstallments,
      totalRemainingInstallments,
      totalExpectedAmount,
      totalAmountCollected,
      totalOutstandingAmount
    }
  }, [rdPolicies])

  // ───────────────────────────────────────────────────────────────────────────
  // RD Payment History Table Data
  // ───────────────────────────────────────────────────────────────────────────
  const rdPayments = useMemo(() => {
    // Only payments linked to RD policies
    const rdPolicyIds = new Set(rdPolicies.map(p => p.id))
    let list = (paymentsData || []).filter(pay => rdPolicyIds.has(pay.policyId || pay.policy_id))

    if (selectedRDPolicyId !== 'all') {
      list = list.filter(pay => (pay.policyId || pay.policy_id) === selectedRDPolicyId)
    }

    if (historySearch.trim()) {
      const q = historySearch.toLowerCase().trim()
      list = list.filter(pay =>
        String(pay.installmentNumber || pay.installment_number).includes(q) ||
        (pay.receiptNumber || pay.receipt_number || '').toLowerCase().includes(q) ||
        (pay.transactionRef || pay.transaction_ref || '').toLowerCase().includes(q) ||
        (pay.paymentMode || pay.payment_mode || '').toLowerCase().includes(q)
      )
    }

    // Sort by installment number descending or paid date
    return list.sort((a, b) => (Number(b.installmentNumber || 0) - Number(a.installmentNumber || 0)))
  }, [paymentsData, rdPolicies, selectedRDPolicyId, historySearch])

  // ───────────────────────────────────────────────────────────────────────────
  // Remaining Installments Schedule Generator
  // ───────────────────────────────────────────────────────────────────────────
  const installmentSchedule = useMemo(() => {
    if (!activeSelectedRDPolicy) return []

    const pol = activeSelectedRDPolicy
    const totalInst = Number(pol.totalInstallments ?? pol.total_installments ?? 1)
    const monthlyAmt = Number(pol.monthlyAmount ?? pol.monthly_amount ?? 0)
    const startDate = pol.startDate ? new Date(pol.startDate) : (pol.start_date ? new Date(pol.start_date) : new Date())
    const today = new Date()

    // Map payments for this specific policy by installment_number
    const paymentsByInst = new Map()
    paymentsData.forEach(pay => {
      if ((pay.policyId || pay.policy_id) === pol.id && pay.status !== 'reversed') {
        const instNum = Number(pay.installmentNumber || pay.installment_number)
        paymentsByInst.set(instNum, pay)
      }
    })

    const rows = []
    for (let i = 1; i <= totalInst; i++) {
      const dueDate = addMonths(startDate, i - 1)
      const isPaid = paymentsByInst.has(i)
      const payRecord = paymentsByInst.get(i)

      let status = 'upcoming'
      let daysLate = 0

      if (isPaid) {
        status = 'paid'
      } else if (dueDate < today) {
        status = 'overdue'
        daysLate = daysBetween(today, dueDate)
      }

      rows.push({
        installmentNumber: i,
        dueDate,
        amount: monthlyAmt,
        status,
        daysLate,
        payment: payRecord || null
      })
    }

    return rows
  }, [activeSelectedRDPolicy, paymentsData])

  // ───────────────────────────────────────────────────────────────────────────
  // Excel Export: Download RD Installment Report (.xlsx)
  // ───────────────────────────────────────────────────────────────────────────
  const handleExportRDExcel = () => {
    if (!c) return toast.error('Customer data not loaded')
    setExportingExcel(true)

    try {
      const wb = xlsx.utils.book_new()
      const genDateStr = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })

      // ── Sheet 1: Customer Summary ──
      const sheet1Data = [
        ['APEX MULTISOLUTIONS — RD INSTALLMENT & CUSTOMER REPORT'],
        ['Generated On:', genDateStr],
        [''],
        ['CUSTOMER SUMMARY METRICS', 'VALUE'],
        ['Customer CIF ID', c.customerId || '—'],
        ['Customer Name', c.name || '—'],
        ['Mobile Number', c.phone || '—'],
        ['Address', c.address || '—'],
        ['Servicing Agent ID / Name', agent ? `${agent.name} (${agent.sponsorCode || agent.id})` : '—'],
        ['Branch', branchName],
        ['Total RD Policies', rdSummary.totalRDPolicies],
        ['Total Installments Expected', rdSummary.totalExpectedInstallments],
        ['Total Installments Paid', rdSummary.totalPaidInstallments],
        ['Total Installments Remaining', rdSummary.totalRemainingInstallments],
        ['Total Amount Expected (₹)', rdSummary.totalExpectedAmount],
        ['Total Amount Collected (₹)', rdSummary.totalAmountCollected],
        ['Total Outstanding Balance (₹)', rdSummary.totalOutstandingAmount]
      ]
      const ws1 = xlsx.utils.aoa_to_sheet(sheet1Data)
      ws1['!cols'] = [{ wch: 32 }, { wch: 45 }]
      xlsx.utils.book_append_sheet(wb, ws1, 'Customer Summary')

      // ── Sheet 2: Policy Details ──
      const sheet2Data = rdPolicies.map((p, idx) => {
        const total = Number(p.totalInstallments ?? p.total_installments ?? 1)
        const paid = Number(p.paidInstallments ?? p.paid_installments ?? 0)
        return {
          'Sr. No.': idx + 1,
          'Policy Number': p.policyNumber || p.policy_number,
          'Plan Code': p.planCode || p.type,
          'Monthly Amount (₹)': Number(p.monthlyAmount ?? p.monthly_amount ?? 0),
          'Total Installments': total,
          'Paid Installments': paid,
          'Remaining Installments': Math.max(0, total - paid),
          'Total Paid (₹)': Number(p.totalPaid ?? p.total_paid ?? 0),
          'Start Date': p.startDate ? fmtDate(p.startDate) : '—',
          'Next Due Date': p.nextDueDate ? fmtDate(p.nextDueDate) : '—',
          'Maturity Date': p.maturityDate ? fmtDate(p.maturityDate) : '—',
          'Policy Status': p.status || 'active'
        }
      })
      const ws2 = xlsx.utils.json_to_sheet(sheet2Data)
      xlsx.utils.book_append_sheet(wb, ws2, 'Policy Details')

      // ── Sheet 3: Payment History ──
      const sheet3Data = rdPayments.map((pay, idx) => {
        const pol = rdPolicies.find(p => p.id === (pay.policyId || pay.policy_id))
        const ag = usersData.find(u => u.id === (pay.agentId || pay.agent_id))
        return {
          'Sr. No.': idx + 1,
          'Policy Number': pol?.policyNumber || pol?.policy_number || '—',
          'Installment Number': pay.installmentNumber || pay.installment_number,
          'Payment Date': fmtDate(pay.paidDate || pay.paid_date),
          'Amount (₹)': Number(pay.amount || 0),
          'Payment Mode': (pay.paymentMode || pay.payment_mode || 'cash').toUpperCase(),
          'Transaction ID / Ref': pay.transactionRef || pay.transaction_ref || '—',
          'Receipt Number': pay.receiptNumber || pay.receipt_number || '—',
          'Collected By': ag ? `${ag.name} (${ag.sponsorCode || ag.id.slice(0, 8)})` : '—',
          'Payment Status': (pay.status || 'completed').toUpperCase()
        }
      })
      const ws3 = xlsx.utils.json_to_sheet(sheet3Data)
      xlsx.utils.book_append_sheet(wb, ws3, 'Payment History')

      // ── Sheet 4: Remaining Schedule ──
      const allSchedules = []
      rdPolicies.forEach(pol => {
        const totalInst = Number(pol.totalInstallments ?? pol.total_installments ?? 1)
        const monthlyAmt = Number(pol.monthlyAmount ?? pol.monthly_amount ?? 0)
        const start = pol.startDate ? new Date(pol.startDate) : (pol.start_date ? new Date(pol.start_date) : new Date())
        const polPaidCount = Number(pol.paidInstallments ?? pol.paid_installments ?? 0)

        for (let i = 1; i <= totalInst; i++) {
          const dDate = addMonths(start, i - 1)
          const isPaid = i <= polPaidCount
          allSchedules.push({
            'Policy Number': pol.policyNumber || pol.policy_number,
            'Installment Number': i,
            'Due Date': fmtDate(dDate),
            'Expected Amount (₹)': monthlyAmt,
            'Status': isPaid ? 'PAID' : (dDate < new Date() ? 'OVERDUE' : 'PENDING')
          })
        }
      })
      const ws4 = xlsx.utils.json_to_sheet(allSchedules)
      xlsx.utils.book_append_sheet(wb, ws4, 'Remaining Schedule')

      xlsx.writeFile(wb, `RD_Installment_Report_${c.customerId || c.id.slice(0, 8)}.xlsx`)
      toast.success('Downloaded RD Installment Report (.xlsx)')
    } catch (err) {
      console.error('Failed to export RD Excel report:', err)
      toast.error('Export failed: ' + err.message)
    } finally {
      setExportingExcel(false)
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Payment Reversal Handler
  // ───────────────────────────────────────────────────────────────────────────
  const handleConfirmReversal = async () => {
    if (!reversingPayment) return
    if (!reversalReason.trim()) {
      toast.error('Reversal reason is mandatory.')
      return
    }

    setReversing(true)
    const tId = toast.loading('Processing payment reversal...')

    try {
      await paymentsAPI.reversePayment(reversingPayment.id, reversalReason.trim())
      toast.success('Payment successfully reversed and policy updated.', { id: tId })
      setReverseModalOpen(false)
      setReversingPayment(null)
      setReversalReason('')
      fetchCustomerData()
    } catch (err) {
      console.error('Reversal error:', err)
      toast.error(err.message || 'Payment reversal failed.', { id: tId })
    } finally {
      setReversing(false)
    }
  }

  // Compute live diff preview for Record Correction
  const diffs = useMemo(() => {
    if (!c) return []
    const list = []
    if (editForm.name.trim() !== (c.name || '')) {
      list.push({ field: 'Customer Name', oldVal: c.name || '—', newVal: editForm.name.trim() })
    }
    if (editForm.phone.trim() !== (c.phone || '')) {
      list.push({ field: 'Mobile / Phone', oldVal: c.phone || '—', newVal: editForm.phone.trim() })
    }
    if (editForm.address.trim() !== (c.address || '')) {
      list.push({ field: 'Address', oldVal: c.address || '—', newVal: editForm.address.trim() })
    }
    if (editForm.customerId.trim() !== (c.customerId || '')) {
      list.push({ field: 'Customer CIF ID', oldVal: c.customerId || '—', newVal: editForm.customerId.trim() })
    }
    return list
  }, [c, editForm])

  // Save Customer Correction Action
  const handleSaveCorrection = async () => {
    if (!reason.trim()) {
      toast.error('Reason for correction is mandatory.')
      return
    }

    if (diffs.length === 0) {
      toast.error('No values were changed.')
      return
    }

    setSaving(true)
    const loader = toast.loading('Saving customer correction...')

    try {
      const newCustId = editForm.customerId.trim()
      const newName = editForm.name.trim()

      await customersAPI.updateCustomer(id, {
        name: newName,
        phone: editForm.phone.trim(),
        address: editForm.address.trim(),
      })

      // Write Audit Log
      try {
        await auditAPI.logAuditEvent({
          type: 'Customer Correction',
          recordId: id,
          targetType: 'customer',
          customerName: newName,
          performedBy: user?.id || 'system',
          performedByEmail: user?.email || profile?.email || 'Admin',
          reason: reason.trim(),
          changes: diffs
        })
      } catch (aErr) {
        console.warn('Audit log write error:', aErr)
      }

      toast.success('Customer details corrected successfully!', { id: loader })
      setEditOpen(false)
      fetchCustomerData()
    } catch (err) {
      console.error('Error saving customer correction:', err)
      toast.error(`Correction failed: ${err.message}`, { id: loader })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={4} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }

  if (!c) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Customer Not Found</h2>
        <p className="text-sm text-ink-2">This customer record does not exist in the system.</p>
        <Link to="/admin/customers" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">
          Back to Customers
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* ── Header Card ─────────────────────────────────────────────────── */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1 bg-navy-3">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-card border border-gold-1/25 bg-gold-1/10 text-gold-1">
              <IUsers size={28} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">{c.name}</h1>
                <span className="text-[10px] bg-ok/10 border border-ok/25 px-2 py-0.5 rounded text-ok font-semibold">
                  CIF Verified
                </span>
              </div>
              <p className="text-xs text-ink-2 mt-0.5 font-mono">CIF ID: {c.customerId || '—'}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Quick Link to Collect Next Installment */}
            {rdPolicies.length > 0 && (
              <Link
                to={`/payments/collect?customer=${c.id}&agent=${c.enrolledBy || ''}`}
                className="btn-gold py-2 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow"
              >
                <ICash size={14} /> Collect Installment
              </Link>
            )}

            {/* Excel Export Button */}
            {rdPolicies.length > 0 && (
              <button
                type="button"
                onClick={handleExportRDExcel}
                disabled={exportingExcel}
                className="btn-dark py-2 px-4 text-xs font-bold uppercase tracking-wider border border-gold-1/40 text-gold hover:border-gold flex items-center gap-1.5"
              >
                <IDownload size={14} />
                {exportingExcel ? 'Exporting...' : 'Download RD Installment Report'}
              </button>
            )}

            {canEdit && (
              <button
                onClick={() => setEditOpen(true)}
                className="btn-dark py-2 px-3 text-xs font-bold uppercase tracking-wider border border-navy-4 text-ink-2 hover:text-ink-1 flex items-center gap-1.5"
              >
                <ISettings size={14} /> Correct Record
              </button>
            )}

            <Link to="/admin/customers" className="btn-ghost py-2 px-3 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* ── SECTION: RD INSTALLMENT DETAILS ──────────────────────────────── */}
      {rdPolicies.length > 0 && (
        <div className="space-y-6 pt-2">
          {/* Section Heading */}
          <div className="flex items-center justify-between pb-2 border-b border-navy-4/50">
            <div className="flex items-center gap-2">
              <ICash size={20} className="text-gold" />
              <h2 className="font-serif text-xl font-bold text-ink-1 tracking-tight">
                RD Installment Details
              </h2>
            </div>
            <span className="text-xs text-ink-2 font-mono">
              {rdPolicies.length} Active RD {rdPolicies.length === 1 ? 'Policy' : 'Policies'}
            </span>
          </div>

          {/* A. Installment Summary Cards (7 required KPI metrics) */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="card p-3.5 bg-navy-3 border border-navy-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-ink-2 tracking-wider block">Total RD Policies</span>
              <p className="text-lg font-bold font-serif text-ink-1">{rdSummary.totalRDPolicies}</p>
            </div>
            <div className="card p-3.5 bg-navy-3 border border-navy-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-ink-2 tracking-wider block">Inst. Expected</span>
              <p className="text-lg font-bold font-serif text-ink-1">{rdSummary.totalExpectedInstallments}</p>
            </div>
            <div className="card p-3.5 bg-navy-3 border border-navy-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-ink-2 tracking-wider block">Inst. Paid</span>
              <p className="text-lg font-bold font-serif text-emerald-400">{rdSummary.totalPaidInstallments}</p>
            </div>
            <div className="card p-3.5 bg-navy-3 border border-navy-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-ink-2 tracking-wider block">Inst. Remaining</span>
              <p className="text-lg font-bold font-serif text-amber-400">{rdSummary.totalRemainingInstallments}</p>
            </div>
            <div className="card p-3.5 bg-navy-3 border border-navy-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-ink-2 tracking-wider block">Amount Expected</span>
              <p className="text-sm font-bold font-serif text-ink-1">{formatINR(rdSummary.totalExpectedAmount)}</p>
            </div>
            <div className="card p-3.5 bg-navy-3 border border-navy-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-ink-2 tracking-wider block">Amount Collected</span>
              <p className="text-sm font-bold font-serif text-emerald-400">{formatINR(rdSummary.totalAmountCollected)}</p>
            </div>
            <div className="card p-3.5 bg-navy-3 border border-gold-1/30 space-y-1 bg-gold-1/5 col-span-2 md:col-span-1">
              <span className="text-[10px] uppercase font-bold text-gold tracking-wider block">Outstanding Amt</span>
              <p className="text-sm font-bold font-serif text-gold-1">{formatINR(rdSummary.totalOutstandingAmount)}</p>
            </div>
          </div>

          {/* B. Individual RD Policy Details & Progress Bars */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
              Individual RD Policy Progress
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rdPolicies.map(p => {
                const total = Number(p.totalInstallments ?? p.total_installments ?? 1)
                const paid = Number(p.paidInstallments ?? p.paid_installments ?? 0)
                const remaining = Math.max(0, total - paid)
                const monthlyAmt = Number(p.monthlyAmount ?? p.monthly_amount ?? 0)
                const expAmt = monthlyAmt * total
                const paidAmt = Number(p.totalPaid ?? p.total_paid ?? (monthlyAmt * paid))
                const remAmt = Math.max(0, expAmt - paidAmt)
                const progressPct = Math.min(100, Math.round((paid / total) * 100))
                const isSelected = activeSelectedRDPolicy?.id === p.id

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedRDPolicyId(p.id)}
                    className={`card p-5 cursor-pointer transition-all border ${
                      isSelected
                        ? 'border-gold bg-gold-1/5 ring-1 ring-gold/40'
                        : 'border-navy-4 bg-navy-3 hover:border-gold-1/40'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-ink-1 text-sm">{p.policyNumber}</span>
                          <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold">
                            {p.planCode || p.type}
                          </span>
                        </div>
                        <p className="text-xs text-ink-2 mt-0.5">
                          Monthly Installment: <strong className="text-gold-1">{formatINR(monthlyAmt)}</strong>
                        </p>
                      </div>
                      <StatusBadge status={p.status || 'active'} />
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 mt-4">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-ink-2">Installment Progress:</span>
                        <span className="font-mono text-ink-1">
                          {paid} / {total} installments ({progressPct}%)
                        </span>
                      </div>
                      <div className="w-full bg-navy-2 rounded-full h-2.5 overflow-hidden border border-navy-4">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-300 ${
                            progressPct >= 100 ? 'bg-emerald-500' : 'bg-gold'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono mt-4 pt-3 border-t border-navy-4/50">
                      <div>
                        <span className="text-[10px] text-ink-2 block">Expected Amount</span>
                        <span className="font-bold text-ink-1">{formatINR(expAmt)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Amount Paid</span>
                        <span className="font-bold text-emerald-400">{formatINR(paidAmt)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-2 block">Remaining Amount</span>
                        <span className="font-bold text-amber-400">{formatINR(remAmt)}</span>
                      </div>
                    </div>

                    {/* Action Footer */}
                    <div className="flex items-center justify-between mt-4 pt-2.5 border-t border-navy-4/50 text-[11px]">
                      <span className="text-ink-2">
                        Next Due: <strong className="text-gold font-mono">{fmtDate(p.nextDueDate)}</strong>
                      </span>
                      {paid < total && p.status !== 'matured' ? (
                        <Link
                          to={`/payments/collect?customer=${c.id}&policy=${p.id}&agent=${p.agentId || c.enrolledBy || ''}`}
                          onClick={e => e.stopPropagation()}
                          className="btn-gold py-1 px-3 text-[11px] font-bold uppercase tracking-wider"
                        >
                          Collect #{paid + 1} &rarr;
                        </Link>
                      ) : (
                        <span className="font-bold text-emerald-400">Matured</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* C & D: Tabbed Views for Installment Payment History & Schedule */}
          <div className="card p-5 bg-navy-3 border border-navy-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-4 pb-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRdViewTab('history')}
                  className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                    rdViewTab === 'history'
                      ? 'border-gold text-gold-1'
                      : 'border-transparent text-ink-2 hover:text-ink-1'
                  }`}
                >
                  Installment Payment History ({rdPayments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRdViewTab('schedule')}
                  className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                    rdViewTab === 'schedule'
                      ? 'border-gold text-gold-1'
                      : 'border-transparent text-ink-2 hover:text-ink-1'
                  }`}
                >
                  Remaining Schedule ({activeSelectedRDPolicy?.policyNumber || 'All'})
                </button>
              </div>

              {/* Policy Filter Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-2 font-semibold">Filter Policy:</span>
                <select
                  className="field text-xs py-1 px-2.5 w-44 font-mono"
                  value={selectedRDPolicyId}
                  onChange={e => setSelectedRDPolicyId(e.target.value)}
                >
                  <option value="all">All RD Policies</option>
                  {rdPolicies.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.policyNumber} ({p.planCode || p.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* TAB C: Installment Payment History Table */}
            {rdViewTab === 'history' && (
              <div className="space-y-3">
                {/* Search Bar */}
                <div className="relative max-w-sm">
                  <input
                    type="text"
                    className="field text-xs pl-8"
                    placeholder="Search installment #, receipt, mode..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                  />
                  <ISearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
                </div>

                {rdPayments.length === 0 ? (
                  <div className="p-8 text-center text-xs text-ink-2 italic bg-navy-2 rounded border border-navy-4">
                    No installment payments recorded yet for this customer.
                  </div>
                ) : (
                  <div className="table-wrap overflow-x-auto">
                    <table className="tbl text-xs">
                      <thead>
                        <tr>
                          <th>Installment #</th>
                          <th>Payment Date</th>
                          <th>Amount</th>
                          <th>Payment Mode</th>
                          <th>Transaction ID / Ref</th>
                          <th>Receipt Number</th>
                          <th>Collected By</th>
                          <th>Status</th>
                          <th className="text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rdPayments.map(pay => {
                          const ag = usersData.find(u => u.id === (pay.agentId || pay.agent_id))
                          const isReversed = pay.status === 'reversed'

                          return (
                            <tr key={pay.id} className={`hover:bg-navy-2/60 ${isReversed ? 'opacity-50' : ''}`}>
                              <td className="font-mono font-bold text-gold-1">
                                Installment #{pay.installmentNumber || pay.installment_number}
                              </td>
                              <td className="font-mono text-ink-2">
                                {fmtDate(pay.paidDate || pay.paid_date)}
                              </td>
                              <td className="font-mono font-bold text-ink-1">
                                {formatINR(pay.amount)}
                              </td>
                              <td className="uppercase font-semibold text-ink-1">
                                {pay.paymentMode || pay.payment_mode || 'cash'}
                              </td>
                              <td className="font-mono text-[11px] text-ink-2">
                                {pay.transactionRef || pay.transaction_ref || '—'}
                              </td>
                              <td className="font-mono text-[11px] text-gold">
                                <Link
                                  to={`/payments/${pay.id}/receipt`}
                                  className="hover:underline flex items-center gap-1 font-bold"
                                  title="View Receipt"
                                >
                                  {pay.receiptNumber || pay.receipt_number || 'View'} &rarr;
                                </Link>
                              </td>
                              <td className="text-ink-2">
                                {ag ? (
                                  <span>{ag.name} <span className="font-mono text-[10px]">({ag.sponsorCode || '—'})</span></span>
                                ) : '—'}
                              </td>
                              <td>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    isReversed
                                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  }`}
                                >
                                  {isReversed ? 'Reversed' : 'Paid'}
                                </span>
                              </td>
                              <td className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Link
                                    to={`/payments/${pay.id}/receipt`}
                                    className="text-[11px] text-gold hover:underline font-bold"
                                  >
                                    Receipt
                                  </Link>
                                  {canEdit && !isReversed && !isViewingAs && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReversingPayment(pay)
                                        setReversalReason('')
                                        setReverseModalOpen(true)
                                      }}
                                      className="text-[11px] text-red-400 hover:underline"
                                    >
                                      Reverse
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB D: Remaining Installments Schedule Table */}
            {rdViewTab === 'schedule' && (
              <div className="space-y-3">
                <div className="p-3 bg-navy-2 rounded border border-navy-4 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-ink-2">Schedule for: </span>
                    <strong className="text-ink-1 font-mono">{activeSelectedRDPolicy?.policyNumber}</strong>
                    <span className="text-ink-2 ml-2">({activeSelectedRDPolicy?.planCode || activeSelectedRDPolicy?.type})</span>
                  </div>
                  <span className="text-ink-2">
                    Start Date: <strong className="text-ink-1 font-mono">{fmtDate(activeSelectedRDPolicy?.startDate || activeSelectedRDPolicy?.start_date)}</strong>
                  </span>
                </div>

                <div className="table-wrap overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="tbl text-xs">
                    <thead>
                      <tr>
                        <th>Installment #</th>
                        <th>Due Date</th>
                        <th className="text-right">Expected Amount</th>
                        <th>Status</th>
                        <th>Payment Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {installmentSchedule.map(row => (
                        <tr key={row.installmentNumber} className="hover:bg-navy-2/60">
                          <td className="font-mono font-bold text-ink-1">
                            Installment #{row.installmentNumber}
                          </td>
                          <td className="font-mono text-ink-2">
                            {fmtDate(row.dueDate)}
                          </td>
                          <td className="text-right font-mono font-bold text-ink-1">
                            {formatINR(row.amount)}
                          </td>
                          <td>
                            {row.status === 'paid' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Paid
                              </span>
                            ) : row.status === 'overdue' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">
                                Overdue ({row.daysLate}d late)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-navy-4 text-ink-2 border border-navy-4">
                                Upcoming
                              </span>
                            )}
                          </td>
                          <td className="text-xs">
                            {row.payment ? (
                              <span className="font-mono text-[11px] text-ink-2">
                                Paid on {fmtDate(row.payment.paidDate || row.payment.paid_date)} ·{' '}
                                <Link
                                  to={`/payments/${row.payment.id}/receipt`}
                                  className="text-gold hover:underline font-bold"
                                >
                                  {row.payment.receiptNumber || 'Receipt'}
                                </Link>
                              </span>
                            ) : (
                              <span className="text-ink-2 italic text-[11px]">—</span>
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
        </div>
      )}

      {/* ── Main Grid: Customer, Agent, Linked Policies & Timeline ────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Customer and Agent details */}
        <div className="space-y-6">
          {/* Customer Profile card */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> CIF Customer Profile
            </h3>
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="block text-[10px] text-ink-2">Mobile / Contact</span>
                <span className="font-semibold text-ink-1 font-mono">{c.phone || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Address</span>
                <span className="font-semibold text-ink-1 whitespace-pre-wrap">{c.address || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Branch Office</span>
                <span className="font-semibold text-ink-1">{branchName}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Import / Created Date</span>
                <span className="font-semibold text-ink-1">{c.createdAt ? fmtDate(c.createdAt) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Assigned Agent card */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Assigned Servicing Agent
            </h3>
            {agent ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-navy-4 flex items-center justify-center font-bold text-gold-1">
                    {agent.name.charAt(0)}
                  </div>
                  <div>
                    <Link to={`/admin/members/${agent.id}`} className="font-semibold text-ink-1 hover:underline">
                      {agent.name}
                    </Link>
                    <div className="text-[10px] text-ink-2 font-mono">Code: {agent.sponsorCode}</div>
                  </div>
                </div>
                <div className="border-t border-navy-4/50 pt-2 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-ink-2">Rank Level</span>
                    <RankBadge rank={agent.rank} size="sm" showName />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">Phone</span>
                    <span className="font-mono text-ink-1">{agent.phone || '—'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic py-1">No enrolled agent mapping found.</p>
            )}
          </div>
        </div>

        {/* Right Column: Policies and Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Linked Policies */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IDoc size={16} /> All Linked Customer Policies
            </h3>
            {plansData?.length ? (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Policy No.</th>
                      <th>Plan Product</th>
                      <th>Amount</th>
                      <th>Duration</th>
                      <th>Start Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plansData.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-[10px] font-semibold text-gold">
                          <Link to={`/admin/policies/${p.id}`} className="hover:underline">
                            {p.policyNumber || '—'}
                          </Link>
                        </td>
                        <td className="font-semibold uppercase text-ink-1">{p.type}</td>
                        <td className="font-semibold text-ink-1">
                          {p.monthlyAmount > 0 ? (
                            <span>{formatINR(p.monthlyAmount)} <span className="text-[9px] text-ink-2 font-normal">/mo</span></span>
                          ) : (
                            <span>{formatINR(p.fdAmount)} <span className="text-[9px] text-ink-2 font-normal">Total</span></span>
                          )}
                        </td>
                        <td className="text-ink-2">{p.duration} {p.duration === 1 ? 'Year' : 'Years'}</td>
                        <td className="text-ink-2 font-mono">{p.startDate ? fmtDate(p.startDate) : '—'}</td>
                        <td>
                          <StatusBadge status={p.status || 'active'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic py-4 text-center">No active policies found for this customer.</p>
            )}
          </div>

          {/* Timeline Audit Logs */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IClock size={16} /> CIF Onboarding Timeline
            </h3>
            <div className="space-y-4 pl-4 relative before:absolute before:left-[10px] before:top-2 before:bottom-2 before:w-0.5 before:bg-navy-4">
              <div className="relative pl-6">
                <span className="absolute left-[5px] top-1 h-2 w-2 rounded-full bg-gold-1 ring-4 ring-navy-3" />
                <span className="block text-[10px] text-ink-2 font-mono">
                  {c.createdAt ? fmtDate(c.createdAt) : '—'}
                </span>
                <span className="text-xs font-semibold text-ink-1">CIF Profile Created</span>
                <p className="text-[11px] text-ink-2 mt-0.5">Account auto-generated via daily ledger upload.</p>
              </div>
              {plansData.map((p) => (
                <div key={p.id} className="relative pl-6">
                  <span className="absolute left-[5px] top-1 h-2 w-2 rounded-full bg-ok ring-4 ring-navy-3" />
                  <span className="block text-[10px] text-ink-2 font-mono">
                    {p.startDate ? fmtDate(p.startDate) : '—'}
                  </span>
                  <span className="text-xs font-semibold text-ink-1">Policy #{p.policyNumber} Allocated</span>
                  <p className="text-[11px] text-ink-2 mt-0.5">Linked {p.type} savings plan via Agent {p.agentName || '—'}.</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Reversal Modal */}
      {reverseModalOpen && reversingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6 bg-navy-3 border border-red-500/30 space-y-4">
            <h3 className="font-serif text-lg font-bold text-red-400">Reverse Installment Payment</h3>
            <p className="text-xs text-ink-2">
              You are about to reverse Installment #{reversingPayment.installmentNumber || reversingPayment.installment_number} (Amount: {formatINR(reversingPayment.amount)}, Receipt: {reversingPayment.receiptNumber || reversingPayment.receipt_number}).
            </p>
            <div className="p-3 bg-navy-2 rounded border border-navy-4 text-xs text-ink-2 space-y-1">
              <p>• The policy&apos;s paid installment counter will decrement by 1.</p>
              <p>• Total paid amount will be reduced by {formatINR(reversingPayment.amount)}.</p>
              <p>• The payment record is preserved with status marked as <strong>REVERSED</strong>.</p>
            </div>
            <div>
              <label className="label text-red-400 font-bold">Reason for Reversal *</label>
              <input
                type="text"
                autoFocus
                className="field text-xs border-red-400/40 focus:border-red-400"
                placeholder="e.g. Bounced cheque, bank error, customer dispute..."
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={reversing}
                onClick={() => setReverseModalOpen(false)}
                className="btn-dark py-1.5 px-3 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reversing || !reversalReason.trim()}
                onClick={handleConfirmReversal}
                className="btn-danger py-1.5 px-4 text-xs font-bold"
              >
                {reversing ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Controlled Correction Modal */}
      <ConfirmDialog
        open={editOpen}
        title="Admin Record Correction — Customer"
        confirmLabel="Save Correction"
        cancelLabel="Cancel"
        loading={saving}
        confirmDisabled={diffs.length === 0 || !reason.trim()}
        onConfirm={handleSaveCorrection}
        onClose={() => !saving && setEditOpen(false)}
      >
        <div className="space-y-4 text-xs mt-3">
          <div className="p-3 bg-navy-2 border border-navy-4 rounded text-ink-2">
            <span className="font-bold text-gold">Controlled Admin Correction:</span> Changes will update linked records and create a permanent entry in the system audit trail.
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">Customer Name</label>
              <input
                type="text"
                className="field"
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div>
              <label className="label">CIF / Customer ID</label>
              <input
                type="text"
                className="field font-mono"
                value={editForm.customerId}
                onChange={e => setEditForm({ ...editForm, customerId: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Mobile / Phone Number</label>
              <input
                type="text"
                className="field font-mono"
                value={editForm.phone}
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Address</label>
              <textarea
                rows={2}
                className="field"
                value={editForm.address}
                onChange={e => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
          </div>

          {/* Live Diff Preview */}
          {diffs.length > 0 && (
            <div className="card p-3 bg-navy-4/40 border border-gold-1/30 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gold">
                Preview Changes:
              </div>
              <div className="space-y-1">
                {diffs.map((d, i) => (
                  <div key={i} className="flex justify-between items-center text-[11px] border-b border-navy-4/50 pb-1">
                    <span className="text-ink-2 font-medium">{d.field}:</span>
                    <span className="font-mono text-ink-1">
                      <span className="text-red-400 line-through mr-1">{d.oldVal}</span> → <span className="text-ok font-bold">{d.newVal}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mandatory Correction Reason */}
          <div>
            <label className="label text-gold font-bold">
              Reason for Correction <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="field border-gold/40 focus:border-gold"
              placeholder="e.g. Corrected spelling typo from Excel data"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  )
}
