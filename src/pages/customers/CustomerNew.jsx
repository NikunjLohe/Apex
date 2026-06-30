import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { customerSchema } from '../../lib/schemas'
import { createCustomer } from '../../lib/customers'
import { uploadFile, customerAssetPath } from '../../lib/storage'
import SignaturePad from '../../components/ui/SignaturePad'

export default function CustomerNew() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [photo, setPhoto] = useState(null)
  const [signatureBlob, setSignatureBlob] = useState(null)
  const [signatureFile, setSignatureFile] = useState(null)
  const [aadhaarFile, setAadhaarFile] = useState(null)
  const [panFile, setPanFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: { source: 'Walk-in', gender: 'Male' },
  })

  const onSubmit = async (form) => {
    setSubmitting(true)
    const tId = toast.loading('Saving customer…')
    try {
      // Upload assets in parallel
      const uploads = {}
      const jobs = []
      if (photo) jobs.push(uploadFile(customerAssetPath('photos', photo.name), photo).then((u) => (uploads.photoUrl = u)))
      if (signatureFile) jobs.push(uploadFile(customerAssetPath('signatures', signatureFile.name), signatureFile).then((u) => (uploads.signatureUrl = u)))
      else if (signatureBlob) jobs.push(uploadFile(customerAssetPath('signatures', 'sign.png'), signatureBlob).then((u) => (uploads.signatureUrl = u)))
      if (aadhaarFile) jobs.push(uploadFile(customerAssetPath('aadhaar', aadhaarFile.name), aadhaarFile).then((u) => (uploads.aadhaarUrl = u)))
      if (panFile) jobs.push(uploadFile(customerAssetPath('pan', panFile.name), panFile).then((u) => (uploads.panUrl = u)))
      await Promise.all(jobs)

      const { id, accountNumber } = await createCustomer(form, {
        uploads,
        agent: { uid: profile?.uid, name: profile?.name, branchId: profile?.branchId },
      })
      toast.success(`Customer created · ${accountNumber}`, { id: tId })
      navigate(`/customers/${id}`)
    } catch (e) {
      toast.error(e.message || 'Could not save customer', { id: tId })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Section 1 */}
        <Section title="1 · Personal Details">
          <Grid>
            <F label="Full Name *" error={errors.name}><input className="field" {...register('name')} /></F>
            <F label="Father's/Husband's Name" error={errors.fatherOrHusbandName}><input className="field" {...register('fatherOrHusbandName')} /></F>
            <F label="Mother's Name" error={errors.motherName}><input className="field" {...register('motherName')} /></F>
            <F label="Date of Birth *" error={errors.dob}><input type="date" className="field" {...register('dob')} /></F>
            
            <F label="Gender *" error={errors.gender}>
              <select className="field" {...register('gender')}><option>Male</option><option>Female</option><option>Other</option></select>
            </F>
            <F label="Marital Status" error={errors.maritalStatus}>
              <select className="field" {...register('maritalStatus')}><option>Married</option><option>Unmarried</option></select>
            </F>
            
            <F label="Phone *" error={errors.phone}><input className="field" inputMode="numeric" maxLength={10} {...register('phone')} /></F>
            <F label="Alt Phone" error={errors.altPhone}><input className="field" inputMode="numeric" maxLength={10} {...register('altPhone')} /></F>
            <F label="Email" error={errors.email}><input className="field" type="email" {...register('email')} /></F>
            
            <F label="Nationality" error={errors.nationality}><input className="field" {...register('nationality')} defaultValue="Indian" /></F>
            <F label="Cast/Subcast" error={errors.castOrSubcast}><input className="field" {...register('castOrSubcast')} /></F>
            <F label="Occupation" error={errors.occupation}><input className="field" {...register('occupation')} /></F>
            <F label="Annual Income" error={errors.annualIncome}><input className="field" {...register('annualIncome')} /></F>
          </Grid>
        </Section>

        {/* Section 2 */}
        <Section title="2 · Address">
          <Grid>
            <F label="Address Line 1 *" error={errors.address1} full><input className="field" {...register('address1')} /></F>
            <F label="Address Line 2" error={errors.address2} full><input className="field" {...register('address2')} /></F>
            <F label="City *" error={errors.city}><input className="field" {...register('city')} /></F>
            <F label="State *" error={errors.state}><input className="field" {...register('state')} /></F>
            <F label="Pincode *" error={errors.pincode}><input className="field" inputMode="numeric" maxLength={6} {...register('pincode')} /></F>
          </Grid>
        </Section>

        {/* Section 3 */}
        <Section title="3 · ID Documents">
          <Grid>
            <F label="Aadhaar Number * (12 digits)" error={errors.aadhaar}><input className="field" inputMode="numeric" maxLength={12} {...register('aadhaar')} /></F>
            <F label="PAN Number * (ABCDE1234F)" error={errors.pan}>
              <input className="field uppercase" maxLength={10} {...register('pan')} style={{ textTransform: 'uppercase' }} />
            </F>
            <Upload label="Upload Aadhaar Photo" file={aadhaarFile} onPick={setAadhaarFile} />
            <Upload label="Upload PAN Photo" file={panFile} onPick={setPanFile} />
          </Grid>
        </Section>

        {/* Section 4 */}
        <Section title="4 · Photo & Signature">
          <Grid>
            <F label="Customer Photo (camera or file)">
              <input type="file" accept="image/*" capture="user" className="field" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
              {photo && <p className="mt-1 text-xs text-ok">{photo.name}</p>}
            </F>
            <F label="Signature — upload file (optional)">
              <input type="file" accept="image/*" className="field" onChange={(e) => setSignatureFile(e.target.files?.[0] || null)} />
            </F>
            <div className="sm:col-span-2">
              <label className="label">Or draw signature</label>
              <SignaturePad onChange={setSignatureBlob} />
            </div>
          </Grid>
        </Section>

        {/* Section 5 */}
        <Section title="5 · Nominee Details">
          <Grid>
            <F label="Nominee Name *" error={errors.nomineeName}><input className="field" {...register('nomineeName')} /></F>
            <F label="Relation *" error={errors.nomineeRelation}><input className="field" {...register('nomineeRelation')} /></F>
            <F label="Nominee Phone *" error={errors.nomineePhone}><input className="field" inputMode="numeric" maxLength={10} {...register('nomineePhone')} /></F>
            <F label="Nominee Address" error={errors.nomineeAddress}><input className="field" {...register('nomineeAddress')} /></F>
          </Grid>
        </Section>

        {/* Section 6 */}
        <Section title="6 · Agent Details">
          <Grid>
            <F label="Enrolled By"><input className="field" disabled value={profile?.name || '—'} /></F>
            <F label="Branch"><input className="field" disabled value={profile?.branchId || '—'} /></F>
            <F label="Introduction Source *" error={errors.source}>
              <select className="field" {...register('source')}><option>Walk-in</option><option>Referral</option><option>Agent</option></select>
            </F>
          </Grid>
        </Section>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-navy-4 bg-navy-1/90 py-3 backdrop-blur">
          <button type="button" onClick={() => navigate('/customers')} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-gold">{submitting ? 'Saving…' : 'Create Customer'}</button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gold">{title}</h3>
      {children}
    </div>
  )
}
function Grid({ children }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}
function F({ label, error, full, children }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      {children}
      {error && <p className="err">{error.message}</p>}
    </div>
  )
}
function Upload({ label, file, onPick }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="file" accept="image/*,application/pdf" className="field" onChange={(e) => onPick(e.target.files?.[0] || null)} />
      {file && <p className="mt-1 text-xs text-ok">{file.name}</p>}
    </div>
  )
}
