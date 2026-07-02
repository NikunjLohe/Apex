import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useCollection } from '../../hooks/useFirestore'
import { branchSchema } from '../../lib/schemas'
import { createBranch, updateBranch } from '../../lib/admin'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IPlus, IBuilding } from '../../components/ui/icons'

export default function Branches() {
  const branches = useCollection('branches')
  const members = useCollection('users')
  const [modal, setModal] = useState(null)
  const [updating, setUpdating] = useState(null)

  const managerName = (mid) => members.data.find((m) => m.id === mid)?.name || '—'

  const toggleBranchStatus = async (branch) => {
    setUpdating(branch.id)
    const nextStatus = branch.status === 'inactive' ? 'active' : 'inactive'
    try {
      await updateBranch(branch.id, { status: nextStatus })
      toast.success(`Branch ${nextStatus === 'active' ? 'activated' : 'deactivated'} successfully`)
    } catch {
      toast.error('Could not change branch status')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-serif text-xl font-bold text-ink-1 tracking-tight">Branch Management</h2>
          <p className="text-xs text-ink-2">Create and supervise company branch offices</p>
        </div>
        <button type="button" onClick={() => setModal({ mode: 'new' })} className="btn-gold py-2.5 text-sm flex items-center gap-2">
          <IPlus size={16} /> Add Branch
        </button>
      </div>

      {branches.loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : !branches.data.length ? (
        <EmptyState icon={<IBuilding size={24} />} title="No branches found" message="Add your first branch office." />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl text-xs sm:text-sm">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Branch Name</th>
                  <th>Manager</th>
                  <th>Contact Details</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.data.map((b) => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs font-semibold text-ink-1">
                      <Link to={`/admin/branches/${b.id}`} className="hover:text-gold-1 hover:underline">
                        {b.branchCode || '—'}
                      </Link>
                    </td>
                    <td className="font-medium text-ink-1">
                      <Link to={`/admin/branches/${b.id}`} className="hover:text-gold-1 hover:underline font-semibold text-ink-1">
                        {b.name}
                      </Link>
                      <div className="text-xs text-ink-2">{b.address}</div>
                    </td>
                    <td className="text-ink-2 font-medium">{managerName(b.managerId)}</td>
                    <td className="text-xs text-ink-2">
                      <div className="font-mono">{b.contactNumber || '—'}</div>
                      <div>{b.email || '—'}</div>
                    </td>
                    <td className="text-ink-2 text-xs">{b.city}, {b.state}</td>
                    <td>
                      <StatusBadge status={b.status || 'active'} />
                    </td>
                    <td className="text-right space-x-3.5">
                      <Link to={`/admin/branches/${b.id}`} className="text-xs font-bold text-gold hover:underline">
                        View Details
                      </Link>
                      <button 
                        type="button" 
                        onClick={() => setModal({ mode: 'edit', branch: b })} 
                        className="text-xs font-bold text-gold hover:underline"
                      >
                        Edit
                      </button>
                      <button 
                        type="button" 
                        disabled={updating === b.id}
                        onClick={() => toggleBranchStatus(b)} 
                        className={`text-xs font-bold hover:underline ${
                          b.status === 'inactive' ? 'text-ok' : 'text-danger'
                        }`}
                      >
                        {updating === b.id ? '...' : b.status === 'inactive' ? 'Activate' : 'Deactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && <BranchModal modal={modal} members={members.data} existingBranches={branches.data} onClose={() => setModal(null)} />}
    </div>
  )
}

function BranchModal({ modal, members, existingBranches, onClose }) {
  const isEdit = modal.mode === 'edit'
  const b = modal.branch
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(branchSchema),
    defaultValues: { 
      name: b?.name || '', 
      address: b?.address || '', 
      city: b?.city || '', 
      state: b?.state || '', 
      managerId: b?.managerId || '',
      contactNumber: b?.contactNumber || '',
      email: b?.email || '',
      status: b?.status || 'active',
      branchCode: b?.branchCode || '',
    },
  })

  const submit = async (form) => {
    setSaving(true)
    try {
      if (isEdit) { 
        await updateBranch(b.id, form)
        toast.success('Branch updated') 
      } else { 
        await createBranch(form, existingBranches)
        toast.success('Branch created successfully') 
      }
      onClose()
    } catch {
      toast.error('Could not save branch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfirmDialog open title={isEdit ? 'Edit branch' : 'Add branch'} confirmLabel={isEdit ? 'Save' : 'Create'} loading={saving} onConfirm={handleSubmit(submit)} onClose={onClose}>
      <form className="mt-3 space-y-3.5 text-left" onSubmit={handleSubmit(submit)}>
        {isEdit && (
          <div>
            <label className="label">Branch Code</label>
            <input className="field font-mono bg-navy-2 cursor-not-allowed" disabled value={b?.branchCode || '—'} />
          </div>
        )}
        <div><label className="label">Branch name *</label><input className="field" {...register('name')} />{errors.name && <p className="err">{errors.name.message}</p>}</div>
        <div><label className="label">Address *</label><input className="field" {...register('address')} />{errors.address && <p className="err">{errors.address.message}</p>}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">City *</label><input className="field" {...register('city')} />{errors.city && <p className="err">{errors.city.message}</p>}</div>
          <div><label className="label">State *</label><input className="field" {...register('state')} />{errors.state && <p className="err">{errors.state.message}</p>}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Contact number</label><input className="field" maxLength={10} {...register('contactNumber')} />{errors.contactNumber && <p className="err">{errors.contactNumber.message}</p>}</div>
          <div><label className="label">Email address</label><input className="field" type="email" {...register('email')} />{errors.email && <p className="err">{errors.email.message}</p>}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Branch Manager</label><select className="field" {...register('managerId')}><option value="">— Unassigned —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.sponsorCode || '—'})</option>)}</select></div>
          <div><label className="label">Status</label><select className="field" {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
        </div>
      </form>
    </ConfirmDialog>
  )
}
