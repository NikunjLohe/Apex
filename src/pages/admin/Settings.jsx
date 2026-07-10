import { useEffect, useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { doc, setDoc, serverTimestamp, collection, addDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useDoc, useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR } from '../../utils/format'
import { SkeletonForm } from '../../components/ui/LoadingSkeleton'
import { IPlus, IEdit, IClose, IDoc, ICash, ITrophy, ISettings, IBuilding } from '../../components/ui/icons'
import StatusBadge from '../../components/ui/StatusBadge'


const DEFAULT_MAPPING = {
  customerId: 'Customer ID',
  customerName: 'Customer Name',
  mobile: 'Mobile',
  address: 'Address',
  agentCode: 'Agent Code',
  policyNumber: 'Policy Number',
  planCode: 'Plan Code',
  monthlyAmount: 'Monthly Amount',
  totalAmount: 'Total Amount',
  startDate: 'Start Date',
}

export default function Settings() {
  const { isSuperAdmin } = useAuth()
  const { data: settingsData, loading: settingsLoading } = useDoc('config/settings')
  const { ranksList, config, saveRanks, loading: ranksLoading } = useRanks()
  const plansMaster = useCollection('plans_master')
  const { data: commissionsData, loading: commissionsLoading } = useDoc('config/commissions')
  const { data: promotionsData, loading: promotionsLoading } = useDoc('config/promotions')

  const [activeTab, setActiveTab] = useState('system') // 'system' | 'ranks' | 'plans' | 'commissions' | 'promotions' | 'mapping'

  // System & Company settings form state
  const [systemForm, setSystemForm] = useState(null)
  const [savingSystem, setSavingSystem] = useState(false)

  // Excel Mapping state
  const [excelMapping, setExcelMapping] = useState(DEFAULT_MAPPING)
  const [savingMapping, setSavingMapping] = useState(false)

  // Rank modal form states
  const [editingRank, setEditingRank] = useState(null)
  const [rankModalOpen, setRankModalOpen] = useState(false)

  // Plan modal form states
  const [planForm, setPlanForm] = useState({ name: '', code: '', duration: 1, type: 'RD', status: 'active' })
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState(null)
  const [savingPlan, setSavingPlan] = useState(false)

  // Commission matrix state
  const [selectedPlanCode, setSelectedPlanCode] = useState('')
  const [selectedYear, setSelectedYear] = useState(1)
  const [commissionsState, setCommissionsState] = useState({})
  const [savingCommissions, setSavingCommissions] = useState(false)
  const [focusedRankCode, setFocusedRankCode] = useState(null)
  const [tempRateValue, setTempRateValue] = useState('')

  // Promotion rules state
  const [promotionsState, setPromotionsState] = useState({})
  const [savingPromotions, setSavingPromotions] = useState(false)

  useEffect(() => {
    setSystemForm({
      companyName: settingsData?.companyName || 'APEX Savings',
      headOffice: settingsData?.headOffice || '',
      supportPhone: settingsData?.supportPhone || '',
      receiptFooter: settingsData?.receiptFooter || 'This is a computer-generated receipt · APEX',
      enableAgentAlerts: settingsData?.enableAgentAlerts ?? true,
      enablePayoutAlerts: settingsData?.enablePayoutAlerts ?? true,
      enablePromoAlerts: settingsData?.enablePromoAlerts ?? true,
      enableImportAlerts: settingsData?.enableImportAlerts ?? true,
    })
    if (settingsData?.excelMapping) {
      setExcelMapping(settingsData.excelMapping)
    }
  }, [settingsData])

  // Load initial commissions
  useEffect(() => {
    if (commissionsData?.commissions) {
      setCommissionsState(commissionsData.commissions)
    }
  }, [commissionsData])

  // Load initial promotion rules
  useEffect(() => {
    if (promotionsLoading) return
    const DEFAULT_PROMOTION_RULES = {
      AO: { businessTarget: 0, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 400, mfaTarget: 20000, pb: 0, pbTarget: 0, ta: 0, cmd: 3000, cmdTarget: 300000 },
      AM: { businessTarget: 50000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 500, mfaTarget: 40000, pb: 0, pbTarget: 0, ta: 500, cmd: 9000, cmdTarget: 900000 },
      ADM: { businessTarget: 150000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 600, mfaTarget: 60000, pb: 0, pbTarget: 0, ta: 1000, cmd: 15000, cmdTarget: 1500000 },
      DM: { businessTarget: 300000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 750, mfaTarget: 80000, pb: 3000, pbTarget: 200000, ta: 1000, cmd: 25000, cmdTarget: 2500000 },
      SDM: { businessTarget: 500000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 1000, mfaTarget: 200000, pb: 4000, pbTarget: 500000, ta: 1500, cmd: 40000, cmdTarget: 4000000 },
      CM: { businessTarget: 750000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 1500, mfaTarget: 300000, pb: 6000, pbTarget: 800000, ta: 1500, cmd: 60000, cmdTarget: 6000000 },
      AGM: { businessTarget: 1500000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 2000, mfaTarget: 400000, pb: 7000, pbTarget: 1000000, ta: 2000, cmd: 80000, cmdTarget: 8000000 },
      GM: { businessTarget: 2000000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 2500, mfaTarget: 600000, pb: 8000, pbTarget: 1500000, ta: 2500, cmd: 100000, cmdTarget: 10000000 },
      ZM: { businessTarget: 3000000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 3000, mfaTarget: 800000, pb: 9000, pbTarget: 2000000, ta: 2500, cmd: 150000, cmdTarget: 15000000 },
      ED: { businessTarget: 4500000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 3500, mfaTarget: 1000000, pb: 10000, pbTarget: 3000000, ta: 3000, cmd: 200000, cmdTarget: 20000000 },
      SED: { businessTarget: 6000000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 4000, mfaTarget: 1200000, pb: 15000, pbTarget: 4000000, ta: 3000, cmd: 225000, cmdTarget: 30000000 },
      MD: { businessTarget: 7500000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 5000, mfaTarget: 1500000, pb: 20000, pbTarget: 5000000, ta: 3500, cmd: 300000, cmdTarget: 40000000 },
      CMD: { businessTarget: 9000000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 6000, mfaTarget: 1800000, pb: 25000, pbTarget: 6000000, ta: 3500, cmd: 412500, cmdTarget: 55000000 },
      AVP: { businessTarget: 12000000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 7500, mfaTarget: 2100000, pb: 32500, pbTarget: 7500000, ta: 4500, cmd: 525000, cmdTarget: 70000000 },
      VP: { businessTarget: 15000000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 9000, mfaTarget: 2500000, pb: 40000, pbTarget: 9000000, ta: 6000, cmd: 675000, cmdTarget: 90000000 },
      SVP: { businessTarget: 18000000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 12000, mfaTarget: 3000000, pb: 50000, pbTarget: 10500000, ta: 7000, cmd: 550000, cmdTarget: 110000000 },
      EVP: { businessTarget: 21000000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 15000, mfaTarget: 3500000, pb: 60000, pbTarget: 12000000, ta: 9000, cmd: 750000, cmdTarget: 150000000 },
      MGD: { businessTarget: 25000000, requiredPromotedRank: '', requiredPromotedCount: 0, mfa: 20000, mfaTarget: 4000000, pb: 75000, pbTarget: 13500000, ta: 12000, cmd: 1000000, cmdTarget: 200000000 },
    }

    if (promotionsData?.rules && Object.keys(promotionsData.rules).length > 0) {
      setPromotionsState(promotionsData.rules)
    } else {
      setPromotionsState(DEFAULT_PROMOTION_RULES)
      // Seed directly to Firestore so the fields do not stay empty
      setDoc(doc(db, 'config', 'promotions'), { rules: DEFAULT_PROMOTION_RULES, updatedAt: serverTimestamp() })
        .catch(err => console.warn('Auto-seed config/promotions error:', err))
    }
  }, [promotionsData, promotionsLoading])

  const RANKS = config.RANKS

  // Sorted list of ranks
  const currentRanks = useMemo(() => {
    const list = ranksList.length > 0 ? ranksList : RANKS.map((r, i) => ({
      rank: r.rank,
      code: r.code,
      name: r.name,
      mfa: config.MFA[i] || 0,
      mfaTarget: config.MFA_TARGET[i] || 0,
      ta: config.TA[i] || 0,
      pbTarget: config.PB_TARGET[i] || 0,
      pbAmount: config.PB_AMOUNT[i] || 0,
      promoTarget: config.PROMO_TARGET[i] || 0,
      cmdTarget: config.CMD_AWARD_TARGET[i] || 0,
      cmdAmount: config.CMD_AWARD_AMOUNT[i] || 0,
      mdaY1: config.MDA[i]?.y1?.map(val => val * 100) || [0, 0, 0, 0, 0],
      mdaY2: config.MDA[i]?.y2?.map(val => val === null ? null : val * 100) || [null, 0, 0, 0, 0],
      fdPension: config.FD_PENSION[i]?.map(val => val * 100) || [0, 0, 0, 0, 0],
      recruitPermission: Number(r.rank) > 1,
      promoDesc: r.promoDesc || '',
      status: r.status || 'active',
    }))
    return list.map((r, i) => ({
      ...r,
      mfaTarget: r.mfaTarget || config.MFA_TARGET[i] || 0,
    }))
  }, [ranksList, RANKS, config])

  // Default dropdown selections on load
  useEffect(() => {
    if (plansMaster.data && plansMaster.data.length > 0 && !selectedPlanCode) {
      setSelectedPlanCode(plansMaster.data[0].code)
    }
  }, [plansMaster.data, selectedPlanCode])

  const selectedPlanObj = useMemo(() => {
    return plansMaster.data.find(p => p.code === selectedPlanCode)
  }, [plansMaster.data, selectedPlanCode])

  // Initialize master plans if collection is empty
  useEffect(() => {
    if (!plansMaster.loading && plansMaster.data.length === 0) {
      const defaults = [
        { name: 'RD 1 Year', code: 'RD1Y', duration: 1, type: 'RD', status: 'active' },
        { name: 'RD 2 Year', code: 'RD2Y', duration: 2, type: 'RD', status: 'active' },
        { name: 'RD 3 Year', code: 'RD3Y', duration: 3, type: 'RD', status: 'active' },
        { name: 'RD 4 Year', code: 'RD4Y', duration: 4, type: 'RD', status: 'active' },
        { name: 'Pension', code: 'PENS', duration: 5, type: 'FD', status: 'active' },
      ]
      defaults.forEach(async (p) => {
        await addDoc(collection(db, 'plans_master'), p)
      })
    }
  }, [plansMaster.loading, plansMaster.data])

  if (settingsLoading || ranksLoading || commissionsLoading || promotionsLoading || plansMaster.loading || !systemForm) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <SkeletonForm fields={6} />
      </div>
    )
  }

  // Save System settings
  const handleSaveSystem = async () => {
    setSavingSystem(true)
    try {
      await setDoc(doc(db, 'config', 'settings'), { ...systemForm, updatedAt: serverTimestamp() }, { merge: true })
      toast.success('System Settings saved')
    } catch {
      toast.error('Could not save system settings')
    } finally {
      setSavingSystem(false)
    }
  }

  // Save Excel Column Mappings
  const handleSaveMapping = async () => {
    setSavingMapping(true)
    try {
      await setDoc(doc(db, 'config', 'settings'), { excelMapping, updatedAt: serverTimestamp() }, { merge: true })
      toast.success('Excel Column Mapping saved')
    } catch {
      toast.error('Could not save Excel mapping')
    } finally {
      setSavingMapping(false)
    }
  }

  // Handle Ranks Modal
  const handleEditRank = (rankObj) => {
    setEditingRank({
      rank: rankObj.rank,
      code: rankObj.code || '',
      name: rankObj.name || '',
      mfa: rankObj.mfa || 0,
      mfaTarget: rankObj.mfaTarget || 0,
      ta: rankObj.ta || 0,
      pbTarget: rankObj.pbTarget || 0,
      pbAmount: rankObj.pbAmount || 0,
      promoTarget: rankObj.promoTarget || 0,
      cmdTarget: rankObj.cmdTarget || 0,
      cmdAmount: rankObj.cmdAmount || 0,
      mdaY1: [...(rankObj.mdaY1 || [0, 0, 0, 0, 0])],
      mdaY2: [...(rankObj.mdaY2 || [null, 0, 0, 0, 0])],
      fdPension: [...(rankObj.fdPension || [0, 0, 0, 0, 0])],
      recruitPermission: rankObj.recruitPermission !== undefined ? Boolean(rankObj.recruitPermission) : (Number(rankObj.rank) > 1),
      promoDesc: rankObj.promoDesc || '',
      status: rankObj.status || 'active',
    })
    setRankModalOpen(true)
  }

  const handleAddRank = () => {
    const nextRankNum = currentRanks.length > 0 ? Math.max(...currentRanks.map(r => r.rank)) + 1 : 1
    setEditingRank({
      rank: nextRankNum,
      code: '',
      name: '',
      mfa: 0,
      mfaTarget: 0,
      ta: 0,
      pbTarget: 0,
      pbAmount: 0,
      promoTarget: 0,
      cmdTarget: 0,
      cmdAmount: 0,
      mdaY1: [0, 0, 0, 0, 0],
      mdaY2: [null, 0, 0, 0, 0],
      fdPension: [0, 0, 0, 0, 0],
      recruitPermission: true,
      promoDesc: '',
      status: 'active',
    })
    setRankModalOpen(true)
  }

  const handleSaveRank = async () => {
    if (!editingRank.code || !editingRank.name) {
      toast.error('Rank Code and Name are required')
      return
    }
    const toastId = toast.loading('Saving rank...')
    try {
      let updatedList = [...currentRanks]
      const existingIdx = updatedList.findIndex(r => r.rank === editingRank.rank)
      if (existingIdx > -1) {
        updatedList[existingIdx] = editingRank
      } else {
        updatedList.push(editingRank)
      }
      updatedList.sort((a, b) => a.rank - b.rank)
      await saveRanks(updatedList)
      toast.success('Ranks configuration updated', { id: toastId })
      setRankModalOpen(false)
      setEditingRank(null)
    } catch (e) {
      toast.error(e.message || 'Could not save rank', { id: toastId })
    }
  }

  const handleMoveRank = async (index, direction) => {
    let updatedList = [...currentRanks]
    if (direction === 'up' && index > 0) {
      const temp = updatedList[index].rank
      updatedList[index].rank = updatedList[index - 1].rank
      updatedList[index - 1].rank = temp
    } else if (direction === 'down' && index < updatedList.length - 1) {
      const temp = updatedList[index].rank
      updatedList[index].rank = updatedList[index + 1].rank
      updatedList[index + 1].rank = temp
    } else {
      return
    }
    updatedList.sort((a, b) => a.rank - b.rank)
    // Normalize rank indices sequentially
    const normalized = updatedList.map((r, idx) => ({ ...r, rank: idx + 1 }))
    const toastId = toast.loading('Reordering ranks...')
    try {
      await saveRanks(normalized)
      toast.success('Ranks reordered successfully', { id: toastId })
    } catch (e) {
      toast.error(e.message || 'Failed to reorder ranks', { id: toastId })
    }
  }

  // Save Plan master
  const handleSavePlan = async (e) => {
    e.preventDefault()
    if (!planForm.name || !planForm.code) {
      toast.error('Plan Name and Code are required')
      return
    }
    setSavingPlan(true)
    try {
      if (editingPlanId) {
        await updateDoc(doc(db, 'plans_master', editingPlanId), { ...planForm, updatedAt: serverTimestamp() })
        toast.success('Plan updated successfully')
      } else {
        await addDoc(collection(db, 'plans_master'), { ...planForm, createdAt: serverTimestamp() })
        toast.success('Plan created successfully')
      }
      setPlanForm({ name: '', code: '', duration: 1, type: 'RD', status: 'active' })
      setEditingPlanId(null)
      setPlanModalOpen(false)
    } catch {
      toast.error('Could not save plan')
    } finally {
      setSavingPlan(false)
    }
  }

  const handleEditPlan = (p) => {
    setPlanForm({ name: p.name, code: p.code, duration: p.duration, type: p.type || 'RD', status: p.status })
    setEditingPlanId(p.id)
    setPlanModalOpen(true)
  }

  // Save Commissions
  const handleSaveCommissions = async () => {
    setSavingCommissions(true)
    try {
      await setDoc(doc(db, 'config', 'commissions'), { commissions: commissionsState, updatedAt: serverTimestamp() })
      toast.success('Commissions configuration saved')
    } catch {
      toast.error('Could not save commissions')
    } finally {
      setSavingCommissions(false)
    }
  }

  const handleCommissionChange = (rankCode, val) => {
    setCommissionsState(prev => ({
      ...prev,
      [selectedPlanCode]: {
        ...(prev[selectedPlanCode] || {}),
        [selectedYear]: {
          ...((prev[selectedPlanCode] || {})[selectedYear] || {}),
          [rankCode]: Number(val) || 0
        }
      }
    }))
  }

  // Save Promotions
  const handleSavePromotions = async () => {
    setSavingPromotions(true)
    try {
      await setDoc(doc(db, 'config', 'promotions'), { rules: promotionsState, updatedAt: serverTimestamp() })
      toast.success('Promotion configurations saved')
    } catch {
      toast.error('Could not save promotion configurations')
    } finally {
      setSavingPromotions(false)
    }
  }

  const handlePromoRuleChange = (rankCode, field, val) => {
    setPromotionsState(prev => ({
      ...prev,
      [rankCode]: {
        ...(prev[rankCode] || { businessTarget: 0, requiredPromotedCount: 0, requiredPromotedRank: '' }),
        [field]: field === 'requiredPromotedRank' ? val : (Number(val) || 0)
      }
    }))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top Title and Tab Menu */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Master Configurations</h2>
          <p className="text-xs text-ink-2">Manage settings, rank compensations, products, commissions, and promotions.</p>
        </div>
        <div className="flex flex-wrap gap-1 bg-navy-2 p-1.5 rounded-card border border-navy-4/50 text-xs">
          <button type="button" onClick={() => setActiveTab('system')} className={`px-3.5 py-2 font-bold uppercase rounded-md tracking-wider transition-all ${activeTab === 'system' ? 'bg-gold-1 text-white shadow-sm font-semibold' : 'text-ink-2 hover:text-ink-1'}`}>System Settings</button>
          <button type="button" onClick={() => setActiveTab('ranks')} className={`px-3.5 py-2 font-bold uppercase rounded-md tracking-wider transition-all ${activeTab === 'ranks' ? 'bg-gold-1 text-white shadow-sm font-semibold' : 'text-ink-2 hover:text-ink-1'}`}>Rank Master</button>
          <button type="button" onClick={() => setActiveTab('plans')} className={`px-3.5 py-2 font-bold uppercase rounded-md tracking-wider transition-all ${activeTab === 'plans' ? 'bg-gold-1 text-white shadow-sm font-semibold' : 'text-ink-2 hover:text-ink-1'}`}>Plan Master</button>
          <button type="button" onClick={() => setActiveTab('commissions')} className={`px-3.5 py-2 font-bold uppercase rounded-md tracking-wider transition-all ${activeTab === 'commissions' ? 'bg-gold-1 text-white shadow-sm font-semibold' : 'text-ink-2 hover:text-ink-1'}`}>Commission Master</button>
          <button type="button" onClick={() => setActiveTab('promotions')} className={`px-3.5 py-2 font-bold uppercase rounded-md tracking-wider transition-all ${activeTab === 'promotions' ? 'bg-gold-1 text-white shadow-sm font-semibold' : 'text-ink-2 hover:text-ink-1'}`}>Promotion Master</button>
          <button type="button" onClick={() => setActiveTab('mapping')} className={`px-3.5 py-2 font-bold uppercase rounded-md tracking-wider transition-all ${activeTab === 'mapping' ? 'bg-gold-1 text-white shadow-sm font-semibold' : 'text-ink-2 hover:text-ink-1'}`}>Excel Mapping</button>
        </div>
      </div>

      {/* Tabs Contents */}
      <div className="space-y-6">
        
        {/* Tab 1: System Settings */}
        {activeTab === 'system' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="card p-5 space-y-4 lg:col-span-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1 border-b border-navy-4/50 flex items-center gap-2">
                <IBuilding size={16} /> Company Credentials Settings
              </h3>
              <div className="space-y-3.5">
                <div>
                  <label className="label">Company name</label>
                  <input className="field" value={systemForm.companyName} onChange={(e) => setSystemForm({ ...systemForm, companyName: e.target.value })} />
                </div>
                <div>
                  <label className="label">Head office address</label>
                  <input className="field" value={systemForm.headOffice} onChange={(e) => setSystemForm({ ...systemForm, headOffice: e.target.value })} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">Support phone</label>
                    <input className="field" value={systemForm.supportPhone} onChange={(e) => setSystemForm({ ...systemForm, supportPhone: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Receipt footer</label>
                    <input className="field" value={systemForm.receiptFooter} onChange={(e) => setSystemForm({ ...systemForm, receiptFooter: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-2 border-t border-navy-4/20">
                <button type="button" onClick={handleSaveSystem} disabled={!isSuperAdmin && false || savingSystem} className="btn-gold px-6">
                  {savingSystem ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </div>

            {/* Side column: Notifications Settings & Placeholders */}
            <div className="space-y-5">
              <div className="card p-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
                  <ISettings size={14} /> Notification Settings
                </h4>
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-ink-1 block">New Agent Onboarding Alerts</span>
                      <span className="text-[10px] text-ink-2">Push notifications when new recruits sign up.</span>
                    </div>
                    <input 
                      type="checkbox" 
                      className="rounded border-navy-4 text-gold focus:ring-0"
                      checked={systemForm.enableAgentAlerts ?? true}
                      onChange={(e) => setSystemForm({ ...systemForm, enableAgentAlerts: e.target.checked })} 
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-ink-1 block">Payout Engine Confirmations</span>
                      <span className="text-[10px] text-ink-2">Alert agents automatically on payouts generation.</span>
                    </div>
                    <input 
                      type="checkbox" 
                      className="rounded border-navy-4 text-gold focus:ring-0"
                      checked={systemForm.enablePayoutAlerts ?? true}
                      onChange={(e) => setSystemForm({ ...systemForm, enablePayoutAlerts: e.target.checked })} 
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-ink-1 block">Promotion Decisions Alerts</span>
                      <span className="text-[10px] text-ink-2">Alerts agents on rank advancement results.</span>
                    </div>
                    <input 
                      type="checkbox" 
                      className="rounded border-navy-4 text-gold focus:ring-0"
                      checked={systemForm.enablePromoAlerts ?? true}
                      onChange={(e) => setSystemForm({ ...systemForm, enablePromoAlerts: e.target.checked })} 
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-ink-1 block">Excel Upload Summaries</span>
                      <span className="text-[10px] text-ink-2">Post notifications when bank excel import finishes.</span>
                    </div>
                    <input 
                      type="checkbox" 
                      className="rounded border-navy-4 text-gold focus:ring-0"
                      checked={systemForm.enableImportAlerts ?? true}
                      onChange={(e) => setSystemForm({ ...systemForm, enableImportAlerts: e.target.checked })} 
                    />
                  </div>
                </div>
              </div>

              <div className="card p-5 space-y-3.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
                  <ISettings size={14} /> Future Settings Modules
                </h4>
                <div className="space-y-3 text-xs text-ink-2">
                  <div className="border border-dashed border-navy-4 bg-navy-2/30 p-3 rounded-card">
                    <p className="font-semibold text-ink-1 mb-1">Excel Template Rules</p>
                    <p className="text-[10px]">Define columns and verification keys for uploading daily bank Excel formats.</p>
                  </div>
                  <div className="border border-dashed border-navy-4 bg-navy-2/30 p-3 rounded-card">
                    <p className="font-semibold text-ink-1 mb-1">System Import Controls</p>
                    <p className="text-[10px]">Verify duplicates, handle missing agent records, and map branches automatically.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Rank Master */}
        {activeTab === 'ranks' && (
          <div className="card p-5 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-navy-4/50">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                <ITrophy size={16} /> Rank Master Configuration
              </h3>
              <button type="button" onClick={handleAddRank} className="btn-gold py-1.5 px-3.5 text-xs flex items-center gap-1.5">
                <IPlus size={14} /> Add Rank Level
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Lvl</th>
                    <th>Rank Code</th>
                    <th>Name</th>
                    <th>Recruit</th>
                    <th>MFA</th>
                    <th>TA</th>
                    <th>PB Target / Reward</th>
                    <th>CMD Target / Reward</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRanks.map((r, idx) => (
                    <tr key={r.rank}>
                      <td className="font-mono text-ink-2">{r.rank}</td>
                      <td className="font-semibold text-ink-1 uppercase">{r.code}</td>
                      <td className="text-ink-2 font-medium">{r.name}</td>
                      <td>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold uppercase ${r.recruitPermission ? 'bg-ok/10 text-ok' : 'bg-navy-4 text-ink-2'}`}>
                          {r.recruitPermission ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="text-ink-1">{formatINR(r.mfa)}</td>
                      <td className="text-ink-1">{formatINR(r.ta)}</td>
                      <td className="text-[10px] text-ink-2">
                        {r.pbTarget > 0 ? (
                          <>
                            <div className="font-semibold text-ink-1">{formatINR(r.pbTarget)}</div>
                            <div className="text-[9px] text-gold-1">Get {formatINR(r.pbAmount)}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td className="text-[10px] text-ink-2">
                        {r.cmdTarget > 0 ? (
                          <>
                            <div className="font-semibold text-ink-1">{formatINR(r.cmdTarget)}</div>
                            <div className="text-[9px] text-gold-1">Get {formatINR(r.cmdAmount)}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td>
                        <StatusBadge status={r.status || 'active'} />
                      </td>
                      <td className="text-right space-x-2">
                        <button 
                          type="button" 
                          disabled={idx === 0} 
                          onClick={() => handleMoveRank(idx, 'up')} 
                          className="text-ink-2 hover:text-gold font-bold disabled:opacity-30 disabled:pointer-events-none" 
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button 
                          type="button" 
                          disabled={idx === currentRanks.length - 1} 
                          onClick={() => handleMoveRank(idx, 'down')} 
                          className="text-ink-2 hover:text-gold font-bold disabled:opacity-30 disabled:pointer-events-none" 
                          title="Move Down"
                        >
                          ▼
                        </button>
                        <button type="button" onClick={() => handleEditRank(r)} className="text-gold font-bold hover:underline" title="Edit">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Plan Master */}
        {activeTab === 'plans' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="card p-5 space-y-4 lg:col-span-2">
              <div className="flex justify-between items-center pb-2 border-b border-navy-4/50">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                  <IDoc size={16} /> Plan Configurations
                </h3>
                <button type="button" onClick={() => { setEditingPlanId(null); setPlanForm({ name: '', code: '', duration: 1, type: 'RD', status: 'active' }); setPlanModalOpen(true) }} className="btn-gold py-1.5 px-3.5 text-xs flex items-center gap-1.5">
                  <IPlus size={14} /> Add Plan
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Plan Code</th>
                      <th>Plan Name</th>
                      <th>Type</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plansMaster.data.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono font-semibold text-ink-1 uppercase">{p.code}</td>
                        <td className="font-semibold text-ink-1">{p.name}</td>
                        <td className="font-bold text-gold-1 uppercase">{p.type || 'RD'}</td>
                        <td className="text-ink-2">{p.duration} {p.duration === 1 ? 'Year' : 'Years'}</td>
                        <td>
                          <StatusBadge status={p.status || 'active'} />
                        </td>
                        <td className="text-right space-x-3">
                          <button type="button" onClick={() => handleEditPlan(p)} className="text-gold font-bold hover:underline">Edit</button>
                          <button 
                            type="button" 
                            onClick={async () => {
                              const next = p.status === 'inactive' ? 'active' : 'inactive'
                              await updateDoc(doc(db, 'plans_master', p.id), { status: next })
                              toast.success('Plan status updated')
                            }} 
                            className={`font-bold hover:underline ${p.status === 'inactive' ? 'text-ok' : 'text-danger'}`}
                          >
                            {p.status === 'inactive' ? 'Activate' : 'Deactivate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card p-5 space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
                Plan Master Overview
              </h4>
              <p className="text-xs text-ink-2 leading-relaxed">
                Plan Masters map the available savings products agents can sell. 
                Durations (in policy years) dictate how many annual collection cycles a plan requires. 
                Commission matrices and calculation rules lookup this master list to allocate payments.
              </p>
            </div>
          </div>
        )}

        {/* Tab 4: Commission Master */}
        {activeTab === 'commissions' && (
          <div className="card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-navy-4/50">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                  <ICash size={16} /> Commission Structure Matrix Config
                </h3>
                <p className="text-[11px] text-ink-2 mt-0.5">Define percentage commission structures by plan, policy year, and rank tier.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleSaveCommissions} disabled={savingCommissions} className="btn-gold py-1.5 px-4 text-xs">
                  {savingCommissions ? 'Saving...' : 'Save Matrix'}
                </button>
              </div>
            </div>

            {plansMaster.data.length ? (
              <div className="space-y-4">
                {/* Configuration Dropdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-navy-2/30 p-4 rounded-card border border-navy-4/50">
                  <div>
                    <label className="label">1. Select Target Plan *</label>
                    <select className="field text-xs" value={selectedPlanCode} onChange={(e) => { setSelectedPlanCode(e.target.value); setSelectedYear(1) }}>
                      {plansMaster.data.map(p => <option key={p.id} value={p.code}>{p.name} ({p.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">2. Select Policy Year *</label>
                    <select className="field text-xs" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                      {Array.from({ length: selectedPlanObj?.duration || 1 }, (_, i) => i + 1).map(yr => (
                        <option key={yr} value={yr}>Policy Year {yr}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Commissions Grid */}
                <div className="border border-navy-4 rounded-card overflow-hidden">
                  <table className="tbl text-xs">
                    <thead>
                      <tr>
                        <th>Rank Code</th>
                        <th>Rank Name</th>
                        <th className="w-48 text-center">Commission Percentage (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRanks.map((r) => {
                        const rate = commissionsState[selectedPlanCode]?.[selectedYear]?.[r.code] ?? 0
                        const isFocused = focusedRankCode === r.code
                        const displayValue = isFocused 
                          ? tempRateValue 
                          : (rate !== undefined && rate !== null ? Number(rate).toFixed(2) : '0.00')
                        return (
                          <tr key={r.rank}>
                            <td className="font-semibold text-ink-1 uppercase">{r.code}</td>
                            <td className="text-ink-2 font-medium">{r.name}</td>
                            <td className="p-1 flex justify-center">
                              <div className="relative w-36">
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  className="field font-mono py-1 text-center w-full pr-7" 
                                  value={displayValue} 
                                  placeholder="0.00" 
                                  onFocus={() => {
                                    setFocusedRankCode(r.code)
                                    setTempRateValue(rate ? rate.toString() : '')
                                  }}
                                  onBlur={() => {
                                    setFocusedRankCode(null)
                                  }}
                                  onChange={(e) => {
                                    setTempRateValue(e.target.value)
                                    handleCommissionChange(r.code, e.target.value)
                                  }} 
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-2 text-[10px] font-bold">%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic text-center py-4">Configure Plans in Plan Master before managing commissions.</p>
            )}
          </div>
        )}

        {/* Tab 5: Promotion Master */}
        {activeTab === 'promotions' && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-navy-4/50">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                  <ITrophy size={16} /> Promotion Transition Configurations & Allowances
                </h3>
                <p className="text-[11px] text-ink-2 mt-0.5">Configure targets (Lifetime BV), downline requirements, and monthly allowances (MFA, PB, TA, CMD) for all ranks.</p>
              </div>
              <button type="button" onClick={handleSavePromotions} disabled={savingPromotions} className="btn-gold py-1.5 px-4 text-xs">
                {savingPromotions ? 'Saving...' : 'Save Promotion Rules'}
              </button>
            </div>

            <div className="border border-navy-4 rounded-card overflow-x-auto">
              <table className="tbl text-xs whitespace-nowrap min-w-[1200px]">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Next Rank Transition</th>
                    <th>Target Lifetime BV (₹)</th>
                    <th className="text-center">Required Downline Promotee</th>
                    <th className="text-center">Required Count</th>
                    <th>MFA Target (Monthly BV)</th>
                    <th>MFA Reward (₹)</th>
                    <th>PB Target (Monthly BV)</th>
                    <th>PB Reward (₹)</th>
                    <th>TA Reward (₹)</th>
                    <th>CMD Target (Weighted)</th>
                    <th>CMD Reward (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRanks.map((r) => {
                    const rule = promotionsState[r.code] || { 
                      businessTarget: 0, requiredPromotedCount: 0, requiredPromotedRank: '',
                      mfa: 0, mfaTarget: 0, pb: 0, pbTarget: 0, ta: 0, cmd: 0, cmdTarget: 0
                    }
                    const isRank1 = r.rank === 1
                    return (
                      <tr key={r.rank} className="hover:bg-navy-2/20">
                        <td className="font-semibold text-ink-1 uppercase">
                          {r.code}
                          <div className="text-[10px] text-ink-2 font-normal mt-0.5">{r.name}</div>
                        </td>
                        <td className="text-ink-2">
                          {isRank1 ? (
                            <span className="text-[10px] italic text-ink-2/50">— Entry Rank —</span>
                          ) : (
                            <span className="font-mono text-[10px]">
                              {currentRanks.find(x => x.rank === r.rank - 1)?.code || 'AO'} &rarr; {r.code}
                            </span>
                          )}
                        </td>
                        <td className="p-1">
                          {isRank1 ? (
                            <span className="text-[10px] text-ink-2/50 block text-center">—</span>
                          ) : (
                            <input 
                              type="number" 
                              className="field font-mono py-1 px-2 max-w-[100px]" 
                              value={rule.businessTarget || ''} 
                              placeholder="e.g. 50000" 
                              onChange={(e) => handlePromoRuleChange(r.code, 'businessTarget', e.target.value)} 
                            />
                          )}
                        </td>
                        <td className="p-1">
                          {isRank1 ? (
                            <span className="text-[10px] text-ink-2/50 block text-center">—</span>
                          ) : (
                            <select 
                              className="field py-1 max-w-[100px] mx-auto block text-xs" 
                              value={rule.requiredPromotedRank || ''}
                              onChange={(e) => handlePromoRuleChange(r.code, 'requiredPromotedRank', e.target.value)}
                            >
                              <option value="">— None —</option>
                              {currentRanks.filter(x => x.rank < r.rank).map(x => (
                                <option key={x.rank} value={x.code}>{x.code}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="p-1 text-center">
                          {isRank1 ? (
                            <span className="text-[10px] text-ink-2/50 block text-center">—</span>
                          ) : (
                            <input 
                              type="number" 
                              className="field font-mono py-1 px-2 max-w-[60px] mx-auto block text-center" 
                              value={rule.requiredPromotedCount || ''} 
                              placeholder="0"
                              onChange={(e) => handlePromoRuleChange(r.code, 'requiredPromotedCount', e.target.value)} 
                            />
                          )}
                        </td>
                        <td className="p-1">
                          <input 
                            type="number" 
                            className="field font-mono py-1 px-2 max-w-[100px]" 
                            value={rule.mfaTarget || ''} 
                            placeholder="0" 
                            onChange={(e) => handlePromoRuleChange(r.code, 'mfaTarget', e.target.value)} 
                          />
                        </td>
                        <td className="p-1">
                          <input 
                            type="number" 
                            className="field font-mono py-1 px-2 max-w-[80px]" 
                            value={rule.mfa || ''} 
                            placeholder="0" 
                            onChange={(e) => handlePromoRuleChange(r.code, 'mfa', e.target.value)} 
                          />
                        </td>
                        <td className="p-1">
                          <input 
                            type="number" 
                            className="field font-mono py-1 px-2 max-w-[100px]" 
                            value={rule.pbTarget || ''} 
                            placeholder="0" 
                            onChange={(e) => handlePromoRuleChange(r.code, 'pbTarget', e.target.value)} 
                          />
                        </td>
                        <td className="p-1">
                          <input 
                            type="number" 
                            className="field font-mono py-1 px-2 max-w-[80px]" 
                            value={rule.pb || ''} 
                            placeholder="0" 
                            onChange={(e) => handlePromoRuleChange(r.code, 'pb', e.target.value)} 
                          />
                        </td>
                        <td className="p-1">
                          <input 
                            type="number" 
                            className="field font-mono py-1 px-2 max-w-[80px]" 
                            value={rule.ta || ''} 
                            placeholder="0" 
                            onChange={(e) => handlePromoRuleChange(r.code, 'ta', e.target.value)} 
                          />
                        </td>
                        <td className="p-1">
                          <input 
                            type="number" 
                            className="field font-mono py-1 px-2 max-w-[100px]" 
                            value={rule.cmdTarget || ''} 
                            placeholder="0" 
                            onChange={(e) => handlePromoRuleChange(r.code, 'cmdTarget', e.target.value)} 
                          />
                        </td>
                        <td className="p-1">
                          <input 
                            type="number" 
                            className="field font-mono py-1 px-2 max-w-[80px]" 
                            value={rule.cmd || ''} 
                            placeholder="0" 
                            onChange={(e) => handlePromoRuleChange(r.code, 'cmd', e.target.value)} 
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 6: Excel Mapping */}
        {activeTab === 'mapping' && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-navy-4/50">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                  <IDoc size={16} /> Excel Import Column Mapping
                </h3>
                <p className="text-[11px] text-ink-2 mt-0.5">Map Excel sheet column header labels to internal database fields.</p>
              </div>
              <button type="button" onClick={handleSaveMapping} disabled={savingMapping} className="btn-gold py-1.5 px-4 text-xs">
                {savingMapping ? 'Saving...' : 'Save Mapping'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(DEFAULT_MAPPING).map((key) => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-ink-2 tracking-wider">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </label>
                  <input
                    type="text"
                    className="field py-2"
                    value={excelMapping[key] || ''}
                    placeholder={`e.g. ${DEFAULT_MAPPING[key]}`}
                    onChange={(e) => setExcelMapping(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Ranks Add/Edit Modal */}
      {rankModalOpen && editingRank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-1/80 backdrop-blur-sm" onClick={() => setRankModalOpen(false)} />
          <div className="card relative z-10 w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh] space-y-4">
            <div className="flex items-center justify-between border-b border-navy-4 pb-3">
              <h3 className="text-lg font-bold text-ink-1 font-serif">
                {ranksList.some(r => r.rank === editingRank.rank) ? `Edit Rank Level ${editingRank.rank}` : `Add New Rank Level ${editingRank.rank}`}
              </h3>
              <button type="button" onClick={() => setRankModalOpen(false)} className="text-ink-2 hover:text-ink-1">
                <IClose size={20} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Rank Code *</label>
                <input className="field font-mono uppercase" placeholder="e.g. AO, AM" value={editingRank.code} onChange={(e) => setEditingRank({ ...editingRank, code: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="label">Rank Name *</label>
                <input className="field" placeholder="e.g. Administrative Officer" value={editingRank.name} onChange={(e) => setEditingRank({ ...editingRank, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="field text-xs" value={editingRank.status} onChange={(e) => setEditingRank({ ...editingRank, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 pb-2">
              <input 
                type="checkbox" 
                id="recruitPerm" 
                className="accent-gold-1 h-4 w-4" 
                checked={editingRank.recruitPermission} 
                onChange={(e) => setEditingRank({ ...editingRank, recruitPermission: e.target.checked })} 
              />
              <label htmlFor="recruitPerm" className="text-xs font-semibold text-ink-1">Recruitment Permission (Allow recruiting new members at this rank)</label>
            </div>

            {/* MDA and FD Slabs */}
            <div className="space-y-3 pt-2">
              <h4 className="font-semibold text-gold-tan text-sm uppercase tracking-wide">Compensation Percentage Slabs (RD / FD)</h4>
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
              <button type="button" onClick={() => setRankModalOpen(false)} className="btn-ghost py-2">Cancel</button>
              <button type="button" onClick={handleSaveRank} className="btn-gold py-2 px-6">Save Rank</button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Add/Edit Modal */}
      {planModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-1/80 backdrop-blur-sm" onClick={() => setPlanModalOpen(false)} />
          <form className="card relative z-10 w-full max-w-md p-6 space-y-4" onSubmit={handleSavePlan}>
            <div className="flex items-center justify-between border-b border-navy-4 pb-3">
              <h3 className="text-lg font-bold text-ink-1 font-serif">
                {editingPlanId ? 'Edit Financial Plan' : 'Add New Financial Plan'}
              </h3>
              <button type="button" onClick={() => setPlanModalOpen(false)} className="text-ink-2 hover:text-ink-1">
                <IClose size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Plan Name *</label>
                <input className="field" placeholder="e.g. RD 3 Year" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Plan Code *</label>
                <input className="field font-mono uppercase" placeholder="e.g. RD3Y" value={planForm.code} onChange={(e) => setPlanForm({ ...planForm, code: e.target.value.toUpperCase() })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Plan Type *</label>
                  <select className="field text-xs" value={planForm.type} onChange={(e) => setPlanForm({ ...planForm, type: e.target.value })}>
                    <option value="RD">Recurring Deposit (RD)</option>
                    <option value="FD">Fixed Deposit (FD) / Pension</option>
                  </select>
                </div>
                <div>
                  <label className="label">Duration (Years) *</label>
                  <input type="number" min={1} max={20} className="field font-mono" value={planForm.duration} onChange={(e) => setPlanForm({ ...planForm, duration: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="field text-xs" value={planForm.status} onChange={(e) => setPlanForm({ ...planForm, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-navy-4 pt-3 mt-4">
              <button type="button" onClick={() => setPlanModalOpen(false)} className="btn-ghost py-2">Cancel</button>
              <button type="submit" disabled={savingPlan} className="btn-gold py-2 px-6">
                {savingPlan ? 'Saving...' : 'Save Plan'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  )
}
