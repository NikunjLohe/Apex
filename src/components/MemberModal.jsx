import { useMemo, useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCollection, fetchCollection, useDoc } from '../hooks/useFirestore'
import { memberSchema } from '../lib/schemas'
import { createMember, updateMember } from '../lib/admin'
import { useRanks } from '../contexts/RanksContext'
import { fmtDate, formatINR, formatCompactINR } from '../utils/format'
import RankBadge from './ui/RankBadge'
import StatusBadge from './ui/StatusBadge'
import ConfirmDialog from './ui/ConfirmDialog'
import { SkeletonTable, SkeletonStats } from './ui/LoadingSkeleton'
import { IClose, ICash, ITrophy, IShield } from './ui/icons'
import { computeEarnings } from '../lib/earnings'

export default function MemberModal({ modal, branches, members, settings, onClose }) {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.isSuperAdmin === true

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
    if (isEdit) {
      if (!m?.referredBy || !members) return ''
      return members.find(u => u.id === m.referredBy)?.sponsorCode || ''
    } else {
      return ''
    }
  }, [isEdit, m?.referredBy, members])

  const initialRank = useMemo(() => {
    if (isEdit) return m?.rank || 1
    // For agents recruiting, default to Rank 1 (AO) since it is below all other ranks
    return 1
  }, [isEdit, m?.rank])

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: m?.name || '',
      email: m?.email || '',
      phone: m?.phone || '',
      rank: initialRank,
      branchId: m?.branchId || (!isSuperAdmin ? profile?.branchId || '' : ''),
      isSuperAdmin: m?.isSuperAdmin || false,
      status: m?.status || 'active',
      referredBy: m?.referredBy || (!isSuperAdmin ? profile?.uid || '' : ''),
      sponsorCode: m?.sponsorCode || '',
      password: '',
      address: m?.address || '',
      dob: m?.dob || '',
      sponsorCodeInput: initialSponsorCode,
      panNumber: m?.panNumber || '',
    },
  })

  const sponsorCodeInputVal = watch('sponsorCodeInput')

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

  const selectedSponsor = useMemo(() => {
    // If blank: Super Admin has no sponsor, Agent defaults to themselves
    if (!sponsorCodeInputVal?.trim()) {
      if (!isSuperAdmin && profile) return profile  // agent defaults to self
      return null
    }
    if (!members) return null
    const clean = sponsorCodeInputVal.trim().toUpperCase()
    return members.find(u => u.sponsorCode?.toUpperCase() === clean) || null
  }, [sponsorCodeInputVal, members, isSuperAdmin, profile])

  const cannotRecruit = useMemo(() => {
    return selectedSponsor && Number(selectedSponsor.rank) === 1
  }, [selectedSponsor])

  // Filter allowed ranks
  const activeRanks = useMemo(() => {
    let list = RANKS.filter(r => r.status !== 'inactive' || r.rank === m?.rank)
    if (selectedSponsor) {
      // Ranks strictly below the effective sponsor's rank
      list = list.filter(r => r.rank < selectedSponsor.rank || r.rank === m?.rank)
    } else if (isEdit && m?.rank) {
      list = list.filter(r => r.rank === m.rank)
    } else if (!isEdit && isSuperAdmin) {
      // Super Admin no sponsor → all ranks for root agent
    } else {
      return []
    }
    return list
  }, [RANKS, m?.rank, selectedSponsor, isEdit, isSuperAdmin])

  const submit = async (form) => {
    setSaving(true)
    try {
      // Enforce PAN uppercase
      if (form.panNumber) form.panNumber = form.panNumber.toUpperCase()

      // Frontend Uniqueness Checks
      if (form.panNumber) {
        const panDup = (members || []).find(u => u.panNumber === form.panNumber)
        if (panDup && (!isEdit || panDup.id !== m.id)) {
          toast.error('PAN number is already registered to another agent')
          setSaving(false)
          return
        }
      }

      const phoneDup = (members || []).find(u => u.phone === form.phone)
      if (phoneDup && (!isEdit || phoneDup.id !== m.id)) {
        toast.error('Phone number is already registered to another agent')
        setSaving(false)
        return
      }

      if (form.email && form.email.trim()) {
        const emailDup = (members || []).find(u => u.email?.toLowerCase() === form.email.trim().toLowerCase())
        if (emailDup && (!isEdit || emailDup.id !== m.id)) {
          toast.error('Email address is already registered to another agent')
          setSaving(false)
          return
        }
      }

      // Sponsor lookup & hierarchy rules enforcement
      let finalReferredBy = null
      const sponsorCodeInput = form.sponsorCodeInput?.trim()
      if (!sponsorCodeInput) {
        if (isSuperAdmin) {
          // Super Admin + blank = root agent, no sponsor
          finalReferredBy = null
        } else {
          // Agent + blank = recruit directly under themselves
          finalReferredBy = profile?.uid || null
        }
      } else {
        if (isEdit && sponsorCodeInput.toUpperCase() === m.sponsorCode?.toUpperCase()) {
          toast.error('Agent cannot sponsor themselves')
          setSaving(false)
          return
        }
        const sponsorObj = (members || []).find(u => u.sponsorCode?.toUpperCase() === sponsorCodeInput.toUpperCase())
        if (!sponsorObj) {
          toast.error('Invalid Sponsor ID: Sponsor agent does not exist')
          setSaving(false)
          return
        }
        if (Number(sponsorObj.rank) === 1) {
          toast.error('This sponsor cannot recruit new members')
          setSaving(false)
          return
        }
        finalReferredBy = sponsorObj.id
      }

      form.referredBy = finalReferredBy

      // Frontend Sponsor Rank restriction
      if (finalReferredBy) {
        const sponsorObj = (members || []).find(u => u.id === finalReferredBy)
        if (sponsorObj) {
          const sponsorRank = Number(sponsorObj.rank || 1)
          const recruitRank = Number(form.rank)
          if (recruitRank >= sponsorRank) {
            toast.error(`Recruitment Rank Violation: Allowed ranks are only below Rank ${sponsorRank}`)
            setSaving(false)
            return
          }
        }
      }

      const cleanForm = { ...form }
      delete cleanForm.sponsorCodeInput

      if (isEdit) {
        await updateMember(m.id, cleanForm)
        toast.success('Member updated')
        onClose()
      } else {
        const tempPassword = form.password || `Apex@${Math.floor(1000 + Math.random() * 9000)}`
        const { uid: newUid, sponsorCode: newSponsorCode } = await createMember(cleanForm, tempPassword)
        
        // Re-read settings or build generated email values for modal view
        const domain = settings?.agentEmailDomain || 'apex.local'
        const generatedEmail = cleanForm.email ? cleanForm.email.toLowerCase() : `${newSponsorCode.toLowerCase()}@${domain}`

        setCreatedAgent({
          id: newUid,
          name: form.name,
          sponsorCode: newSponsorCode,
          email: generatedEmail,
          password: tempPassword,
          phone: form.phone
        })
      }
    } catch (e) {
      toast.error(e.message || 'Could not save member')
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
\nDear ${createdAgent.name},
\nYour account has been created successfully.
\nAgent Code:\n${createdAgent.sponsorCode}
\nLogin Email:\n${createdAgent.email}
\nPassword:\n${createdAgent.password}
\nLogin URL:\n${loginUrl}
\nPlease change your password after your first login.
\nWelcome to the Apex Family.`
          const encoded = encodeURIComponent(message)
          const cleanPhone = createdAgent.phone.replace(/\D/g, '')
          const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone
          window.open(`https://wa.me/${formattedPhone}?text=${encoded}`, '_blank')
        }}
        onClose={() => {
          const loginUrl = window.location.origin
          const credentialsText = `Agent Code: ${createdAgent.sponsorCode}\nLogin Email: ${createdAgent.email}\nPassword: ${createdAgent.password}\nLogin URL: ${loginUrl}`
          navigator.clipboard.writeText(credentialsText).catch(err => {
            console.warn('Clipboard write failed:', err)
          })
          toast.success('Credentials copied to clipboard')
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
              <span className="block text-[10px] text-ink-2 font-mono">LOGIN EMAIL</span>
              <span className="text-ink-1 font-bold font-mono text-sm">{createdAgent.email}</span>
            </div>
            <div>
              <span className="block text-[10px] text-ink-2 font-mono">TEMPORARY PASSWORD</span>
              <span className="text-ink-1 font-bold font-mono select-all bg-navy-3 px-2 py-0.5 rounded border border-navy-4">{createdAgent.password}</span>
            </div>
          </div>
        </div>
      </ConfirmDialog>
    )
  }

  // Adding a member: render the standard ConfirmDialog modal
  if (!isEdit) {
    return (
      <ConfirmDialog 
        open 
        title="Add member" 
        confirmLabel="Create" 
        loading={saving} 
        confirmDisabled={cannotRecruit || (sponsorCodeInputVal?.trim() && !selectedSponsor)}
        onConfirm={handleSubmit(submit)} 
        onClose={onClose}
      >
        <form className="mt-3 space-y-2" onSubmit={handleSubmit(submit)} autoComplete="off">
          {/* Fake fields to defeat browser autofill */}
          <div style={{ position: 'absolute', opacity: 0, height: 0, width: 0, overflow: 'hidden' }}>
            <input type="text" name="chrome-username-dummy" tabIndex="-1" />
            <input type="password" name="chrome-password-dummy" tabIndex="-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="label">Full name</label>
              <input className="field" autoComplete="off" {...register('name')} />
              {errors.name && <p className="err">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="field" maxLength={10} autoComplete="off" {...register('phone')} />
              {errors.phone && <p className="err">{errors.phone.message}</p>}
            </div>
            <div>
              <label className="label">Date of Birth</label>
              <input className="field" type="date" {...register('dob')} />
              {errors.dob && <p className="err">{errors.dob.message}</p>}
            </div>
            
            {isSuperAdmin ? (
              <>
                <div>
                  <label className="label">Branch</label>
                  <select className="field" {...register('branchId')}>
                    <option value="">— None —</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Rank</label>
                  <select 
                    className="field" 
                    disabled={!selectedSponsor && sponsorCodeInputVal?.trim()}
                    {...register('rank', { valueAsNumber: true })}
                  >
                    {activeRanks.length === 0 ? (
                      <option value="">— No eligible ranks —</option>
                    ) : (
                      <>
                        <option value="">— Select a rank —</option>
                        {activeRanks.map((r) => <option key={r.rank} value={r.rank}>{r.rank}. {r.code} — {r.name}</option>)}
                      </>
                    )}
                  </select>
                  {errors.rank && <p className="err">{errors.rank.message}</p>}
                </div>
              </>
            ) : (
              <>
                {/* For non-super admins (Agents): Lock Branch but keep Rank dropdown dynamic */}
                <div>
                  <label className="label">Branch</label>
                  <input type="hidden" value={profile?.branchId || ''} {...register('branchId')} />
                  <select className="field bg-navy-2/60 text-ink-2" disabled value={profile?.branchId || ''}>
                    <option value="">— None —</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Rank</label>
                  <select 
                    className="field"
                    {...register('rank', { valueAsNumber: true })}
                  >
                    <option value="">— Select a rank —</option>
                    {activeRanks.map((r) => <option key={r.rank} value={r.rank}>{r.rank}. {r.code} — {r.name}</option>)}
                  </select>
                  {errors.rank && <p className="err">{errors.rank.message}</p>}
                </div>
              </>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="label">Address</label>
              <textarea className="field h-12 resize-none" autoComplete="off" {...register('address')} />
              {errors.address && <p className="err">{errors.address.message}</p>}
            </div>
            <div>
              <label className="label">PAN Number</label>
              <input className="field font-mono uppercase" maxLength={10} autoComplete="off" {...register('panNumber')} />
              {errors.panNumber && <p className="err">{errors.panNumber.message}</p>}
            </div>
            <div>
              <label className="label">Agent Code</label>
              <input className="field" placeholder="Auto-generated" disabled {...register('sponsorCode')} />
            </div>
 
            <div>
              <label className="label">Sponsor ID</label>
              <input 
                className="field font-mono uppercase" 
                placeholder={`e.g. ${settings?.agentPrefix || 'KB'}000001`}
                autoComplete="off"
                readOnly
                onFocus={(e) => e.target.removeAttribute('readOnly')}
                {...register('sponsorCodeInput')} 
              />
              {selectedSponsor ? (
                cannotRecruit ? (
                  <p className="text-danger text-[10px] mt-1 font-semibold">
                    ✗ This sponsor cannot recruit new members.
                  </p>
                ) : !isSuperAdmin && !sponsorCodeInputVal?.trim() ? (
                  // Agent with blank sponsor: show default message
                  <p className="text-sky-400 text-[10px] mt-1 font-semibold">
                    ℹ Leave blank to recruit directly under you ({selectedSponsor.name})
                  </p>
                ) : (
                  <p className="text-emerald-500 text-[10px] mt-1 font-semibold">
                    ✓ Sponsor: {selectedSponsor.name} ({getRank(selectedSponsor.rank).code})
                  </p>
                )
              ) : sponsorCodeInputVal?.trim() ? (
                <p className="text-danger text-[10px] mt-1 font-semibold">
                  ✗ Invalid Sponsor ID
                </p>
              ) : null}
            </div>
 
            {isSuperAdmin ? (
              <div>
                <label className="label">Status</label>
                <select className="field" {...register('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="label">Status</label>
                <input type="hidden" value="active" {...register('status')} />
                <input className="field bg-navy-2/60 text-ink-2" disabled value="Active" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 mt-2">
            <div>
              <label className="label">Email address (optional)</label>
              <input 
                type="text" 
                className="field" 
                autoComplete="new-password"
                placeholder={isSuperAdmin ? "Custom email or leave blank for auto" : "Leave blank for auto-generated login"} 
                {...register('email')} 
              />
              {errors.email && <p className="err">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Temporary Password (optional)</label>
              <input className="field" type="password" autoComplete="new-password" placeholder="Auto-generated if blank" {...register('password')} />
              {errors.password && <p className="err">{errors.password.message}</p>}
            </div>
          </div>

          {isSuperAdmin && (
            <div className="flex items-center gap-2 pb-1 text-sm text-ink-2 mt-2">
              <input type="checkbox" id="isSuperAdmin" className="accent-gold-1 h-4 w-4" {...register('isSuperAdmin')} />
              <label htmlFor="isSuperAdmin" className="text-xs font-semibold text-ink-1">Super Admin Account</label>
            </div>
          )}
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

                {/* Recent Collections */}
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
                      <span className="block text-[10px] text-ink-2">Security Status</span>
                      <span className={`font-bold ${m?.mustChangePassword ? 'text-gold' : 'text-ok'}`}>
                        {m?.mustChangePassword ? 'Change Required' : 'Verified'}
                      </span>
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
                      <span className="font-semibold text-ink-1 font-mono uppercase">{m?.panNumber || '—'}</span>
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
              {/* Fake fields to defeat browser autofill */}
              <div style={{ position: 'absolute', opacity: 0, height: 0, width: 0, overflow: 'hidden' }}>
                <input type="text" name="chrome-username-dummy" tabIndex="-1" />
                <input type="password" name="chrome-password-dummy" tabIndex="-1" />
              </div>
              <div><label className="label">Full name</label><input className="field" {...register('name')} />{errors.name && <p className="err">{errors.name.message}</p>}</div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Email</label><input className="field bg-navy-2/60 text-ink-2" type="email" disabled {...register('email')} />{errors.email && <p className="err">{errors.email.message}</p>}</div>
                <div><label className="label">Phone</label><input className="field" maxLength={10} {...register('phone')} />{errors.phone && <p className="err">{errors.phone.message}</p>}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Date of Birth</label><input className="field" type="date" {...register('dob')} />{errors.dob && <p className="err">{errors.dob.message}</p>}</div>
                <div><label className="label">PAN Number</label><input className="field font-mono uppercase" maxLength={10} placeholder="ABCDE1234F" {...register('panNumber')} />{errors.panNumber && <p className="err">{errors.panNumber.message}</p>}</div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="label">Branch</label>
                  <select className="field" disabled={!isSuperAdmin} {...register('branchId')}>
                    <option value="">— None —</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label">Address</label><textarea className="field h-16 resize-none" {...register('address')} />{errors.address && <p className="err">{errors.address.message}</p>}</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Rank</label>
                  <select 
                    className="field" 
                    disabled={!isSuperAdmin || (!selectedSponsor && !isEdit)} 
                    {...register('rank', { valueAsNumber: true })}
                  >
                    {!selectedSponsor && !isEdit ? (
                      <option value="">— Enter a valid Sponsor ID first —</option>
                    ) : (
                      activeRanks.map((r) => <option key={r.rank} value={r.rank}>{r.rank}. {r.code} — {r.name}</option>)
                    )}
                  </select>
                  {errors.rank && <p className="err">{errors.rank.message}</p>}
                </div>
                <div>
                  <label className="label">Sponsor ID (Agent Code)</label>
                  <input 
                    className="field font-mono uppercase" 
                    placeholder={`e.g. ${settings?.agentPrefix || 'KB'}000001`} 
                    disabled={!isSuperAdmin}
                    autoComplete="new-password"
                    {...register('sponsorCodeInput')} 
                  />
                  {isSuperAdmin && selectedSponsor && (
                    cannotRecruit ? (
                      <p className="text-danger text-[10px] mt-1 font-semibold">
                        ✗ This sponsor cannot recruit new members.
                      </p>
                    ) : (
                      <p className="text-emerald-500 text-[10px] mt-1 font-semibold">
                        ✓ Sponsor: {selectedSponsor.name} ({getRank(selectedSponsor.rank).code})
                      </p>
                    )
                  )}
                  {isSuperAdmin && !selectedSponsor && sponsorCodeInputVal?.trim() && (
                    <p className="text-danger text-[10px] mt-1 font-semibold">
                      ✗ Invalid Sponsor ID
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Agent Code (Sponsor Code)</label><input className="field font-mono" disabled {...register('sponsorCode')} /></div>
                <div>
                  <label className="label">Status</label>
                  <select className="field" disabled={!isSuperAdmin} {...register('status')}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              {isSuperAdmin && (
                <div className="flex items-center gap-2 pt-1">
                  <input type="checkbox" id="isSuperAdmin" className="accent-gold-1 h-4 w-4" {...register('isSuperAdmin')} />
                  <label htmlFor="isSuperAdmin" className="text-sm font-semibold text-ink-1">Super Admin Account</label>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-navy-4/50">
          <button type="button" onClick={onClose} className="btn-ghost">
            Close
          </button>
          {activeTab === 'edit' && isSuperAdmin && (
            <button
              type="submit"
              form="edit-member-form"
              disabled={saving || cannotRecruit || !selectedSponsor}
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
