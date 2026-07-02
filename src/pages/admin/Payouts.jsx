import { useState, useMemo, useEffect } from 'react'
import { collection, doc, getDocs, setDoc, writeBatch, serverTimestamp, query, where, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useFirestore'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR, fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import toast from 'react-hot-toast'
import { ICash, ICheck, IAlert, IClock, IUsers, IDoc } from '../../components/ui/icons'

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

export default function Payouts() {
  const { config, getRank } = useRanks()
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const [loading, setLoading] = useState(false)
  const [payoutsList, setPayoutsList] = useState([])
  const [generating, setGenerating] = useState(false)

  // Load existing payouts for selected month & year
  const fetchPayouts = async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'payouts'),
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear)
      )
      const snap = await getDocs(q)
      const list = []
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() })
      })
      setPayoutsList(list)
    } catch (err) {
      console.error('Error fetching payouts:', err)
      toast.error('Failed to load payouts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPayouts()
  }, [selectedMonth, selectedYear])

  // Generate Payout calculation process
  const handleGeneratePayouts = async () => {
    setGenerating(true)
    const toastId = toast.loading('Calculating monthly payouts & allowance targets...')
    try {
      // 1. Fetch all unpaid commissions for target month/year
      const commQuery = query(
        collection(db, 'commissions'),
        where('status', '==', 'unpaid'),
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear)
      )
      const commSnap = await getDocs(commQuery)
      const commissions = []
      commSnap.forEach(d => {
        commissions.push({ id: d.id, ...d.data() })
      })

      if (commissions.length === 0) {
        toast.error('No unpaid commissions found for selected month & year', { id: toastId })
        setGenerating(false)
        return
      }

      // 2. Fetch all users (agents) to get ranks
      const usersSnap = await getDocs(collection(db, 'users'))
      const usersMap = {}
      usersSnap.forEach(d => {
        usersMap[d.id] = { id: d.id, ...d.data() }
      })

      // 3. Fetch all active policies of target month/year to compute Monthly BV for target allowances checks
      const plansSnap = await getDocs(collection(db, 'plans'))
      const plansList = []
      plansSnap.forEach(d => {
        plansList.push({ id: d.id, ...d.data() })
      })

      // Group commissions by agent
      const groupedComms = {}
      commissions.forEach(c => {
        if (!groupedComms[c.agentId]) {
          groupedComms[c.agentId] = []
        }
        groupedComms[c.agentId].push(c)
      })

      const batch = writeBatch(db)

      for (const agentId in groupedComms) {
        const commList = groupedComms[agentId]
        const agent = usersMap[agentId] || { name: commList[0].agentName, sponsorCode: commList[0].sponsorCode || '—', rank: 1 }
        
        // Compute monthly business volume sold in this target month
        const agentPlans = plansList.filter(p => {
          if (p.agentId !== agentId) return false
          const startDateVal = p.startDate?.seconds ? new Date(p.startDate.seconds * 1000) : new Date(p.startDate)
          if (isNaN(startDateVal.getTime())) return false
          return (startDateVal.getMonth() + 1 === selectedMonth) && (startDateVal.getFullYear() === selectedYear)
        })

        // Monthly BV = sum of RD monthly amounts * 12 + FD lump sum amounts
        const monthlyBV = agentPlans.reduce((sum, p) => {
          const isRD = p.type?.toLowerCase().startsWith('rd')
          return sum + (isRD ? (p.monthlyAmount * 12) : p.fdAmount)
        }, 0)

        // Rank settings
        const rankIdx = (Number(agent.rank) || 1) - 1
        const rankInfo = getRank(agent.rank)
        
        // MFA Target Check
        const mfaTarget = config.MFA_TARGET[rankIdx] || 0
        const mfaAmount = config.MFA[rankIdx] || 0
        const mfa = monthlyBV >= mfaTarget ? mfaAmount : 0

        // PB Target Check
        const pbTarget = config.PB_TARGET[rankIdx] || 0
        const pbAmount = config.PB_AMOUNT[rankIdx] || 0
        const pb = (pbTarget > 0 && monthlyBV >= pbTarget) ? pbAmount : 0

        // Travel Allowance (flat flat allowance if they had active sales)
        const taAmount = config.TA[rankIdx] || 0
        const ta = agentPlans.length > 0 ? taAmount : 0

        const totalCommission = commList.reduce((sum, c) => sum + (c.amount || 0), 0)
        const totalPayable = totalCommission + mfa + pb + ta

        // Construct Payout Document
        const payoutRef = doc(collection(db, 'payouts'))
        batch.set(payoutRef, {
          agentId,
          agentName: agent.name,
          sponsorCode: agent.sponsorCode || '—',
          month: selectedMonth,
          year: selectedYear,
          policiesCount: commList.length,
          totalCommission,
          mda: totalCommission, // MDA is direct commission
          mfa,
          pb,
          ta,
          totalPayable,
          status: 'generated',
          generatedDate: serverTimestamp(),
          paidDate: null,
        })
      }

      await batch.commit()
      toast.success('Payout calculation batch created successfully!', { id: toastId })
      fetchPayouts()
    } catch (err) {
      console.error('Error generating payouts:', err)
      toast.error(`Calculation failed: ${err.message}`, { id: toastId })
    } finally {
      setGenerating(false)
    }
  }

  // Update payout status
  const handleUpdateStatus = async (payoutId, nextStatus) => {
    const loader = toast.loading(`Updating payout status to ${nextStatus}...`)
    try {
      const payoutRef = doc(db, 'payouts', payoutId)
      const updateData = { status: nextStatus }
      
      if (nextStatus === 'paid') {
        updateData.paidDate = serverTimestamp()
        
        // Fetch payout details to match commissions
        const snap = await getDocs(query(collection(db, 'payouts'), where('status', '==', 'approved')))
        const currentPayout = payoutsList.find(p => p.id === payoutId)

        if (currentPayout) {
          // Get all commissions of this agent matching month & year
          const commQuery = query(
            collection(db, 'commissions'),
            where('agentId', '==', currentPayout.agentId),
            where('month', '==', selectedMonth),
            where('year', '==', selectedYear)
          )
          const commSnap = await getDocs(commQuery)
          const batch = writeBatch(db)

          // Mark matching commissions paid
          commSnap.forEach(d => {
            batch.update(doc(db, 'commissions', d.id), { status: 'paid' })
          })

          // Mark matching ledger entries paid
          const ledgerQuery = query(
            collection(db, 'income_ledger'),
            where('sponsorCode', '==', currentPayout.sponsorCode),
            where('status', '==', 'unpaid')
          )
          const ledgerSnap = await getDocs(ledgerQuery)
          ledgerSnap.forEach(d => {
            batch.update(doc(db, 'income_ledger', d.id), { status: 'paid' })
          })

          await batch.commit()
        }
      }

      await updateDoc(payoutRef, updateData)
      toast.success(`Payout successfully marked as ${nextStatus}!`, { id: loader })
      fetchPayouts()
    } catch (err) {
      console.error(err)
      toast.error('Failed to update payout status', { id: loader })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Monthly Payout Engine</h2>
          <p className="text-xs text-ink-2">Calculate, approve, and execute monthly agent compensation disbursements.</p>
        </div>
      </div>

      {/* Control bar */}
      <div className="card p-5 bg-navy-3 border border-navy-4 flex flex-wrap items-end gap-4 justify-between">
        <div className="flex gap-4">
          <div className="w-44">
            <label className="label">Select Target Month</label>
            <select className="field text-xs font-semibold" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className="label">Select Year</label>
            <select className="field text-xs font-semibold" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <button 
          onClick={handleGeneratePayouts} 
          disabled={generating} 
          className="btn-gold px-6 py-2.5 text-xs uppercase tracking-wider font-bold"
        >
          {generating ? 'Calculating...' : 'Generate Monthly Payouts'}
        </button>
      </div>

      {/* Grid List */}
      {loading ? (
        <SkeletonTable rows={6} cols={9} />
      ) : payoutsList.length === 0 ? (
        <EmptyState 
          icon={<ICash size={24} />} 
          title="No payouts calculated" 
          message="Run payout generation to compute commissions and allow targeting metrics for this month."
        />
      ) : (
        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan">
              Payout Batch Summary ({payoutsList.length} Agents)
            </h3>
          </div>

          <div className="table-wrap">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th>Agent Name</th>
                  <th>Policies</th>
                  <th>Total Comm</th>
                  <th>MFA</th>
                  <th>PB</th>
                  <th>TA</th>
                  <th>Total Payable</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payoutsList.map(p => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-semibold text-ink-1 block">{p.agentName}</span>
                      <span className="text-[10px] text-ink-2 font-mono">{p.sponsorCode}</span>
                    </td>
                    <td className="font-mono text-ink-1 font-bold">{p.policiesCount}</td>
                    <td className="text-ink-1 font-semibold">{formatINR(p.totalCommission)}</td>
                    <td className="text-ink-1">{p.mfa > 0 ? formatINR(p.mfa) : '—'}</td>
                    <td className="text-ink-1">{p.pb > 0 ? formatINR(p.pb) : '—'}</td>
                    <td className="text-ink-1">{p.ta > 0 ? formatINR(p.ta) : '—'}</td>
                    <td className="text-gold font-bold">{formatINR(p.totalPayable)}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="text-right space-x-2">
                      {p.status === 'generated' && (
                        <button 
                          onClick={() => handleUpdateStatus(p.id, 'approved')} 
                          className="btn-gold py-1 px-3 text-[10px] uppercase font-bold"
                        >
                          Approve
                        </button>
                      )}
                      {p.status === 'approved' && (
                        <button 
                          onClick={() => handleUpdateStatus(p.id, 'paid')} 
                          className="btn-ok py-1 px-3 text-[10px] uppercase font-bold bg-ok text-white rounded hover:bg-ok/80"
                        >
                          Mark Paid
                        </button>
                      )}
                      {p.status === 'paid' && (
                        <span className="text-[10px] text-ink-2 italic font-medium">
                          Paid {p.paidDate ? fmtDate(p.paidDate) : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
