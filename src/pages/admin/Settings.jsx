import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useDoc } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import { MFA, TA } from '../../data/compensation'
import { RANKS } from '../../data/ranks'
import { formatINR } from '../../utils/format'
import { SkeletonForm } from '../../components/ui/LoadingSkeleton'

export default function Settings() {
  const { isSuperAdmin } = useAuth()
  const { data, loading } = useDoc('config/settings')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      companyName: data?.companyName || 'APEX Savings',
      headOffice: data?.headOffice || '',
      supportPhone: data?.supportPhone || '',
      receiptFooter: data?.receiptFooter || 'This is a computer-generated receipt · APEX',
    })
  }, [data])

  if (loading || !form) return <div className="mx-auto max-w-3xl"><SkeletonForm fields={4} /></div>

  const save = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'config', 'settings'), { ...form, updatedAt: serverTimestamp() }, { merge: true })
      toast.success('Settings saved')
    } catch {
      toast.error('Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="card space-y-4 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gold">Company</h3>
        <div><label className="label">Company name</label><input className="field" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
        <div><label className="label">Head office address</label><input className="field" value={form.headOffice} onChange={(e) => setForm({ ...form, headOffice: e.target.value })} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Support phone</label><input className="field" value={form.supportPhone} onChange={(e) => setForm({ ...form, supportPhone: e.target.value })} /></div>
          <div><label className="label">Receipt footer</label><input className="field" value={form.receiptFooter} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} /></div>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={!isSuperAdmin && false || saving} className="btn-gold">{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </div>

      {/* Reference: rank allowances (read-only) */}
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gold">Allowance reference</h3>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Rank</th><th>MFA (monthly)</th><th>Travel Allowance</th></tr></thead>
            <tbody>
              {RANKS.map((r, i) => (
                <tr key={r.rank}><td className="font-semibold text-ink-1">{r.code}<span className="ml-2 text-xs text-ink-2">{r.name}</span></td><td>{formatINR(MFA[i])}</td><td>{formatINR(TA[i])}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
