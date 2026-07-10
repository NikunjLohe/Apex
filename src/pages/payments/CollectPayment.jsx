import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { where } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useFirestore'
import { paymentSchema } from '../../lib/schemas'
import { recordPayment } from '../../lib/payments'
import { isRD } from '../../data/compensation'
import { formatINR, fmtDate, toDate, daysBetween } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { ISearch, ICash, ICheck } from '../../components/ui/icons'

export default function CollectPayment() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const customers = useCollection('customers')

  const [customer, setCustomer] = useState(null)
  const [plan, setPlan] = useState(null)
  const [search, setSearch] = useState('')

  // Preselect customer from query (?customer=id)
  useEffect(() => {
    const cid = params.get('customer')
    if (cid && !customer) {
      const c = customers.data.find((x) => x.id === cid)
      if (c) setCustomer(c)
    }
  }, [params, customers.data, customer])

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return customers.data
      .filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.accountNumber?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [search, customers.data])

  const step = !customer ? 1 : !plan ? 2 : 3

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Steps step={step} />

      {/* Step 1 — find customer */}
      {step === 1 && (
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-ink-1">Find Customer</h3>
          <div className="relative">
            <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or account number…" className="field pl-10" />
          </div>
          {search && (
            <div className="mt-3 divide-y divide-navy-4/60 overflow-hidden rounded-card border border-navy-4">
              {matches.length ? matches.map((c) => (
                <button key={c.id} type="button" onClick={() => setCustomer(c)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-navy-2">
                  <span>
                    <span className="block font-medium text-ink-1">{c.name}</span>
                    <span className="block text-xs text-ink-2">{c.phone} · {c.accountNumber}</span>
                  </span>
                  <StatusBadge status={c.kycStatus || 'pending'} />
                </button>
              )) : <p className="px-4 py-6 text-center text-sm text-ink-2">No matching customers.</p>}
            </div>
          )}
        </div>
      )}

      {/* Step 2 — select plan */}
      {step === 2 && (
        <PlanPicker customer={customer} onBack={() => setCustomer(null)} onSelect={setPlan} />
      )}

      {/* Step 3 — payment details */}
      {step === 3 && (
        <PaymentForm
          customer={customer}
          plan={plan}
          profile={profile}
          onBack={() => setPlan(null)}
          onDone={(paymentId) => navigate(`/payments/${paymentId}/receipt`)}
        />
      )}
    </div>
  )
}

