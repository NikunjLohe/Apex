import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { useCollection } from '../../hooks/useFirestore'
import { branchSchema } from '../../lib/schemas'
import { createBranch, updateBranch } from '../../lib/admin'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IPlus, IBuilding } from '../../components/ui/icons'

export default function Branches() {
  const branches = useCollection('branches')
  const members = useCollection('users')
  const [modal, setModal] = useState(null)

  const managerName = (mid) => members.data.find((m) => m.id === mid)?.name || '—'

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setModal({ mode: 'new' })} className="btn-gold py-2.5 text-sm"><IPlus size={16} /> Add Branch</button>
      </div>

      {branches.loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : !branches.data.length ? (
        <EmptyState icon={<IBuilding size={24} />} title="No branches" message="Add your first branch." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {branches.data.map((b) => (
            <div key={b.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-ink-1">{b.name}</h3>
                  <p className="text-sm text-ink-2">{b.city}, {b.state}</p>
                </div>
                <button type="button" onClick={() => setModal({ mode: 'edit', branch: b })} className="text-xs font-semibold text-gold hover:underline">Edit</button>
              </div>
              <p className="mt-2 text-sm text-ink-2">{b.address}</p>
              <p className="mt-2 text-xs text-ink-2">Manager: <span className="text-ink-1">{managerName(b.managerId)}</span></p>
            </div>
          ))}
        </div>
      )}

      {modal && <BranchModal modal={modal} members={members.data} onClose={() => setModal(null)} />}
    </div>
  )
}

function BranchModal({ modal, members, onClose }) {
  const isEdit = modal.mode === 'edit'
  const b = modal.branch
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(branchSchema),
    defaultValues: { name: b?.name || '', address: b?.address || '', city: b?.city || '', state: b?.state || '', managerId: b?.managerId || '' },
  })

  const submit = async (form) => {
    setSaving(true)
    try {
      if (isEdit) { await updateBranch(b.id, form); toast.success('Branch updated') }
      else { await createBranch(form); toast.success('Branch created') }
      onClose()
    } catch {
      toast.error('Could not save branch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfirmDialog open title={isEdit ? 'Edit branch' : 'Add branch'} confirmLabel={isEdit ? 'Save' : 'Create'} loading={saving} onConfirm={handleSubmit(submit)} onClose={onClose}>
      <form className="mt-3 space-y-3" onSubmit={handleSubmit(submit)}>
        <div><label className="label">Branch name</label><input className="field" {...register('name')} />{errors.name && <p className="err">{errors.name.message}</p>}</div>
        <div><label className="label">Address</label><input className="field" {...register('address')} />{errors.address && <p className="err">{errors.address.message}</p>}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">City</label><input className="field" {...register('city')} />{errors.city && <p className="err">{errors.city.message}</p>}</div>
          <div><label className="label">State</label><input className="field" {...register('state')} />{errors.state && <p className="err">{errors.state.message}</p>}</div>
        </div>
        <div><label className="label">Branch Manager</label><select className="field" {...register('managerId')}><option value="">— Unassigned —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      </form>
    </ConfirmDialog>
  )
}
