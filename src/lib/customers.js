import { createCustomer as dalCreateCustomer } from './supabase/customers'
import { generateAccountNumber } from './ids'

/**
 * Create a customer doc with an auto-generated account number.
 * Defaults to Supabase DAL.
 * @returns {{ id, accountNumber }}
 */
export async function createCustomer(form, { uploads = {}, agent }) {
  console.log("createCustomer Step 1: generating account number")
  let accountNumber
  try {
    accountNumber = await generateAccountNumber()
    console.log("createCustomer Step 2: generated account number", accountNumber)
  } catch (err) {
    console.error("createCustomer Error generating account number:", err)
    accountNumber = `CUST-${Date.now()}`
  }
  
  const payload = {
    customerId: accountNumber,
    accountNumber,
    name: form.name,
    dob: form.dob ? new Date(form.dob) : null,
    gender: form.gender,
    phone: form.phone,
    altPhone: form.altPhone || '',
    email: form.email || '',
    fatherOrHusbandName: form.fatherOrHusbandName || '',
    motherName: form.motherName || '',
    maritalStatus: form.maritalStatus || 'Unmarried',
    occupation: form.occupation || '',
    annualIncome: form.annualIncome || '',
    nationality: form.nationality || 'Indian',
    castOrSubcast: form.castOrSubcast || '',
    address: [form.address1, form.address2, form.city, form.state, form.pincode].filter(Boolean).join(', '),
    address1: form.address1,
    address2: form.address2 || '',
    city: form.city,
    state: form.state,
    pincode: form.pincode,
    aadhaar: form.aadhaar,
    pan: form.pan,
    photoUrl: uploads.photoUrl || '',
    signatureUrl: uploads.signatureUrl || '',
    aadhaarUrl: uploads.aadhaarUrl || '',
    panUrl: uploads.panUrl || '',
    nominee: { name: form.nomineeName, relation: form.nomineeRelation, phone: form.nomineePhone, address: form.nomineeAddress || '' },
    source: form.source,
    kycStatus: 'pending',
    enrolledBy: agent?.uid || agent?.id || null,
    enrolledByName: agent?.name || '',
    branchId: agent?.branchId || null,
  }
  
  console.log("createCustomer Step 3: calling Supabase DAL createCustomer")
  const created = await dalCreateCustomer(payload)
  console.log("createCustomer Step 4: Supabase DAL createCustomer finished successfully", created)
  return { id: created.id, accountNumber: created.accountNumber || accountNumber }
}

export async function getCustomer(id) {
  const { getCustomer: dalGetCustomer } = await import('./supabase/customers')
  return dalGetCustomer(id)
}

export async function updateCustomer(id, data) {
  const { updateCustomer: dalUpdateCustomer } = await import('./supabase/customers')
  return dalUpdateCustomer(id, data)
}

export async function setKycStatus(id, kycStatus) {
  const { updateCustomer: dalUpdateCustomer } = await import('./supabase/customers')
  return dalUpdateCustomer(id, { kycStatus })
}
