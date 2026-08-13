import { useMemo, useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { where, collection, doc, updateDoc, addDoc, getDocs, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import { useDoc, useCollection } from '../../hooks/useFirestore'
import { fmtDate, formatINR } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IUsers, IDoc, IBuilding, IClock, ISettings } from '../../components/ui/icons'
import { useAuth } from '../../contexts/AuthContext'
import { usePermission } from '../../hooks/usePermission'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

export default function CustomerDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const { can, CAP, isSuperAdmin } = usePermission()
  const canEdit = isSuperAdmin || can(CAP.ADMIN)

  const customerDoc = useDoc(id ? `customers/${id}` : null)
  const plans = useCollection('plans', id ? [where('customerId', '==', id)] : null)
  const users = useCollection('users')
  const branches = useCollection('branches')

  const c = customerDoc.data

  // Edit / Correction State
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', customerId: '' })
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

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
    if (!c?.enrolledBy || !users.data) return null
    return users.data.find(u => u.id === c.enrolledBy)
  }, [c?.enrolledBy, users.data])

  // Get branch details
  const branchName = useMemo(() => {
    if (!c?.branchId || !branches.data) return '—'
    return branches.data.find(b => b.id === c.branchId)?.name || '—'
  }, [c?.branchId, branches.data])

  // Compute live diff preview
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

      // Duplicate CIF Check if changed
      if (newCustId !== c.customerId) {
        const dupQ = query(collection(db, 'customers'), where('customerId', '==', newCustId))
        const dupSnap = await getDocs(dupQ)
        const exists = dupSnap.docs.some(d => d.id !== id)
        if (exists) {
          toast.error(`Customer CIF ID "${newCustId}" already belongs to another customer.`, { id: loader })
          setSaving(false)
          return
        }
      }

      // Update customer document
      const custRef = doc(db, 'customers', id)
      await updateDoc(custRef, {
        name: newName,
        phone: editForm.phone.trim(),
        address: editForm.address.trim(),
        customerId: newCustId,
        updatedAt: serverTimestamp()
      })

      // If Name or CustomerId changed, update linked plans and commission entries
      const batch = writeBatch(db)
      let batchCount = 0

      if (newName !== c.name || newCustId !== c.customerId) {
        // Linked plans
        const plansQ = query(collection(db, 'plans'), where('customerId', '==', id))
        const plansSnap = await getDocs(plansQ)
        plansSnap.forEach(pDoc => {
          batch.update(pDoc.ref, { customerName: newName, customerAccount: newCustId })
          batchCount++
        })

        // Linked commissions
        const commQ = query(collection(db, 'commission_ledger'), where('customerId', '==', id))
        const commSnap = await getDocs(commQ)
        commSnap.forEach(cDoc => {
          batch.update(cDoc.ref, { customerName: newName, customerAccount: newCustId })
          batchCount++
        })

        if (batchCount > 0) {
          await batch.commit()
        }
      }

      // Write Audit Log
      await addDoc(collection(db, 'audit_logs'), {
        type: 'Customer Correction',
        recordId: id,
        targetType: 'customer',
        customerName: newName,
        adminUid: user?.uid || 'system',
        adminName: profile?.name || user?.email || 'Admin',
        timestamp: serverTimestamp(),
        reason: reason.trim(),
        changes: diffs
      })

      toast.success('Customer details corrected successfully!', { id: loader })
      setEditOpen(false)
    } catch (err) {
      console.error('Error saving customer correction:', err)
      toast.error(`Correction failed: ${err.message}`, { id: loader })
    } finally {
      setSaving(false)
    }
  }

  const loading = customerDoc.loading || plans.loading || users.loading || branches.loading

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={3} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }

  if (!customerDoc.exists) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Customer Not Found</h2>
        <p className="text-sm text-ink-2">This customer record does not exist in the system.</p>
        <Link to="/admin/customers" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">Back to Customers</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Info */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1 bg-navy-3">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-card border border-gold-1/25 bg-gold-1/10 text-gold-1">
              <IUsers size={28} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">{c.name}</h1>
                <span className="text-[10px] bg-ok/10 border border-ok/25 px-2 py-0.5 rounded text-ok font-semibold">Bank Verified</span>
              </div>
              <p className="text-xs text-ink-2 mt-0.5 font-mono">CIF ID: {c.customerId || '—'}</p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            {canEdit && (
              <button
                onClick={() => setEditOpen(true)}
                className="btn-dark py-2 px-4 text-xs font-bold uppercase tracking-wider border border-gold/40 text-gold hover:border-gold flex items-center gap-1.5"
              >
                <ISettings size={14} /> Correct Record
              </button>
            )}
            <Link to="/admin/customers" className="btn-ghost py-2 px-4 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid */}
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
                <span className="block text-[10px] text-ink-2">Home Branch Office</span>
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
              <IUsers size={16} /> Assigned Agent
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
                    <div className="text-[10px] text-ink-2 font-mono">{agent.sponsorCode}</div>
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
              <IDoc size={16} /> Linked Policies
            </h3>
            {plans.data.length ? (
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
                    {plans.data.map((p) => (
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
              {plans.data.map((p) => (
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

