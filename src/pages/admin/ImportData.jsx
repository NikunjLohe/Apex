import { useState, useMemo, useEffect } from 'react'
import * as xlsx from 'xlsx'
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  serverTimestamp, 
  increment, 
  where, 
  query, 
  writeBatch 
} from 'firebase/firestore'
import { db } from '../../firebase'
import { updateDashboardSummary } from '../../lib/summary'
import { useAuth } from '../../contexts/AuthContext'
import { useRanks } from '../../contexts/RanksContext'
import { MDA as DEFAULT_MDA, FD_PENSION as DEFAULT_FD_PENSION, isRD } from '../../data/compensation'
import toast from 'react-hot-toast'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IDoc, IPlus, IClock, IAlert, ICheck, IClose } from '../../components/ui/icons'
import { Link } from 'react-router-dom'
import { formatINR } from '../../utils/format'
import { calculateCommissions } from '../../lib/commissionEngine'

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

export default function ImportData() {
  const { profile } = useAuth()
  const { getRank, config: ranksConfig } = useRanks()
  const [commissionsConfig, setCommissionsConfig] = useState(null)
  const [mapping, setMapping] = useState(DEFAULT_MAPPING)
  const [data, setData] = useState([])
  const [agentsMap, setAgentsMap] = useState({})
  const [usersMap, setUsersMap] = useState({})
  const [plansMaster, setPlansMaster] = useState([])

  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  
  // Duplicate statistics for pre-import validation report
  const [duplicatesCount, setDuplicatesCount] = useState(0)
  const [errorsCount, setErrorsCount] = useState(0)

  // Fetch Excel Mapping & Master dependencies
  useEffect(() => {
    ;(async () => {
      try {
        const commSnap = await getDoc(doc(db, 'config', 'commissions'))
        if (commSnap.exists() && commSnap.data().commissions) {
          setCommissionsConfig(commSnap.data().commissions)
        }
      } catch (err) {
        console.warn('Commissions config skipped:', err)
      }

      try {
        const settingsSnap = await getDoc(doc(db, 'config', 'settings'))
        if (settingsSnap.exists() && settingsSnap.data().excelMapping) {
          setMapping(settingsSnap.data().excelMapping)
        }
      } catch (err) {
        console.warn('Excel mapping config fetch skipped:', err)
      }

      try {
        const usersSnap = await getDocs(collection(db, 'users'))
        const uMap = {}
        const idMap = {}
        usersSnap.forEach(d => {
          const u = d.data()
          const userObj = { id: d.id, name: u.name, branchId: u.branchId, rank: u.rank, sponsorCode: u.sponsorCode, referredBy: u.referredBy }
          if (u.sponsorCode) {
            uMap[u.sponsorCode.trim().toLowerCase()] = userObj
          }
          idMap[d.id] = userObj
        })
        setAgentsMap(uMap)
        setUsersMap(idMap)
      } catch (err) {
        console.warn('Agent mapping fetch failed:', err)
      }

      try {
        const masterSnap = await getDocs(collection(db, 'plans_master'))
        const mPlans = []
        masterSnap.forEach(d => {
          mPlans.push({ id: d.id, ...d.data() })
        })
        setPlansMaster(mPlans)
      } catch (err) {
        console.warn('Configured Plan list lookup failed:', err)
        setPlansMaster([
          { name: 'RD 1 Year', code: 'RD1Y', duration: 1, type: 'RD' },
          { name: 'RD 2 Year', code: 'RD2Y', duration: 2, type: 'RD' },
          { name: 'RD 3 Year', code: 'RD3Y', duration: 3, type: 'RD' },
          { name: 'RD 4 Year', code: 'RD4Y', duration: 4, type: 'RD' },
          { name: 'Pension', code: 'PENS', duration: 5, type: 'FD' },
        ])
      }
    })()
  }, [])

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0])
    }
  }

  // Check duplicate policy numbers & customer IDs in database (using query batches of 30)
  const queryExistingDuplicates = async (policyNumbers, customerIds) => {
    const existingPolicies = new Set()
    const existingCustomerIds = new Set()

    const uniquePolicies = [...new Set(policyNumbers)].filter(Boolean)
    const uniqueCusts = [...new Set(customerIds)].filter(Boolean)

    // Chunk policy queries
    for (let i = 0; i < uniquePolicies.length; i += 30) {
      const chunk = uniquePolicies.slice(i, i + 30)
      const q = query(collection(db, 'plans'), where('policyNumber', 'in', chunk))
      const snap = await getDocs(q)
      snap.forEach(d => {
        const val = d.data().policyNumber
        if (val) existingPolicies.add(String(val).trim().toLowerCase())
      })
    }

    // Chunk customer queries
    for (let i = 0; i < uniqueCusts.length; i += 30) {
      const chunk = uniqueCusts.slice(i, i + 30)
      const q = query(collection(db, 'customers'), where('customerId', 'in', chunk))
      const snap = await getDocs(q)
      snap.forEach(d => {
        const val = d.data().customerId
        if (val) existingCustomerIds.add(String(val).trim().toLowerCase())
      })
    }

    return { existingPolicies, existingCustomerIds }
  }

  const processFile = (file) => {
    setFileName(file.name)
    setLoading(true)
    setImportSummary(null)
    setDuplicatesCount(0)
    setErrorsCount(0)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = xlsx.read(bstr, { type: 'binary', cellDates: true })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const rawRows = xlsx.utils.sheet_to_json(ws)

        // Columns check
        const excelCols = rawRows.length > 0 ? Object.keys(rawRows[0]) : []
        const missingMappings = []
        Object.entries(mapping).forEach(([key, colName]) => {
          if (!excelCols.includes(colName)) {
            missingMappings.push(`${key.toUpperCase()} mapped to "${colName}"`)
          }
        })

        if (missingMappings.length > 0 && rawRows.length > 0) {
          toast.error(`Column mismatch! Expected headers not found: ${missingMappings.slice(0, 2).join(', ')}...`)
        }

        // Collect all policy and customer codes to query duplicates in batch
        const policyNumbers = rawRows.map(r => String(r[mapping.policyNumber] || '').trim())
        const customerIds = rawRows.map(r => String(r[mapping.customerId] || '').trim())

        // Asynchronous batch check from database
        const { existingPolicies, existingCustomerIds } = await queryExistingDuplicates(policyNumbers, customerIds)

        const localPolicyNumbers = new Set()
        let dups = 0
        let errs = 0

        const processed = rawRows.map((row, idx) => {
          const cId = String(row[mapping.customerId] || '').trim()
          const cName = String(row[mapping.customerName] || '').trim()
          const mobile = String(row[mapping.mobile] || '').trim()
          const address = String(row[mapping.address] || '').trim()
          const agentCode = String(row[mapping.agentCode] || '').trim().toLowerCase()
          const policyNo = String(row[mapping.policyNumber] || '').trim()
          const planCode = String(row[mapping.planCode] || '').trim().toLowerCase()
          const mAmount = Number(row[mapping.monthlyAmount]) || 0
          const tAmount = Number(row[mapping.totalAmount]) || 0
          const rawDate = row[mapping.startDate]

          let isValid = true
          const errors = []

          // 1. Agent Code check
          const agent = agentsMap[agentCode]
          if (!agent) {
            isValid = false
            errors.push(`Agent Code "${agentCode}" not found`)
          }

          // 2. Duplicate Policy & Customer check
          const policyLower = policyNo.toLowerCase()
          const custLower = cId.toLowerCase()

          if (!policyNo) {
            isValid = false
            errors.push('Missing Policy Number')
          } else if (existingPolicies.has(policyLower)) {
            isValid = false
            dups++
            errors.push(`Duplicate Policy: ${policyNo} already exists in database`)
          } else if (localPolicyNumbers.has(policyLower)) {
            isValid = false
            dups++
            errors.push(`Duplicate Policy: ${policyNo} defined twice in Excel sheet`)
          } else {
            localPolicyNumbers.add(policyLower)
          }

          if (existingCustomerIds.has(custLower)) {
            isValid = false
            dups++
            errors.push(`Duplicate Customer CIF: ${cId} already registered in database`)
          }

          // 3. Plan Master check
          const masterPlan = plansMaster.find(p => p.code.toLowerCase() === planCode || p.name.toLowerCase() === planCode)
          if (!masterPlan) {
            isValid = false
            errors.push(`Plan "${planCode}" does not match active Plan Master`)
          }

          // 4. Missing required CIF/Name check
          if (!cId) {
            isValid = false
            errors.push('Missing Customer ID (CIF)')
          }
          if (!cName) {
            isValid = false
            errors.push('Missing Customer Name')
          }

          // 5. Amount validation
          const isRDType = masterPlan && masterPlan.type === 'RD'
          if (isRDType && mAmount <= 0) {
            isValid = false
            errors.push('RD Plan requires positive Monthly Amount')
          }
          if (masterPlan && masterPlan.type === 'FD' && tAmount <= 0) {
            isValid = false
            errors.push('FD/Pension requires positive Total Amount')
          }

          // 6. Date validation
          let parsedDate = null
          if (!rawDate) {
            isValid = false
            errors.push('Missing Start Date')
          } else {
            parsedDate = rawDate instanceof Date ? rawDate : new Date(rawDate)
            if (isNaN(parsedDate.getTime())) {
              isValid = false
              errors.push(`Invalid Start Date format: "${rawDate}"`)
            }
          }

          if (!isValid && !errors.some(e => e.includes('Duplicate'))) {
            errs++
          }

          return {
            rowNum: idx + 2,
            customerId: cId,
            customerName: cName,
            mobile,
            address,
            agentCode,
            policyNumber: policyNo,
            planCode: masterPlan?.code || planCode,
            planType: masterPlan?.type || 'RD',
            duration: masterPlan?.duration || 1,
            monthlyAmount: mAmount,
            totalAmount: tAmount,
            startDate: parsedDate,
            agent,
            errors,
            valid: isValid,
            raw: row,
          }
        })

        setDuplicatesCount(dups)
        setErrorsCount(errs)
        setData(processed)
      } catch (err) {
        console.error('Error parsing sheet:', err)
        toast.error('Could not parse Excel document')
      } finally {
        setLoading(false)
      }
    }
    reader.readAsBinaryString(file)
  }

  // Execute Import sequentially in Firestore writeBatch chunks of 50
  const handleImport = async () => {
    if (data.length === 0) return
    const validRows = data.filter(d => d.valid)
    if (validRows.length === 0) {
      toast.error('No valid rows to import')
      return
    }

    setImporting(true)
    setProgress(0)

    let successCount = 0
    let failedCount = 0
    let totalImportedBusiness = 0
    let totalImportedCommissions = 0
    const logs = []

    const batchSize = 50
    for (let i = 0; i < validRows.length; i += batchSize) {
      const chunk = validRows.slice(i, i + batchSize)
      const batch = writeBatch(db)

      for (const row of chunk) {
        try {
          const agentRef = row.agent
          
          // 1. Create Customer
          const custRef = doc(collection(db, 'customers'))
          const customerDocId = custRef.id

          batch.set(custRef, {
            customerId: row.customerId,
            name: row.customerName,
            phone: row.mobile || '0000000000',
            address: row.address || 'Imported Address',
            branchId: agentRef.branchId || null,
            enrolledBy: agentRef.id,
            enrolledByName: agentRef.name,
            plansCount: 1,
            kycStatus: 'verified',
            createdAt: serverTimestamp(),
          })

          // 2. Create Policy (Plan doc)
          const policyRef = doc(collection(db, 'plans'))
          const isRDPlan = row.planType === 'RD'
          const calculatedAmount = isRDPlan ? row.monthlyAmount : row.totalAmount

          batch.set(policyRef, {
            customerId: customerDocId,
            customerName: row.customerName,
            customerAccount: row.customerId,
            policyNumber: row.policyNumber,
            agentId: agentRef.id,
            agentName: agentRef.name,
            branchId: agentRef.branchId || null,
            type: row.planCode,
            planType: row.planType,
            monthlyAmount: isRDPlan ? row.monthlyAmount : 0,
            fdAmount: !isRDPlan ? row.totalAmount : 0,
            startDate: row.startDate,
            status: 'active',
            commissionCalculated: true,
            createdAt: serverTimestamp(),
          })

          // 3. Update Agent Profile business stats
          const agentDocRef = doc(db, 'users', agentRef.id)
          batch.update(agentDocRef, {
            totalCustomers: increment(1),
            activePolicies: increment(1),
            businessVolume: increment(calculatedAmount),
            recentImportDate: serverTimestamp(),
          })

          // 4. Calculate Commissions (Hierarchical with compression)
          const calculationDate = new Date()
          const monthNum = row.startDate ? (row.startDate.getMonth() + 1) : (calculationDate.getMonth() + 1)
          const yearNum = row.startDate ? row.startDate.getFullYear() : calculationDate.getFullYear()
          const baseAmount = isRDPlan ? (row.monthlyAmount * 12) : row.totalAmount
          
          const commissionResults = calculateCommissions({
            baseAgent: agentRef,
            usersMap,
            planCode: row.planCode,
            planType: row.planType,
            policyYear: 1,
            businessAmount: baseAmount,
            commissionsConfig,
            ranksConfig
          })

          // Create ledger entries for each beneficiary
          commissionResults.forEach(comm => {
            const ledgerRef = doc(collection(db, 'commission_ledger'))
            batch.set(ledgerRef, {
              policyId: policyRef.id,
              policyNumber: row.policyNumber,
              customerName: row.customerName,
              agentId: comm.beneficiaryId,
              agentName: comm.beneficiaryName,
              sponsorCode: comm.sponsorCode,
              planCode: row.planCode,
              type: 'commission',
              percentage: comm.percentage,
              amount: comm.amount,
              businessAmount: baseAmount,
              originalRank: comm.originalRank,
              compression: comm.compression,
              month: monthNum,
              year: yearNum,
              status: 'unpaid',
              createdAt: serverTimestamp()
            })
            totalImportedCommissions += comm.amount
          })

          totalImportedBusiness += calculatedAmount
          successCount++
        } catch (err) {
          console.error('Failed importing row:', row, err)
          failedCount++
          logs.push({ row: row.rowNum, level: 'error', message: `Database write failure: ${err.message}` })
        }
      }

      try {
        await batch.commit()
      } catch (err) {
        console.error('Batch commit failed:', err)
        failedCount += chunk.length
        chunk.forEach(r => {
          logs.push({ row: r.rowNum, level: 'error', message: `Batch commit fail: ${err.message}` })
        })
      }

      setProgress(Math.round(((i + chunk.length) / validRows.length) * 100))
    }

    // Write Import summary session log
    try {
      await addDoc(collection(db, 'imports'), {
        fileName,
        importDate: serverTimestamp(),
        totalRows: data.length,
        successRows: successCount,
        duplicateRows: duplicatesCount,
        failedRows: failedCount + (data.length - validRows.length),
        logs: logs.slice(0, 100),
        status: successCount > 0 ? 'completed' : 'failed',
        triggeredBy: profile?.name || 'Administrator',
      })
    } catch (e) {
      console.error('Could not log import summary:', e)
    }

    try {
      await updateDashboardSummary({
        totalBusiness: totalImportedBusiness,
        monthlyBusiness: totalImportedBusiness,
        activePlans: successCount,
        totalPolicies: successCount,
        todayImportedPolicies: successCount,
        todayImportedCustomers: successCount,
      })
    } catch (err) {
      console.error('Failed to update dashboard summaries:', err)
    }

    setImportSummary({
      total: data.length,
      success: successCount,
      failed: failedCount + (data.length - validRows.length),
      logs,
    })

    setImporting(false)
    setData([])
    setFileName('')
    toast.success(`Import Session Finished! Successful: ${successCount}`)
  }

  const validRows = data.filter(d => d.valid).length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Import Center</h2>
          <p className="text-xs text-ink-2">Upload and import the bank approved daily Excel data transactions.</p>
        </div>
        <Link to="/admin/import/history" className="btn-gold py-2 text-xs uppercase tracking-wider font-bold flex items-center gap-1.5">
          <IClock size={16} /> Import History Logs
        </Link>
      </div>

      {/* Drag and Drop Zone */}
      {!importing && !importSummary && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-card p-10 text-center transition-all duration-200 ${
                dragActive 
                  ? 'border-gold-1 bg-gold-1/5 scale-[1.01]' 
                  : 'border-navy-4 bg-navy-2/30 hover:border-navy-4 hover:bg-navy-2/50'
              }`}
            >
              <input 
                type="file" 
                id="excel-file" 
                className="hidden" 
                accept=".xlsx, .xls"
                onChange={handleFileChange} 
              />
              <label htmlFor="excel-file" className="cursor-pointer space-y-4 block">
                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-navy-4 bg-navy-2 mx-auto text-ink-2">
                  <IDoc size={28} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-1">Drag and drop bank Excel file here</p>
                  <p className="text-xs text-ink-2 mt-1">or click to browse locally (Supported formats: `.xlsx`, `.xls` only)</p>
                </div>
              </label>
            </div>

            {/* Selected File Details */}
            {fileName && (
              <div className="flex items-center justify-between card p-3.5 bg-navy-3 border-l-2 border-gold-1">
                <div className="flex items-center gap-2.5">
                  <IDoc size={18} className="text-gold-1" />
                  <div>
                    <p className="text-xs font-semibold text-ink-1 font-mono">{fileName}</p>
                    <p className="text-[10px] text-ink-2 mt-0.5">
                      {data.length} records parsed · {validRows} ready to import · {duplicatesCount} duplicates skipped · {errorsCount} formatting errors
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => { setData([]); setFileName('') }} 
                    className="p-1 text-ink-2 hover:text-danger rounded hover:bg-navy-2"
                  >
                    <IClose size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Mapping info sidebar */}
          <div className="card p-5 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
              Excel Header Column Bindings
            </h4>
            <div className="space-y-2.5 text-[11px] font-medium text-ink-2">
              {Object.entries(mapping).map(([key, colName]) => (
                <div key={key} className="flex justify-between py-1 border-b border-navy-4/20">
                  <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <span className="font-mono text-ink-1">{colName}</span>
                </div>
              ))}
              <div className="pt-2 text-center">
                <Link to="/admin/settings" className="text-xs text-gold hover:underline font-bold">
                  Edit mapping rules in Settings &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress execution indicator */}
      {importing && (
        <div className="card p-8 text-center space-y-4 bg-navy-3 border-gold-1 border">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-gold mx-auto" />
          <h3 className="text-base font-bold text-ink-1 font-serif">Executing Database Import</h3>
          <p className="text-xs text-ink-2">Processing CIF codes, ledger allocations, and updating agent volumes in chunks...</p>
          <div className="w-full bg-navy-2 rounded-full h-2.5 mt-4 max-w-md mx-auto overflow-hidden border border-navy-4">
            <div className="bg-gold h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] text-gold font-mono">{progress}% Complete</span>
        </div>
      )}

      {/* Execution Summary logs */}
      {importSummary && (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-navy-4 pb-3">
            <h3 className="text-lg font-bold text-ink-1 font-serif">Import Session Summary</h3>
            <button 
              onClick={() => setImportSummary(null)} 
              className="btn-gold py-1.5 px-4 text-xs font-semibold"
            >
              Start New Upload
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-navy-2/50 border border-navy-4 rounded p-4 text-center">
              <span className="text-[10px] uppercase font-bold text-ink-2 tracking-wider">Total records</span>
              <p className="text-2xl font-bold font-serif text-ink-1 mt-1">{importSummary.total}</p>
            </div>
            <div className="bg-ok/5 border border-ok/20 rounded p-4 text-center">
              <span className="text-[10px] uppercase font-bold text-ok tracking-wider">Imported Successfully</span>
              <p className="text-2xl font-bold font-serif text-ok mt-1">{importSummary.success}</p>
            </div>
            <div className="bg-danger/5 border border-danger/20 rounded p-4 text-center">
              <span className="text-[10px] uppercase font-bold text-danger tracking-wider">Row Failures / Skipped Dups</span>
              <p className="text-2xl font-bold font-serif text-danger mt-1">{importSummary.failed}</p>
            </div>
          </div>

          {importSummary.logs.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">Row Validation Logs</h4>
              <div className="rounded border border-navy-4 max-h-[300px] overflow-y-auto bg-navy-2/30 p-2 space-y-1.5">
                {importSummary.logs.map((log, idx) => (
                  <div key={idx} className="flex gap-2 text-xs border-b border-navy-4/20 py-2 last:border-b-0 px-2">
                    <span className="font-mono font-bold text-ink-2 bg-navy-2 px-1.5 py-0.5 rounded border border-navy-4">Row {log.row}</span>
                    <span className={`font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded ${log.level === 'error' ? 'bg-danger/10 text-danger' : 'bg-gold-1/10 text-gold-1'}`}>
                      {log.level}
                    </span>
                    <span className="text-ink-1">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row preview table before execution */}
      {!importing && data.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-1.5">
                Parsed Sheet Verification Preview
              </h3>
              <p className="text-[10px] text-ink-2 mt-0.5">
                Skipping {duplicatesCount} duplicate database records. Ready to write {validRows} rows.
              </p>
            </div>
            <button 
              onClick={handleImport}
              disabled={validRows === 0} 
              className="btn-gold py-2 px-6 text-sm font-semibold"
            >
              Execute Database Import ({validRows} valid rows)
            </button>
          </div>

          <div className="table-wrap max-h-[450px] overflow-y-auto">
            <table className="tbl text-xs">
              <thead className="sticky top-0 bg-navy-2 z-10">
                <tr>
                  <th>Row</th>
                  <th>CIF ID</th>
                  <th>Customer Name</th>
                  <th>Agent Found</th>
                  <th>Policy Number</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className={row.valid ? '' : 'opacity-50 bg-danger/5'}>
                    <td className="font-mono text-ink-2">{row.rowNum}</td>
                    <td className="font-mono font-semibold text-ink-1">{row.customerId || '—'}</td>
                    <td className="font-semibold text-ink-1">{row.customerName || '—'}</td>
                    <td>
                      {row.agent ? (
                        <span className="text-ok font-semibold">{row.agent.name} ({row.agentCode.toUpperCase()})</span>
                      ) : (
                        <span className="text-danger font-semibold flex items-center gap-1"><IClose size={12} /> {row.agentCode ? `"${row.agentCode.toUpperCase()}" Missing` : 'Empty'}</span>
                      )}
                    </td>
                    <td className="font-mono text-ink-1">{row.policyNumber || '—'}</td>
                    <td className="font-semibold uppercase text-ink-2">{row.planCode}</td>
                    <td className="text-ink-1">
                      {row.monthlyAmount > 0 ? (
                        <div>{formatINR(row.monthlyAmount)} <span className="text-[9px] text-ink-2 font-normal">/mo (RD)</span></div>
                      ) : (
                        <div>{formatINR(row.totalAmount)} <span className="text-[9px] text-ink-2 font-normal">Total (FD)</span></div>
                      )}
                    </td>
                    <td>
                      {row.valid ? (
                        <span className="text-ok font-semibold flex items-center gap-1"><ICheck size={14} /> Ready</span>
                      ) : (
                        <span className="text-danger font-semibold flex items-center gap-1" title={row.errors.join('; ')}>
                          <IAlert size={14} /> Invalid ({row.errors.length})
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