function Steps({ step }) {
  const labels = ['Find Customer', 'Select Plan', 'Payment']
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex flex-1 items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step > i + 1 ? 'bg-ok text-navy-1' : step === i + 1 ? 'bg-gold-1 text-navy-1' : 'bg-navy-3 text-ink-2'}`}>
            {step > i + 1 ? '✓' : i + 1}
          </span>
          <span className={`text-xs font-medium ${step >= i + 1 ? 'text-ink-1' : 'text-ink-2'}`}>{l}</span>
          {i < labels.length - 1 && <span className="h-px flex-1 bg-navy-4" />}
        </div>
      ))}
    </div>
  )
}

function PlanPicker({ customer, onBack, onSelect }) {
  const plans = useCollection('plans', [where('customerId', '==', customer.id), where('status', '==', 'active')], `pay-plans-${customer.id}`)
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink-1">{customer.name}</h3>
          <p className="font-mono text-xs text-gold">{customer.accountNumber}</p>
        </div>
        <button type="button" onClick={onBack} className="text-sm text-ink-2 hover:text-gold">← Change</button>
      </div>
      {plans.loading ? (
        <div className="skeleton h-24 w-full" />
      ) : !plans.data.length ? (
        <EmptyState icon={<ICash size={22} />} title="No active plans" message="This customer has no active plans to collect against." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.data.map((p) => {
            const due = toDate(p.nextDueDate)
            const overdue = due && due < new Date()
            const daysLate = overdue ? daysBetween(new Date(), due) : 0
            
            const isRDPlan = isRD(p.type)
            const isFullyPaid = isRDPlan 
              ? (p.paidInstallments || 0) >= (p.totalInstallments || 1)
              : (p.paidInstallments || 0) >= 1
              
            const fullyPaidMsg = isRDPlan ? 'This policy has been fully paid.' : 'This Fixed Deposit has already been paid.'

            return (
              <button 
                key={p.id} 
                type="button" 
                onClick={() => onSelect(p)} 
                disabled={isFullyPaid}
                className={`card p-4 text-left transition-colors ${isFullyPaid ? 'opacity-60 cursor-not-allowed bg-navy-2/30' : 'hover:border-gold-1/50'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-1">{p.type}</span>
                  <StatusBadge status={isFullyPaid ? 'matured' : overdue ? 'overdue' : 'active'} />
                </div>
                <p className="mt-1 text-sm text-ink-2">{formatINR(p.monthlyAmount || p.fdAmount)} · {p.paidInstallments}/{p.totalInstallments}</p>
                {isFullyPaid ? (
                  <p className="mt-2 text-xs font-medium text-ok">{fullyPaidMsg}</p>
                ) : (
                  <p className={`mt-1 text-xs ${overdue ? 'text-danger' : 'text-ink-2'}`}>
                    Next due {fmtDate(p.nextDueDate)}{overdue ? ` · ${daysLate}d overdue` : ''}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PaymentForm({ customer, plan, profile, onBack, onDone }) {
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, watch, getValues, formState: { errors } } = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: plan.monthlyAmount || plan.fdAmount || 0,
      paymentMode: 'cash',
      paidDate: format(new Date(), 'yyyy-MM-dd'),
    },
  })
  const mode = watch('paymentMode')

  const save = async () => {
    setSubmitting(true)
    const tId = toast.loading('Recording payment…')
    try {
      const { paymentId } = await recordPayment({
        plan,
        customer,
        agent: { uid: profile?.uid, name: profile?.name },
        form: getValues(),
      })
      toast.success('Payment recorded', { id: tId })
      onDone(paymentId)
    } catch (e) {
      toast.error(e.message || 'Could not record payment', { id: tId })
      setSubmitting(false)
    }
  }

  if (confirming) {
    const v = getValues()
    return (
      <div className="card p-5">
        <h3 className="mb-4 font-semibold text-ink-1">Confirm Payment</h3>
        <dl className="space-y-2 text-sm">
          <Row k="Customer" v={`${customer.name} (${customer.accountNumber})`} />
          <Row k="Plan" v={`${plan.type} · ${plan.planAccountNumber}`} />
          <Row k="Installment" v={`${(plan.paidInstallments || 0) + 1} of ${plan.totalInstallments}`} />
          <Row k="Amount" v={formatINR(v.amount)} highlight />
          <Row k="Mode" v={v.paymentMode.toUpperCase()} />
          {v.paymentMode === 'upi' && <Row k="Txn ID" v={v.transactionRef} />}
          {v.paymentMode === 'cheque' && <Row k="Cheque" v={`${v.chequeNumber} · ${v.bankName}`} />}
          <Row k="Date" v={fmtDate(v.paidDate)} />
        </dl>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirming(false)} disabled={submitting} className="btn-ghost">Back</button>
          <button type="button" onClick={save} disabled={submitting} className="btn-gold"><ICheck size={16} /> {submitting ? 'Saving…' : 'Confirm & Save'}</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(() => setConfirming(true))} className="card space-y-4 p-5" noValidate>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink-1">Payment Details</h3>
        <button type="button" onClick={onBack} className="text-sm text-ink-2 hover:text-gold">← Change plan</button>
      </div>

      <div className="rounded-card border border-navy-4 bg-navy-2 p-3 text-sm">
        <span className="text-ink-1">{customer.name}</span> · <span className="text-gold">{plan.type}</span> · Installment {(plan.paidInstallments || 0) + 1}/{plan.totalInstallments}
      </div>

      <div>
        <label className="label">Amount *</label>
        <input type="number" className="field" {...register('amount')} />
        {errors.amount && <p className="err">{errors.amount.message}</p>}
      </div>

      <div>
        <label className="label">Payment Mode *</label>
        <div className="grid grid-cols-3 gap-2">
          {['cash', 'upi', 'cheque'].map((m) => (
            <label key={m} className={`cursor-pointer rounded-card border px-3 py-2.5 text-center text-sm font-semibold capitalize transition-colors ${mode === m ? 'border-gold-1 bg-gold-1/10 text-gold' : 'border-navy-4 text-ink-2'}`}>
              <input type="radio" value={m} className="sr-only" {...register('paymentMode')} />
              {m}
            </label>
          ))}
        </div>
      </div>

      {mode === 'upi' && (
        <div>
          <label className="label">UPI Transaction ID *</label>
          <input className="field" {...register('transactionRef')} />
          {errors.transactionRef && <p className="err">{errors.transactionRef.message}</p>}
        </div>
      )}

      {mode === 'cheque' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Cheque No. *</label><input className="field" {...register('chequeNumber')} />{errors.chequeNumber && <p className="err">{errors.chequeNumber.message}</p>}</div>
          <div><label className="label">Bank *</label><input className="field" {...register('bankName')} />{errors.bankName && <p className="err">{errors.bankName.message}</p>}</div>
          <div><label className="label">Cheque Date</label><input type="date" className="field" {...register('chequeDate')} /></div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Payment Date *</label><input type="date" className="field" {...register('paidDate')} />{errors.paidDate && <p className="err">{errors.paidDate.message}</p>}</div>
        <div><label className="label">Notes</label><input className="field" {...register('notes')} /></div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn-gold">Review Payment →</button>
      </div>
    </form>
  )
}

function Row({ k, v, highlight }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-navy-4/50 pb-2">
      <dt className="text-ink-2">{k}</dt>
      <dd className={highlight ? 'text-lg font-bold text-gold' : 'font-medium text-ink-1'}>{v}</dd>
    </div>
  )
}
