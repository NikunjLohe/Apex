import { doc, setDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { generateAccountNumber } from './ids'

/**
 * Create a customer doc with an auto-generated account number.
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
    throw err
  }
  
  const ref = doc(collection(db, 'customers'))
  const payload = {
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
    enrolledBy: agent?.uid || null,
    enrolledByName: agent?.name || '',
    branchId: agent?.branchId || null,
    accountNumber,
    plansCount: 0,
    createdAt: serverTimestamp(),
  }
  
  console.log("createCustomer Step 3: calling setDoc on customers collection")
  try {
    await setDoc(ref, payload)
    console.log("createCustomer Step 4: setDoc finished successfully")
  } catch (err) {
    console.error("createCustomer Error in setDoc:", err)
    throw err
  }
  return { id: ref.id, accountNumber }
}

export function updateCustomer(id, data) {
  return updateDoc(doc(db, 'customers', id), { ...data, updatedAt: serverTimestamp() })
}

export function setKycStatus(id, kycStatus) {
  return updateDoc(doc(db, 'customers', id), { kycStatus })
}
