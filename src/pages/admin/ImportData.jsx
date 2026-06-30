import { useState } from 'react'
import * as xlsx from 'xlsx'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../firebase'
import { createCustomer } from '../../lib/customers'
import { createPlan } from '../../lib/plans'
import toast from 'react-hot-toast'

export default function ImportData() {
  const [data, setData] = useState([])
  const [agentsMap, setAgentsMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)

  // Fetch agents to map SponsorCode to User ID
  const fetchAgents = async () => {
    const snap = await getDocs(collection(db, 'users'))
    const map = {}
    snap.forEach(doc => {
      const d = doc.data()
      if (d.sponsorCode) map[d.sponsorCode.toLowerCase()] = { id: doc.id, ...d }
    })
    setAgentsMap(map)
  }

  const handleFileUpload = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    setLoading(true)

    try {
      if (Object.keys(agentsMap).length === 0) await fetchAgents()
      
      const reader = new FileReader()
      reader.onload = (evt) => {
        const bstr = evt.target.result
        const wb = xlsx.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const rawData = xlsx.utils.sheet_to_json(ws)

        // Process and validate rows
        const processed = rawData.map((row, index) => {
          const agentIdRaw = String(row['Agent ID'] || row['sponsorCode'] || '').trim().toLowerCase()
          const agent = agentsMap[agentIdRaw] || null
          return {
            _originalIndex: index + 2,
            agentIdRaw,
            agent,
            customerName: row['Customer Name'] || row['name'] || '',
            phone: String(row['Phone'] || row['phone'] || ''),
            planType: row['Plan Type'] || row['type'] || 'RD-1Y',
            amount: Number(row['Amount'] || row['amount']) || 0,
            valid: !!agent && !!row['Customer Name'] && !!row['Plan Type'] && (Number(row['Amount'] || row['amount']) > 0),
            raw: row
          }
        })
        setData(processed)
        setLoading(false)
      }
      reader.readAsBinaryString(f)
    } catch (err) {
      toast.error('Error reading file')
      console.error(err)
      setLoading(false)
    }
  }

  const executeImport = async () => {
    const validRows = data.filter(d => d.valid)
    if (validRows.length === 0) {
      toast.error('No valid rows to import')
      return
    }

    setImporting(true)
    setProgress(0)
    let successCount = 0
    let errorCount = 0

    // Import sequentially to avoid overwhelming Firestore (could be parallelized with batches)
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      try {
        const agentUser = { uid: row.agent.id, name: row.agent.name, branchId: row.agent.branchId }
        
        // 1. Create Customer
        const customerForm = {
          name: row.customerName, phone: row.phone || '0000000000',
          dob: null, gender: 'Other', altPhone: '', email: '',
          fatherOrHusbandName: row.raw["Father's Name"] || row.raw["Husband's Name"] || '',
          motherName: row.raw["Mother's Name"] || '',
          maritalStatus: row.raw['Marital Status'] || 'Unmarried',
          occupation: row.raw['Occupation'] || '',
          annualIncome: String(row.raw['Annual Income'] || ''),
          nationality: row.raw['Nationality'] || 'Indian',
          castOrSubcast: row.raw['Cast'] || row.raw['Subcast'] || '',
          address1: 'Imported Address', address2: '', city: 'Imported City', state: 'State', pincode: '000000',
          aadhaar: '000000000000', pan: 'XXXXX0000X', nomineeName: 'Unknown', nomineeRelation: 'Unknown', nomineePhone: '0000000000',
          source: 'Agent'
        }
        
        const customerRes = await createCustomer(customerForm, { agent: agentUser })
        const customerRef = { id: customerRes.id, name: customerForm.name, accountNumber: customerRes.accountNumber, branchId: agentUser.branchId }
        
        // 2. Create Plan
        const planForm = {
          type: row.planType,
          monthlyAmount: row.planType.startsWith('RD') ? row.amount : 0,
          fdAmount: row.planType.startsWith('FD') ? row.amount : 0,
          paymentDate: 1, // Default to 1st of month
          startDate: new Date().toISOString()
        }
        await createPlan({ form: planForm, customer: customerRef, agent: agentUser })
        
        successCount++
      } catch (err) {
        console.error('Row error:', row, err)
        errorCount++
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }

    setImporting(false)
    toast.success(`Import complete! ${successCount} successful, ${errorCount} failed.`)
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-ink-1 mb-2">Import Bank Data</h1>
      <p className="text-ink-2 mb-6">
        {"Upload an Excel (.xlsx) file containing customer data. Required columns: \"Agent ID\", \"Customer Name\", \"Phone\", \"Plan Type\", \"Amount\". Optional columns: \"Father's Name\", \"Mother's Name\", \"Marital Status\", \"Occupation\", \"Annual Income\", \"Nationality\", \"Cast\"."}
      </p>
      
      <div className="card p-6 mb-6">
        <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="mb-4" disabled={importing} />
        {loading && <p className="text-gold mt-2">Reading file...</p>}
      </div>

      {data.length > 0 && (
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-ink-1">Preview</h2>
            <button className="btn-primary" onClick={executeImport} disabled={importing || data.filter(d => d.valid).length === 0}>
              {importing ? `Importing ${progress}%` : `Execute Import (${data.filter(d => d.valid).length} valid)`}
            </button>
          </div>
          
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="tbl w-full text-sm">
              <thead className="sticky top-0 bg-navy-2">
                <tr><th>Row</th><th>Agent ID</th><th>Agent Found</th><th>Customer Name</th><th>Plan Type</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className={row.valid ? '' : 'opacity-60 bg-red-900/10'}>
                    <td className="text-ink-2">{row._originalIndex}</td>
                    <td className="font-mono text-ink-2">{row.agentIdRaw || '—'}</td>
                    <td>{row.agent ? <span className="text-green-500">{row.agent.name}</span> : <span className="text-red-400">Not Found</span>}</td>
                    <td className="text-ink-1">{row.customerName}</td>
                    <td className="text-ink-2">{row.planType}</td>
                    <td className="text-ink-2">₹{row.amount}</td>
                    <td>{row.valid ? <span className="text-green-500">Ready</span> : <span className="text-red-400">Invalid</span>}</td>
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
