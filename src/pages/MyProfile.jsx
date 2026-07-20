import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { IDoc, IUsers } from '../components/ui/icons'

const profileSchema = z.object({
  dob: z.string().min(1, 'Date of Birth is required'),
  address: z.string().min(5, 'Address is required'),
  aadhaar: z.string().trim().regex(/^\d{12}$/, 'Aadhaar must be exactly 12 digits').optional().or(z.literal('')),
  pan: z.string().trim().regex(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/, 'PAN format: ABCDE1234F'),
  bankName: z.string().min(2, 'Bank name is required'),
  accountHolderName: z.string().min(2, 'Account holder name is required'),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'Account number must be 9 to 18 digits'),
  ifscCode: z.string().trim().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'IFSC format: ABCD0123456 (11 alphanumeric, 5th digit must be 0)'),
  branch: z.string().trim().min(2, 'Branch name is required'),
})

export default function MyProfile() {
  const { user, profile } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      dob: '',
      address: '',
      aadhaar: '',
      pan: '',
      bankName: '',
      accountHolderName: '',
      accountNumber: '',
      ifscCode: '',
      branch: '',
    },
  })

  useEffect(() => {
    if (profile) {
      reset({
        dob: profile.dob || '',
        address: profile.address || '',
        aadhaar: profile.aadhaar || '',
        pan: profile.pan || '',
        bankName: profile.bankDetails?.bankName || '',
        accountHolderName: profile.bankDetails?.accountHolderName || '',
        accountNumber: profile.bankDetails?.accountNumber || '',
        ifscCode: profile.bankDetails?.ifscCode || '',
        branch: profile.bankDetails?.branch || '',
      })
    }
  }, [profile, reset])

  const onSubmit = async (data) => {
    if (!user?.uid) return
    setSubmitting(true)
    try {
      const userRef = doc(db, 'users', user.uid)
      await updateDoc(userRef, {
        dob: data.dob,
        address: data.address,
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
      toast.success('Profile details updated successfully!')
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile details. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="card p-6 bg-navy-3 border border-navy-4">
        <h2 className="font-serif text-2xl font-extrabold text-ink-1">My Profile</h2>
        <p className="text-xs text-ink-2 mt-1">
          Keep your identity and bank details up to date for smooth commission payouts.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="card p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan border-b border-navy-4/50 pb-2 flex items-center gap-2">
            <IUsers size={16} /> Personal Information
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Date of Birth</label>
              <input type="date" className="field" {...register('dob')} />
              {errors.dob && <p className="err">{errors.dob.message}</p>}
            </div>
            <div>
              <label className="label">Address</label>
              <input type="text" placeholder="Full residential address" className="field" {...register('address')} />
              {errors.address && <p className="err">{errors.address.message}</p>}
            </div>
            <div>
              <label className="label">Aadhaar Card Number (Optional)</label>
              <input type="text" maxLength={12} placeholder="12-digit number" className="field" {...register('aadhaar')} />
              {errors.aadhaar && <p className="err">{errors.aadhaar.message}</p>}
            </div>
            <div>
              <label className="label">PAN Card Number</label>
              <input type="text" maxLength={10} placeholder="ABCDE1234F" className="field uppercase" {...register('pan')} />
              {errors.pan && <p className="err">{errors.pan.message}</p>}
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan border-b border-navy-4/50 pb-2 flex items-center gap-2">
            <IDoc size={16} /> Bank Account Details
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Account Holder Name</label>
              <input type="text" placeholder="As per bank passbook" className="field" {...register('accountHolderName')} />
              {errors.accountHolderName && <p className="err">{errors.accountHolderName.message}</p>}
            </div>
            <div>
              <label className="label">Bank Name</label>
              <input type="text" placeholder="e.g. State Bank of India" className="field" {...register('bankName')} />
              {errors.bankName && <p className="err">{errors.bankName.message}</p>}
            </div>
            <div>
              <label className="label">Account Number</label>
              <input type="text" placeholder="Account number" className="field" {...register('accountNumber')} />
              {errors.accountNumber && <p className="err">{errors.accountNumber.message}</p>}
            </div>
            <div>
              <label className="label">IFSC Code</label>
              <input type="text" maxLength={11} placeholder="e.g. SBIN0012345" className="field uppercase" {...register('ifscCode')} />
              {errors.ifscCode && <p className="err">{errors.ifscCode.message}</p>}
            </div>
            <div>
              <label className="label">Branch Name</label>
              <input type="text" placeholder="Branch location" className="field" {...register('branch')} />
              {errors.branch && <p className="err">{errors.branch.message}</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className="btn-gold py-2.5 px-6 min-w-[150px] shadow-sm disabled:opacity-50 font-bold text-sm">
            {submitting ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  )
}
