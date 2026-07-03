import { doc, updateDoc, increment, serverTimestamp, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Perform delta increments or array updates on the master dashboard summary document.
 * If the document does not exist, it will be automatically initialized first.
 * Numbers in delta payload will use Firestore increment(); arrays/dates will overwrite directly.
 */
export async function updateDashboardSummary(deltas) {
  const ref = doc(db, 'system_summaries', 'dashboard')
  
  try {
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        totalBusiness: 0,
        monthlyBusiness: 0,
        totalCommission: 0,
        pendingPayouts: 0,
        activeAgents: 0,
        activePlans: 0,
        todayCollection: 0,
        monthCollection: 0,
        defaulters: 0,
        totalAgents: 0,
        totalBranches: 0,
        todayImportedPolicies: 0,
        todayImportedCustomers: 0,
        pendingImportErrors: 0,
        promotionsCount: 0,
        growthData: [],
        branchPerformance: [],
        topAgentsList: [],
        createdAt: serverTimestamp(),
      })
    }

    const payload = { ...deltas, lastUpdated: serverTimestamp() }
    
    Object.keys(deltas).forEach((key) => {
      if (typeof deltas[key] === 'number') {
        payload[key] = increment(deltas[key])
      }
    })

    await updateDoc(ref, payload)
  } catch (err) {
    console.error('Failed to update dashboard summary document:', err)
  }
}
