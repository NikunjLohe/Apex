import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import Logo from './ui/Logo'

const profileCompletionSchema = z.object({
  aadhaar: z.string().trim().regex(/^\d{12}$/, 'Aadhaar must be exactly 12 digits'),
  pan: z.string().trim().regex(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/, 'PAN format: ABCDE1234F'),
  bankName: z.string().min(2, 'Bank name is required'),
  accountHolderName: z.string().min(2, 'Account holder name is required'),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'Account number must be 9 to 18 digits'),
  ifscCode: z.string().trim().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'IFSC format: ABCD0123456 (11 alphanumeric, 5th digit must be 0)'),
  branch: z.string().trim().min(2, 'Branch name is required'),
})

export default function AgentProfileCompletionModal() {
  const { user, logout } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(profileCompletionSchema),
    defaultValues: {
      aadhaar: '',
      pan: '',
      bankName: '',
      accountHolderName: '',
      accountNumber: '',
      ifscCode: '',
      branch: '',
    },
  })

  const onSubmit = async (data) => {
    if (!user?.uid) return
    setSubmitting(true)
    try {
      const userRef = doc(db, 'users', user.uid)
      await updateDoc(userRef, {
        aadhaar: data.aadhaar,
        pan: data.pan.toUpperCase(),
        bankDetails: {
          bankName: data.bankName,
          accountHolderName: data.accountHolderName,
          accountNumber: data.accountNumber,
          ifscCode: data.ifscCode.toUpperCase(),
          branch: data.branch,
        },
        profileCompleted: true,
      })
      toast.success('Profile details completed successfully!')
    } catch (error) {
      console.error('Error completing profile:', error)
      toast.error('Failed to save profile details. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await logout()
      window.location.href = '/login'
    } catch (e) {
      toast.error('Error logging out')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-1/80 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-xl rounded-card border border-navy-4 bg-navy-3 p-6 shadow-xl space-y-5 my-8">
        <div className="flex items-center justify-between border-b border-navy-4 pb-3">
          <Logo size={32} tagline={false} />
          <button 
            type="button" 
            onClick={handleSignOut} 
            className="text-xs font-semibold text-danger hover:underline"
          >
            Sign out
          </button>
        </div>

        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-extrabold text-ink-1">Complete Your Profile</h2>
          <p className="text-xs text-ink-2">
            Before accessing the agent portal, please complete your bank account and identity registration details.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Identity Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan border-b border-navy-4/50 pb-1">
              Identity Verification
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Aadhaar Card Number</label>
                <input 
                  type="text" 
                  maxLength={12} 
                  placeholder="12-digit number" 
                  className="field" 
                  {...register('aadhaar')} 
                />
                {errors.aadhaar && <p className="err">{errors.aadhaar.message}</p>}
              </div>
              <div>
                <label className="label">PAN Card Number</label>
                <input 
                  type="text" 
                  maxLength={10} 
                  placeholder="ABCDE1234F" 
                  className="field uppercase" 
                  {...register('pan')} 
                />
                {errors.pan && <p className="err">{errors.pan.message}</p>}
              </div>
            </div>
          </div>

          {/* Bank Details Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan border-b border-navy-4/50 pb-1">
              Bank Account Details
            </h3>
            <div>
              <label className="label">Account Holder Name</label>
              <input 
                type="text" 
                placeholder="As per bank passbook" 
                className="field" 
                {...register('accountHolderName')} 
              />
              {errors.accountHolderName && <p className="err">{errors.accountHolderName.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Bank Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. State Bank of India" 
                  className="field" 
                  {...register('bankName')} 
                />
                {errors.bankName && <p className="err">{errors.bankName.message}</p>}
              </div>
              <div>
                <label className="label">Account Number</label>
                <input 
                  type="text" 
                  placeholder="Account number" 
                  className="field" 
                  {...register('accountNumber')} 
                />
                {errors.accountNumber && <p className="err">{errors.accountNumber.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">IFSC Code</label>
                <input 
                  type="text" 
                  maxLength={11} 
                  placeholder="e.g. SBIN0012345" 
                  className="field uppercase" 
                  {...register('ifscCode')} 
                />
                {errors.ifscCode && <p className="err">{errors.ifscCode.message}</p>}
              </div>
              <div>
                <label className="label">Branch Name</label>
                <input 
                  type="text" 
                  placeholder="Branch location" 
                  className="field" 
                  {...register('branch')} 
                />
                {errors.branch && <p className="err">{errors.branch.message}</p>}
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={submitting} 
            className="btn-gold w-full py-3 mt-2 shadow-sm disabled:opacity-50"
          >
            {submitting ? 'Saving details...' : 'Submit and Access Panel'}
          </button>
        </form>
      </div>
    </div>
  )
}
