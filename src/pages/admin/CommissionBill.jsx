import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { formatINR, fmtDate } from '../../utils/format'
import { useDoc } from '../../hooks/useFirestore'
import { IPrint, IArrowLeft } from '../../components/ui/icons'

export default function CommissionBill() {
  const { id } = useParams()
  const { data: settings } = useDoc('config/settings')
  
  const [loading, setLoading] = useState(true)
  const [bill, setBill] = useState(null)
  const [commissions, setCommissions] = useState([])

  useEffect(() => {
    async function loadData() {
      try {
        const docRef = doc(db, 'payouts', id)
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          const payoutData = snap.data()
          setBill({ id: snap.id, ...payoutData })
          
          if (payoutData.commissionEntryIds?.length > 0) {
            // Firestore 'in' query supports up to 10. If more than 10, we should query by agentId/month/year instead
            const commQuery = query(
              collection(db, 'commission_ledger'),
              where('agentId', '==', payoutData.agentId),
              where('month', '==', payoutData.month),
              where('year', '==', payoutData.year)
            )
            const commSnap = await getDocs(commQuery)
            const commList = []
            commSnap.forEach(d => commList.push({ id: d.id, ...d.data() }))
            setCommissions(commList)
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  if (loading) {
    return <div className="p-10 text-center text-ink-2">Loading Bill Details...</div>
  }

  if (!bill) {
    return <div className="p-10 text-center text-red-500">Bill not found.</div>
  }

  const companyName = settings?.companyName || 'APEX Savings'
  const headOffice = settings?.headOffice || ''

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <div className="flex justify-between items-center print:hidden">
        <Link to="/admin/payouts" className="text-gold flex items-center gap-1 text-sm font-semibold hover:underline">
          <IArrowLeft size={16} /> Back to Payouts
        </Link>
        <button onClick={() => window.print()} className="btn-dark px-4 py-2 flex items-center gap-2 text-xs uppercase font-bold">
          <IPrint size={14} /> Print Bill
        </button>
      </div>

      <div className="card p-8 bg-white text-black print:shadow-none print:border-none print:m-0 print:p-0">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-gray-200 pb-6 mb-6">
          <div>
            <h1 className="text-3xl font-serif font-black tracking-tight">{companyName}</h1>
            {headOffice && <p className="text-xs text-gray-500 max-w-xs mt-1">{headOffice}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold text-gray-800 uppercase tracking-widest">Commission Bill</h2>
            <p className="text-sm text-gray-500 mt-1">Bill No: {bill.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-sm font-semibold mt-1">Period: {new Date(bill.year, bill.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Agent Details */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Agent Details</h3>
            <p className="font-bold text-lg">{bill.agentName}</p>
            <p className="text-sm text-gray-600">Sponsor Code: <span className="font-mono">{bill.sponsorCode}</span></p>
            <p className="text-sm text-gray-600">PAN Number: <span className="font-mono font-bold">{bill.panNumber || '—'}</span></p>
          </div>

          {/* Summary Box */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Payout Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Gross Commission:</span>
                <span className="font-semibold">{formatINR(bill.grossCommission || 0)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Less 5% TDS:</span>
                <span>-{formatINR(bill.tds || 0)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Less 5% Admin Charge:</span>
                <span>-{formatINR(bill.adminCharge || 0)}</span>
              </div>
              <div className="pt-2 mt-2 border-t border-gray-200 flex justify-between font-bold text-lg">
                <span>Net Payable:</span>
                <span>{formatINR(bill.netPayable || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Commission Breakdown Table */}
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Commission Breakdown</h3>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-200 text-gray-600">
                <th className="py-2 px-3 font-semibold">Policy</th>
                <th className="py-2 px-3 font-semibold">Customer</th>
                <th className="py-2 px-3 font-semibold text-right">Business Amt</th>
                <th className="py-2 px-3 font-semibold text-center">Comm %</th>
                <th className="py-2 px-3 font-semibold text-right">Amount</th>
                <th className="py-2 px-3 font-semibold text-center">Type</th>
              </tr>
            </thead>
            <tbody>
              {commissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-400 italic">No commission entries found.</td>
                </tr>
              ) : commissions.map((c, idx) => (
                <tr key={c.id || idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="py-2 px-3 font-mono">{c.policyNumber}</td>
                  <td className="py-2 px-3">{c.customerName}</td>
                  <td className="py-2 px-3 text-right">{formatINR(c.businessAmount)}</td>
                  <td className="py-2 px-3 text-center">{c.percentage}%</td>
                  <td className="py-2 px-3 text-right font-semibold">{formatINR(c.amount)}</td>
                  <td className="py-2 px-3 text-center">
                    <span className="text-gray-800 text-[10px] font-bold block leading-tight">
                      {c.compressionReason || (c.compression ? 'Roll-up' : 'Direct')}
                    </span>
                    {c.compression && c.receivingRankCode && (
                      <span className="text-gray-500 text-[9px] block mt-0.5">
                        Paid to {c.receivingRankCode}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 mt-12 pt-6 border-t border-gray-200">
          <p>This is a computer-generated document and does not require a signature.</p>
          <p className="mt-1">Status: <span className="font-bold text-gray-600 uppercase">{bill.status}</span> | Generated: {bill.generatedDate ? fmtDate(bill.generatedDate) : '—'}</p>
        </div>

      </div>
    </div>
  )
}
