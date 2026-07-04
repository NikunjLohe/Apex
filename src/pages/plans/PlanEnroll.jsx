import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useDoc, useCollection } from '../../hooks/useFirestore'
import { planSchema } from '../../lib/schemas'
import { createPlan } from '../../lib/plans'
import { computePlan } from '../../lib/calc'
import { useRanks } from '../../contexts/RanksContext'
import { isRD } from '../../data/compensation'
import { formatINR, fmtDate } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonForm } from '../../components/ui/LoadingSkeleton'

export default function PlanEnroll() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { config } = useRanks()
  const { data: customer, loading } = useDoc(`customers/${id}`)
  const plansMaster = useCollection('plans_master')
  const [submitting, setSubmitting] = useState(false)

  const activePlans = useMemo(() => {
    return (plansMaster.data || []).filter(p => (p.status || 'active').toLowerCase() !== 'inactive')
  }, [plansMaster.data])

  const defaultPlanCode = useMemo(() => {
    return activePlans[0]?.code || 'RD-3Y'
  }, [activePlans])

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(planSchema),
    defaultValues: { type: defaultPlanCode, startDate: format(new Date(), 'yyyy-MM-dd'), paymentDate: 1 },
  })

  const type = watch('type')
  const monthlyAmount = watch('monthlyAmount')
  const fdAmount = watch('fdAmount')
  const startDate = watch('startDate')

  const selectedPlanObj = useMemo(() => {
    return activePlans.find(p => p.code === type)
  }, [activePlans, type])

  const rd = useMemo(() => {
    if (!selectedPlanObj) return String(type).toUpperCase().startsWith('RD')
    return (selectedPlanObj.type || 'RD').toUpperCase() === 'RD'
  }, [selectedPlanObj, type])

  const preview = useMemo(() => {
    try {
      return computePlan({
        type,
        monthlyAmount: Number(monthlyAmount) || 0,
        fdAmount: Number(fdAmount) || 0,
        startDate: startDate ? new Date(startDate) : new Date(),
        ranksConfig: config,
      })
    } catch {
      return null
    }
  }, [type, monthlyAmount, fdAmount, startDate, config])

  if (loading || plansMaster.loading) return <div className="mx-auto max-w-3xl"><SkeletonForm fields={4} /></div>
  if (!customer) return <EmptyState title="Customer not found" />

  const onSubmit = async (form) => {
    setSubmitting(true)
    const tId = toast.loading('Creating plan…')
    try {
      const selectedPlan = activePlans.find(p => p.code === form.type)
      const enrichedForm = {
        ...form,
        planType: selectedPlan?.type || 'RD'
      }
      const { planAccountNumber } = await createPlan({
        form: enrichedForm,
        customer,
        agent: { uid: profile?.uid, name: profile?.name, branchId: profile?.branchId },
        ranksConfig: config,
      })
      toast.success(`Plan created · ${planAccountNumber}`, { id: tId })
      navigate(`/customers/${id}`)
    } catch (e) {
      toast.error(e.message || 'Could not create plan', { id: tId })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[1fr,320px]">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="card p-5">
          <p className="mb-1 text-sm text-ink-2">Enrolling</p>
          <p className="font-semibold text-ink-1">{customer.name} <span className="font-mono text-xs text-gold">· {customer.accountNumber}</span></p>
        </div>

        <div className="card space-y-4 p-5">
          <div>
            <label className="label">Plan Type *</label>
            <select className="field text-xs" {...register('type')}>
              <optgroup label="Recurring Deposit (RD)">
                {activePlans.filter(p => (p.type || 'RD').toUpperCase() === 'RD').map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
              </optgroup>
              <optgroup label="Fixed Deposit (FD)">
                {activePlans.filter(p => (p.type || 'RD').toUpperCase() === 'FD').map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
              </optgroup>
            </select>
          </div>

          {rd ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Monthly Installment * (min ₹500)</label>
                <input type="number" className="field" min={500} step={100} {...register('monthlyAmount')} />
                {errors.monthlyAmount && <p className="err">{errors.monthlyAmount.message}</p>}
              </div>
              <div>
                <label className="label">Payment Day * (1–28)</label>
                <input type="number" className="field" min={1} max={28} {...register('paymentDate')} />
                {errors.paymentDate && <p className="err">{errors.paymentDate.message}</p>}
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Lump Sum Amount * (min ₹5,000)</label>
              <input type="number" className="field" min={5000} step={500} {...register('fdAmount')} />
              {errors.fdAmount && <p className="err">{errors.fdAmount.message}</p>}
            </div>
          )}

          <div>
            <label className="label">Start Date *</label>
            <input type="date" className="field" {...register('startDate')} />
            {errors.startDate && <p className="err">{errors.startDate.message}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate(`/customers/${id}`)} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-gold">{submitting ? 'Creating…' : 'Create Plan'}</button>
        </div>
      </form>

      {/* Preview */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gold">Plan Summary</h3>
          {preview ? (
            <dl className="space-y-2.5 text-sm">
              <Row k="Type" v={`${rd ? 'RD' : 'FD'} - ${preview.years} Year`} />
              {rd ? <Row k="Monthly" v={formatINR(monthlyAmount || 0)} /> : <Row k="Amount" v={formatINR(fdAmount || 0)} />}
              <Row k="Start" v={fmtDate(preview.startDate)} />
              <Row k="Maturity" v={fmtDate(preview.maturityDate)} />
              <Row k="Installments" v={preview.totalInstallments} />
              <Row k="Rate" v={`${preview.ratePct.toFixed(2)}% p.a.`} />
              <div className="my-2 border-t border-navy-4" />
              <Row k="Maturity Amount" v={formatINR(preview.maturityAmount)} highlight />
            </dl>
          ) : (
            <p className="text-sm text-ink-2">Fill the form to preview.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, highlight }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{k}</dt>
      <dd className={highlight ? 'text-lg font-bold text-gold' : 'font-medium text-ink-1'}>{v}</dd>
    </div>
  )
}
