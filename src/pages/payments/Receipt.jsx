import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useDoc } from '../../hooks/useFirestore'
import { rankCode } from '../../data/ranks'
import { formatINR, fmtDate } from '../../utils/format'
import { elementToPdf } from '../../lib/pdf'
import { shareWhatsApp, receiptMessage } from '../../lib/whatsapp'
import Logo from '../../components/ui/Logo'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonForm } from '../../components/ui/LoadingSkeleton'
import { IPrint, IWhatsapp } from '../../components/ui/icons'

export default function Receipt() {
  const { id } = useParams()
  const navigate = useNavigate()
  const receiptRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const { data: payment, loading } = useDoc(`payments/${id}`)
  const { data: plan } = useDoc(payment ? `plans/${payment.planId}` : null)
  const { data: customer } = useDoc(payment ? `customers/${payment.customerId}` : null)

  if (loading) return <div className="mx-auto max-w-md"><SkeletonForm fields={6} /></div>
  if (!payment) return <EmptyState title="Receipt not found" />

  const remaining = plan ? Math.max(0, (plan.maturityAmount || (plan.monthlyAmount || 0) * (plan.totalInstallments || 0)) - (plan.totalPaid || 0)) : 0

  const download = async () => {
    setBusy(true)
    try {
      await elementToPdf(receiptRef.current, `${payment.receiptNumber}.pdf`)
      toast.success('Receipt downloaded')
    } catch {
      toast.error('Could not generate PDF')
    } finally {
      setBusy(false)
    }
  }

  const whatsapp = () => {
    shareWhatsApp(
      receiptMessage({
        name: customer?.name || 'Customer',
        amount: payment.amount,
        planAccount: plan?.planAccountNumber || payment.planAccountNumber,
        receiptNumber: payment.receiptNumber,
        branch: plan?.branchId,
      }),
      customer?.phone
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* Receipt card (also the PDF source) */}
      <div ref={receiptRef} className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-navy-4 bg-navy-2 px-5 py-4">
          <Logo size={36} />
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-ink-2">Receipt No.</p>
            <p className="font-mono text-sm font-bold text-gold">{payment.receiptNumber}</p>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <Block rows={[
            ['Customer', customer?.name || '—'],
            ['Account No', customer?.accountNumber || '—'],
            ['Plan', plan?.type || '—'],
            ['Plan Account', plan?.planAccountNumber || payment.planAccountNumber || '—'],
          ]} />
          <Divider />
          <Block rows={[
            ['Installment', `${payment.installmentNumber} of ${plan?.totalInstallments ?? '—'}`],
            ['Amount Paid', formatINR(payment.amount)],
            ['Payment Mode', String(payment.paymentMode).toUpperCase()],
            ...(payment.transactionRef ? [['Txn ID', payment.transactionRef]] : []),
            ...(payment.chequeNumber ? [['Cheque', `${payment.chequeNumber} · ${payment.bankName}`]] : []),
            ['Date', fmtDate(payment.paidDate)],
            ['Agent', `${payment.agentName || '—'}`],
          ]} highlightKey="Amount Paid" />
          <Divider />
          <Block rows={[
            ['Next Due', fmtDate(plan?.nextDueDate)],
            ['Total Paid', formatINR(plan?.totalPaid || payment.amount)],
            ['Remaining', formatINR(remaining)],
          ]} />
          {payment.isLate && (
            <p className="rounded-card border border-gold-1/30 bg-gold-1/10 px-3 py-2 text-xs text-gold">
              Paid {payment.daysLate} day(s) after due date.
            </p>
          )}
        </div>
        <div className="border-t border-navy-4 bg-navy-2 px-5 py-3 text-center text-[10px] text-ink-2">
          This is a computer-generated receipt · APEX Performance Portal
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={download} disabled={busy} className="btn-gold flex-1"><IPrint size={18} /> {busy ? 'Generating…' : 'Print PDF'}</button>
        <button type="button" onClick={whatsapp} className="btn-ghost flex-1"><IWhatsapp size={18} /> WhatsApp</button>
      </div>
      <div className="flex justify-center gap-4 text-sm">
        <button type="button" onClick={() => navigate('/payments/collect')} className="text-gold hover:underline">Collect another →</button>
        {customer && <button type="button" onClick={() => navigate(`/customers/${customer.id}`)} className="text-ink-2 hover:text-gold">View customer</button>}
      </div>
    </div>
  )
}

function Block({ rows, highlightKey }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="text-ink-2">{k}</dt>
          <dd className={highlightKey === k ? 'font-bold text-gold' : 'font-medium text-ink-1'}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
function Divider() {
  return <div className="border-t border-dashed border-navy-4" />
}
