import { useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { addMonths } from 'date-fns'
import toast from 'react-hot-toast'
import { where } from 'firebase/firestore'
import { useDoc, useCollection } from '../../hooks/useFirestore'
import { formatINR, fmtDate, toDate } from '../../utils/format'
import { isRD } from '../../data/compensation'
import { elementToPdf } from '../../lib/pdf'
import Logo from '../../components/ui/Logo'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonForm } from '../../components/ui/LoadingSkeleton'
import { IDownload } from '../../components/ui/icons'

export default function Passbook() {
  const { id, planId } = useParams()
  const navigate = useNavigate()
  const sheetRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const { data: plan, loading } = useDoc(`plans/${planId}`)
  const { data: customer } = useDoc(`customers/${id}`)
  const payments = useCollection('payments', [where('planId', '==', planId)], `pb-${planId}`)

  const rows = useMemo(() => {
    if (!plan) return []
    const byInst = {}
    payments.data.forEach((p) => { byInst[p.installmentNumber] = p })
    const start = toDate(plan.startDate) || new Date()
    const today = new Date()
    const total = isRD(plan.type) ? plan.totalInstallments : 1
    const out = []
    for (let i = 1; i <= total; i += 1) {
      const due = addMonths(start, i - 1)
      const paid = byInst[i]
      let status = 'upcoming'
      if (paid) status = paid.isLate ? 'late' : 'paid'
      else if (due < today) status = 'overdue'
      out.push({
        no: i,
        dueDate: due,
        paidDate: paid ? toDate(paid.paidDate) : null,
        amount: paid?.amount ?? (isRD(plan.type) ? plan.monthlyAmount : plan.fdAmount),
        mode: paid?.paymentMode || null,
        status,
        paymentId: paid?.id || null,
      })
    }
    return out
  }, [plan, payments.data])

  if (loading) return <div className="mx-auto max-w-3xl"><SkeletonForm fields={5} /></div>
  if (!plan) return <EmptyState title="Plan not found" />

  const pct = plan.totalInstallments ? Math.round((plan.paidInstallments / plan.totalInstallments) * 100) : 0

  const download = async () => {
    setBusy(true)
    try {
      await elementToPdf(sheetRef.current, `Passbook-${plan.planAccountNumber}.pdf`)
      toast.success('Passbook downloaded')
    } catch {
      toast.error('Could not generate PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={download} disabled={busy} className="btn-gold py-2 text-sm"><IDownload size={16} /> {busy ? 'Generating…' : 'Download PDF'}</button>
      </div>

      <div ref={sheetRef} className="space-y-4">
        {/* Summary */}
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <ProgressRing pct={pct} />
              <div>
                <Logo size={30} />
                <p className="mt-2 font-semibold text-ink-1">{customer?.name}</p>
                <p className="font-mono text-xs text-gold">{plan.planAccountNumber}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <Row k="Plan" v={plan.type} />
              <Row k="Status" v={plan.status} />
              <Row k="Installment" v={isRD(plan.type) ? `${plan.monthlyAmount ? formatINR(plan.monthlyAmount) : '—'}/mo` : formatINR(plan.fdAmount)} />
              <Row k="Paid" v={`${plan.paidInstallments}/${plan.totalInstallments}`} />
              <Row k="Total Paid" v={formatINR(plan.totalPaid || 0)} />
              <Row k="Maturity" v={formatINR(plan.maturityAmount || 0)} />
              <Row k="Start" v={fmtDate(plan.startDate)} />
              <Row k="Matures" v={fmtDate(plan.maturityDate)} />
            </dl>
          </div>
        </div>

        {/* Schedule */}
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>No.</th><th>Due Date</th><th>Paid Date</th><th>Amount</th><th>Mode</th><th>Status</th><th>Receipt</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.no}>
                    <td>{r.no}</td>
                    <td className="text-ink-2">{fmtDate(r.dueDate)}</td>
                    <td className="text-ink-2">{r.paidDate ? fmtDate(r.paidDate) : '—'}</td>
                    <td className="font-medium">{r.status === 'upcoming' ? '—' : formatINR(r.amount)}</td>
                    <td className="uppercase text-ink-2">{r.mode || '—'}</td>
                    <td><Dot status={r.status} /></td>
                    <td>{r.paymentId ? <button type="button" onClick={() => navigate(`/payments/${r.paymentId}/receipt`)} className="text-xs font-semibold text-gold hover:underline">View</button> : <span className="text-ink-2">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

const DOT = {
  paid: ['bg-ok/15 text-ok', 'Paid'],
  late: ['bg-gold-1/15 text-gold', 'Late'],
  upcoming: ['bg-ink-2/15 text-ink-2', 'Upcoming'],
  overdue: ['bg-danger/15 text-danger', 'Overdue'],
}
function Dot({ status }) {
  const [cls, label] = DOT[status] || DOT.upcoming
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span>
}
function Row({ k, v }) {
  return <><dt className="text-ink-2">{k}</dt><dd className="text-right font-medium capitalize text-ink-1">{v}</dd></>
}
function ProgressRing({ pct }) {
  const r = 30
  const c = 2 * Math.PI * r
  const off = c - (pct / 100) * c
  return (
    <svg width={76} height={76} viewBox="0 0 76 76">
      <circle cx="38" cy="38" r={r} fill="none" stroke="#232D42" strokeWidth="7" />
      <circle cx="38" cy="38" r={r} fill="none" stroke="#C9980A" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 38 38)" />
      <text x="38" y="43" textAnchor="middle" className="fill-ink-1" fontSize="16" fontWeight="700">{pct}%</text>
    </svg>
  )
}
