import { useState, useMemo, useEffect } from 'react'
import { collection, doc, getDocs, setDoc, writeBatch, serverTimestamp, query, where, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR, fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import toast from 'react-hot-toast'
import { ICash, ICheck, IAlert, IClock, IUsers, IDoc } from '../../components/ui/icons'
import { updateDashboardSummary } from '../../lib/summary'
import { Link } from 'react-router-dom'

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
    const toastId = toast.loading('Calculating monthly Commission Bills...')
    try {
      // 1. Fetch all unpaid commissions for target month/year from commission_ledger
      const commQuery = query(
        collection(db, 'commission_ledger'),
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

      // 2. Fetch all users (agents) to get PAN and details
      const usersSnap = await getDocs(collection(db, 'users'))
      const usersMap = {}
      usersSnap.forEach(d => {
        usersMap[d.id] = { id: d.id, ...d.data() }
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
        const agent = usersMap[agentId] || { name: commList[0].agentName, sponsorCode: commList[0].sponsorCode || '—', rank: 1, panNumber: 'UNASSIGNED' }
        
        const grossCommission = commList.reduce((sum, c) => sum + (c.amount || 0), 0)
        
        // Deductions: 5% TDS and 5% Admin Charge
        const tds = grossCommission * 0.05
        const adminCharge = grossCommission * 0.05
        const netPayable = grossCommission - tds - adminCharge

        // Construct Payout Document
        const payoutRef = doc(collection(db, 'payouts'))
        batch.set(payoutRef, {
          agentId,
          agentName: agent.name,
          sponsorCode: agent.sponsorCode || '—',
          panNumber: agent.panNumber || '—',
          month: selectedMonth,
          year: selectedYear,
          policiesCount: commList.length,
          grossCommission,
          tds,
          adminCharge,
          netPayable,
          status: 'generated',
          generatedDate: serverTimestamp(),
          paidDate: null,
          // We can optionally store the references to the commission entries to lock them
          commissionEntryIds: commList.map(c => c.id)
        })
      }

      await batch.commit()
      toast.success('Commission Bills created successfully!', { id: toastId })
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
        const currentPayout = payoutsList.find(p => p.id === payoutId)

        if (currentPayout) {
          const batch = writeBatch(db)
          let payoutTotal = currentPayout.netPayable || 0

          // Update all linked commission_ledger entries
          if (currentPayout.commissionEntryIds && currentPayout.commissionEntryIds.length > 0) {
             for (const commId of currentPayout.commissionEntryIds) {
               batch.update(doc(db, 'commission_ledger', commId), { status: 'paid' })
             }
          }

          // Trigger dashboard summary update for paid commissions (QA-002 Fix)
          await updateDashboardSummary({ totalCommission: payoutTotal })
          
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
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Commission Payout Engine</h2>
          <p className="text-xs text-ink-2">Generate and approve monthly Commission Bills.</p>
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
          {generating ? 'Calculating...' : 'Generate Commission Bills'}
        </button>
      </div>

      {/* Grid List */}
      {loading ? (
        <SkeletonTable rows={6} cols={9} />
      ) : payoutsList.length === 0 ? (
        <EmptyState 
          icon={<ICash size={24} />} 
          title="No Commission Bills" 
          message="Run payout generation to compute commissions for this month."
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
                  <th>Entries</th>
                  <th>Gross Comm</th>
                  <th className="text-red-400">TDS (5%)</th>
                  <th className="text-red-400">Admin (5%)</th>
                  <th className="text-gold">Net Payable</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payoutsList.map(p => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-semibold text-ink-1 block">{p.agentName}</span>
                      <span className="text-[10px] text-ink-2 font-mono">PAN: {p.panNumber}</span>
                    </td>
                    <td className="font-mono text-ink-1 font-bold">{p.policiesCount}</td>
                    <td className="text-ink-1 font-semibold">{formatINR(p.grossCommission)}</td>
                    <td className="text-red-400 font-semibold">{formatINR(p.tds)}</td>
                    <td className="text-red-400 font-semibold">{formatINR(p.adminCharge)}</td>
                    <td className="text-gold font-bold text-sm">{formatINR(p.netPayable)}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="text-right space-x-2">
                      <Link 
                        to={`/admin/commission-bill/${p.id}`} 
                        className="btn-dark py-1 px-3 text-[10px] uppercase font-bold"
                      >
                        View Bill
                      </Link>
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
                        <span className="text-[10px] text-ink-2 italic font-medium block mt-1">
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
