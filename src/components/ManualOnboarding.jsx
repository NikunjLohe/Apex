import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useRanks } from '../contexts/RanksContext'
import { masterDataAPI, customersAPI, policiesAPI, paymentsAPI, profilesAPI, auditAPI } from '../lib/supabase'
import { computePlan } from '../lib/calc'
import { generateAccountNumber, generatePlanAccountNumber } from '../lib/ids'
import { formatINR, fmtDate } from '../utils/format'
import { ISearch, IPlus, ICheck, IDoc, ICash, IUsers, IShield } from './ui/icons'

export default function ManualOnboarding({ onComplete }) {
  const { profile, isSuperAdmin } = useAuth()
  const { config: ranksConfig, ranksList } = useRanks()

  // Master dependencies
  const [plansMaster, setPlansMaster] = useState([])
  const [agentsList, setAgentsList] = useState([])
  const [existingCustomers, setExistingCustomers] = useState([])
  const [loadingInitial, setLoadingInitial] = useState(true)

  // Customer selection mode: 'new' | 'existing'
  const [customerMode, setCustomerMode] = useState('new')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // New Customer Form Fields
  const [newCustomer, setNewCustomer] = useState({
    customerId: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    aadhaar: '',
    pan: '',
  })

  // Selected Agent (who closed this business)
  const [agentSearch, setAgentSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState(null)

  // Plan & Financial Fields
  const [planCode, setPlanCode] = useState('RD1Y')
  const [monthlyAmount, setMonthlyAmount] = useState(1000)
  const [fdAmount, setFdAmount] = useState(10000)
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [paymentMode, setPaymentMode] = useState('cash')
  const [transactionRef, setTransactionRef] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [successResult, setSuccessResult] = useState(null)

  // Load plans, agents, and customers
  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        const [plans, agents, customers] = await Promise.all([
          masterDataAPI.getPlansMaster().catch(() => []),
          profilesAPI.listProfiles().catch(() => []),
          customersAPI.listCustomers().catch(() => []),
        ])

        if (!mounted) return
        setPlansMaster(plans || [])
        setAgentsList(agents || [])
        setExistingCustomers(customers || [])

        // Default selected agent
        if (profile?.id) {
          const self = (agents || []).find(a => a.id === profile.id)
          if (self) setSelectedAgent(self)
        }
      } catch (err) {
        console.error('[ManualOnboarding] Load error:', err)
      } finally {
        if (mounted) setLoadingInitial(false)
      }
    }
    loadData()
    return () => { mounted = false }
  }, [profile?.id])

  // Selected Plan Object
  const selectedPlanObj = useMemo(() => {
    return plansMaster.find(p => p.code === planCode) || null
  }, [plansMaster, planCode])

  const isRDPlan = Boolean(
    planCode.toUpperCase().startsWith('RD') || selectedPlanObj?.type === 'RD'
  )

  // Compute live plan preview
  const preview = useMemo(() => {
    try {
      const match = planCode.toUpperCase().match(/^PENS([1-5])Y$/)
      const yr = match ? Number(match[1]) : (selectedPlanObj?.duration || (planCode.match(/\d+/) ? Number(planCode.match(/\d+/)[0]) : 1))

      return computePlan({
        type: planCode,
        monthlyAmount: isRDPlan ? Number(monthlyAmount) || 0 : 0,
        fdAmount: !isRDPlan ? Number(fdAmount) || 0 : 0,
        startDate: startDate ? new Date(startDate) : new Date(),
        ranksConfig,
        policyYear: yr,
      })
    } catch {
      return null
    }
  }, [planCode, isRDPlan, monthlyAmount, fdAmount, startDate, selectedPlanObj, ranksConfig])

  // Filtered existing customers for autocomplete
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return []
    return existingCustomers
      .filter(c => (
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.customerId?.toLowerCase().includes(q)
      ))
      .slice(0, 8)
  }, [existingCustomers, customerSearch])

  // Filtered agents for autocomplete
  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase()
    if (!q) return agentsList.slice(0, 10)
    return agentsList
      .filter(a => (
        a.name?.toLowerCase().includes(q) ||
        a.sponsorCode?.toLowerCase().includes(q) ||
        a.phone?.includes(q)
      ))
      .slice(0, 10)
  }, [agentsList, agentSearch])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return

    // 1. Validation
    if (customerMode === 'existing') {
      if (!selectedCustomer) {
        toast.error('Please search and select an existing customer.')
        return
      }
    } else {
      if (newCustomer.customerId?.trim()) {
        const manualCustId = newCustomer.customerId.trim().toUpperCase()
        const localDup = existingCustomers.find(c => 
          c.customerId?.toUpperCase() === manualCustId || c.accountNumber?.toUpperCase() === manualCustId
        )
        if (localDup) {
          toast.error(`Customer ID "${manualCustId}" is already registered. Please enter a unique Customer ID.`)
          return
        }
      }
      if (!newCustomer.name?.trim()) {
        toast.error('Customer name is required.')
        return
      }
      if (!newCustomer.phone || newCustomer.phone.replace(/\D/g, '').length < 10) {
        toast.error('Valid 10-digit mobile number is required.')
        return
      }
      if (!newCustomer.address?.trim()) {
        toast.error('Customer address is required.')
        return
      }
    }

    if (!selectedAgent) {
      toast.error('Please assign the selling agent for this business.')
      return
    }

    const baseAmount = isRDPlan ? Number(monthlyAmount) : Number(fdAmount)
    if (!baseAmount || baseAmount <= 0) {
      toast.error('Please enter a valid deposit amount.')
      return
    }

    if (isRDPlan && baseAmount < 500) {
      toast.error('Minimum monthly RD amount is ₹500.')
      return
    }

    if (!isRDPlan && baseAmount < 5000) {
      toast.error('Minimum lump-sum deposit amount is ₹5,000.')
      return
    }

    setSubmitting(true)
    const toastId = toast.loading('Onboarding business & generating ledger records...')

    try {
      // 2. Resolve or Create Customer
      let targetCustomer = selectedCustomer
      if (customerMode === 'new') {
        let assignedAcc = newCustomer.customerId?.trim()?.toUpperCase()
        if (assignedAcc) {
          const { supabase } = await import('../lib/supabase/client')
          const { data: dbDup } = await supabase
            .from('customers')
            .select('id')
            .eq('customer_id', assignedAcc)
            .maybeSingle()
          if (dbDup) {
            throw new Error(`Customer ID "${assignedAcc}" is already registered. Please choose a unique Customer ID.`)
          }
        } else {
          try {
            assignedAcc = await generateAccountNumber()
          } catch {
            assignedAcc = `APEX-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`
          }
        }

        const fullAddr = [newCustomer.address, newCustomer.city, newCustomer.state, newCustomer.pincode].filter(Boolean).join(', ')

        targetCustomer = await customersAPI.createCustomer({
          customerId: assignedAcc,
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim(),
          email: newCustomer.email?.trim() || null,
          address: fullAddr || newCustomer.address.trim(),
          aadhaar: newCustomer.aadhaar?.trim() || null,
          pan: newCustomer.pan?.trim()?.toUpperCase() || null,
          branchId: selectedAgent.branchId || null,
          enrolledBy: selectedAgent.id,
        })
      }

      // 3. Generate Policy
      let generatedPolicyNo = null
      try {
        generatedPolicyNo = await generatePlanAccountNumber()
      } catch {
        generatedPolicyNo = `APEX-PLN-${Date.now().toString().slice(-5)}`
      }

      const match = planCode.toUpperCase().match(/^PENS([1-5])Y$/)
      const policyYear = match ? Number(match[1]) : (preview?.years || 1)
      const derivedPlanType = isRDPlan ? 'RD' : (match ? 'PENS' : 'FD')

      const policyPayload = {
        policyNumber: generatedPolicyNo,
        customerId: targetCustomer.id,
        agentId: selectedAgent.id,
        planCode: planCode.toUpperCase(),
        planType: derivedPlanType,
        policyYear,
        installmentAmount: preview?.monthlyAmount || (isRDPlan ? baseAmount : 0),
        fdAmount: preview?.fdAmount || (!isRDPlan ? baseAmount : 0),
        totalInstallments: preview?.totalInstallments || (isRDPlan ? policyYear * 12 : 1),
        paidInstallments: 0,
        totalPaid: 0,
        status: 'active',
        startDate: new Date(startDate).toISOString(),
        maturityDate: preview?.maturityDate ? new Date(preview.maturityDate).toISOString() : null,
        nextDueDate: new Date(startDate).toISOString(),
      }

      const policy = await policiesAPI.createPolicy(policyPayload)

      // 4. Record Initial Payment (Atomically triggers commission RPC on server)
      const initialAmount = isRDPlan ? Number(monthlyAmount) : Number(fdAmount)
      const payment = await paymentsAPI.recordPayment({
        policyId: policy.id,
        amount: initialAmount,
        paymentMode,
        transactionRef: transactionRef.trim() || 'MANUAL_ONBOARDING',
        paidDate: new Date(startDate).toISOString(),
        notes: paymentNotes.trim() || 'Initial business onboarding payment',
      })

      // 5. Audit Log
      try {
        await auditAPI.logAction('MANUAL_BUSINESS_ONBOARDING', {
          policyNumber: policy.policyNumber,
          customerName: targetCustomer.name,
          agentCode: selectedAgent.sponsorCode,
          amount: initialAmount,
          planCode,
        })
      } catch (err) {
        console.warn('Audit log warning:', err)
      }

      toast.success('Business successfully onboarded!', { id: toastId })

      setSuccessResult({
        customer: targetCustomer,
        policy,
        payment,
        agent: selectedAgent,
        amount: initialAmount,
        planCode,
      })

      if (onComplete) onComplete()
    } catch (err) {
      console.error('[ManualOnboarding] Submission failed:', err)
      toast.error(err.message || 'Failed to onboard business. Please try again.', { id: toastId })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setSuccessResult(null)
    setCustomerMode('new')
    setSelectedCustomer(null)
    setCustomerSearch('')
    setNewCustomer({
      customerId: '',
      name: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      aadhaar: '',
      pan: '',
    })
    setMonthlyAmount(1000)
    setFdAmount(10000)
    setTransactionRef('')
    setPaymentNotes('')
  }

  // --- Success State View ---
  if (successResult) {
    return (
      <div className="card p-6 border-l-4 border-l-emerald-500 bg-navy-2 space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xl">
            ✓
          </span>
          <div>
            <h3 className="text-lg font-bold text-ink-1">Business Onboarded Successfully!</h3>
            <p className="text-xs text-ink-2">
              Policy generated, initial installment recorded, and commissions calculated in ledger.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-navy-3 border border-navy-4 p-4 rounded-card">
          <div>
            <span className="block text-[10px] text-ink-2 font-mono uppercase tracking-wider">Customer</span>
            <span className="text-ink-1 font-bold">{successResult.customer.name}</span>
            <span className="block text-xs font-mono text-gold-1">{successResult.customer.customerId || successResult.customer.accountNumber}</span>
          </div>
          <div>
            <span className="block text-[10px] text-ink-2 font-mono uppercase tracking-wider">Policy Number</span>
            <span className="text-gold-1 font-bold font-mono text-sm">{successResult.policy.policyNumber}</span>
            <span className="block text-xs text-ink-2">{successResult.planCode}</span>
          </div>
          <div>
            <span className="block text-[10px] text-ink-2 font-mono uppercase tracking-wider">Initial Payment</span>
            <span className="text-emerald-400 font-bold font-mono text-sm">{formatINR(successResult.amount)}</span>
            <span className="block text-xs text-ink-2">Receipt: <span className="font-mono text-ink-1">{successResult.payment?.receiptNumber || 'Generated'}</span></span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          {successResult.payment?.id && (
            <Link
              to={`/payments/${successResult.payment.id}/receipt`}
              className="btn-gold py-2 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              <IDoc size={14} /> View / Print Receipt
            </Link>
          )}
          <Link
            to={`/admin/policies/${successResult.policy.id}`}
            className="btn-ghost border border-navy-4 hover:border-gold-1/30 py-2 px-4 text-xs font-bold uppercase tracking-wider"
          >
            View Policy Record
          </Link>
          <button
            type="button"
            onClick={handleReset}
            className="btn-primary py-2 px-4 text-xs font-bold uppercase tracking-wider ml-auto"
          >
            + Onboard Another Business
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── SECTION 1: CUSTOMER SELECTION ────────────────────────────────────────── */}
      <div className="card p-5 space-y-4 border border-navy-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-4/50 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-1/20 text-gold-1 text-xs font-bold">1</span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink-1">Customer Information</h3>
          </div>
          <div className="flex rounded bg-navy-1 p-0.5 border border-navy-4 text-xs font-medium">
            <button
              type="button"
              onClick={() => { setCustomerMode('new'); setSelectedCustomer(null) }}
              className={`px-3 py-1 rounded transition-all ${customerMode === 'new' ? 'bg-gold-1 text-navy-1 font-bold' : 'text-ink-2 hover:text-ink-1'}`}
            >
              + New Customer
            </button>
            <button
              type="button"
              onClick={() => setCustomerMode('existing')}
              className={`px-3 py-1 rounded transition-all ${customerMode === 'existing' ? 'bg-gold-1 text-navy-1 font-bold' : 'text-ink-2 hover:text-ink-1'}`}
            >
              Existing Customer
            </button>
          </div>
        </div>

        {customerMode === 'existing' ? (
          <div className="space-y-3">
            <div className="relative">
              <ISearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by customer name, phone, or account number..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="field pl-9 w-full text-xs"
              />
            </div>

            {selectedCustomer ? (
              <div className="card p-3 bg-navy-3 border-l-2 border-l-emerald-500 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-ink-1 text-sm">{selectedCustomer.name}</span>
                  <span className="font-mono text-gold-1 ml-2">({selectedCustomer.customerId || selectedCustomer.accountNumber})</span>
                  <p className="text-ink-2 text-[11px] mt-0.5">Phone: {selectedCustomer.phone} · Address: {selectedCustomer.address || '—'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="text-ink-2 hover:text-danger text-xs font-semibold"
                >
                  Change
                </button>
              </div>
            ) : filteredCustomers.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-1 border border-navy-4/60 rounded p-1 bg-navy-2">
                {filteredCustomers.map(c => (
                  <div
                    key={c.id}
                    onClick={() => { setSelectedCustomer(c); setCustomerSearch('') }}
                    className="p-2 hover:bg-navy-3 rounded cursor-pointer flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <span className="font-bold text-ink-1">{c.name}</span>
                      <span className="font-mono text-gold-1 ml-2 text-[11px]">{c.customerId || c.accountNumber}</span>
                      <span className="text-ink-2 ml-2">· {c.phone}</span>
                    </div>
                    <span className="text-[10px] text-ink-2 uppercase font-mono">Select</span>
                  </div>
                ))}
              </div>
            ) : customerSearch.trim() ? (
              <p className="text-xs text-ink-2 italic">No customers found matching &quot;{customerSearch}&quot;.</p>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Customer ID</label>
              <input
                type="text"
                placeholder="e.g. CUST00123 (or leave blank to auto-generate)"
                value={newCustomer.customerId}
                onChange={e => setNewCustomer({ ...newCustomer, customerId: e.target.value })}
                className="field w-full font-mono uppercase"
              />
              <p className="text-[10px] text-ink-2 mt-0.5">Enter custom Customer ID or leave blank to auto-generate</p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Full Name *</label>
              <input
                type="text"
                placeholder="e.g. Ramesh Kumar"
                value={newCustomer.name}
                onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                className="field w-full"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">10-Digit Mobile *</label>
              <input
                type="tel"
                placeholder="9876543210"
                maxLength={10}
                value={newCustomer.phone}
                onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value.replace(/\D/g, '') })}
                className="field w-full font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Email Address (Optional)</label>
              <input
                type="email"
                placeholder="customer@example.com"
                value={newCustomer.email}
                onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
                className="field w-full"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Street Address *</label>
              <input
                type="text"
                placeholder="House No, Ward, Village / Colony"
                value={newCustomer.address}
                onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })}
                className="field w-full"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">City / District</label>
              <input
                type="text"
                placeholder="City"
                value={newCustomer.city}
                onChange={e => setNewCustomer({ ...newCustomer, city: e.target.value })}
                className="field w-full"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">State</label>
              <input
                type="text"
                placeholder="State"
                value={newCustomer.state}
                onChange={e => setNewCustomer({ ...newCustomer, state: e.target.value })}
                className="field w-full"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Pincode</label>
              <input
                type="text"
                placeholder="400001"
                maxLength={6}
                value={newCustomer.pincode}
                onChange={e => setNewCustomer({ ...newCustomer, pincode: e.target.value.replace(/\D/g, '') })}
                className="field w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Aadhaar / ID (Optional)</label>
              <input
                type="text"
                placeholder="12-digit Aadhaar"
                maxLength={12}
                value={newCustomer.aadhaar}
                onChange={e => setNewCustomer({ ...newCustomer, aadhaar: e.target.value.replace(/\D/g, '') })}
                className="field w-full font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: SELLING AGENT ASSIGNMENT ───────────────────────────────────── */}
      <div className="card p-5 space-y-4 border border-navy-4">
        <div className="flex items-center gap-2 border-b border-navy-4/50 pb-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-1/20 text-gold-1 text-xs font-bold">2</span>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink-1">Selling Agent Credit</h3>
        </div>

        {selectedAgent ? (
          <div className="card p-3.5 bg-navy-3 border-l-2 border-l-gold-1 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-4 text-gold-1 font-bold font-mono text-xs">
                {selectedAgent.sponsorCode?.substring(0, 2) || 'AG'}
              </span>
              <div>
                <span className="font-bold text-ink-1 text-sm">{selectedAgent.name}</span>
                <span className="font-mono text-gold-1 ml-2 font-bold">{selectedAgent.sponsorCode}</span>
                <p className="text-ink-2 text-[11px] mt-0.5">Rank {selectedAgent.rank || 1} · Phone: {selectedAgent.phone || '—'}</p>
              </div>
            </div>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="text-ink-2 hover:text-gold-1 text-xs font-semibold"
              >
                Change Agent
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <ISearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search agent by code or name..."
                value={agentSearch}
                onChange={e => setAgentSearch(e.target.value)}
                className="field pl-9 w-full text-xs"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 border border-navy-4/60 rounded p-1 bg-navy-2">
              {filteredAgents.map(a => (
                <div
                  key={a.id}
                  onClick={() => { setSelectedAgent(a); setAgentSearch('') }}
                  className="p-2 hover:bg-navy-3 rounded cursor-pointer flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-ink-1">{a.name}</span>
                    <span className="font-mono text-gold-1 ml-2 font-bold">{a.sponsorCode}</span>
                    <span className="text-ink-2 ml-2">Rank {a.rank}</span>
                  </div>
                  <span className="text-[10px] text-ink-2 uppercase font-mono">Select</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 3: PLAN SELECTION & TERMS ────────────────────────────────────── */}
      <div className="card p-5 space-y-4 border border-navy-4">
        <div className="flex items-center gap-2 border-b border-navy-4/50 pb-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-1/20 text-gold-1 text-xs font-bold">3</span>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink-1">Plan Specification & Maturity</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">Plan / Product *</label>
            <select
              value={planCode}
              onChange={e => setPlanCode(e.target.value)}
              className="field w-full font-mono text-xs font-semibold"
            >
              <optgroup label="Recurring Deposit (RD)">
                <option value="RD1Y">RD 1 Year (RD1Y)</option>
                <option value="RD2Y">RD 2 Years (RD2Y)</option>
                <option value="RD3Y">RD 3 Years (RD3Y)</option>
                <option value="RD4Y">RD 4 Years (RD4Y)</option>
                <option value="RD5Y">RD 5 Years (RD5Y)</option>
              </optgroup>
              <optgroup label="Fixed Deposit (FD)">
                <option value="FD1Y">FD 1 Year (FD1Y)</option>
                <option value="FD2Y">FD 2 Years (FD2Y)</option>
                <option value="FD3Y">FD 3 Years (FD3Y)</option>
                <option value="FD4Y">FD 4 Years (FD4Y)</option>
                <option value="FD5Y">FD 5 Years (FD5Y)</option>
              </optgroup>
              <optgroup label="Pension Plans">
                <option value="PENS1Y">Pension 1 Year (PENS1Y)</option>
                <option value="PENS2Y">Pension 2 Years (PENS2Y)</option>
                <option value="PENS3Y">Pension 3 Years (PENS3Y)</option>
                <option value="PENS4Y">Pension 4 Years (PENS4Y)</option>
                <option value="PENS5Y">Pension 5 Years (PENS5Y)</option>
              </optgroup>
            </select>
          </div>

          {isRDPlan ? (
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Monthly Installment (₹) *</label>
              <input
                type="number"
                min={500}
                step={100}
                value={monthlyAmount}
                onChange={e => setMonthlyAmount(Number(e.target.value))}
                className="field w-full font-mono font-bold text-gold-1"
                required
              />
              <span className="text-[10px] text-ink-2">Minimum ₹500/month</span>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Lump Sum Deposit (₹) *</label>
              <input
                type="number"
                min={5000}
                step={500}
                value={fdAmount}
                onChange={e => setFdAmount(Number(e.target.value))}
                className="field w-full font-mono font-bold text-gold-1"
                required
              />
              <span className="text-[10px] text-ink-2">Minimum ₹5,000</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">Policy Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="field w-full font-mono"
              required
            />
          </div>
        </div>

        {/* Live Calculation Summary Banner */}
        {preview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-navy-3 border border-navy-4 p-3.5 rounded text-xs">
            <div>
              <span className="block text-[10px] text-ink-2 font-mono uppercase">Tenure</span>
              <span className="font-bold text-ink-1">{preview.years} {preview.years === 1 ? 'Year' : 'Years'} ({preview.totalInstallments} inst)</span>
            </div>
            <div>
              <span className="block text-[10px] text-ink-2 font-mono uppercase">Interest Rate</span>
              <span className="font-bold text-gold-1 font-mono">{preview.ratePct?.toFixed(2)}% p.a.</span>
            </div>
            <div>
              <span className="block text-[10px] text-ink-2 font-mono uppercase">Maturity Date</span>
              <span className="font-bold text-ink-1 font-mono">{fmtDate(preview.maturityDate)}</span>
            </div>
            <div>
              <span className="block text-[10px] text-ink-2 font-mono uppercase">Projected Maturity</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">{formatINR(preview.maturityAmount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 4: INITIAL PAYMENT & RECEIPT ──────────────────────────────────── */}
      <div className="card p-5 space-y-4 border border-navy-4">
        <div className="flex items-center gap-2 border-b border-navy-4/50 pb-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-1/20 text-gold-1 text-xs font-bold">4</span>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink-1">Initial Collection & Receipt</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">Payment Mode *</label>
            <select
              value={paymentMode}
              onChange={e => setPaymentMode(e.target.value)}
              className="field w-full font-semibold"
            >
              <option value="cash">Cash Collection</option>
              <option value="upi">UPI / QR Transfer</option>
              <option value="bank_transfer">Bank Transfer / NEFT</option>
              <option value="cheque">Cheque Deposit</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">Transaction Ref / Cheque No.</label>
            <input
              type="text"
              placeholder={paymentMode === 'cheque' ? 'Cheque No.' : 'UPI Ref / UTR No.'}
              value={transactionRef}
              onChange={e => setTransactionRef(e.target.value)}
              className="field w-full font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">Amount to Collect (₹)</label>
            <input
              type="text"
              readOnly
              value={formatINR(isRDPlan ? monthlyAmount : fdAmount)}
              className="field w-full font-mono font-bold bg-navy-3 cursor-not-allowed text-emerald-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-ink-2 mb-1">Internal Ledger Note (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Onboarded at counter"
            value={paymentNotes}
            onChange={e => setPaymentNotes(e.target.value)}
            className="field w-full text-xs"
          />
        </div>
      </div>

      {/* Submit Action */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="btn-gold py-3 px-8 text-xs uppercase tracking-wider font-bold shadow-lg flex items-center gap-2 cursor-pointer"
        >
          {submitting ? (
            <span>Processing Onboarding...</span>
          ) : (
            <>
              <ICheck size={16} />
              <span>Submit &amp; Onboard Business</span>
            </>
          )}
        </button>
      </div>
    </form>
  )
}
