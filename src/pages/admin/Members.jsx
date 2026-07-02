import { useMemo, useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { where } from 'firebase/firestore'
import { Link, useNavigate } from 'react-router-dom'
import { useCollection, fetchCollection } from '../../hooks/useFirestore'
import { memberSchema } from '../../lib/schemas'
import { createMember, updateMember } from '../../lib/admin'
import { useRanks } from '../../contexts/RanksContext'
import { fmtDate, formatINR, formatCompactINR } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SkeletonTable, SkeletonStats } from '../../components/ui/LoadingSkeleton'
import { IPlus, IUsers, ISearch, IClose, ICash, ITrophy, IShield } from '../../components/ui/icons'
import { computeEarnings } from '../../lib/earnings'

export default function Members() {
  const members = useCollection('users')
  const branches = useCollection('branches')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // { mode:'new'|'edit', member }
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.data
      .filter((m) => !q || m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.phone?.includes(q) || m.sponsorCode?.toLowerCase().includes(q))
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
  }, [members.data, search])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const match = members.data.find(
        (m) => m.sponsorCode?.toLowerCase() === search.trim().toLowerCase()
      )
      if (match) {
        navigate(`/admin/members/${match.id}`)
      }
    }
  }

  const branchName = (bid) => branches.data.find((b) => b.id === bid)?.name || '—'
  const memberName = (uid) => members.data.find((m) => m.id === uid)?.name || '—'

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleKeyDown} placeholder="Search members by code, name, phone…" className="field pl-10" />
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
                    <td className="font-medium text-ink-1">
                      <Link to={`/admin/members/${m.id}`} className="hover:text-gold-1 hover:underline">
                        {m.name}
                      </Link>
                      <div className="text-xs text-ink-2">{m.email}</div>
                    </td>
                    <td className="font-mono text-sm">
                      <Link to={`/admin/members/${m.id}`} className="text-ink-1 font-semibold hover:text-gold-1 hover:underline">
                        {m.sponsorCode || '—'}
                      </Link>
                      {m.password && (
                        <div className="text-[11px] text-ink-2 mt-0.5">
                          Pwd: <span className="select-all font-mono font-medium bg-navy-2 px-1 rounded border border-navy-4">{m.password}</span>
                        </div>
                      )}
                    </td>
                    <td><RankBadge rank={m.rank} size="sm" />{m.isSuperAdmin && <span className="ml-1 rounded-full bg-gold-1/15 px-2 py-0.5 text-[10px] font-bold text-gold">SUPER</span>}</td>

                    <td className="text-ink-2">{m.referredBy ? memberName(m.referredBy) : '—'}</td>
                    <td className="text-ink-2">{branchName(m.branchId)}</td>
                    <td className="text-ink-2">{fmtDate(m.joinDate)}</td>
                    <td><StatusBadge status={m.status || 'active'} /></td>
                    <td className="space-x-2">
                      <Link to={`/admin/members/${m.id}`} className="text-xs font-semibold text-gold hover:underline">View Profile</Link>
                      <button type="button" onClick={() => setModal({ mode: 'edit', member: m })} className="text-xs font-semibold text-gold hover:underline">Edit</button>
                    </td>
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
  const { config, nextRank, getRank } = useRanks()
  const RANKS = config.RANKS
  const isEdit = modal.mode === 'edit'
  const m = modal.member
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('performance') // 'performance' | 'profile' | 'edit'
  const [createdAgent, setCreatedAgent] = useState(null)

  // Performance data states
  const [ownPlans, setOwnPlans] = useState([])
  const [ownPayments, setOwnPayments] = useState([])
  const [downlinePlans, setDownlinePlans] = useState([])
  const [statsLoading, setStatsLoading] = useState(true)

  const initialSponsorCode = useMemo(() => {
    if (!m?.referredBy || !members) return ''
    return members.find(u => u.id === m.referredBy)?.sponsorCode || ''
  }, [m?.referredBy, members])

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: m?.name || '', email: m?.email || '', phone: m?.phone || '',
      rank: m?.rank || 1, branchId: m?.branchId || '', isSuperAdmin: m?.isSuperAdmin || false,
      status: m?.status || 'active', referredBy: m?.referredBy || '', sponsorCode: m?.sponsorCode || '',
      password: '', address: m?.address || '', dob: m?.dob || '',
      sponsorCodeInput: initialSponsorCode,
    },
  })

  // Fetch performance data if in edit mode
  useEffect(() => {
    if (!isEdit || !m?.id) {
      setStatsLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setStatsLoading(true)
        const plansData = await fetchCollection('plans', [where('agentId', '==', m.id)])
        const paymentsData = await fetchCollection('payments', [where('agentId', '==', m.id)])
        
        // Fetch downline plans
        const downlineUsers = await fetchCollection('users', [where('referredBy', '==', m.id)])
        const dlIds = downlineUsers.map((d) => d.id).slice(0, 10)
        let dlPlansData = []
        if (dlIds.length > 0) {
          dlPlansData = await fetchCollection('plans', [where('agentId', 'in', dlIds)])
        }
        
        if (!cancelled) {
          setOwnPlans(plansData)
          setOwnPayments(paymentsData)
          setDownlinePlans(dlPlansData)
        }
      } catch (e) {
        console.error('Error fetching member details:', e)
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isEdit, m?.id])

  const model = useMemo(() => {
    if (!isEdit || statsLoading) return null
    return computeEarnings({
      rank: m?.rank || 1,
      ownPlans,
      payments: ownPayments,
      downlinePlans,
      ranksConfig: config,
    })
  }, [isEdit, statsLoading, m?.rank, ownPlans, ownPayments, downlinePlans, config])

  const sortedPayments = useMemo(() => {
    return [...ownPayments].sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate)).slice(0, 5)
  }, [ownPayments])

  const branchName = (bid) => branches.find((b) => b.id === bid)?.name || '—'
  const memberName = (uid) => members.find((x) => x.id === uid)?.name || '—'

  // Filter inactive ranks from select dropdowns, unless it is already the member's rank
  const activeRanks = useMemo(() => {
    return RANKS.filter(r => r.status !== 'inactive' || r.rank === m?.rank)
  }, [RANKS, m?.rank])

  const submit = async (form) => {
    setSaving(true)
    try {
      // Validate Sponsor ID (referredBy Code)
      const sponsorCodeInput = form.sponsorCodeInput?.trim()
      if (sponsorCodeInput) {
        if (isEdit && sponsorCodeInput === m.sponsorCode) {
          toast.error('Agent cannot sponsor themselves')
          setSaving(false)
          return
        }
        const sponsorObj = (members || []).find(u => u.sponsorCode === sponsorCodeInput)
        if (!sponsorObj) {
          toast.error('Invalid Sponsor ID: Sponsor agent does not exist')
          setSaving(false)
          return
        }
        form.referredBy = sponsorObj.id
      } else {
        form.referredBy = null
      }

      // Auto-generate a unique Agent Code (Agent ID) starting from AG000001.
      if (!form.sponsorCode) {
        let maxId = 0
        if (members && members.length > 0) {
          members.forEach(member => {
            if (member.sponsorCode) {
              const numStr = member.sponsorCode.replace(/^[A-Z]+/i, '')
              const num = parseInt(numStr, 10)
              if (!isNaN(num) && num > maxId) {
                maxId = num
              }
            }
          })
        }
        const nextId = maxId + 1
        form.sponsorCode = `AG${String(nextId).padStart(6, '0')}`
      }

      const cleanForm = { ...form }
      delete cleanForm.sponsorCodeInput

      if (isEdit) {
        await updateMember(m.id, cleanForm)
        toast.success('Member updated')
        onClose()
      } else {
        const tempPassword = form.password || `Apex@${Math.floor(1000 + Math.random() * 9000)}`
        const { uid } = await createMember(cleanForm, tempPassword)
        setCreatedAgent({
          id: uid,
          name: form.name,
          sponsorCode: form.sponsorCode,
          password: tempPassword,
          phone: form.phone
        })
      }
    } catch (e) {
      toast.error(e.code === 'auth/email-already-in-use' ? 'Email already in use' : e.message || 'Could not save member')
    } finally {
      if (!createdAgent) {
        setSaving(false)
      }
    }
  }

  // Credentials success modal popup
  if (createdAgent) {
    return (
      <ConfirmDialog
        open
        title="Agent Onboarded Successfully"
        confirmLabel="Send WhatsApp Welcome"
        cancelLabel="Copy Credentials"
        onConfirm={() => {
          const loginUrl = window.location.origin
          const message = `Welcome to Apex!

Dear ${createdAgent.name},

Your account has been created successfully.

Agent Code:
${createdAgent.sponsorCode}

Password:
${createdAgent.password}

Login URL:
${loginUrl}

Please change your password after your first login.

Welcome to the Apex Family.`
          const encoded = encodeURIComponent(message)
          const cleanPhone = createdAgent.phone.replace(/\D/g, '')
          const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone
          window.open(`https://wa.me/${formattedPhone}?text=${encoded}`, '_blank')
        }}
        onCancel={() => {
          const loginUrl = window.location.origin
          const credentialsText = `Agent Code: ${createdAgent.sponsorCode}\nPassword: ${createdAgent.password}\nLogin URL: ${loginUrl}`
          navigator.clipboard.writeText(credentialsText)
          toast.success('Credentials copied to clipboard')
        }}
        onClose={() => {
          setCreatedAgent(null)
          onClose()
        }}
      >
        <div className="space-y-4 text-xs leading-relaxed py-2">
          <p className="text-ok font-bold">✓ Agent has been created and registered in Firebase Authentication database.</p>
          <div className="bg-navy-2 border border-navy-4 p-4 rounded-card space-y-2">
            <div>
              <span className="block text-[10px] text-ink-2 font-mono">AGENT NAME</span>
              <span className="text-ink-1 font-semibold">{createdAgent.name}</span>
            </div>
            <div>
              <span className="block text-[10px] text-ink-2 font-mono">AGENT CODE (SPONSOR ID)</span>
              <span className="text-gold font-bold font-mono text-sm">{createdAgent.sponsorCode}</span>
            </div>
            <div>
              <span className="block text-[10px] text-ink-2 font-mono">TEMPORARY PASSWORD</span>
              <span className="text-ink-1 font-bold font-mono select-all bg-navy-3 px-2 py-0.5 rounded border border-navy-4">{createdAgent.password}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link 
              to={`/admin/members/${createdAgent.id}`} 
              onClick={() => setCreatedAgent(null)} 
              className="btn-ghost flex-1 py-2 text-center text-xs border border-navy-4 hover:border-gold-1/30 rounded inline-block"
            >
              View Agent Profile
            </Link>
          </div>
        </div>
      </ConfirmDialog>
    )
  }

  // Adding a member: render the standard ConfirmDialog modal
  if (!isEdit) {
    return (
      <ConfirmDialog open title="Add member" confirmLabel="Create" loading={saving} onConfirm={handleSubmit(submit)} onClose={onClose}>
        <form className="mt-3 space-y-3" onSubmit={handleSubmit(submit)}>
          <div><label className="label">Full name</label><input className="field" {...register('name')} />{errors.name && <p className="err">{errors.name.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Email</label><input className="field" type="email" {...register('email')} />{errors.email && <p className="err">{errors.email.message}</p>}</div>
            <div><label className="label">Phone</label><input className="field" maxLength={10} {...register('phone')} />{errors.phone && <p className="err">{errors.phone.message}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Date of Birth</label><input className="field" type="date" {...register('dob')} />{errors.dob && <p className="err">{errors.dob.message}</p>}</div>
            <div><label className="label">Branch</label><select className="field" {...register('branchId')}><option value="">— None —</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          </div>
          <div><label className="label">Address</label><textarea className="field h-16 resize-none" {...register('address')} />{errors.address && <p className="err">{errors.address.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Rank</label><select className="field" {...register('rank')}>{activeRanks.map((r) => <option key={r.rank} value={r.rank}>{r.rank}. {r.code} — {r.name}</option>)}</select></div>
            <div>
              <label className="label">Sponsor ID (Agent Code)</label>
              <input 
                className="field font-mono uppercase" 
                placeholder="e.g. AG000001 (leave blank for top)" 
                {...register('sponsorCodeInput')} 
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Sponsor code (Agent Code)</label><input className="field" placeholder="Auto if blank" {...register('sponsorCode')} /></div>
            <div><label className="label">Status</label><select className="field" {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          </div>
          <div className="flex items-end gap-2 pb-1 text-sm text-ink-2">
            <input type="checkbox" id="isSuperAdmin" className="accent-gold-1 h-4 w-4" {...register('isSuperAdmin')} />
            <label htmlFor="isSuperAdmin" className="text-xs font-semibold text-ink-1">Super Admin Account</label>
          </div>
          <div><label className="label">Password (optional)</label><input className="field" type="password" placeholder="Auto-generate if blank" {...register('password')} /></div>
          <p className="text-xs text-ink-2">Creates a login account. Leave password blank to auto-generate a secure temporary one.</p>
        </form>
      </ConfirmDialog>
    )
  }

  // Editing a member: render the large tabbed Master-Detail modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-1/85 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="card relative z-10 w-full max-w-3xl bg-navy-3 border border-navy-4 p-6 shadow-xl max-h-[92vh] overflow-y-auto flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-navy-4 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-xl font-bold text-ink-1 tracking-tight">{m?.name}</h3>
              <RankBadge rank={m?.rank} size="sm" />
            </div>
            <p className="text-xs text-ink-2 mt-0.5">Agent Details & Performance Profiling</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-2 hover:text-ink-1">
            <IClose size={19} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-1.5 border-b border-navy-4/50 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('performance')}
            className={`px-3.5 py-1.5 text-xs font-bold uppercase rounded-md tracking-wider transition-all ${
              activeTab === 'performance' ? 'bg-gold-1 text-white shadow-sm font-semibold' : 'text-ink-2 hover:bg-navy-4/30'
            }`}
          >
            Overview & Performance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-1.5 text-xs font-bold uppercase rounded-md tracking-wider transition-all ${
              activeTab === 'profile' ? 'bg-gold-1 text-white shadow-sm font-semibold' : 'text-ink-2 hover:bg-navy-4/30'
            }`}
          >
            Bank & Identity Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={`px-3.5 py-1.5 text-xs font-bold uppercase rounded-md tracking-wider transition-all ${
              activeTab === 'edit' ? 'bg-gold-1 text-white shadow-sm font-semibold' : 'text-ink-2 hover:bg-navy-4/30'
            }`}
          >
            Edit Settings
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-[360px]">
          {activeTab === 'performance' && (
            statsLoading ? (
              <div className="space-y-4 pt-4"><SkeletonStats count={4} /><SkeletonTable rows={4} cols={4} /></div>
            ) : model ? (
              <div className="space-y-5 pt-1">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="border border-navy-4 bg-navy-2/40 p-3 rounded-card">
                    <span className="text-[10px] text-ink-2 uppercase font-bold tracking-wider">Earnings (Month)</span>
                    <p className="text-lg font-bold text-gold-1 font-serif mt-1">{formatINR(model.totalThisMonth)}</p>
                  </div>
                  <div className="border border-navy-4 bg-navy-2/40 p-3 rounded-card">
                    <span className="text-[10px] text-ink-2 uppercase font-bold tracking-wider">MDA Accrual</span>
                    <p className="text-lg font-bold text-ink-1 font-serif mt-1">{formatINR(model.mda)}</p>
                  </div>
                  <div className="border border-navy-4 bg-navy-2/40 p-3 rounded-card">
                    <span className="text-[10px] text-ink-2 uppercase font-bold tracking-wider">MFA Payout</span>
                    <p className="text-lg font-bold text-ink-1 font-serif mt-1">{formatINR(model.mfa)}</p>
                  </div>
                  <div className="border border-navy-4 bg-navy-2/40 p-3 rounded-card">
                    <span className="text-[10px] text-ink-2 uppercase font-bold tracking-wider">Pension Accrued</span>
                    <p className="text-lg font-bold text-ink-1 font-serif mt-1">{formatINR(model.fdAccrual)}</p>
                  </div>
                </div>

                {/* Progress Indicators */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="border border-navy-4 p-4 rounded-card bg-navy-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-ink-1 mb-2">
                      <ITrophy size={16} className="text-[#8D7952]" /> Performance Bonus
                    </div>
                    {model.pb.target > 0 ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-ink-2">
                          <span>{formatINR(model.pb.current)} / {formatINR(model.pb.target)}</span>
                          <span className={model.pb.achieved ? 'text-ok font-semibold' : ''}>
                            {model.pb.achieved ? `Earned ${formatINR(model.pb.amount)}` : `Reward ${formatINR(model.pb.amount)}`}
                          </span>
                        </div>
                        <div className="h-2 bg-navy-2 rounded-full overflow-hidden">
                          <div className={`h-full ${model.pb.achieved ? 'bg-ok' : 'bg-gold-1'}`} style={{ width: `${Math.max(0, Math.min(100, model.pb.progress))}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-ink-2 italic">No performance targets active.</p>
                    )}
                  </div>

                  <div className="border border-navy-4 p-4 rounded-card bg-navy-3">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-ink-1">
                        <IShield size={16} className="text-[#8D7952]" /> CMD Award Progress
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${model.cmd.qualified ? 'bg-ok/10 text-ok' : 'bg-gold-1/10 text-gold-1'}`}>
                        {model.cmd.qualified ? 'Qualified' : 'Active'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-ink-2">
                        <span>BV: {formatCompactINR(model.cmd.weightedTotal)} / {formatCompactINR(model.cmd.target)}</span>
                        <span>Reward: {formatINR(model.cmd.amount)}</span>
                      </div>
                      <div className="h-2 bg-navy-2 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-1" style={{ width: `${Math.max(0, Math.min(100, model.cmd.progress))}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Collections (What he does) */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan mb-2.5">
                    Recent Collections by Agent
                  </h4>
                  {sortedPayments.length ? (
                    <div className="table-wrap">
                      <table className="tbl text-xs">
                        <thead>
                          <tr>
                            <th>Receipt</th>
                            <th>Customer</th>
                            <th>Amount</th>
                            <th>Mode</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedPayments.map((p) => (
                            <tr key={p.id}>
                              <td className="font-mono text-[10px] text-ink-2">{p.receiptNumber}</td>
                              <td className="text-ink-1 font-medium">{p.customerName || '—'}</td>
                              <td className="font-semibold text-ink-1">{formatINR(p.amount)}</td>
                              <td className="uppercase font-medium text-ink-2">{p.paymentMode}</td>
                              <td className="text-ink-2">{fmtDate(p.paidDate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-xs text-ink-2 italic bg-navy-2/30 p-4 rounded-card border border-navy-4/50 text-center">
                      No collections recorded by this agent.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic pt-4">No performance metrics generated.</p>
            )
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Credentials */}
                <div className="border border-navy-4 p-4 rounded-card space-y-3 bg-navy-2/30">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1 border-b border-navy-4/50">
                    System Credentials
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="block text-[10px] text-ink-2">Agent ID</span>
                      <span className="font-semibold text-ink-1 font-mono">{m?.sponsorCode || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">Password</span>
                      <span className="font-semibold text-ink-1 font-mono select-all bg-navy-3 px-1 rounded border border-navy-4">{m?.password || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Identity Documents */}
                <div className="border border-navy-4 p-4 rounded-card space-y-3 bg-navy-2/30">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1 border-b border-navy-4/50">
                    Identity Documents
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="block text-[10px] text-ink-2">Aadhaar Number</span>
                      <span className="font-semibold text-ink-1 font-mono">{m?.aadhaar || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">PAN Card Number</span>
                      <span className="font-semibold text-ink-1 font-mono uppercase">{m?.pan || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Personal Details */}
              <div className="border border-navy-4 p-4 rounded-card space-y-3 bg-navy-2/30">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1 border-b border-navy-4/50">
                  Personal Details
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                  <div>
                    <span className="block text-[10px] text-ink-2">Date of Birth</span>
                    <span className="font-semibold text-ink-1">{m?.dob || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-ink-2">Address</span>
                    <span className="font-semibold text-ink-1 whitespace-pre-wrap">{m?.address || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="border border-navy-4 p-4 rounded-card space-y-3 bg-navy-2/30">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1 border-b border-navy-4/50">
                  Bank Account Information
                </h4>
                {m?.profileCompleted ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                    <div>
                      <span className="block text-[10px] text-ink-2">Account Holder Name</span>
                      <span className="font-semibold text-ink-1">{m.bankDetails?.accountHolderName || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">Bank Name</span>
                      <span className="font-semibold text-ink-1">{m.bankDetails?.bankName || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">Account Number</span>
                      <span className="font-semibold text-ink-1 font-mono">{m.bankDetails?.accountNumber || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">IFSC Code</span>
                      <span className="font-semibold text-ink-1 font-mono uppercase">{m.bankDetails?.ifscCode || '—'}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="block text-[10px] text-ink-2">Branch Name</span>
                      <span className="font-semibold text-ink-1">{m.bankDetails?.branch || '—'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-2 italic text-center py-2">Agent has not completed their onboarding registration details yet.</p>
                )}
              </div>

              {/* Sponsorship details */}
              <div className="border border-navy-4 p-4 rounded-card text-xs space-y-2 bg-navy-2/30">
                <div className="grid grid-cols-3 gap-2">
                  <div><span className="block text-[10px] text-ink-2">Sponsor / Upline</span><span className="font-medium text-ink-1">{m?.referredBy ? memberName(m.referredBy) : '—'}</span></div>
                  <div><span className="block text-[10px] text-ink-2">Branch Office</span><span className="font-medium text-ink-1">{branchName(m?.branchId)}</span></div>
                  <div><span className="block text-[10px] text-ink-2">Joined Date</span><span className="font-medium text-ink-1">{fmtDate(m?.joinDate)}</span></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'edit' && (
            <form id="edit-member-form" className="space-y-3.5 pt-1" onSubmit={handleSubmit(submit)}>
              <div><label className="label">Full name</label><input className="field" {...register('name')} />{errors.name && <p className="err">{errors.name.message}</p>}</div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Email</label><input className="field" type="email" disabled {...register('email')} />{errors.email && <p className="err">{errors.email.message}</p>}</div>
                <div><label className="label">Phone</label><input className="field" maxLength={10} {...register('phone')} />{errors.phone && <p className="err">{errors.phone.message}</p>}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Date of Birth</label><input className="field" type="date" {...register('dob')} />{errors.dob && <p className="err">{errors.dob.message}</p>}</div>
                <div><label className="label">Branch</label><select className="field" {...register('branchId')}><option value="">— None —</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              </div>
              <div><label className="label">Address</label><textarea className="field h-16 resize-none" {...register('address')} />{errors.address && <p className="err">{errors.address.message}</p>}</div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Rank</label><select className="field" {...register('rank')}>{activeRanks.map((r) => <option key={r.rank} value={r.rank}>{r.rank}. {r.code} — {r.name}</option>)}</select></div>
                <div>
                  <label className="label">Sponsor ID (Agent Code)</label>
                  <input 
                    className="field font-mono uppercase" 
                    placeholder="e.g. AG000001 (leave blank for top)" 
                    {...register('sponsorCodeInput')} 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Agent Code (Sponsor Code)</label><input className="field font-mono" disabled {...register('sponsorCode')} /></div>
                <div><label className="label">Status</label><select className="field" {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="isSuperAdmin" className="accent-gold-1 h-4 w-4" {...register('isSuperAdmin')} />
                <label htmlFor="isSuperAdmin" className="text-sm font-semibold text-ink-1">Super Admin Account</label>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-navy-4/50">
          <button type="button" onClick={onClose} className="btn-ghost">
            Close
          </button>
          {activeTab === 'edit' && (
            <button
              type="submit"
              form="edit-member-form"
              disabled={saving}
              className="btn-gold px-6"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
