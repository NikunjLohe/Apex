import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { where } from 'firebase/firestore'
import { useDoc, useCollection } from '../../hooks/useFirestore'
import { usePermission, CAP } from '../../hooks/usePermission'
import { setKycStatus, updateCustomer } from '../../lib/customers'
import { formatINR, fmtDate, fmtDateTime, toDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SkeletonForm } from '../../components/ui/LoadingSkeleton'
import { ICash, IPlus, IDoc, ICheck, IClose, IEdit } from '../../components/ui/icons'

const TABS = ['Overview', 'Plans', 'Payment History', 'Documents']

export default function CustomerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = usePermission()
  const { data: customer, loading } = useDoc(`customers/${id}`)
  const plans = useCollection('plans', [where('customerId', '==', id)], `cust-plans-${id}`)
  const payments = useCollection('payments', [where('customerId', '==', id)], `cust-pay-${id}`)
  const [tab, setTab] = useState('Overview')
  const [kycAction, setKycAction] = useState(null) // 'verified' | 'rejected'
  const [editOpen, setEditOpen] = useState(false)

  const sortedPayments = useMemo(
    () => [...payments.data].sort((a, b) => (toDate(b.paidDate) || 0) - (toDate(a.paidDate) || 0)),
    [payments.data]
  )

  if (loading) return <div className="mx-auto max-w-4xl"><SkeletonForm fields={5} /></div>
  if (!customer) return <EmptyState title="Customer not found" message="This customer may have been removed." />

  const confirmKyc = async () => {
    try {
      await setKycStatus(id, kycAction)
      toast.success(`KYC ${kycAction}`)
    } catch {
      toast.error('Could not update KYC')
    } finally {
      setKycAction(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar url={customer.photoUrl} name={customer.name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-ink-1">{customer.name}</h2>
              <StatusBadge status={customer.kycStatus || 'pending'} />
            </div>
            <p className="font-mono text-sm text-gold">{customer.accountNumber}</p>
            <p className="text-sm text-ink-2">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditOpen(true)} className="btn-ghost py-2 text-sm"><IEdit size={16} /> Edit KYC</button>
          {can(CAP.ADMIN) && customer.kycStatus !== 'verified' && (
            <button type="button" onClick={() => setKycAction('verified')} className="btn-ghost py-2 text-sm text-ok"><ICheck size={16} /> Verify KYC</button>
          )}
          {can(CAP.ADMIN) && customer.kycStatus !== 'rejected' && (
            <button type="button" onClick={() => setKycAction('rejected')} className="btn-ghost py-2 text-sm text-danger"><IClose size={16} /> Reject</button>
          )}
          <Link to={`/customers/${id}/enroll`} className="btn-gold py-2 text-sm"><IPlus size={16} /> Enroll in Plan</Link>
          <Link to={`/payments/collect?customer=${id}`} className="btn-ghost py-2 text-sm"><ICash size={16} /> Collect Payment</Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-card border border-navy-4 bg-navy-2 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors ${tab === t ? 'bg-gold-1 text-navy-1' : 'text-ink-2 hover:text-ink-1'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <Overview customer={customer} />}
      {tab === 'Plans' && <PlansTab plans={plans} customerId={id} navigate={navigate} />}
      {tab === 'Payment History' && <PaymentsTab payments={sortedPayments} loading={payments.loading} navigate={navigate} />}
      {tab === 'Documents' && <DocumentsTab customer={customer} />}

      <ConfirmDialog
        open={Boolean(kycAction)}
        title={kycAction === 'verified' ? 'Verify KYC?' : 'Reject KYC?'}
        message={kycAction === 'verified' ? 'Mark this customer as KYC verified.' : 'Mark this customer KYC as rejected.'}
        confirmLabel={kycAction === 'verified' ? 'Verify' : 'Reject'}
        danger={kycAction === 'rejected'}
        onConfirm={confirmKyc}
        onClose={() => setKycAction(null)}
      />

      <EditModal open={editOpen} onClose={() => setEditOpen(false)} customer={customer} id={id} />
    </div>
  )
}

function Overview({ customer }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Info title="Personal" rows={[
        ['Date of Birth', fmtDate(customer.dob)],
        ['Gender', customer.gender || '—'],
        ['Phone', customer.phone],
        ['Alt Phone', customer.altPhone || '—'],
        ['Email', customer.email || '—'],
        ['Source', customer.source || '—'],
      ]} />
      <Info title="Address" rows={[
        ['Address', customer.address || '—'],
        ['City', customer.city || '—'],
        ['State', customer.state || '—'],
        ['Pincode', customer.pincode || '—'],
      ]} />
      <Info title="ID Documents" rows={[
        ['Aadhaar', customer.aadhaar ? `XXXX XXXX ${String(customer.aadhaar).slice(-4)}` : '—'],
        ['PAN', customer.pan || '—'],
      ]} />
      <Info title="Nominee" rows={[
        ['Name', customer.nominee?.name || '—'],
        ['Relation', customer.nominee?.relation || '—'],
        ['Phone', customer.nominee?.phone || '—'],
        ['Address', customer.nominee?.address || '—'],
      ]} />
    </div>
  )
}

