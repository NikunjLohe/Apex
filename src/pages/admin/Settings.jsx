import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useDoc } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR } from '../../utils/format'
import { SkeletonForm } from '../../components/ui/LoadingSkeleton'
import { IPlus, IEdit, IClose } from '../../components/ui/icons'

export default function Settings() {
  const { isSuperAdmin } = useAuth()
  const { data: settingsData, loading: settingsLoading } = useDoc('config/settings')
  const { ranksList, config, saveRanks, loading: ranksLoading } = useRanks()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editingRank, setEditingRank] = useState(null) // rank object or null
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    setForm({
      companyName: settingsData?.companyName || 'APEX Savings',
      headOffice: settingsData?.headOffice || '',
      supportPhone: settingsData?.supportPhone || '',
      receiptFooter: settingsData?.receiptFooter || 'This is a computer-generated receipt · APEX',
    })
  }, [settingsData])

  if (settingsLoading || ranksLoading || !form) {
    return (
      <div className="mx-auto max-w-3xl">
        <SkeletonForm fields={4} />
      </div>
    )
  }

  const saveSettings = async () => {
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

  const handleEditRank = (rankObj) => {
    // Deep clone the rank object so we don't mutate local state
    setEditingRank({
      rank: rankObj.rank,
      code: rankObj.code || '',
      name: rankObj.name || '',
      mfa: rankObj.mfa || 0,
      ta: rankObj.ta || 0,
      pbTarget: rankObj.pbTarget || 0,
      pbAmount: rankObj.pbAmount || 0,
      promoTarget: rankObj.promoTarget || 0,
      cmdTarget: rankObj.cmdTarget || 0,
      cmdAmount: rankObj.cmdAmount || 0,
      mdaY1: [...(rankObj.mdaY1 || [0, 0, 0, 0, 0])],
      mdaY2: [...(rankObj.mdaY2 || [null, 0, 0, 0, 0])],
      fdPension: [...(rankObj.fdPension || [0, 0, 0, 0, 0])],
    })
    setModalOpen(true)
  }

  const handleAddRank = () => {
    const nextRankNum = ranksList.length > 0 ? Math.max(...ranksList.map(r => r.rank)) + 1 : 1
    // Load default values based on common rank parameters
    setEditingRank({
      rank: nextRankNum,
      code: '',
      name: '',
      mfa: 0,
      ta: 0,
      pbTarget: 0,
      pbAmount: 0,
      promoTarget: 0,
      cmdTarget: 0,
      cmdAmount: 0,
      mdaY1: [0, 0, 0, 0, 0],
      mdaY2: [null, 0, 0, 0, 0],
      fdPension: [0, 0, 0, 0, 0],
    })
    setModalOpen(true)
  }

  const handleSaveRank = async () => {
    if (!editingRank.code || !editingRank.name) {
      toast.error('Rank Code and Name are required')
      return
    }

    const toastId = toast.loading('Saving rank...')
    try {
      let updatedList = [...ranksList]
      const existingIdx = updatedList.findIndex(r => r.rank === editingRank.rank)
      if (existingIdx > -1) {
        updatedList[existingIdx] = editingRank
      } else {
        updatedList.push(editingRank)
      }

      // Sort by rank level
      updatedList.sort((a, b) => a.rank - b.rank)

      await saveRanks(updatedList)
      toast.success('Ranks configuration updated', { id: toastId })
      setModalOpen(false)
      setEditingRank(null)
    } catch (e) {
      toast.error(e.message || 'Could not save rank', { id: toastId })
    }
  }

  const handleDeleteRank = async (rankNum) => {
    if (!confirm('Are you sure you want to delete this rank level? Users assigned to this rank may be affected.')) {
      return
    }

    const toastId = toast.loading('Deleting rank...')
    try {
      const updatedList = ranksList.filter(r => r.rank !== rankNum)
      await saveRanks(updatedList)
      toast.success('Rank level deleted', { id: toastId })
    } catch (e) {
      toast.error(e.message || 'Could not delete rank', { id: toastId })
    }
  }

  // If ranksList is empty, map the default fallback lists to display them
  const currentRanks = ranksList.length > 0 ? ranksList : config.RANKS.map((r, i) => ({
    rank: r.rank,
    code: r.code,
    name: r.name,
    mfa: config.MFA[i],
    ta: config.TA[i],
    pbTarget: config.PB_TARGET[i],
    pbAmount: config.PB_AMOUNT[i],
    promoTarget: config.PROMO_TARGET[i],
    cmdTarget: config.CMD_AWARD_TARGET[i],
    cmdAmount: config.CMD_AWARD_AMOUNT[i],
    mdaY1: config.MDA[i].y1.map(val => val * 100),
    mdaY2: config.MDA[i].y2.map(val => val === null ? null : val * 100),
    fdPension: config.FD_PENSION[i].map(val => val * 100),
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Company Settings Card */}
      <div className="card space-y-4 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gold">Company Settings</h3>
        <div>
          <label className="label">Company name</label>
          <input className="field" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        </div>
        <div>
          <label className="label">Head office address</label>
          <input className="field" value={form.headOffice} onChange={(e) => setForm({ ...form, headOffice: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Support phone</label>
            <input className="field" value={form.supportPhone} onChange={(e) => setForm({ ...form, supportPhone: e.target.value })} />
          </div>
          <div>
            <label className="label">Receipt footer</label>
            <input className="field" value={form.receiptFooter} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={saveSettings} disabled={!isSuperAdmin && false || saving} className="btn-gold">
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

      {/* Ranks Management Card */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gold">Ranks & Compensation Slabs</h3>
          <button type="button" onClick={handleAddRank} className="btn-gold text-xs py-1.5 px-3 flex items-center gap-1">
            <IPlus size={14} /> Add Rank
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Lvl</th>
                <th>Rank</th>
                <th>MFA</th>
                <th>TA</th>
                <th>PB Target / Reward</th>
                <th>Promo Target</th>
                <th>CMD Target / Reward</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentRanks.map((r) => (
                <tr key={r.rank}>
                  <td className="font-mono text-ink-2">{r.rank}</td>
                  <td>
                    <span className="font-semibold text-ink-1">{r.code}</span>
                    <span className="ml-2 text-xs text-ink-2">{r.name}</span>
                  </td>
                  <td className="text-ink-1">{formatINR(r.mfa)}</td>
                  <td className="text-ink-1">{formatINR(r.ta)}</td>
                  <td className="text-xs text-ink-2">
                    {r.pbTarget > 0 ? (
                      <>
                        <span className="text-ink-1 font-medium">{formatINR(r.pbTarget)}</span>
                        <div className="text-[10px] text-gold">Get {formatINR(r.pbAmount)}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-ink-1 font-medium">{formatINR(r.promoTarget)}</td>
                  <td className="text-xs text-ink-2">
                    <span className="text-ink-1 font-medium">{formatINR(r.cmdTarget)}</span>
                    <div className="text-[10px] text-gold">Get {formatINR(r.cmdAmount)}</div>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => handleEditRank(r)} className="text-gold hover:underline p-1" title="Edit">
                        <IEdit size={16} />
                      </button>
                      <button type="button" onClick={() => handleDeleteRank(r.rank)} className="text-danger hover:underline p-1 text-xs" title="Delete">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Rank Modal */}
      {modalOpen && editingRank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-1/80 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="card relative z-10 w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh] space-y-4">
            <div className="flex items-center justify-between border-b border-navy-4 pb-3">
              <h3 className="text-lg font-bold text-ink-1">
                {ranksList.some(r => r.rank === editingRank.rank) ? `Edit Rank Level ${editingRank.rank}` : `Add New Rank Level ${editingRank.rank}`}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-ink-2 hover:text-ink-1">
                <IClose size={20} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Rank Code *</label>
                <input className="field font-mono" placeholder="e.g. AO, AM" value={editingRank.code} onChange={(e) => setEditingRank({ ...editingRank, code: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="label">Rank Name *</label>
                <input className="field" placeholder="e.g. Administrative Officer" value={editingRank.name} onChange={(e) => setEditingRank({ ...editingRank, name: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Monthly Field Allowance (MFA)</label>
                <input type="number" className="field" value={editingRank.mfa} onChange={(e) => setEditingRank({ ...editingRank, mfa: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Travel Allowance (TA)</label>
                <input type="number" className="field" value={editingRank.ta} onChange={(e) => setEditingRank({ ...editingRank, ta: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Performance Bonus Target (Monthly BV)</label>
                <input type="number" className="field" value={editingRank.pbTarget} onChange={(e) => setEditingRank({ ...editingRank, pbTarget: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Performance Bonus Reward Amount</label>
                <input type="number" className="field" value={editingRank.pbAmount} onChange={(e) => setEditingRank({ ...editingRank, pbAmount: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Promotion Target (Lifetime BV)</label>
                <input type="number" className="field" value={editingRank.promoTarget} onChange={(e) => setEditingRank({ ...editingRank, promoTarget: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">CMD Award Target</label>
                <input type="number" className="field" value={editingRank.cmdTarget} onChange={(e) => setEditingRank({ ...editingRank, cmdTarget: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">CMD Award Amount</label>
                <input type="number" className="field" value={editingRank.cmdAmount} onChange={(e) => setEditingRank({ ...editingRank, cmdAmount: Number(e.target.value) })} />
              </div>
            </div>

            {/* MDA and FD Slabs */}
            <div className="space-y-3 pt-2">
              <h4 className="font-semibold text-gold text-sm uppercase tracking-wide">Compensation Percentage Slabs (RD / FD)</h4>
              <div className="overflow-x-auto rounded-card border border-navy-4 bg-navy-2 p-3">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-navy-4 pb-2">
                      <th className="py-2 text-ink-2">Category</th>
                      <th className="py-2 text-center text-ink-2">1 Year Plan</th>
                      <th className="py-2 text-center text-ink-2">2 Year Plan</th>
                      <th className="py-2 text-center text-ink-2">3 Year Plan</th>
                      <th className="py-2 text-center text-ink-2">4 Year Plan</th>
                      <th className="py-2 text-center text-ink-2">5 Year Plan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-4">
                    <tr>
                      <td className="py-3 font-medium text-ink-1">MDA Year 1 (%)</td>
                      {editingRank.mdaY1.map((val, idx) => (
                        <td key={idx} className="p-1">
                          <input type="number" step="0.01" className="field py-1 px-1.5 text-center font-mono text-xs w-16 mx-auto block" value={val} onChange={(e) => {
                            const newY1 = [...editingRank.mdaY1]
                            newY1[idx] = Number(e.target.value)
                            setEditingRank({ ...editingRank, mdaY1: newY1 })
                          }} />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-3 font-medium text-ink-1">MDA Year 2+ (%)</td>
                      {editingRank.mdaY2.map((val, idx) => (
                        <td key={idx} className="p-1">
                          {idx === 0 ? (
                            <span className="text-center block text-ink-2 text-xs font-mono">—</span>
                          ) : (
                            <input type="number" step="0.01" className="field py-1 px-1.5 text-center font-mono text-xs w-16 mx-auto block" value={val ?? 0} onChange={(e) => {
                              const newY2 = [...editingRank.mdaY2]
                              newY2[idx] = Number(e.target.value)
                              setEditingRank({ ...editingRank, mdaY2: newY2 })
                            }} />
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-3 font-medium text-ink-1">FD / Pension (%)</td>
                      {editingRank.fdPension.map((val, idx) => (
                        <td key={idx} className="p-1">
                          <input type="number" step="0.01" className="field py-1 px-1.5 text-center font-mono text-xs w-16 mx-auto block" value={val} onChange={(e) => {
                            const newFd = [...editingRank.fdPension]
                            newFd[idx] = Number(e.target.value)
                            setEditingRank({ ...editingRank, fdPension: newFd })
                          }} />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-navy-4 pt-3 mt-4">
              <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost py-2">Cancel</button>
              <button type="button" onClick={handleSaveRank} className="btn-gold py-2">Save Rank</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
