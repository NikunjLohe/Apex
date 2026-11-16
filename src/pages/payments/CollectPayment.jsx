import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { usePermission, CAP } from '../../hooks/usePermission'
import { customersAPI, policiesAPI, paymentsAPI, profilesAPI } from '../../lib/supabase'
import { isRD } from '../../data/compensation'
import { formatINR, fmtDate, toDate, daysBetween } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import RankBadge from '../../components/ui/RankBadge'
import EmptyState from '../../components/ui/EmptyState'
import {
  ISearch,
  ICash,
  ICheck,
  IUsers,
  IDoc,
  IShield,
  IAlert,
  IClock,
  IPrint,
  IDownload
} from '../../components/ui/icons'

export default function CollectPayment() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { profile, isViewingAs, logDeniedWrite } = useAuth()
  const { isSuperAdmin, can } = usePermission()

  // 5 Workflow Steps
  // 1: Identify Agent -> 2: Identify Customer -> 3: Select Policy -> 4: Installment Details -> 5: Confirm Payment
  const [step, setStep] = useState(1)

  // Master Lists
  const [allAgents, setAllAgents] = useState([])
  const [allCustomers, setAllCustomers] = useState([])
  const [loadingInitial, setLoadingInitial] = useState(true)

  // Step 1: Agent State
  const [agentSearch, setAgentSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [agentError, setAgentError] = useState('')

  // Step 2: Customer State
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerWarning, setCustomerWarning] = useState('')

  // Step 3: Policy Selection State
  const [loadingPolicies, setLoadingPolicies] = useState(false)
  const [customerRDPolicies, setCustomerRDPolicies] = useState([])
  const [selectedPolicy, setSelectedPolicy] = useState(null)

  // Step 4: Installment Details Form
  const [amount, setAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [transactionRef, setTransactionRef] = useState('')
  const [chequeNumber, setChequeNumber] = useState('')
  const [bankName, setBankName] = useState('')
  const [remarks, setRemarks] = useState('')
  const [formErrors, setFormErrors] = useState({})

  // Step 5: Submission & Success State
  const [submitting, setSubmitting] = useState(false)
  const [completedPayment, setCompletedPayment] = useState(null)

  // Load Agents & Customers on Mount
  useEffect(() => {
    let mounted = true
    setLoadingInitial(true)

    Promise.all([
      profilesAPI.listProfiles().catch(() => []),
      customersAPI.listCustomers().catch(() => [])
    ]).then(([agentsRes, custsRes]) => {
      if (!mounted) return
      setAllAgents(agentsRes || [])
      setAllCustomers(custsRes || [])

      // Auto-preselect agent if logged-in user is an agent (not super admin)
      if (profile?.rank && profile?.id && !isSuperAdmin) {
        const currentAgent = (agentsRes || []).find(a => a.id === profile.id)
        if (currentAgent) {
          setSelectedAgent(currentAgent)
          setStep(2)
        }
      }

      setLoadingInitial(false)
    }).catch(err => {
      console.error('Failed to load initial data:', err)
      if (mounted) setLoadingInitial(false)
    })

    return () => { mounted = false }
  }, [profile, isSuperAdmin])

  // Handle URL query parameters (?agent=id&customer=id&policy=id)
  useEffect(() => {
    if (loadingInitial) return

    const agentParam = params.get('agent')
    const custParam = params.get('customer')

    if (agentParam && allAgents.length > 0 && !selectedAgent) {
      const foundA = allAgents.find(a => a.id === agentParam || a.sponsorCode === agentParam || a.agentCode === agentParam)
      if (foundA) {
        setSelectedAgent(foundA)
        setStep(2)
      }
    }

    if (custParam && allCustomers.length > 0 && !selectedCustomer) {
      const foundC = allCustomers.find(c => c.id === custParam || c.customerId === custParam || c.accountNumber === custParam)
      if (foundC) {
        setSelectedCustomer(foundC)
        // If agent wasn't set, infer from customer enrolledBy
        if (!selectedAgent && foundC.enrolledBy) {
          const matchingAgent = allAgents.find(a => a.id === foundC.enrolledBy)
          if (matchingAgent) setSelectedAgent(matchingAgent)
        }
        setStep(3)
      }
    }
  }, [params, loadingInitial, allAgents, allCustomers, selectedAgent, selectedCustomer])

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 1: Agent Identification & Search
  // ───────────────────────────────────────────────────────────────────────────
  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase()
    if (!q) return []
    return allAgents.filter(a =>
      a.name?.toLowerCase().includes(q) ||
      a.sponsorCode?.toLowerCase().includes(q) ||
      a.agentCode?.toLowerCase().includes(q) ||
      a.id?.toLowerCase().includes(q) ||
      a.phone?.includes(q)
    ).slice(0, 8)
  }, [agentSearch, allAgents])

  const handleSelectAgent = (agent) => {
    setSelectedAgent(agent)
    setAgentError('')
    // If a customer was already selected, verify relationship
    if (selectedCustomer) {
      validateCustomerAgentRelationship(selectedCustomer, agent)
    }
    setStep(2)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 2: Customer Identification & Relationship Validation
  // ───────────────────────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return []
    return allCustomers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.customerId?.toLowerCase().includes(q) ||
      c.accountNumber?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    ).slice(0, 8)
  }, [customerSearch, allCustomers])

  const validateCustomerAgentRelationship = (cust, agent) => {
    if (!cust || !agent) return true
    const enrolledBy = cust.enrolledBy || cust.agentId || cust.agent_id
    if (enrolledBy && enrolledBy !== agent.id) {
      const assigned = allAgents.find(a => a.id === enrolledBy)
      const warningMsg = `Warning: Customer ${cust.name} is mapped to agent ${assigned ? `${assigned.name} (${assigned.sponsorCode || assigned.id.slice(0, 8)})` : enrolledBy}, not ${agent.name} (${agent.sponsorCode || agent.id.slice(0, 8)}). Please confirm this is the intended agent relationship.`
      setCustomerWarning(warningMsg)
      return false
    } else {
      setCustomerWarning('')
      return true
    }
  }

  const handleSelectCustomer = (cust) => {
    setSelectedCustomer(cust)
    validateCustomerAgentRelationship(cust, selectedAgent)
    setStep(3)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 3: Load & Filter RD Policies
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerRDPolicies([])
      return
    }

    let mounted = true
    setLoadingPolicies(true)

    policiesAPI.listPolicies({ customerId: selectedCustomer.id })
      .then(res => {
        if (!mounted) return
        // Filter strictly for RD plans
        const rdList = (res || []).filter(p => {
          const typeStr = String(p.planType || p.type || p.planCode || '').toUpperCase()
          return typeStr === 'RD' || typeStr.startsWith('RD')
        })
        setCustomerRDPolicies(rdList)
        setLoadingPolicies(false)
      })
      .catch(err => {
        console.error('Failed to load customer RD policies:', err)
        if (mounted) setLoadingPolicies(false)
      })

    return () => { mounted = false }
  }, [selectedCustomer])

  const handleSelectPolicy = (pol) => {
    setSelectedPolicy(pol)
    // Pre-populate Step 4 fields
    const defaultAmt = pol.monthlyAmount || pol.installmentAmount || 0
    setAmount(String(defaultAmt))
    setPaymentMode('cash')
    setPaidDate(format(new Date(), 'yyyy-MM-dd'))
    setTransactionRef('')
    setChequeNumber('')
    setBankName('')
    setRemarks('')
    setFormErrors({})
    setStep(4)
  }

  // Calculated next installment values
  const currentPaidCount = Number(selectedPolicy?.paidInstallments ?? selectedPolicy?.paid_installments ?? 0)
  const totalInstallmentsCount = Number(selectedPolicy?.totalInstallments ?? selectedPolicy?.total_installments ?? 1)
  const nextInstallmentNumber = currentPaidCount + 1
  const remainingAfterPayment = Math.max(0, totalInstallmentsCount - nextInstallmentNumber)

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 4: Validate Installment Details Form
  // ───────────────────────────────────────────────────────────────────────────
  const handleProceedToConfirm = (e) => {
    e.preventDefault()
    const errs = {}

    const amtNum = Number(amount)
    if (isNaN(amtNum) || amtNum <= 0) {
      errs.amount = 'Valid positive installment amount is required.'
    }

    if (!paidDate) {
      errs.paidDate = 'Payment date is mandatory.'
    }

    if (paymentMode === 'upi' && !transactionRef.trim()) {
      errs.transactionRef = 'UPI Transaction / UTR reference number is required.'
    }

    if (paymentMode === 'cheque') {
      if (!chequeNumber.trim()) errs.chequeNumber = 'Cheque number is required.'
      if (!bankName.trim()) errs.bankName = 'Bank name is required.'
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      return
    }

    setFormErrors({})
    setStep(5)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 5: Confirm & Execute Safe Installment Payment
  // ───────────────────────────────────────────────────────────────────────────
  const handleConfirmPayment = async () => {
    if (isViewingAs) {
      toast.error('Payment creation is disabled in View As Agent mode')
      if (logDeniedWrite) logDeniedWrite('recordInstallmentPayment')
      return
    }

    if (!selectedPolicy || !selectedCustomer || !selectedAgent) {
      toast.error('Incomplete payment context. Please verify all details.')
      return
    }

    setSubmitting(true)
    const tId = toast.loading(`Recording Installment #${nextInstallmentNumber} for Policy #${selectedPolicy.policyNumber}...`)

    try {
      const payload = {
        policyId: selectedPolicy.id,
        amount: Number(amount),
        paymentMode,
        transactionRef: paymentMode === 'cheque' ? `${chequeNumber} (${bankName})` : transactionRef,
        paidDate,
        notes: remarks.trim() || undefined
      }

      const result = await paymentsAPI.recordInstallmentPayment(payload)

      toast.success(`Installment #${nextInstallmentNumber} recorded successfully!`, { id: tId })
      setCompletedPayment({
        ...result,
        customerName: selectedCustomer.name,
        customerId: selectedCustomer.customerId,
        agentName: selectedAgent.name,
        agentSponsorCode: selectedAgent.sponsorCode,
        policyNumber: selectedPolicy.policyNumber,
        planCode: selectedPolicy.planCode || selectedPolicy.type,
        amount: Number(amount),
        paidDate,
        paymentMode
      })
    } catch (err) {
      console.error('Installment collection error:', err)
      toast.error(err.message || 'Payment recording failed. Please try again.', { id: tId })
    } finally {
      setSubmitting(false)
    }
  }

  // Restart flow
  const handleResetFlow = () => {
    setCompletedPayment(null)
    setSelectedPolicy(null)
    setSelectedCustomer(null)
    setCustomerWarning('')
    if (isSuperAdmin) {
      setSelectedAgent(null)
      setStep(1)
    } else {
      setStep(2)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* View-As Mode Warning */}
      {isViewingAs && (
        <div className="rounded-card border border-amber-500/40 bg-amber-500/10 p-4 text-sm font-medium text-amber-200">
          ⚠️ View As Agent Mode (Read-Only): Payment collection is strictly disabled while impersonating an agent.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-navy-4/50">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">
            RD Monthly Installment Collection
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Collect subsequent monthly recurring deposit installments, generate receipts, and track customer policy progress.
          </p>
        </div>
        <Link
          to="/reports/collections"
          className="btn-dark py-2 px-4 text-xs font-bold uppercase tracking-wider border border-navy-4 hover:border-gold-1/30"
        >
          View Collections Ledger
        </Link>
      </div>

      {/* Progress Steps Header */}
      {!completedPayment && (
        <div className="card p-4 bg-navy-3 border border-navy-4">
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            {[
              { num: 1, label: '1. Identify Agent' },
              { num: 2, label: '2. Identify Customer' },
              { num: 3, label: '3. Select RD Policy' },
              { num: 4, label: '4. Installment Details' },
              { num: 5, label: '5. Confirm Payment' }
            ].map((s, idx) => (
              <div key={s.num} className="flex items-center gap-2 flex-1 min-w-[140px]">
                <button
                  type="button"
                  disabled={step < s.num}
                  onClick={() => s.num < step && setStep(s.num)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    step > s.num
                      ? 'bg-emerald-500 text-navy-1 cursor-pointer hover:opacity-80'
                      : step === s.num
                      ? 'bg-gold-1 text-navy-1 ring-2 ring-gold/40'
                      : 'bg-navy-2 text-ink-2 cursor-not-allowed'
                  }`}
                >
                  {step > s.num ? '✓' : s.num}
                </button>
                <span
                  className={`text-xs font-semibold whitespace-nowrap ${
                    step >= s.num ? 'text-ink-1' : 'text-ink-2'
                  }`}
                >
                  {s.label}
                </span>
                {idx < 4 && <span className="h-px flex-1 bg-navy-4 min-w-[12px]" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUCCESS SCREEN: Payment Recorded & Receipt Ready ───────────────── */}
      {completedPayment && (
        <div className="card p-6 bg-navy-3 border border-gold-1/40 space-y-6 shadow-2xl animate-fade-in">
          <div className="flex items-center gap-4 border-b border-navy-4 pb-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <ICheck size={24} />
            </span>
            <div>
              <h3 className="font-serif text-xl font-bold text-ink-1">
                Installment Payment Successfully Recorded!
              </h3>
              <p className="text-xs text-ink-2 font-mono">
                Receipt Number: <strong className="text-gold-1">{completedPayment.receiptNumber}</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded bg-navy-2 border border-navy-4 space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gold-tan block">
                Policy & Installment Summary
              </span>
              <div className="flex justify-between border-b border-navy-4/50 pb-1">
                <span className="text-ink-2">Policy Number:</span>
                <span className="font-mono font-bold text-ink-1">{completedPayment.policyNumber}</span>
              </div>
              <div className="flex justify-between border-b border-navy-4/50 pb-1">
                <span className="text-ink-2">Plan Code:</span>
                <span className="font-bold text-ink-1">{completedPayment.planCode}</span>
              </div>
              <div className="flex justify-between border-b border-navy-4/50 pb-1">
                <span className="text-ink-2">Collected Installment:</span>
                <span className="font-bold text-gold-1">#{completedPayment.installmentNumber}</span>
              </div>
              <div className="flex justify-between border-b border-navy-4/50 pb-1">
                <span className="text-ink-2">Installments Remaining:</span>
                <span className="font-bold text-ink-1">{completedPayment.remainingInstallments}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-2">Policy Status:</span>
                <span className={`font-bold uppercase ${completedPayment.isMatured ? 'text-emerald-400' : 'text-blue-400'}`}>
                  {completedPayment.isMatured ? 'Matured (Fully Paid)' : 'Active'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded bg-navy-2 border border-navy-4 space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gold-tan block">
                Financial Transaction Details
              </span>
              <div className="flex justify-between border-b border-navy-4/50 pb-1">
                <span className="text-ink-2">Amount Paid:</span>
                <span className="font-mono font-bold text-gold-1 text-sm">{formatINR(completedPayment.amount)}</span>
              </div>
              <div className="flex justify-between border-b border-navy-4/50 pb-1">
                <span className="text-ink-2">Cumulative Total Paid:</span>
                <span className="font-mono font-bold text-ink-1">{formatINR(completedPayment.totalPaid)}</span>
              </div>
              <div className="flex justify-between border-b border-navy-4/50 pb-1">
                <span className="text-ink-2">Payment Mode:</span>
                <span className="font-bold uppercase text-ink-1">{completedPayment.paymentMode}</span>
              </div>
              <div className="flex justify-between border-b border-navy-4/50 pb-1">
                <span className="text-ink-2">Payment Date:</span>
                <span className="font-mono text-ink-1">{fmtDate(completedPayment.paidDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-2">Customer:</span>
                <span className="font-semibold text-ink-1">{completedPayment.customerName} ({completedPayment.customerId})</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-navy-4">
            <button
              type="button"
              onClick={handleResetFlow}
              className="btn-dark py-2 px-4 text-xs font-bold"
            >
              Collect Another Installment
            </button>
            <div className="flex gap-2">
              <Link
                to={`/payments/${completedPayment.paymentId}/receipt`}
                className="btn-gold py-2 px-5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                <IPrint size={14} /> View & Print Receipt
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 1: IDENTIFY AGENT ────────────────────────────────────────── */}
      {!completedPayment && step === 1 && (
        <div className="card p-6 bg-navy-3 border border-navy-4 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-navy-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-ink-1">Step 1 — Identify Servicing Agent</h3>
              <p className="text-xs text-ink-2">
                Enter the Agent ID, sponsor code, or agent name to validate the agent servicing this RD collection.
              </p>
            </div>
            {selectedAgent && (
              <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                Agent Verified
              </span>
            )}
          </div>

          {selectedAgent ? (
            <div className="p-4 rounded bg-navy-2 border border-gold-1/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-navy-4 flex items-center justify-center font-bold text-gold-1 text-sm">
                  {selectedAgent.name?.charAt(0) || 'A'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink-1 text-sm">{selectedAgent.name}</span>
                    <RankBadge rank={selectedAgent.rank || 1} size="sm" showName />
                  </div>
                  <div className="flex gap-3 text-xs text-ink-2 font-mono mt-0.5">
                    <span>Sponsor Code: <strong className="text-gold-1">{selectedAgent.sponsorCode || '—'}</strong></span>
                    <span>•</span>
                    <span>ID: {selectedAgent.id}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedAgent(null); setAgentSearch(''); }}
                className="text-xs text-ink-2 hover:text-gold underline"
              >
                Change Agent
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <label className="label">Search Agent ID / Sponsor Code / Name *</label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    className="field text-xs pl-8 font-mono"
                    placeholder="Enter Agent ID (UUID), Sponsor Code (e.g. AG001, KW1001), or Name..."
                    value={agentSearch}
                    onChange={e => {
                      setAgentSearch(e.target.value)
                      setAgentError('')
                    }}
                  />
                  <ISearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
                </div>
              </div>

              {agentSearch.trim() && (
                <div className="card overflow-hidden bg-navy-2 border border-navy-4 max-h-56 overflow-y-auto divide-y divide-navy-4/50">
                  {filteredAgents.length > 0 ? (
                    filteredAgents.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleSelectAgent(a)}
                        className="w-full text-left p-3 hover:bg-navy-4/60 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink-1 text-xs">{a.name}</span>
                            <RankBadge rank={a.rank || 1} size="sm" />
                          </div>
                          <span className="text-[11px] text-ink-2 font-mono">
                            Code: {a.sponsorCode || '—'} · ID: {a.id.slice(0, 10)}... · Phone: {a.phone || '—'}
                          </span>
                        </div>
                        <span className="text-xs text-gold font-bold">Select &rarr;</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-ink-2">
                      No agent found matching &quot;{agentSearch}&quot;. Please verify the Agent ID or Sponsor Code.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedAgent && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-gold py-2 px-5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                Proceed to Customer &rarr;
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: IDENTIFY CUSTOMER ─────────────────────────────────────── */}
      {!completedPayment && step === 2 && (
        <div className="card p-6 bg-navy-3 border border-navy-4 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-navy-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-ink-1">Step 2 — Identify Customer</h3>
              <p className="text-xs text-ink-2">
                Search and select the customer making this installment payment.
              </p>
            </div>
            {selectedAgent && (
              <div className="text-right">
                <span className="text-[10px] text-ink-2 uppercase block">Selected Agent:</span>
                <span className="text-xs font-bold text-gold-1">{selectedAgent.name} ({selectedAgent.sponsorCode || '—'})</span>
              </div>
            )}
          </div>

          {/* Customer Relationship Warning Alert */}
          {customerWarning && (
            <div className="p-3.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
              <IAlert size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <div>
                <strong className="block font-bold">Ownership Validation Notice:</strong>
                <span>{customerWarning}</span>
              </div>
            </div>
          )}

          {selectedCustomer ? (
            <div className="p-4 rounded bg-navy-2 border border-gold-1/30 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink-1 text-sm">{selectedCustomer.name}</span>
                  <span className="text-[10px] bg-ok/10 border border-ok/25 px-2 py-0.5 rounded text-ok font-semibold">
                    CIF Verified
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-ink-2 font-mono mt-1">
                  <span>Customer ID: <strong className="text-gold-1">{selectedCustomer.customerId || '—'}</strong></span>
                  <span>•</span>
                  <span>Mobile: {selectedCustomer.phone || '—'}</span>
                  <span>•</span>
                  <span>Enrolled By: {selectedCustomer.enrolledBy ? selectedCustomer.enrolledBy.slice(0, 10) + '...' : 'Direct'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setCustomerWarning(''); }}
                className="text-xs text-ink-2 hover:text-gold underline"
              >
                Change Customer
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <label className="label">Search Customer ID / CIF / Name / Mobile *</label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    className="field text-xs pl-8 font-mono"
                    placeholder="Enter Customer ID (e.g. CUST001), Client Name, or 10-digit Phone..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                  />
                  <ISearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
                </div>
              </div>

              {customerSearch.trim() && (
                <div className="card overflow-hidden bg-navy-2 border border-navy-4 max-h-56 overflow-y-auto divide-y divide-navy-4/50">
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full text-left p-3 hover:bg-navy-4/60 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink-1 text-xs">{c.name}</span>
                            <span className="text-[10px] text-ink-2 font-mono">({c.customerId || 'No CIF'})</span>
                          </div>
                          <span className="text-[11px] text-ink-2 font-mono">
                            Phone: {c.phone || '—'} · Address: {c.address || '—'}
                          </span>
                        </div>
                        <span className="text-xs text-gold font-bold">Select &rarr;</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-ink-2">
                      No customer found matching &quot;{customerSearch}&quot;.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn-dark py-2 px-4 text-xs font-bold"
            >
              &larr; Back to Agent
            </button>
            {selectedCustomer && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-gold py-2 px-5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                Proceed to RD Policies &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: SELECT EXISTING RD POLICY ─────────────────────────────── */}
      {!completedPayment && step === 3 && (
        <div className="card p-6 bg-navy-3 border border-navy-4 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-navy-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-ink-1">Step 3 — Select RD Policy</h3>
              <p className="text-xs text-ink-2">
                Choose the active RD policy against which the monthly installment will be credited.
              </p>
            </div>
            <div className="text-right text-xs">
              <span className="text-ink-2 block">Customer: <strong className="text-ink-1">{selectedCustomer?.name}</strong></span>
              <span className="text-ink-2 block">Agent: <strong className="text-gold-1">{selectedAgent?.name}</strong></span>
            </div>
          </div>

          {loadingPolicies ? (
            <div className="p-8 text-center space-y-2">
              <div className="h-8 w-8 mx-auto border-2 border-gold border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-ink-2">Loading customer policies from database...</p>
            </div>
          ) : customerRDPolicies.length === 0 ? (
            <EmptyState
              icon={<IDoc size={28} />}
              title="No Active RD Policies Found"
              message={`Customer ${selectedCustomer?.name} does not have any active RD savings policies registered in the system.`}
            />
          ) : (
            <div className="space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-tan block">
                Available RD Policies ({customerRDPolicies.length})
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {customerRDPolicies.map(p => {
                  const paid = Number(p.paidInstallments ?? p.paid_installments ?? 0)
                  const total = Number(p.totalInstallments ?? p.total_installments ?? 1)
                  const remaining = Math.max(0, total - paid)
                  const isFullyPaid = paid >= total || p.status === 'matured'
                  const monthlyAmt = Number(p.monthlyAmount ?? p.monthly_amount ?? 0)

                  return (
                    <div
                      key={p.id}
                      className={`card p-4 transition-all border ${
                        selectedPolicy?.id === p.id
                          ? 'border-gold bg-gold-1/10 ring-2 ring-gold/40'
                          : isFullyPaid
                          ? 'opacity-60 bg-navy-2/40 border-navy-4 cursor-not-allowed'
                          : 'bg-navy-2 border-navy-4 hover:border-gold-1/50'
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
                          <p className="text-xs text-gold-1 font-bold mt-1">
                            Monthly: {formatINR(monthlyAmt)}
                          </p>
                        </div>
                        <StatusBadge status={isFullyPaid ? 'matured' : (p.status || 'active')} />
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono mt-3 pt-2.5 border-t border-navy-4/50">
                        <div>
                          <span className="text-[10px] text-ink-2 block">Total Inst.</span>
                          <span className="font-bold text-ink-1">{total}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-ink-2 block">Paid</span>
                          <span className="font-bold text-emerald-400">{paid}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-ink-2 block">Remaining</span>
                          <span className="font-bold text-amber-400">{remaining}</span>
                        </div>
                      </div>

                      <div className="text-[10px] text-ink-2 space-y-0.5 mt-2.5 pt-2 border-t border-navy-4/50">
                        <div className="flex justify-between">
                          <span>Start Date:</span>
                          <span className="font-mono text-ink-1">{fmtDate(p.startDate || p.start_date)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Next Due Date:</span>
                          <span className="font-mono text-gold-1">{fmtDate(p.nextDueDate || p.next_due_date)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Maturity Date:</span>
                          <span className="font-mono text-ink-1">{fmtDate(p.maturityDate || p.maturity_date)}</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-navy-4 flex justify-end">
                        {isFullyPaid ? (
                          <span className="text-[11px] font-bold text-emerald-400">
                            Policy Fully Paid
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectPolicy(p)}
                            className="btn-gold py-1.5 px-4 text-xs font-bold uppercase tracking-wider"
                          >
                            Collect Installment #{paid + 1} &rarr;
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="btn-dark py-2 px-4 text-xs font-bold"
            >
              &larr; Back to Customer
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: ENTER INSTALLMENT DETAILS ─────────────────────────────── */}
      {!completedPayment && step === 4 && selectedPolicy && (
        <form onSubmit={handleProceedToConfirm} className="card p-6 bg-navy-3 border border-navy-4 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-navy-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-ink-1">Step 4 — Enter Installment Details</h3>
              <p className="text-xs text-ink-2">
                Verify auto-populated contract fields and enter the payment particulars.
              </p>
            </div>
            <span className="text-xs font-bold text-gold-1 bg-navy-2 px-3 py-1 rounded border border-navy-4">
              Collecting Installment #{nextInstallmentNumber} of {totalInstallmentsCount}
            </span>
          </div>

          {/* Auto-populated Context Card */}
          <div className="p-4 rounded bg-navy-2 border border-navy-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-ink-2 uppercase block">Customer</span>
              <span className="font-semibold text-ink-1">{selectedCustomer?.name}</span>
              <span className="block text-[10px] text-ink-2 font-mono">ID: {selectedCustomer?.customerId}</span>
            </div>
            <div>
              <span className="text-[10px] text-ink-2 uppercase block">Servicing Agent</span>
              <span className="font-semibold text-ink-1">{selectedAgent?.name}</span>
              <span className="block text-[10px] text-ink-2 font-mono">Code: {selectedAgent?.sponsorCode}</span>
            </div>
            <div>
              <span className="text-[10px] text-ink-2 uppercase block">Policy / Plan</span>
              <span className="font-mono font-bold text-gold-1">{selectedPolicy.policyNumber}</span>
              <span className="block text-[10px] text-ink-2">{selectedPolicy.planCode || selectedPolicy.type}</span>
            </div>
            <div>
              <span className="text-[10px] text-ink-2 uppercase block">Installment Progress</span>
              <span className="font-mono font-bold text-emerald-400">
                Installment #{nextInstallmentNumber}
              </span>
              <span className="block text-[10px] text-ink-2 font-mono">
                {remainingAfterPayment} remaining after this
              </span>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount */}
            <div>
              <label className="label">Monthly Installment Amount (₹) *</label>
              <input
                type="number"
                step="any"
                className={`field text-xs font-mono font-bold ${formErrors.amount ? 'border-red-400' : ''}`}
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
              {formErrors.amount && <p className="err text-xs mt-1 text-red-400">{formErrors.amount}</p>}
              <span className="text-[10px] text-ink-2 mt-0.5 block">
                Standard monthly installment: {formatINR(selectedPolicy.monthlyAmount || selectedPolicy.monthly_amount || 0)}
              </span>
            </div>

            {/* Payment Date */}
            <div>
              <label className="label">Payment Date *</label>
              <input
                type="date"
                className={`field text-xs ${formErrors.paidDate ? 'border-red-400' : ''}`}
                value={paidDate}
                onChange={e => setPaidDate(e.target.value)}
              />
              {formErrors.paidDate && <p className="err text-xs mt-1 text-red-400">{formErrors.paidDate}</p>}
            </div>

            {/* Payment Mode */}
            <div className="sm:col-span-2">
              <label className="label">Payment Mode *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'cash', label: 'Cash' },
                  { id: 'upi', label: 'UPI / QR' },
                  { id: 'bank_transfer', label: 'Bank Transfer' },
                  { id: 'cheque', label: 'Cheque' }
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMode(m.id)}
                    className={`p-2.5 rounded text-xs font-semibold capitalize border transition-all ${
                      paymentMode === m.id
                        ? 'border-gold bg-gold-1/10 text-gold-1 font-bold'
                        : 'border-navy-4 bg-navy-2 text-ink-2 hover:text-ink-1'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode-specific Fields */}
            {(paymentMode === 'upi' || paymentMode === 'bank_transfer') && (
              <div className="sm:col-span-2">
                <label className="label">Transaction Reference Number / UTR *</label>
                <input
                  type="text"
                  className={`field text-xs font-mono ${formErrors.transactionRef ? 'border-red-400' : ''}`}
                  placeholder="e.g. UPI/1234567890 or NEFT-AXIS-99238"
                  value={transactionRef}
                  onChange={e => setTransactionRef(e.target.value)}
                />
                {formErrors.transactionRef && (
                  <p className="err text-xs mt-1 text-red-400">{formErrors.transactionRef}</p>
                )}
              </div>
            )}

            {paymentMode === 'cheque' && (
              <>
                <div>
                  <label className="label">Cheque Number *</label>
                  <input
                    type="text"
                    className={`field text-xs font-mono ${formErrors.chequeNumber ? 'border-red-400' : ''}`}
                    placeholder="e.g. 000124"
                    value={chequeNumber}
                    onChange={e => setChequeNumber(e.target.value)}
                  />
                  {formErrors.chequeNumber && (
                    <p className="err text-xs mt-1 text-red-400">{formErrors.chequeNumber}</p>
                  )}
                </div>
                <div>
                  <label className="label">Bank & Branch *</label>
                  <input
                    type="text"
                    className={`field text-xs ${formErrors.bankName ? 'border-red-400' : ''}`}
                    placeholder="e.g. State Bank of India, Main Branch"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                  />
                  {formErrors.bankName && (
                    <p className="err text-xs mt-1 text-red-400">{formErrors.bankName}</p>
                  )}
                </div>
              </>
            )}

            {/* Remarks / Notes */}
            <div className="sm:col-span-2">
              <label className="label">Remarks / Collection Notes (Optional)</label>
              <input
                type="text"
                className="field text-xs"
                placeholder="Optional notes or remarks regarding this installment collection..."
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-navy-4">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="btn-dark py-2 px-4 text-xs font-bold"
            >
              &larr; Back to Policies
            </button>
            <button
              type="submit"
              className="btn-gold py-2 px-6 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              Review Payment &rarr;
            </button>
          </div>
        </form>
      )}

      {/* ── STEP 5: PAYMENT CONFIRMATION SUMMARY ──────────────────────────── */}
      {!completedPayment && step === 5 && selectedPolicy && (
        <div className="card p-6 bg-navy-3 border border-gold-1/30 space-y-6 animate-fade-in shadow-xl">
          <div className="border-b border-navy-4 pb-3">
            <h3 className="font-serif text-lg font-bold text-gold">Step 5 — Payment Confirmation Summary</h3>
            <p className="text-xs text-ink-2">
              Please carefully review the RD installment details before confirming. Once submitted, the policy progress and receipt will be created immediately.
            </p>
          </div>

          {/* Structured Confirmation Table */}
          <div className="card overflow-hidden bg-navy-2 border border-navy-4">
            <table className="tbl text-xs">
              <tbody>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold w-1/3">Customer Name:</td>
                  <td className="text-ink-1 font-bold">{selectedCustomer?.name}</td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Customer ID:</td>
                  <td className="font-mono text-gold-1 font-bold">{selectedCustomer?.customerId || '—'}</td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Servicing Agent ID:</td>
                  <td className="font-mono text-ink-1">{selectedAgent?.name} ({selectedAgent?.sponsorCode || selectedAgent?.id})</td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Policy Number:</td>
                  <td className="font-mono font-bold text-gold-1">{selectedPolicy.policyNumber}</td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Plan Code:</td>
                  <td className="text-ink-1 font-semibold">{selectedPolicy.planCode || selectedPolicy.type}</td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Monthly Installment Amount:</td>
                  <td className="font-mono font-bold text-gold-1 text-base">{formatINR(Number(amount))}</td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Previous Installments Paid:</td>
                  <td className="font-mono text-ink-1 font-semibold">{currentPaidCount}</td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Current Installment Being Collected:</td>
                  <td className="font-mono font-bold text-emerald-400 text-sm">
                    Installment #{nextInstallmentNumber}
                  </td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Remaining Installments After Payment:</td>
                  <td className="font-mono text-ink-1 font-semibold">{remainingAfterPayment}</td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Payment Date:</td>
                  <td className="font-mono text-ink-1">{fmtDate(paidDate)}</td>
                </tr>
                <tr className="border-b border-navy-4/50">
                  <td className="text-ink-2 font-semibold">Payment Mode:</td>
                  <td className="font-bold uppercase text-ink-1">{paymentMode}</td>
                </tr>
                {transactionRef && (
                  <tr className="border-b border-navy-4/50">
                    <td className="text-ink-2 font-semibold">Transaction / Ref #:</td>
                    <td className="font-mono text-ink-1">{transactionRef}</td>
                  </tr>
                )}
                {chequeNumber && (
                  <tr className="border-b border-navy-4/50">
                    <td className="text-ink-2 font-semibold">Cheque Details:</td>
                    <td className="font-mono text-ink-1">{chequeNumber} · {bankName}</td>
                  </tr>
                )}
                {remarks && (
                  <tr>
                    <td className="text-ink-2 font-semibold">Remarks:</td>
                    <td className="text-ink-1 italic">{remarks}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-navy-4">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setStep(4)}
              className="btn-dark py-2 px-4 text-xs font-bold"
            >
              &larr; Back to Edit Details
            </button>
            <button
              type="button"
              disabled={submitting || isViewingAs}
              onClick={handleConfirmPayment}
              className="btn-gold py-2.5 px-6 text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              <ICheck size={16} />
              {submitting ? 'Recording Installment Transaction...' : 'Confirm & Save Payment'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
