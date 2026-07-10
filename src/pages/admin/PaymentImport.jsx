import { useState } from 'react'
import { read, utils } from 'xlsx'
import toast from 'react-hot-toast'
import { collection, doc, writeBatch, serverTimestamp, getDocs, getDoc, query, where, increment, addDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { isRD } from '../../data/compensation'
import { recordPayment } from '../../lib/payments'

export default function PaymentImport() {
  const { profile } = useAuth()
  const [file, setFile] = useState(null)
  const [data, setData] = useState([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [importSummary, setImportSummary] = useState(null)

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0]
    if (!uploadedFile) return
    setFile(uploadedFile)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result
        const wb = read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const parsed = utils.sheet_to_json(ws)
        validateData(parsed)
      } catch (err) {
        toast.error('Failed to parse Excel file')
        console.error(err)
      }
    }
    reader.readAsBinaryString(uploadedFile)
  }

  const validateData = (rows) => {
    const validated = rows.map((r, i) => {
      const rowNum = i + 2
      const errors = []
      
      const policyNumber = (r['Policy Number'] || '').toString().trim()
      const amount = Number(r['Amount Paid'])
      const paymentDate = r['Payment Date'] ? new Date(r['Payment Date']) : new Date()

      if (!policyNumber) errors.push('Missing Policy Number')
      if (isNaN(amount) || amount <= 0) errors.push('Invalid Amount Paid')

      return {
        rowNum,
        policyNumber,
        amount,
        paymentDate,
        transactionRef: (r['Transaction Ref'] || '').toString().trim(),
        paymentMode: (r['Payment Mode'] || 'bank_transfer').toString().trim(),
        valid: errors.length === 0,
        errors
      }
    })
    setData(validated)
    setImportSummary(null)
  }

  const handleImport = async () => {
    const validRows = data.filter(d => d.valid)
    if (validRows.length === 0) {
      toast.error('No valid rows to import')
      return
    }

    setImporting(true)
    setProgress(0)

    let successCount = 0
    let failedCount = 0
    const logs = []

    // Process each row
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      try {
        // Find the active policy
        const planQuery = query(collection(db, 'plans'), where('policyNumber', '==', row.policyNumber), where('status', '==', 'active'))
        const planSnap = await getDocs(planQuery)
        
        if (planSnap.empty) {
          throw new Error(`Active policy ${row.policyNumber} not found`)
        }
        
        const planDoc = planSnap.docs[0]
        const p = planDoc.data()
        const planId = planDoc.id

        await recordPayment({
          plan: { id: planId, ...p },
          customer: { id: p.customerId, name: p.customerName, accountNumber: p.customerAccount || p.planAccountNumber },
          agent: p.agentId ? { uid: p.agentId, name: p.agentName } : null,
          form: {
            amount: Number(row.amount),
            paymentMode: row.paymentMode,
            transactionRef: row.transactionRef,
            paidDate: row.paymentDate,
          }
        })

        successCount++
      } catch (err) {
        console.error('Failed importing row:', row, err)
        failedCount++
        logs.push({ row: row.rowNum, level: 'error', message: err.message })
      }
      
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }

    setImportSummary({
      total: data.length,
      success: successCount,
      failed: failedCount + (data.length - validRows.length),
      logs,
    })

    setImporting(false)
    setData([])
    setFile(null)
    toast.success(`Payment Import Finished! Successful: ${successCount}`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Payment Import Engine</h1>
          <p className="mt-1 text-sm text-ink-2">Bulk import ongoing installment payments via Excel.</p>
        </div>
        <div className="text-right text-xs text-ink-2 space-y-1">
          <p>Expected Columns:</p>
          <p className="font-mono text-gold-1 bg-navy-4/30 px-2 py-0.5 rounded">Policy Number, Amount Paid, Payment Date, Transaction Ref</p>
        </div>
      </div>

      {!importSummary && (
        <div className="card p-6 border-dashed border-2 border-navy-3 hover:border-gold-1/50 transition-colors">
          <label className="flex flex-col items-center justify-center cursor-pointer py-10">
            <span className="text-4xl mb-4">📥</span>
            <span className="text-lg font-medium text-ink-1">Click to upload Excel file</span>
            <span className="text-sm text-ink-2 mt-1">.xlsx or .xls</span>
            <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={importing} />
          </label>
        </div>
      )}

      {data.length > 0 && !importSummary && (
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-white">Data Validation</h3>
            <span className="text-sm text-ink-2 font-mono">
              Valid: <span className="text-ok">{data.filter(d => d.valid).length}</span> | 
              Errors: <span className="text-danger">{data.filter(d => !d.valid).length}</span>
            </span>
          </div>
          
          <div className="max-h-96 overflow-auto mb-6 border border-navy-4 rounded-lg bg-navy-4/20">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-navy-3 text-xs font-semibold uppercase tracking-wider text-ink-2">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Policy Number</th>
                  <th className="px-4 py-3">Amount Paid</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-4/50">
                {data.slice(0, 100).map((row, idx) => (
                  <tr key={idx} className={row.valid ? 'hover:bg-navy-4/20' : 'bg-danger/5 hover:bg-danger/10'}>
                    <td className="px-4 py-3 text-ink-2">{row.rowNum}</td>
                    <td className="px-4 py-3 text-ink-1">{row.policyNumber}</td>
                    <td className="px-4 py-3 text-ink-1 font-mono">₹{row.amount}</td>
                    <td className="px-4 py-3">
                      {row.valid ? (
                        <span className="inline-flex items-center rounded-full bg-ok/10 px-2 py-1 text-xs font-medium text-ok">Valid</span>
                      ) : (
                        <span className="text-xs text-danger">{row.errors.join(', ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleImport}
            disabled={importing || data.filter(d => d.valid).length === 0}
            className="btn-primary w-full py-3"
          >
            {importing ? `Processing Payments... ${progress}%` : `Import ${data.filter(d => d.valid).length} Payments`}
          </button>
        </div>
      )}

      {importSummary && (
        <div className="card p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-white">Import Summary</h3>
            <button onClick={() => setImportSummary(null)} className="btn-secondary">New Import</button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-navy-4/30 p-4 rounded-lg border border-navy-4">
              <p className="text-xs text-ink-2 uppercase tracking-wider">Total Attempted</p>
              <p className="mt-1 text-2xl font-semibold text-white">{importSummary.total}</p>
            </div>
            <div className="bg-ok/5 p-4 rounded-lg border border-ok/20">
              <p className="text-xs text-ok uppercase tracking-wider">Successful</p>
              <p className="mt-1 text-2xl font-semibold text-ok">{importSummary.success}</p>
            </div>
            <div className="bg-danger/5 p-4 rounded-lg border border-danger/20">
              <p className="text-xs text-danger uppercase tracking-wider">Failed</p>
              <p className="mt-1 text-2xl font-semibold text-danger">{importSummary.failed}</p>
            </div>
          </div>
          {importSummary.logs.length > 0 && (
            <div className="bg-navy-4/30 rounded-lg p-4 border border-navy-4">
              <h4 className="text-sm font-semibold text-ink-1 mb-3">Error Log</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-xs text-ink-2">
                {importSummary.logs.map((log, i) => (
                  <div key={i} className="flex gap-4">
                    <span className="w-12 text-right">Row {log.row}</span>
                    <span className={log.level === 'error' ? 'text-danger' : 'text-gold-1'}>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
