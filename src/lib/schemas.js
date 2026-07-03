// ============================================================================
// Zod validation schemas (used with @hookform/resolvers/zod).
// ============================================================================
import { z } from 'zod'

const phone = z.string().regex(/^\d{10}$/, '10-digit mobile number')
const optionalPhone = z.string().regex(/^\d{10}$/, '10-digit mobile number').or(z.literal(''))

export const customerSchema = z.object({
  // Personal
  name: z.string().min(2, 'Full name is required'),
  dob: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['Male', 'Female', 'Other'], { errorMap: () => ({ message: 'Select gender' }) }),
  phone,
  altPhone: optionalPhone.optional(),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  fatherOrHusbandName: z.string().optional(),
  motherName: z.string().optional(),
  maritalStatus: z.enum(['Married', 'Unmarried']).optional(),
  occupation: z.string().optional(),
  annualIncome: z.string().optional(),
  nationality: z.string().default('Indian'),
  castOrSubcast: z.string().optional(),
  // Address
  address1: z.string().min(3, 'Address is required'),
  address2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^\d{6}$/, '6-digit pincode'),
  // IDs
  aadhaar: z.string().trim().regex(/^\d{12}$/, 'Aadhaar must be 12 digits'),
  pan: z.string().trim().regex(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/, 'PAN format: ABCDE1234F'),
  // Nominee
  nomineeName: z.string().min(2, 'Nominee name is required'),
  nomineeRelation: z.string().min(2, 'Relation is required'),
  nomineePhone: phone,
  nomineeAddress: z.string().optional(),
  // Source
  source: z.enum(['Walk-in', 'Referral', 'Agent']),
})

export const planSchema = z
  .object({
    type: z.string().min(1, 'Select plan type'),
    monthlyAmount: z.coerce.number().optional(),
    fdAmount: z.coerce.number().optional(),
    paymentDate: z.coerce.number().min(1).max(28).optional(),
    startDate: z.string().min(1, 'Start date is required'),
  })
  .superRefine((val, ctx) => {
    if (val.type.startsWith('RD')) {
      if (!val.monthlyAmount || val.monthlyAmount < 500)
        ctx.addIssue({ path: ['monthlyAmount'], code: 'custom', message: 'Minimum ₹500' })
      if (!val.paymentDate)
        ctx.addIssue({ path: ['paymentDate'], code: 'custom', message: 'Select a payment day' })
    } else {
      if (!val.fdAmount || val.fdAmount < 5000)
        ctx.addIssue({ path: ['fdAmount'], code: 'custom', message: 'Minimum ₹5,000' })
    }
  })

export const paymentSchema = z
  .object({
    amount: z.coerce.number().min(1, 'Amount required'),
    paymentMode: z.enum(['cash', 'upi', 'cheque']),
    transactionRef: z.string().optional(),
    chequeNumber: z.string().optional(),
    bankName: z.string().optional(),
    chequeDate: z.string().optional(),
    paidDate: z.string().min(1, 'Payment date is required'),
    notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.paymentMode === 'upi' && !val.transactionRef)
      ctx.addIssue({ path: ['transactionRef'], code: 'custom', message: 'UPI transaction ID required' })
    if (val.paymentMode === 'cheque') {
      if (!val.chequeNumber) ctx.addIssue({ path: ['chequeNumber'], code: 'custom', message: 'Cheque number required' })
      if (!val.bankName) ctx.addIssue({ path: ['bankName'], code: 'custom', message: 'Bank name required' })
    }
  })

export const memberSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  phone,
  rank: z.coerce.number().min(1),
  branchId: z.string().optional(),
  referredBy: z.string().optional(), // sponsor / upline uid
  sponsorCode: z.string().optional(),
  isSuperAdmin: z.boolean().optional(),
  status: z.enum(['active', 'inactive']),
  password: z.string().optional(),
  address: z.string().optional(),
  dob: z.string().optional(),
  sponsorCodeInput: z.string().optional(),
})

export const branchSchema = z.object({
  name: z.string().min(2, 'Branch name is required'),
  address: z.string().min(3, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  managerId: z.string().optional(),
  branchCode: z.string().optional(),
  contactNumber: optionalPhone.optional(),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
})

export const planMasterSchema = z.object({
  name: z.string().min(2, 'Plan name is required'),
  code: z.string().min(2, 'Plan code is required'),
  duration: z.coerce.number().min(1, 'Duration must be at least 1 year'),
  status: z.enum(['active', 'inactive']).default('active'),
})
