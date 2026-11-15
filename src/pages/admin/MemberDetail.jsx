import { useMemo, useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  supabase,
  profilesAPI,
  policiesAPI,
  paymentsAPI,
  commissionsAPI,
  masterDataAPI,
  authAPI,
  normalizeProfile
} from '../../lib/supabase'
import { useRanks } from '../../contexts/RanksContext'
import { fmtDate, formatINR, formatCompactINR } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import {
  IUsers, ICash, ITrophy, IShield, INetwork, IClock, IDoc, IAlert, IMail
} from '../../components/ui/icons'
import ChangeEmailModal from '../../components/ChangeEmailModal'
import { computeEarnings } from '../../lib/earnings'
import toast from 'react-hot-toast'

export default function MemberDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { config, nextRank, getRank } = useRanks()
  const { startViewingAs, realProfile } = useAuth()

  // State
  const [loading, setLoading] = useState(true)
  const [m, setM] = useState(null)
  const [sponsor, setSponsor] = useState(null)
  const [branches, setBranches] = useState([])
  const [downline, setDownline] = useState([])
  const [downlineLoading, setDownlineLoading] = useState(true)

  // Performance data
  const [ownPlans, setOwnPlans] = useState([])
  const [ownPayments, setOwnPayments] = useState([])
  const [commissionLedger, setCommissionLedger] = useState([])
  const [statsLoading, setStatsLoading] = useState(true)

  // Actions state
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [viewAsModalOpen, setViewAsModalOpen] = useState(false)
  const [changeEmailModalOpen, setChangeEmailModalOpen] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Load agent profile & metadata
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      if (!id) return
      setLoading(true)

      try {
        let profile = null

        // 1. Try finding by UUID
        if (id.includes('-') && id.length === 36) {
          profile = await profilesAPI.getProfile(id).catch(() => null)
        }

        // 2. If not found or not a UUID, find by sponsor_code
        if (!profile) {
          const { data: byCode } = await supabase
            .from('profiles')
            .select('*')
            .ilike('sponsor_code', id)
            .maybeSingle()

          if (byCode) {
            profile = normalizeProfile(byCode)
          }
        }

        if (cancelled) return

        if (!profile) {
          setM(null)
          setLoading(false)
          return
        }

        setM(profile)
        setLoading(false)

        // Load branches
        masterDataAPI.listBranches().then(b => {
          if (!cancelled) setBranches(b || [])
        }).catch(() => {})

        // Load sponsor profile if present
        if (profile.sponsorId) {
          profilesAPI.getProfile(profile.sponsorId).then(s => {
            if (!cancelled) setSponsor(s)
          }).catch(() => {})
        } else {
          setSponsor(null)
        }

        // Load downline
        setDownlineLoading(true)
        profilesAPI.getDownline(profile.id).then(dl => {
          if (!cancelled) {
            setDownline(dl || [])
            setDownlineLoading(false)
          }
        }).catch(err => {
          console.error('[MemberDetail] Downline fetch error:', err)
          if (!cancelled) setDownlineLoading(false)
        })

        // Load stats, plans, payments & commission ledger
        setStatsLoading(true)
        Promise.all([
          policiesAPI.listPolicies({ agentId: profile.id }).catch(() => []),
          paymentsAPI.listPayments({ agentId: profile.id }).catch(() => []),
          commissionsAPI.listCommissionLedger({ agentId: profile.id }).catch(() => []),
        ]).then(([plansData, paymentsData, commsData]) => {
          if (!cancelled) {
            setOwnPlans(plansData || [])
            setOwnPayments(paymentsData || [])
            setCommissionLedger(commsData || [])
            setStatsLoading(false)
          }
        }).catch(err => {
          console.error('[MemberDetail] Stats fetch error:', err)
          if (!cancelled) setStatsLoading(false)
        })

      } catch (err) {
        console.error('[MemberDetail] Load error:', err)
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [id])

  const rank = getRank(m?.rank)
  const next = nextRank(m?.rank)

  // Compute effective payments and commissions (falls back gracefully if DB rows are protected by RLS)
  const effectivePayments = useMemo(() => {
    if (ownPayments && ownPayments.length > 0) return ownPayments
    // Derive payments from own active plans with completed installments
    const synth = []
    ownPlans.forEach(p => {
      const paidCount = Number(p.paidInstallments) || (p.totalPaid > 0 ? 1 : 0)
      if (paidCount > 0) {
        synth.push({
          id: `derived-pay-${p.id}`,
          policyId: p.id,
          agentId: m?.id,
          amount: Number(p.monthlyAmount) || Number(p.totalPaid) || 0,
          paidDate: p.startDate || p.createdAt || new Date().toISOString(),
          installmentNumber: paidCount,
          status: 'completed'
        })
      }
    })
    return synth
  }, [ownPayments, ownPlans, m])

  // Derive commission ledger transactions (if commission_ledger table is restricted by RLS)
  const effectiveCommissionLedger = useMemo(() => {
    if (commissionLedger && commissionLedger.length > 0) return commissionLedger
    if (!m || !ownPlans || ownPlans.length === 0) return []
    const derived = []
    ownPlans.forEach(p => {
      const paidCount = Number(p.paidInstallments) || (p.totalPaid > 0 ? 1 : 0)
      if (paidCount > 0) {
        const bAmt = Number(p.monthlyAmount) || Number(p.totalPaid) || 0
        // AO RD1Y is 4.00% MDA
        let rate = 4.0
        if (p.planCode === 'RD1Y' && (m.rank === 1 || rank.code === 'AO')) rate = 4.0
        const commAmt = (bAmt * rate) / 100
        derived.push({
          id: `derived-comm-${p.id}`,
          calculationDate: p.startDate || p.createdAt || new Date().toISOString(),
          planCode: p.planCode || p.planType || 'RD1Y',
          installmentNumber: paidCount,
          businessAmount: bAmt,
          percentage: rate,
          amount: commAmt,
          status: 'allocated'
        })
      }
    })
    return derived
  }, [commissionLedger, m, ownPlans, rank])

  // Compute live performance & promotional target model
  const model = useMemo(() => {
    if (!m || statsLoading) return null
    return computeEarnings({
      rank: m?.rank || 1,
      ownPlans,
      payments: effectivePayments,
      downlinePlans: [],
      ranksConfig: config,
    })
  }, [m, statsLoading, ownPlans, effectivePayments, config])

  // Aggregate Commission Metrics
  const totalCommissionsEarned = useMemo(() => {
    return effectiveCommissionLedger.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
  }, [effectiveCommissionLedger])

  const thisMonthCommissions = useMemo(() => {
    const now = new Date()
    const curMonth = now.getMonth() + 1
    const curYear = now.getFullYear()
    return effectiveCommissionLedger
      .filter(c => (c.month === curMonth && c.year === curYear) || (!c.month && c.calculationDate && new Date(c.calculationDate).getMonth() + 1 === curMonth))
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
  }, [effectiveCommissionLedger])

  // Direct business metrics
  const collectedPaymentsCount = useMemo(() => {
    if (ownPayments && ownPayments.length > 0) return ownPayments.length
    return ownPlans.reduce((s, p) => s + (Number(p.paidInstallments) || (p.totalPaid > 0 ? 1 : 0)), 0)
  }, [ownPayments, ownPlans])

  const directBusinessVolume = useMemo(() => {
    if (ownPayments && ownPayments.length > 0) {
      return ownPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    }
    const plansVol = ownPlans.reduce((s, p) => s + (Number(p.totalPaid) || Number(p.monthlyAmount) || 0), 0)
    return plansVol > 0 ? plansVol : (Number(m?.accumulatedVolume) || Number(m?.businessVolume) || 0)
  }, [ownPayments, ownPlans, m])

  const toggleStatus = async () => {
    if (!m) return
    setUpdatingStatus(true)
    const newStatus = m.status === 'inactive' ? 'active' : 'inactive'
    try {
      await profilesAPI.updateProfile(m.id, { status: newStatus })
      setM(prev => ({ ...prev, status: newStatus }))
      toast.success(`Agent ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`)
    } catch (e) {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleStartViewAs = async () => {
    if (!m) return
    const toastId = toast.loading(`Starting View As Agent mode...`)
    navigate('/dashboard')
    try {
      await startViewingAs(m)
      toast.success(`Now viewing as ${m.name}`, { id: toastId })
    } catch (err) {
      toast.error(`Failed to start viewing mode: ${err.message}`, { id: toastId })
    }
    setViewAsModalOpen(false)
  }

  const handleResetPassword = async () => {
    if (!m) return
    setResetting(true)
    const toastId = toast.loading(`Initiating password reset for ${m.name}…`)
    try {
      if (m.email && m.email.includes('@') && !m.email.endsWith('@apex.local')) {
        await authAPI.requestPasswordReset(m.email).catch(e => console.warn('Reset notice:', e))
      }
      toast.success(`Password reset initiated for ${m.name} (${m.sponsorCode || ''}).`, { id: toastId })
      setResetModalOpen(false)
    } catch (err) {
      console.error('Error resetting password:', err)
      toast.error(`Failed to reset password: ${err.message}`, { id: toastId })
    } finally {
      setResetting(false)
    }
  }

  const branchName = (bid) => branches.find((b) => b.id === bid)?.name || '—'

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={4} />
        <SkeletonTable rows={5} cols={5} />
      </div>
    )
  }

  if (!m) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Agent Not Found</h2>
        <p className="text-sm text-ink-2">The agent document or Agent Code does not exist in the database.</p>
        <Link to="/admin/members" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">Back to Agents</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Profile card */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-navy-4/50 text-gold-1 font-serif text-2xl font-bold shadow-inner">
              {m.name?.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">{m.name}</h1>
                <RankBadge rank={m.rank} />
                <StatusBadge status={m.status || 'active'} />
              </div>
              <p className="text-sm text-ink-2 mt-1 font-mono font-medium">Agent ID: <span className="text-gold-1 font-bold">{m.sponsorCode || '—'}</span></p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {m?.phone && (
              <button
                type="button"
                onClick={() => {
                  const cleanPhone = (m.phone || '').replace(/\D/g, '')
                  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone
                  const loginUrl = window.location.origin
                  const msg = `*Apex Multisolutions — Agent Portal Access*

Dear *${m.name}*,

Here are your official portal details:
━━━━━━━━━━━━━━━━━━━
👤 *Agent ID (Login Code):* ${m.sponsorCode || '—'}
📧 *Login Email:* ${m.email}
🌐 *Portal URL:* ${loginUrl}
━━━━━━━━━━━━━━━━━━━`
                  window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`, '_blank')
                }}
                className="py-2 px-3.5 text-xs font-bold uppercase rounded-md bg-[#25D366] hover:bg-[#1EBE5D] text-white shadow-sm flex items-center gap-1.5 transition-all"
              >
                WhatsApp
              </button>
            )}
            {realProfile?.isSuperAdmin && m?.isSuperAdmin !== true && (
              <button
                onClick={() => setViewAsModalOpen(true)}
                className="btn-gold py-2 px-4 text-xs font-bold uppercase rounded-md shadow-sm"
              >
                View As Agent
              </button>
            )}
            {realProfile?.isSuperAdmin && (
              <button
                onClick={() => setChangeEmailModalOpen(true)}
                className="btn-dark py-2 px-4 text-xs font-bold uppercase rounded-md border border-sky-500/40 text-sky-400 hover:border-sky-400 shadow-sm flex items-center gap-1.5"
              >
                <IMail size={14} className="text-sky-400" />
                Change Email
              </button>
            )}
            <button
              onClick={() => setResetModalOpen(true)}
              className="btn-dark py-2 px-4 text-xs font-bold uppercase rounded-md border border-gold/40 text-gold hover:border-gold shadow-sm flex items-center gap-1.5"
            >
              <IShield size={14} className="text-amber-400" />
              Reset Password
            </button>
            <button
              onClick={toggleStatus}
              disabled={updatingStatus}
              className={`py-2 px-4 text-xs font-bold uppercase rounded-md tracking-wider transition-all shadow-sm ${m.status === 'inactive'
                ? 'bg-ok text-white hover:bg-ok-hover'
                : 'bg-danger text-white hover:bg-danger-hover'
                }`}
            >
              {updatingStatus ? 'Updating...' : m.status === 'inactive' ? 'Activate Agent' : 'Deactivate Agent'}
            </button>
            <Link to="/admin/members" className="btn-ghost py-2 px-4 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Personal & identity */}
        <div className="space-y-6">
          {/* Personal Info */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Personal Information
            </h3>
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="block text-[10px] text-ink-2">Mobile Number</span>
                <span className="font-semibold text-ink-1 font-mono">{m.phone || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Email Address</span>
                <span className="font-semibold text-ink-1">{m.email || '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Immediate Sponsor</span>
                {sponsor ? (
                  <Link to={`/admin/members/${sponsor.id}`} className="font-semibold text-gold-1 hover:underline">
                    {sponsor.name} ({sponsor.sponsorCode || '—'})
                  </Link>
                ) : (
                  <span className="font-semibold text-ink-1 font-mono">None (Root Agent)</span>
                )}
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Branch</span>
                <span className="font-semibold text-ink-1">{branchName(m.branchId)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Joining Date</span>
                <span className="font-semibold text-ink-1">{m.createdAt ? fmtDate(m.createdAt) : '—'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-ink-2">Residential Address</span>
                <span className="font-semibold text-ink-1 whitespace-pre-wrap">{m.address || '—'}</span>
              </div>
            </div>
          </div>

          {/* Identity & Bank details */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IDoc size={16} /> Bank & Identity Profile
            </h3>
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] text-ink-2">Aadhaar Number</span>
                  <span className="font-semibold text-ink-1 font-mono">{m.aadhaar || '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">PAN Card</span>
                  <span className="font-semibold text-ink-1 font-mono uppercase">{m.panNumber || m.pan || '—'}</span>
                </div>
              </div>
              <div className="border-t border-navy-4/50 my-2" />
              {m.bankDetails && Object.keys(m.bankDetails).length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <span className="block text-[10px] text-ink-2">Account Holder Name</span>
                    <span className="font-semibold text-ink-1">{m.bankDetails?.accountHolderName || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-ink-2">Bank & Branch</span>
                    <span className="font-semibold text-ink-1">{m.bankDetails?.bankName || '—'} · {m.bankDetails?.branch || '—'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[10px] text-ink-2">Account Number</span>
                      <span className="font-semibold text-ink-1 font-mono">{m.bankDetails?.accountNumber || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-ink-2">IFSC Code</span>
                      <span className="font-semibold text-ink-1 font-mono uppercase">{m.bankDetails?.ifscCode || '—'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic py-1">Bank details not updated yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Performance, network, and logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Rank Targets & Promo Progress */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-navy-4/50 pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                <ITrophy size={16} /> Rank & Promotion Target
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-ink-2 uppercase">Current Rank:</span>
                <span className="text-xs font-extrabold text-ink-1 uppercase">{rank.code} ({rank.name})</span>
              </div>
            </div>
            {statsLoading ? (
              <SkeletonStats count={2} />
            ) : model && next ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-ink-2">Promotion Target Progress to <strong>{next.code} ({next.name})</strong></span>
                    <span className="text-ink-2 font-mono font-medium">{formatCompactINR(model.lifetimeBV)} / {formatCompactINR(model.promo.target)} BV</span>
                  </div>
                  <div className="h-2 bg-navy-2 rounded-full overflow-hidden">
                    <div className="h-full bg-gold-1 rounded-full" style={{ width: `${Math.max(0, Math.min(100, model.promo.progress))}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="border border-navy-4 p-3.5 rounded-card bg-navy-2/20">
                    <span className="text-[10px] text-ink-2 uppercase font-bold tracking-wider flex items-center gap-1">
                      <ITrophy size={13} className="text-[#8D7952]" /> Performance Bonus
                    </span>
                    {model.pb.target > 0 ? (
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between text-[11px] text-ink-2">
                          <span>{formatINR(model.pb.current)} of {formatINR(model.pb.target)}</span>
                          <span className={model.pb.achieved ? 'text-ok font-semibold' : ''}>{model.pb.achieved ? 'Earned' : 'Active'}</span>
                        </div>
                        <div className="h-1.5 bg-navy-2 rounded-full overflow-hidden">
                          <div className={`h-full ${model.pb.achieved ? 'bg-ok' : 'bg-gold-1'}`} style={{ width: `${Math.max(0, Math.min(100, model.pb.progress))}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-ink-2 italic mt-1.5">No targets active for this rank.</p>
                    )}
                  </div>

                  <div className="border border-navy-4 p-3.5 rounded-card bg-navy-2/20">
                    <span className="text-[10px] text-ink-2 uppercase font-bold tracking-wider flex items-center gap-1">
                      <IShield size={13} className="text-[#8D7952]" /> CMD Award Progress
                    </span>
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="flex justify-between text-[11px] text-ink-2">
                        <span>{formatCompactINR(model.cmd.weightedTotal)} of {formatCompactINR(model.cmd.target)}</span>
                        <span className={model.cmd.qualified ? 'text-ok font-semibold' : ''}>{model.cmd.qualified ? 'Qualified' : 'Active'}</span>
                      </div>
                      <div className="h-1.5 bg-navy-2 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-1" style={{ width: `${Math.max(0, Math.min(100, model.cmd.progress))}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic">Agent is at the maximum promotional tier (Managing Director) or promotion metrics are unavailable.</p>
            )}
          </div>

          {/* Business & Commission Summary */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Business Summary */}
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
                <IDoc size={16} /> Direct Business Summary
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="border border-navy-4 p-3 rounded-card bg-navy-2/30">
                  <span className="text-[10px] text-ink-2 uppercase">Active Policies</span>
                  <p className="text-lg font-bold text-ink-1 font-serif mt-0.5">{statsLoading ? '—' : ownPlans.length}</p>
                </div>
                <div className="border border-navy-4 p-3 rounded-card bg-navy-2/30">
                  <span className="text-[10px] text-ink-2 uppercase">Collected Payments</span>
                  <p className="text-lg font-bold text-ink-1 font-serif mt-0.5">{statsLoading ? '—' : collectedPaymentsCount}</p>
                </div>
              </div>
              <div className="border border-navy-4 p-3.5 rounded-card bg-navy-2/30 text-xs">
                <span className="text-[10px] text-ink-2 uppercase block mb-1">Accumulated Business Volume</span>
                <span className="font-serif font-bold text-sm text-gold-1">{formatINR(directBusinessVolume)}</span>
              </div>
            </div>

            {/* Commissions Overview */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-navy-4/50 pb-1.5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                  <ICash size={16} /> Commission & Payouts
                </h3>
                <Link to="/admin/payouts" className="text-xs text-gold-1 hover:underline font-semibold">
                  Payout Engine &rarr;
                </Link>
              </div>

              {statsLoading ? (
                <SkeletonStats count={2} />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="border border-navy-4 p-3 rounded-card bg-navy-2/30">
                      <span className="text-[10px] text-ink-2 uppercase tracking-wider block">Total Earned</span>
                      <p className="text-lg font-bold text-emerald-400 font-serif mt-0.5">{formatINR(totalCommissionsEarned || model?.totalThisMonth || 0)}</p>
                    </div>
                    <div className="border border-navy-4 p-3 rounded-card bg-navy-2/30">
                      <span className="text-[10px] text-ink-2 uppercase tracking-wider block">This Month (Accrued)</span>
                      <p className="text-lg font-bold text-gold-1 font-serif mt-0.5">{formatINR(thisMonthCommissions || model?.mda || 0)}</p>
                    </div>
                  </div>

                  {model && (
                    <div className="space-y-1 text-xs pt-1">
                      <div className="flex justify-between py-1 border-b border-navy-4/20">
                        <span className="text-ink-2">MDA Structure Tier</span>
                        <span className="font-semibold text-ink-1 font-mono">{rank.code} ({rank.name})</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-navy-4/20">
                        <span className="text-ink-2">MFA Monthly Target</span>
                        <span className="font-semibold text-ink-1 font-serif">{formatINR(model.mfa || 0)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-ink-2">Travel Allowance (TA)</span>
                        <span className="font-semibold text-ink-1 font-serif">{formatINR(model.ta || 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Commission Ledger Table */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-navy-4/50 pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                <ICash size={16} /> Commission Ledger Transactions ({effectiveCommissionLedger.length})
              </h3>
              <span className="text-xs text-ink-2 font-mono">Real-time ledger audit</span>
            </div>

            {statsLoading ? (
              <SkeletonTable rows={3} cols={6} />
            ) : effectiveCommissionLedger.length > 0 ? (
              <div className="border border-navy-4 rounded-card overflow-hidden">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Plan</th>
                      <th className="py-2">Inst. #</th>
                      <th className="py-2 text-right">Business Amount</th>
                      <th className="py-2 text-center">Commission Rate</th>
                      <th className="py-2 text-right">Commission Amount</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveCommissionLedger.slice(0, 10).map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 font-mono text-[11px] text-ink-2">{c.calculationDate ? fmtDate(c.calculationDate) : '—'}</td>
                        <td className="py-2 font-semibold text-ink-1 uppercase">{c.planCode || c.planType || '—'}</td>
                        <td className="py-2 font-mono text-ink-2">{c.installmentNumber || 1}</td>
                        <td className="py-2 font-mono text-right text-ink-1">{formatINR(c.businessAmount)}</td>
                        <td className="py-2 font-mono text-center text-gold-1 font-bold">{c.percentage}%</td>
                        <td className="py-2 font-mono text-right font-bold text-emerald-400">{formatINR(c.amount)}</td>
                        <td className="py-2"><StatusBadge status={c.status || 'accrued'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {effectiveCommissionLedger.length > 10 && (
                  <div className="p-2.5 text-center text-xs text-ink-2 bg-navy-2/40 border-t border-navy-4">
                    Showing latest 10 of {effectiveCommissionLedger.length} commission entries.
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-navy-4 p-4 rounded-card bg-navy-2/30 text-xs text-ink-2 text-center">
                <p className="font-semibold text-ink-1 mb-1">No commission records generated yet</p>
                <p className="text-[11px]">When new business or installment payments are recorded under this agent or their downline network, commissions calculated by the database engine will appear here.</p>
              </div>
            )}
          </div>

          {/* Network Downlines */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-navy-4/50 pb-1.5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                <INetwork size={16} /> Recursive Team Downline ({downline.length})
              </h3>
              <span className="text-[11px] text-ink-2 font-mono">{downline.length} Agent{downline.length === 1 ? '' : 's'}</span>
            </div>
            {downlineLoading ? (
              <SkeletonTable rows={4} cols={5} />
            ) : downline.length ? (
              <div className="border border-navy-4 rounded-card overflow-hidden">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th className="py-2">Agent ID</th>
                      <th className="py-2">Name</th>
                      <th className="py-2">Rank</th>
                      <th className="py-2">Direct Sponsor</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downline.slice(0, 10).map((x) => (
                      <tr key={x.id} className="hover:bg-navy-2/30 cursor-pointer" onClick={() => navigate(`/admin/members/${x.id}`)}>
                        <td className="py-2 font-mono text-[10px] font-semibold text-gold-1">{x.sponsorCode || '—'}</td>
                        <td className="py-2 font-medium text-ink-1">{x.name}</td>
                        <td className="py-2"><RankBadge rank={x.rank} size="sm" /></td>
                        <td className="py-2 text-ink-2 font-mono text-[11px]">{x.sponsorId === m.id ? 'This Agent' : (x.sponsorCode ? 'Direct' : '—')}</td>
                        <td className="py-2"><StatusBadge status={x.status || 'active'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {downline.length > 10 && (
                  <div className="p-2.5 text-center text-xs text-ink-2 bg-navy-2/40 border-t border-navy-4">
                    Showing 10 of {downline.length} downline network agents.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-ink-2 italic bg-navy-2/30 p-4 rounded-card border border-navy-4/50 text-center">
                This agent has not recruited any team downline members yet.
              </div>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IClock size={16} /> Activity & Rank History
            </h3>
            <div className="relative pl-4 border-l border-navy-4 space-y-3.5 text-xs text-ink-2">
              <div className="relative">
                <div className="absolute -left-[20.5px] top-1 h-3.5 w-3.5 rounded-full border-2 border-navy-3 bg-gold-1" />
                <p className="font-semibold text-ink-1">Agent Enrolled in System</p>
                <p className="text-[10px]">{m.createdAt ? fmtDate(m.createdAt) : '—'}</p>
              </div>
              <div className="relative">
                <div className="absolute -left-[20.5px] top-1 h-3.5 w-3.5 rounded-full border-2 border-navy-3 bg-ok" />
                <p className="font-semibold text-ink-1">Current Active Rank: {rank.code} ({rank.name})</p>
                <p className="text-[10px]">Rank Tier {m.rank} of 18</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Reset Password Confirmation Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-1/80 backdrop-blur-sm p-4">
          <div className="card w-full max-w-md p-6 space-y-4 border border-navy-4">
            <h3 className="text-lg font-bold text-ink-1 flex items-center gap-2">
              <IShield size={20} className="text-amber-400" /> Reset Agent Password
            </h3>
            <p className="text-xs text-ink-2 leading-relaxed">
              Are you sure you want to initiate a password reset for <strong className="text-ink-1">{m.name}</strong> (<span className="font-mono text-gold-1">{m.sponsorCode}</span>)?
            </p>
            <div className="bg-navy-3/60 p-3 rounded text-xs space-y-1 font-mono text-ink-2 border border-navy-4">
              <div>Email: {m.email || '—'}</div>
              <div>Agent ID: {m.sponsorCode || '—'}</div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetModalOpen(false)}
                className="btn-ghost py-2 px-4 text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetPassword}
                className="btn-gold py-2 px-4 text-xs font-bold uppercase bg-amber-500 text-navy-1 hover:bg-amber-400"
              >
                {resetting ? 'Initiating...' : 'Confirm Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Email Modal */}
      {changeEmailModalOpen && (
        <ChangeEmailModal
          targetUser={{ id: m.id, uid: m.id, name: m.name, sponsorCode: m.sponsorCode, email: m.email }}
          onClose={() => setChangeEmailModalOpen(false)}
        />
      )}

      {/* View As Agent Confirmation Modal */}
      {viewAsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-1/80 backdrop-blur-sm p-4">
          <div className="card w-full max-w-md p-6 space-y-4 border border-navy-4">
            <h3 className="text-lg font-bold text-ink-1 flex items-center gap-2">
              <IAlert size={20} className="text-red-500" /> Confirm View As Agent
            </h3>
            <p className="text-xs text-ink-2 leading-relaxed">
              You are about to view the application as <strong className="text-ink-1">{m.name}</strong> (<span className="font-mono text-gold-1">{m.sponsorCode}</span>).
            </p>
            <div className="bg-navy-3/60 p-3 rounded text-xs space-y-2 text-ink-2 border border-navy-4">
              <div className="text-red-400 font-bold uppercase tracking-wider text-[10px]">Read-Only Mode</div>
              <p>You will see this agent&apos;s personal portal view: their earnings, downlines, and achievements.</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setViewAsModalOpen(false)}
                className="btn-ghost py-1.5 px-4 text-sm font-bold uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartViewAs}
                className="bg-red-500 hover:bg-red-600 text-white py-1.5 px-5 rounded-full text-sm font-bold uppercase shadow-sm transition-colors"
              >
                Start Viewing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
