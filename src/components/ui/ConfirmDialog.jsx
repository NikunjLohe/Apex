import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { IClose } from './icons'

/**
 * Confirmation dialog. Controlled via `open`.
 * @param {function} onConfirm
 * @param {function} onClose
 * @param {boolean}  danger    style confirm button as destructive
 * @param {boolean}  loading   disable buttons while an async action runs
 */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
  children,
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && !loading && onClose?.()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, loading, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-navy-1/80 backdrop-blur-sm" onClick={() => !loading && onClose?.()} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="card relative z-10 w-full max-w-md p-6"
          >
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-lg font-bold text-ink-1">{title}</h3>
              <button type="button" onClick={() => !loading && onClose?.()} className="text-ink-2 hover:text-ink-1">
                <IClose size={18} />
              </button>
            </div>
            {message && <p className="text-sm text-ink-2">{message}</p>}
            {children}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={loading} className="btn-ghost">
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={danger ? 'btn-danger' : 'btn-gold'}
              >
                {loading ? 'Please wait…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
