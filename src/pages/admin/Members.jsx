import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { profilesAPI, masterDataAPI, authAPI } from '../../lib/supabase'
import { fmtDate } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IPlus, IUsers, ISearch, IShield } from '../../components/ui/icons'
import MemberModal from '../../components/MemberModal'
import ChangeEmailModal from '../../components/ChangeEmailModal'
import toast from 'react-hot-toast'

export default function Members() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [membersList, setMembersList] = useState([])
  const [branchesList, setBranchesList] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '')
  const [filterProfile, setFilterProfile] = useState(searchParams.get('profile') || '')
  const [modal, setModal] = useState(null) // { mode:'new'|'edit', member }
  const [resetTarget, setResetTarget] = useState(null) // member for password reset
  const [changeEmailTarget, setChangeEmailTarget] = useState(null) // member for email change
  const [resetting, setResetting] = useState(false)
  const navigate = useNavigate()
  const { user: currentUser, profile: currentProfile, isSuperAdmin } = useAuth()
  const [settings, setSettings] = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [mList, bList, sObj] = await Promise.all([
        profilesAPI.listProfiles(),
        masterDataAPI.listBranches(),
        masterDataAPI.getSystemSettings().catch(() => ({})),
      ])
      setMembersList(mList || [])
      setBranchesList(bList || [])
      setSettings(sObj || {})
    } catch (err) {
      console.error('[Members] Failed to load data:', err)
      toast.error('Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const isProfileComplete = (m) => {
    if (!m.dob || !m.address || !m.panNumber || !m.bankDetails?.bankName || !m.bankDetails?.accountNumber || !m.bankDetails?.ifscCode) {
      return false
    }
    return true
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return membersList
      .filter((m) => {
        if (filterStatus && m.status !== filterStatus) return false
        if (filterProfile) {
          const complete = isProfileComplete(m)
          if (filterProfile === 'completed' && !complete) return false
          if (filterProfile === 'pending' && complete) return false
        }
        return !q || m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.phone?.includes(q) || m.sponsorCode?.toLowerCase().includes(q)
      })
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
  }, [membersList, search, filterStatus, filterProfile])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const match = membersList.find(
        (m) => m.sponsorCode?.toLowerCase() === search.trim().toLowerCase()
      )
      if (match) {
        navigate(`/admin/members/${match.id}`)
      }
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    setResetting(true)
    const toastId = toast.loading(`Initiating password reset for ${resetTarget.name}…`)
    try {
      if (resetTarget.email && resetTarget.email.includes('@') && !resetTarget.email.endsWith('@apex.local')) {
        try {
          await authAPI.resetPassword(resetTarget.email)
        } catch (authErr) {
          console.warn('[PasswordReset] resetPassword notice:', authErr)
        }
      }

      await profilesAPI.updateAllowedProfileFields(resetTarget.id, {
        mustChangePassword: true,
      })

      toast.success(`Password reset initiated for ${resetTarget.name} (${resetTarget.sponsorCode || ''}). Force password change active.`, { id: toastId })
      setResetTarget(null)
      loadData()
    } catch (err) {
      console.error('Error resetting password:', err)
      toast.error(`Failed to reset password: ${err.message}`, { id: toastId })
    } finally {
      setResetting(false)
    }
  }

  const branchName = (bid) => branchesList.find((b) => b.id === bid)?.name || '—'
  const memberName = (uid) => membersList.find((m) => m.id === uid)?.name || '—'

  const handleWhatsApp = (m) => {
    const cleanPhone = (m.phone || '').replace(/\D/g, '')
    if (!cleanPhone) {
      toast.error('Agent does not have a registered phone number')
      return
    }
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone
    const loginUrl = window.location.origin
    const msg = `*Apex Multisolutions — Agent Portal Access*

Dear *${m.name}*,

Here are your official portal details:
━━━━━━━━━━━━━━━━━━━
👤 *Agent ID (Login Code):* ${m.sponsorCode || '—'}
📧 *Login Email:* ${m.email}
🌐 *Portal URL:* ${loginUrl}
━━━━━━━━━━━━━━━━━━━

Please log in to manage your performance, customer onboarding, and commissions.`
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2.5 sm:gap-3">
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 flex-1 min-w-0">
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleKeyDown} placeholder="Search members by code, name, phone…" className="field pl-10 w-full" />
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2.5">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="field w-full sm:w-32">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={filterProfile} onChange={(e) => setFilterProfile(e.target.value)} className="field w-full sm:w-36">
              <option value="">All Profiles</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
        <button type="button" onClick={() => setModal({ mode: 'new' })} className="btn-gold py-2.5 text-sm w-full sm:w-auto justify-center shrink-0"><IPlus size={16} /> Add Member</button>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : !filtered.length ? (
        <EmptyState icon={<IUsers size={24} />} title="No members" message="Add your first team member." />
      ) : (
        <>
          <div className="space-y-2.5 md:hidden">
            {filtered.map((m) => (
              <div key={`mob-mem-${m.id}`} className="card p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/admin/members/${m.id}`} className="font-semibold text-sm text-ink-1 hover:text-gold-1 block truncate">
                      {m.name}
                    </Link>
                    <p className="text-[11px] text-ink-2 font-mono truncate">{m.email}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-gold">{m.sponsorCode || '—'}</span>
                      <RankBadge rank={m.rank} size="sm" />
                      {m.isSuperAdmin && <span className="rounded-full bg-gold-1/15 px-2 py-0.5 text-[10px] font-bold text-gold">SUPER</span>}
                    </div>
                  </div>
                  <StatusBadge status={m.status || 'active'} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-navy-4/40">
                  <div>
                    <span className="text-[10px] uppercase text-ink-2 block">Sponsor</span>
                    <span className="text-ink-1 truncate block">{m.referredBy ? memberName(m.referredBy) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-ink-2 block">Profile / Security</span>
                    <span className={isProfileComplete(m) ? 'text-ok font-semibold' : 'text-gold font-semibold'}>
                      {isProfileComplete(m) ? '✓ Complete' : '⚠ Pending'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-navy-4/40 text-xs">
                  <button type="button" onClick={() => handleWhatsApp(m)} className="px-2.5 py-1 rounded border border-emerald-500/30 text-emerald-400 font-semibold">WhatsApp</button>
                  <Link to={`/admin/members/${m.id}`} className="px-2.5 py-1 rounded border border-gold-1/30 text-gold font-semibold">Profile</Link>
                  {isSuperAdmin && (
                    <button type="button" onClick={() => setChangeEmailTarget(m)} className="px-2.5 py-1 rounded border border-sky-400/30 text-sky-400 font-semibold">Email</button>
                  )}
                  <button type="button" onClick={() => setResetTarget(m)} className="px-2.5 py-1 rounded border border-amber-400/30 text-amber-400 font-semibold">Reset PW</button>
                  <button type="button" onClick={() => setModal({ mode: 'edit', member: m })} className="px-2.5 py-1 rounded border border-navy-4 text-ink-1 font-semibold">Edit</button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block table-wrap overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Agent Name / Email</th>
                  <th>Agent Code</th>
                  <th>Rank</th>
                  <th>Sponsor</th>
                  <th>Status</th>
                  <th>Profile</th>
                  <th>Password Security</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium text-ink-1">
                      <Link to={`/admin/members/${m.id}`} className="hover:text-gold-1 hover:underline">
                        {m.name}
                      </Link>
                      <div className="text-xs text-ink-2 font-mono">{m.email}</div>
                    </td>
                    <td className="font-mono text-sm">
                      <Link to={`/admin/members/${m.id}`} className="text-ink-1 font-semibold hover:text-gold-1 hover:underline">
                        {m.sponsorCode || '—'}
                      </Link>
                    </td>
                    <td><RankBadge rank={m.rank} size="sm" />{m.isSuperAdmin && <span className="ml-1 rounded-full bg-gold-1/15 px-2 py-0.5 text-[10px] font-bold text-gold">SUPER</span>}</td>
                    <td className="text-ink-2">{m.referredBy ? memberName(m.referredBy) : '—'}</td>
                    <td><StatusBadge status={m.status || 'active'} /></td>
                    <td>
                      {isProfileComplete(m) ? (
                        <span className="text-ok text-xs font-semibold">✓ Complete</span>
                      ) : (
                        <span className="text-gold text-xs font-semibold">⚠ Pending</span>
                      )}
                    </td>
                    <td>
                      {m.mustChangePassword ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400">
                          <IShield size={12} /> Force Change
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-ink-2">
                          Normal
                        </span>
                      )}
                    </td>
                    <td className="text-right space-x-2 whitespace-nowrap">
                      <button type="button" onClick={() => handleWhatsApp(m)} className="text-xs font-semibold text-emerald-400 hover:underline">WhatsApp</button>
                      <Link to={`/admin/members/${m.id}`} className="text-xs font-semibold text-gold hover:underline">View Profile</Link>
                      {isSuperAdmin && (
                        <button type="button" onClick={() => setChangeEmailTarget(m)} className="text-xs font-semibold text-sky-400 hover:underline">Change Email</button>
                      )}
                      <button type="button" onClick={() => setResetTarget(m)} className="text-xs font-semibold text-amber-400 hover:underline">Reset Password</button>
                      <button type="button" onClick={() => setModal({ mode: 'edit', member: m })} className="text-xs font-semibold text-gold hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Change Email Modal */}
      {changeEmailTarget && (
        <ChangeEmailModal
          targetUser={changeEmailTarget}
          onClose={() => { setChangeEmailTarget(null); loadData() }}
        />
      )}

      {/* Reset Password Confirmation Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-1/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="card w-full max-w-md p-4 sm:p-6 space-y-4 border border-navy-4 max-h-[90dvh] overflow-y-auto">
            <h3 className="text-lg font-bold text-ink-1 flex items-center gap-2">
              <IShield size={20} className="text-amber-400" /> Reset Agent Password
            </h3>
            <p className="text-xs text-ink-2 leading-relaxed">
              Are you sure you want to initiate a password reset for <strong className="text-ink-1">{resetTarget.name}</strong> (<span className="font-mono text-gold-1">{resetTarget.sponsorCode}</span>)?
            </p>
            <div className="bg-navy-3/60 p-3 rounded text-xs space-y-1 font-mono text-ink-2 border border-navy-4">
              <div className="truncate">Email: {resetTarget.email}</div>
              <div>Agent Code: {resetTarget.sponsorCode || '—'}</div>
              <div>Password Status: {resetTarget.mustChangePassword ? 'Force Change Active' : 'Normal'}</div>
            </div>
            <p className="text-[11px] text-ink-2 italic">
              This action dispatches a reset authorization email and flags the user account to require a password change on next login. No plaintext passwords are displayed or stored.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-2">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetTarget(null)}
                className="btn-ghost py-2 px-4 text-xs font-bold uppercase w-full sm:w-auto justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetPassword}
                className="btn-gold py-2 px-4 text-xs font-bold uppercase bg-amber-500 text-navy-1 hover:bg-amber-400 w-full sm:w-auto justify-center"
              >
                {resetting ? 'Initiating...' : 'Confirm Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && <MemberModal modal={modal} branches={branchesList} members={membersList} settings={settings} onClose={() => { setModal(null); loadData() }} />}
    </div>
  )
}

