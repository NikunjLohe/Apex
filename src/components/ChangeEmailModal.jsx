import { useState } from 'react'
import toast from 'react-hot-toast'
import { changeMemberEmail } from '../lib/admin'
import { IClose, IMail, IShield } from './ui/icons'

export default function ChangeEmailModal({ targetUser, onClose, onSuccess }) {
  const [newEmail, setNewEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const currentEmail = (targetUser?.email || '').trim()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const cleanNewEmail = newEmail.trim().toLowerCase()
    const cleanConfirmEmail = confirmEmail.trim().toLowerCase()

    if (!cleanNewEmail) {
      setError('New email address is required.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(cleanNewEmail)) {
      setError('Please enter a valid email address.')
      return
    }

    if (cleanNewEmail !== cleanConfirmEmail) {
      setError('New email and confirmation email do not match.')
      return
    }

    if (cleanNewEmail === currentEmail.toLowerCase()) {
      setError('New email must be different from current email.')
      return
    }

    setSubmitting(true)
    const toastId = toast.loading('Updating account email address...')

    try {
      await changeMemberEmail(targetUser.id || targetUser.uid, cleanNewEmail)
      toast.success('Email address updated successfully.', { id: toastId })
      if (onSuccess) onSuccess(cleanNewEmail)
      onClose()
    } catch (err) {
      console.error('Email change error:', err)
      const message = err?.message || 'Failed to update email address.'
      setError(message)
      toast.error(message, { id: toastId })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-1/80 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-6 space-y-4 border border-navy-4 shadow-2xl relative bg-navy-3">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-navy-4 pb-3">
          <h3 className="text-base font-bold text-ink-1 flex items-center gap-2 font-serif">
            <IMail size={20} className="text-gold-1" /> Change Email Address
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-ink-2 hover:text-ink-1 transition-colors"
          >
            <IClose size={18} />
          </button>
        </div>

        {/* User context badge */}
        <div className="bg-navy-2/60 p-3 rounded-card text-xs space-y-1 font-mono text-ink-2 border border-navy-4">
          <div className="flex justify-between">
            <span>Account Name:</span>
            <strong className="text-ink-1 font-sans">{targetUser?.name || '—'}</strong>
          </div>
          <div className="flex justify-between">
            <span>Agent Code:</span>
            <strong className="text-gold font-mono">{targetUser?.sponsorCode || '—'}</strong>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          {/* Current Email */}
          <div>
            <label className="label text-xs font-semibold text-ink-2">Current Email</label>
            <input
              type="text"
              readOnly
              disabled
              value={currentEmail || 'No email set'}
              className="field bg-navy-2/70 text-ink-2 font-mono text-xs cursor-not-allowed select-all"
            />
          </div>

          {/* New Email */}
          <div>
            <label className="label text-xs font-semibold text-ink-1">New Email</label>
            <input
              type="email"
              required
              autoFocus
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value)
                if (error) setError('')
              }}
              placeholder="e.g. name@example.com"
              className="field text-xs font-mono"
            />
          </div>

          {/* Confirm New Email */}
          <div>
            <label className="label text-xs font-semibold text-ink-1">Confirm New Email</label>
            <input
              type="email"
              required
              value={confirmEmail}
              onChange={(e) => {
                setConfirmEmail(e.target.value)
                if (error) setError('')
              }}
              placeholder="Re-enter new email address"
              className="field text-xs font-mono"
            />
          </div>

          {/* Validation Error Alert */}
          {error && (
            <div className="p-2.5 rounded bg-danger/10 border border-danger/30 text-danger text-xs font-semibold flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Notice */}
          <p className="text-[11px] text-ink-2 leading-tight pt-1">
            🛡️ Updates both login credentials and system record. Password reset emails will target this new address.
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-navy-4/60">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="btn-ghost py-2 px-4 text-xs font-bold uppercase"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-gold py-2 px-4 text-xs font-bold uppercase flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 border-2 border-navy-1/30 border-t-navy-1 rounded-full animate-spin" />
                  Updating...
                </>
              ) : (
                'Change Email'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
