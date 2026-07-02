import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { updatePassword } from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import toast from 'react-hot-toast'
import Logo from '../components/ui/Logo'

export default function ChangePassword() {
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { password: '', confirmPassword: '' }
  })
  
  const passwordVal = watch('password')

  const submit = async ({ password }) => {
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long')
      return
    }
    setBusy(true)
    const toastId = toast.loading('Updating security credentials...')
    try {
      if (auth.currentUser) {
        // Update password in Firebase Auth
        await updatePassword(auth.currentUser, password)
        
        // Mark mustChangePassword as false in Firestore
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          mustChangePassword: false
        })
        
        toast.success('Password updated successfully', { id: toastId })
        navigate('/dashboard', { replace: true })
      } else {
        throw new Error('No user session active')
      }
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Could not update password. Try re-signing in.', { id: toastId })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-1 p-5">
      <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-gold-1/5 blur-3xl" />
      <div className="relative w-full max-w-md space-y-4">
        <div className="flex flex-col items-center text-center">
          <Logo size={56} showText={false} />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-ink-1">Security Update Required</h1>
          <p className="text-xs text-ink-2 mt-1">Please change your temporary password before accessing the system.</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
            <div>
              <label className="label">New Secure Password</label>
              <input
                type="password"
                className="field font-mono"
                placeholder="Minimum 6 characters"
                {...register('password', { required: 'Password is required' })}
              />
              {errors.password && <p className="err">{errors.password.message}</p>}
            </div>

            <div>
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                className="field font-mono"
                placeholder="Confirm password"
                {...register('confirmPassword', { 
                  required: 'Confirmation required',
                  validate: val => val === passwordVal || 'Passwords do not match'
                })}
              />
              {errors.confirmPassword && <p className="err">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={busy} className="btn-gold w-full py-2.5">
              {busy ? 'Updating credentials...' : 'Update Password & Access Dashboard'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-ink-2">APEX Savings Portal Protection Center</p>
      </div>
    </div>
  )
}