function Info({ title, rows }) {
  return (
    <div className="card p-5">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-gold">{title}</h4>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-navy-4/50 pb-2">
            <dt className="text-ink-2">{k}</dt>
            <dd className="text-right font-medium text-ink-1">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function PlansTab({ plans, customerId, navigate }) {
  if (plans.loading) return <SkeletonForm fields={3} />
  if (!plans.data.length)
    return <EmptyState icon={<IPlus size={24} />} title="No plans yet" message="Enroll this customer in an RD or FD plan." action={<Link to={`/customers/${customerId}/enroll`} className="btn-gold mt-1">Enroll in Plan</Link>} />
  return (
    <div className="space-y-3">
      {plans.data.map((p) => {
        const pct = p.totalInstallments ? Math.round((p.paidInstallments / p.totalInstallments) * 100) : 0
        return (
          <div key={p.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-ink-1">{p.type}</p>
                <p className="font-mono text-xs text-gold">{p.planAccountNumber}</p>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-ink-2">{p.monthlyAmount ? `${formatINR(p.monthlyAmount)}/mo` : formatINR(p.fdAmount)}</span>
              <span className="text-ink-2">{p.paidInstallments}/{p.totalInstallments} installments</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-2">
              <div className="h-full rounded-full bg-gold-1" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-ink-2">Maturity: {fmtDate(p.maturityDate)} · {formatINR(p.maturityAmount)}</span>
              <button type="button" onClick={() => navigate(`/customers/${customerId}/plans/${p.id}/passbook`)} className="text-xs font-semibold text-gold hover:underline">
                View Passbook →
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PaymentsTab({ payments, loading, navigate }) {
  if (loading) return <SkeletonForm fields={3} />
  if (!payments.length) return <EmptyState icon={<ICash size={24} />} title="No payments yet" />
  return (
    <div className="table-wrap">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Receipt</th><th>Inst.</th><th>Amount</th><th>Mode</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs text-ink-2">{p.receiptNumber}</td>
                <td>{p.installmentNumber}</td>
                <td className="font-semibold">{formatINR(p.amount)}</td>
                <td className="uppercase text-ink-2">{p.paymentMode}</td>
                <td className="text-ink-2">{fmtDateTime(p.paidDate)}</td>
                <td><button type="button" onClick={() => navigate(`/payments/${p.id}/receipt`)} className="text-xs font-semibold text-gold hover:underline">Receipt</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DocumentsTab({ customer }) {
  const docs = [
    ['Customer Photo', customer.photoUrl],
    ['Signature', customer.signatureUrl],
    ['Aadhaar', customer.aadhaarUrl],
    ['PAN', customer.panUrl],
  ]
  const hasAny = docs.some(([, url]) => url)
  if (!hasAny) return <EmptyState icon={<IDoc size={24} />} title="No documents uploaded" />
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {docs.map(([label, url]) =>
        url ? (
          <a key={label} href={url} target="_blank" rel="noreferrer" className="card overflow-hidden">
            <img src={url} alt={label} className="h-36 w-full object-cover" />
            <p className="p-2 text-center text-xs text-ink-2">{label}</p>
          </a>
        ) : (
          <div key={label} className="card flex h-44 flex-col items-center justify-center text-ink-2">
            <IDoc size={24} />
            <p className="mt-2 text-xs">{label}</p>
            <p className="text-[10px]">Not uploaded</p>
          </div>
        )
      )}
    </div>
  )
}

function EditModal({ open, onClose, customer, id }) {
  const [form, setForm] = useState({ name: customer.name, phone: customer.phone, email: customer.email || '', address1: customer.address1 || '', city: customer.city || '' })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await updateCustomer(id, form)
      toast.success('Customer updated')
      onClose()
    } catch {
      toast.error('Could not update')
    } finally {
      setSaving(false)
    }
  }
  return (
    <ConfirmDialog open={open} title="Edit customer" confirmLabel="Save" loading={saving} onConfirm={save} onClose={onClose}>
      <div className="mt-3 space-y-3">
        <div><label className="label">Name</label><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Phone</label><input className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div>
        <div><label className="label">Address</label><input className="field" value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} /></div>
        <div><label className="label">City</label><input className="field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
      </div>
    </ConfirmDialog>
  )
}

function Avatar({ url, name }) {
  if (url) return <img src={url} alt={name} className="h-16 w-16 rounded-card object-cover" />
  const initials = (name || 'C').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return <span className="flex h-16 w-16 items-center justify-center rounded-card bg-gold-1 text-xl font-bold text-navy-1">{initials}</span>
}
