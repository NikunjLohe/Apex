import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { useCollection } from '../../hooks/useFirestore'
import { memberSchema } from '../../lib/schemas'
import { createMember, updateMember } from '../../lib/admin'
import { useRanks } from '../../contexts/RanksContext'
import { fmtDate } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IPlus, IUsers, ISearch } from '../../components/ui/icons'

export default function Members() {
  const members = useCollection('users')
  const branches = useCollection('branches')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // { mode:'new'|'edit', member }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.data
      .filter((m) => !q || m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.phone?.includes(q))
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
  }, [members.data, search])

  const branchName = (bid) => branches.data.find((b) => b.id === bid)?.name || '—'
  const memberName = (uid) => members.data.find((m) => m.id === uid)?.name || '—'

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="field pl-10" />
        </div>
        <button type="button" onClick={() => setModal({ mode: 'new' })} className="btn-gold py-2.5 text-sm"><IPlus size={16} /> Add Member</button>
      </div>

      {members.loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : !filtered.length ? (
        <EmptyState icon={<IUsers size={24} />} title="No members" message="Add your first team member." />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Agent ID</th><th>Rank</th><th>Sponsor</th><th>Branch</th><th>Joined</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium text-ink-1">{m.name}<div className="text-xs text-ink-2">{m.email}</div></td>
                    <td className="font-mono text-sm text-ink-2">{m.sponsorCode || '—'}</td>
                    <td><RankBadge rank={m.rank} size="sm" />{m.isSuperAdmin && <span className="ml-1 rounded-full bg-gold-1/15 px-2 py-0.5 text-[10px] font-bold text-gold">SUPER</span>}</td>
                    <td className="text-ink-2">{m.referredBy ? memberName(m.referredBy) : '—'}</td>
                    <td className="text-ink-2">{branchName(m.branchId)}</td>
                    <td className="text-ink-2">{fmtDate(m.joinDate)}</td>
                    <td><StatusBadge status={m.status || 'active'} /></td>
                    <td><button type="button" onClick={() => setModal({ mode: 'edit', member: m })} className="text-xs font-semibold text-gold hover:underline">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && <MemberModal modal={modal} branches={branches.data} members={members.data} onClose={() => setModal(null)} />}
    </div>
  )
}

function MemberModal({ modal, branches, members, onClose }) {
  const { config } = useRanks()
  const RANKS = config.RANKS
  const isEdit = modal.mode === 'edit'
  const m = modal.member
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: m?.name || '', email: m?.email || '', phone: m?.phone || '',
      rank: m?.rank || 1, branchId: m?.branchId || '', isSuperAdmin: m?.isSuperAdmin || false,
      status: m?.status || 'active', referredBy: m?.referredBy || '', sponsorCode: m?.sponsorCode || '',
      password: '',
    },
  })

  // Possible sponsors = everyone except the member being edited.
  const sponsors = (members || []).filter((x) => x.id !== m?.id)

  const submit = async (form) => {
    setSaving(true)
    try {
      // Auto-generate a sponsor code (Agent ID) starting from KB100001.
      if (!form.sponsorCode) {
        let maxId = 100000
        if (members && members.length > 0) {
          members.forEach(member => {
            if (member.sponsorCode && member.sponsorCode.startsWith('KB')) {
              const num = parseInt(member.sponsorCode.replace('KB', ''), 10)
              if (!isNaN(num) && num > maxId) {
                maxId = num
              }
            }
          })
        }
        form.sponsorCode = `KB${maxId + 1}`
      }
      if (isEdit) {
        await updateMember(m.id, form)
        toast.success('Member updated')
      } else {
        const tempPassword = form.password || `Apex@${Math.floor(1000 + Math.random() * 9000)}`
        await createMember(form, tempPassword)
        if (form.password) {
          toast.success('Member created successfully')
        } else {
          toast.success(`Member created · temp password: ${tempPassword}`, { duration: 8000 })
        }
      }
      onClose()
    } catch (e) {
      toast.error(e.code === 'auth/email-already-in-use' ? 'Email already in use' : e.message || 'Could not save member')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfirmDialog open title={isEdit ? 'Edit member' : 'Add member'} confirmLabel={isEdit ? 'Save' : 'Create'} loading={saving} onConfirm={handleSubmit(submit)} onClose={onClose}>
      <form className="mt-3 space-y-3" onSubmit={handleSubmit(submit)}>
        <div><label className="label">Full name</label><input className="field" {...register('name')} />{errors.name && <p className="err">{errors.name.message}</p>}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Email</label><input className="field" type="email" disabled={isEdit} {...register('email')} />{errors.email && <p className="err">{errors.email.message}</p>}</div>
          <div><label className="label">Phone</label><input className="field" maxLength={10} {...register('phone')} />{errors.phone && <p className="err">{errors.phone.message}</p>}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Rank</label><select className="field" {...register('rank')}>{RANKS.map((r) => <option key={r.rank} value={r.rank}>{r.rank}. {r.code} — {r.name}</option>)}</select></div>
          <div><label className="label">Branch</label><select className="field" {...register('branchId')}><option value="">— None —</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sponsor / Upline</label>
            <select className="field" {...register('referredBy')}>
              <option value="">— None (top of tree) —</option>
              {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.rank ? `R${s.rank}` : '—'})</option>)}
            </select>
          </div>
          <div><label className="label">Sponsor code</label><input className="field" placeholder="Auto if blank" {...register('sponsorCode')} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Status</label><select className="field" {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          <label className="flex items-end gap-2 pb-2.5 text-sm text-ink-2"><input type="checkbox" className="accent-gold-1" {...register('isSuperAdmin')} /> Super Admin</label>
        </div>
        {!isEdit && (
          <div><label className="label">Password (optional)</label><input className="field" type="password" placeholder="Auto-generate if blank" {...register('password')} /></div>
        )}
        {!isEdit && <p className="text-xs text-ink-2">Creates a login account. Leave password blank to auto-generate a secure temporary one.</p>}
      </form>
    </ConfirmDialog>
  )
}
