// ============================================================================
// APEX — Downline Business Analytics & Excel Export Engine
// ============================================================================
import * as xlsx from 'xlsx'
import { formatINR, fmtDate } from '../utils/format'

/**
 * Calculates policy business volume and collection metrics following APEX rules:
 * - RD: Annualized contract business volume = monthlyAmount * 12 (or totalPaid if 0)
 * - FD / Pension: Total deposit amount = fdAmount || totalPaid || 0
 */
export function calculatePolicyBusiness(p) {
  if (!p) return { isRD: false, isFD: false, businessAmount: 0, collectionsAmount: 0 }
  
  const planTypeStr = String(p.planType || p.type || '').toUpperCase()
  const planCodeStr = String(p.planCode || '').toUpperCase()
  const isRD = planTypeStr === 'RD' || planCodeStr.startsWith('RD')
  const isFD = !isRD

  let businessAmount = 0
  if (isRD) {
    const monthly = Number(p.monthlyAmount) || Number(p.installmentAmount) || 0
    businessAmount = monthly > 0 ? monthly * 12 : (Number(p.totalPaid) || 0)
  } else {
    businessAmount = Number(p.fdAmount) || Number(p.totalPaid) || Number(p.totalAmount) || 0
  }

  const collectionsAmount = Number(p.totalPaid) || (isRD ? (Number(p.monthlyAmount) || 0) * (Number(p.paidInstallments) || 1) : businessAmount)

  return {
    isRD,
    isFD,
    businessAmount,
    collectionsAmount
  }
}

/**
 * Builds bidirectional hierarchy maps and descendant lookup from an array of profiles.
 */
export function buildHierarchyMap(allProfiles = []) {
  const byId = new Map()
  const byCode = new Map()
  const childrenMap = new Map() // parentId -> childIds[]
  const parentMap = new Map()   // childId -> parentId

  allProfiles.forEach(p => {
    if (!p) return
    const id = p.id || p.uid
    byId.set(id, p)
    if (p.sponsorCode) byCode.set(String(p.sponsorCode).toUpperCase(), p)
    if (p.agentCode) byCode.set(String(p.agentCode).toUpperCase(), p)
  })

  allProfiles.forEach(p => {
    if (!p) return
    const id = p.id || p.uid
    const sponsorId = p.sponsorId || p.sponsor_id || p.referredBy

    if (sponsorId && sponsorId !== 'none' && sponsorId !== id) {
      // Find parent id (could be UUID or sponsorCode)
      let resolvedParentId = sponsorId
      if (byId.has(sponsorId)) {
        resolvedParentId = sponsorId
      } else if (byCode.has(String(sponsorId).toUpperCase())) {
        resolvedParentId = byCode.get(String(sponsorId).toUpperCase()).id
      }

      parentMap.set(id, resolvedParentId)
      if (!childrenMap.has(resolvedParentId)) {
        childrenMap.set(resolvedParentId, [])
      }
      childrenMap.get(resolvedParentId).push(id)
    }
  })

  // Helper to get direct children
  const getDirectChildren = (parentId) => {
    return (childrenMap.get(parentId) || []).map(cid => byId.get(cid)).filter(Boolean)
  }

  // Helper to get all descendants (subtree excluding root)
  const getAllDescendants = (rootId) => {
    const list = []
    const visited = new Set([rootId])
    const queue = [...(childrenMap.get(rootId) || [])]

    while (queue.length > 0) {
      const cid = queue.shift()
      if (visited.has(cid)) continue
      visited.add(cid)
      const child = byId.get(cid)
      if (child) {
        list.push(child)
        const grandChildren = childrenMap.get(cid) || []
        grandChildren.forEach(gId => {
          if (!visited.has(gId)) queue.push(gId)
        })
      }
    }
    return list
  }

  // Helper to compute hierarchy distance (1 = direct child, 2 = grandchild, etc.)
  const getHierarchyLevel = (targetId, rootId) => {
    if (targetId === rootId) return 0
    let level = 0
    let curr = targetId
    const visited = new Set()

    while (curr && curr !== rootId && !visited.has(curr)) {
      visited.add(curr)
      level += 1
      curr = parentMap.get(curr)
    }

    return curr === rootId ? level : -1
  }

  return {
    byId,
    byCode,
    childrenMap,
    parentMap,
    getDirectChildren,
    getAllDescendants,
    getHierarchyLevel
  }
}

/**
 * Computes complete business metrics for an agent and their downline network.
 * Guarantees zero double counting:
 * Total Network Business = Personal Business + sum of Personal Business of all descendants.
 */
export function calculateAgentBusinessMetrics({
  agentId,
  allProfiles = [],
  policies = [],
  payments = [],
  commissions = [],
  customers = [],
  hierarchyMap = null
}) {
  const map = hierarchyMap || buildHierarchyMap(allProfiles)
  const agent = map.byId.get(agentId) || null

  const directDownline = map.getDirectChildren(agentId)
  const allDescendants = map.getAllDescendants(agentId)
  
  const directDownlineIds = new Set(directDownline.map(a => a.id))
  const descendantIds = new Set(allDescendants.map(a => a.id))
  const networkIds = new Set([agentId, ...descendantIds])

  // Group policies by agent
  const policiesByAgent = new Map()
  policies.forEach(p => {
    const aid = p.agentId || p.agent_id
    if (!policiesByAgent.has(aid)) policiesByAgent.set(aid, [])
    policiesByAgent.get(aid).push(p)
  })

  // 1. Personal Business
  const personalPolicies = policiesByAgent.get(agentId) || []
  let personalBusiness = 0
  let personalRDBusiness = 0
  let personalFDBusiness = 0
  let personalCollections = 0
  let personalActivePolicies = 0

  personalPolicies.forEach(p => {
    const b = calculatePolicyBusiness(p)
    personalBusiness += b.businessAmount
    if (b.isRD) personalRDBusiness += b.businessAmount
    else personalFDBusiness += b.businessAmount
    personalCollections += b.collectionsAmount
    if (p.status === 'active') personalActivePolicies += 1
  })

  // 2. Direct Downline Business (sum of Personal Business closed by direct children)
  let directDownlineBusiness = 0
  directDownline.forEach(child => {
    const childPols = policiesByAgent.get(child.id) || []
    childPols.forEach(p => {
      const b = calculatePolicyBusiness(p)
      directDownlineBusiness += b.businessAmount
    })
  })

  // 3. Network Business (Personal + all descendants)
  let totalNetworkBusiness = personalBusiness
  let networkRDBusiness = personalRDBusiness
  let networkFDBusiness = personalFDBusiness
  let networkCollections = personalCollections
  let totalNetworkPolicies = personalPolicies.length
  let networkActivePolicies = personalActivePolicies

  const networkPolicies = [...personalPolicies]

  allDescendants.forEach(desc => {
    const descPols = policiesByAgent.get(desc.id) || []
    descPols.forEach(p => {
      networkPolicies.push(p)
      const b = calculatePolicyBusiness(p)
      totalNetworkBusiness += b.businessAmount
      if (b.isRD) networkRDBusiness += b.businessAmount
      else networkFDBusiness += b.businessAmount
      networkCollections += b.collectionsAmount
      if (p.status === 'active') networkActivePolicies += 1
      totalNetworkPolicies += 1
    })
  })

  // 4. Customers count
  const uniquePersonalCust = new Set()
  customers.forEach(c => {
    if (c.enrolledBy === agentId || c.enrolled_by === agentId) {
      uniquePersonalCust.add(c.id || c.customer_id)
    }
  })
  personalPolicies.forEach(p => {
    const cid = p.customerId || p.customer_id || p.customerAccount
    if (cid) uniquePersonalCust.add(cid)
  })

  const uniqueNetworkCust = new Set(uniquePersonalCust)
  customers.forEach(c => {
    const enr = c.enrolledBy || c.enrolled_by
    if (networkIds.has(enr)) {
      uniqueNetworkCust.add(c.id || c.customer_id)
    }
  })
  networkPolicies.forEach(p => {
    const cid = p.customerId || p.customer_id || p.customerAccount
    if (cid) uniqueNetworkCust.add(cid)
  })

  // 5. Commissions earned by this agent
  const totalCommissionGenerated = commissions
    .filter(c => (c.agentId || c.agent_id) === agentId)
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0)

  // Payments collected for this agent's business
  const agentPayments = payments.filter(pm => {
    return (pm.agentId || pm.agent_id) === agentId
  })
  const recordedPaymentsSum = agentPayments.reduce((sum, pm) => sum + (Number(pm.amount) || 0), 0)
  const finalCollections = recordedPaymentsSum > 0 ? recordedPaymentsSum : personalCollections

  return {
    agent,
    directDownlineCount: directDownline.length,
    networkDownlineCount: allDescendants.length,
    
    // Core Business Metrics
    totalBusinessGenerated: personalBusiness,
    personalBusiness,
    directDownlineBusiness,
    totalNetworkBusiness,

    // Plan Type Breakdowns
    personalRDBusiness,
    personalFDBusiness,
    networkRDBusiness,
    networkFDBusiness,

    // Policy & Customer Counts
    personalPoliciesCount: personalPolicies.length,
    totalPolicies: totalNetworkPolicies,
    activePolicies: networkActivePolicies,
    personalCustomersCount: uniquePersonalCust.size,
    totalCustomers: uniqueNetworkCust.size,

    // Financial Flow
    totalCollections: finalCollections,
    totalCommissionGenerated,

    // Lists
    directDownline,
    allDescendants,
    personalPolicies,
    networkPolicies
  }
}

/**
 * Builds complete tabular rows for every agent in the network downline (including root).
 */
export function generateDownlineTable({
  rootAgentId,
  allProfiles = [],
  policies = [],
  customers = [],
  hierarchyMap = null
}) {
  const map = hierarchyMap || buildHierarchyMap(allProfiles)
  const rootAgent = map.byId.get(rootAgentId)
  if (!rootAgent) return []

  const allDescendants = map.getAllDescendants(rootAgentId)
  const targets = [rootAgent, ...allDescendants]

  // Policies map
  const policiesByAgent = new Map()
  policies.forEach(p => {
    const aid = p.agentId || p.agent_id
    if (!policiesByAgent.has(aid)) policiesByAgent.set(aid, [])
    policiesByAgent.get(aid).push(p)
  })

  // Customers map
  const customersByAgent = new Map()
  customers.forEach(c => {
    const aid = c.enrolledBy || c.enrolled_by
    if (aid) {
      if (!customersByAgent.has(aid)) customersByAgent.set(aid, new Set())
      customersByAgent.get(aid).add(c.id || c.customer_id)
    }
  })

  return targets.map(agent => {
    const aid = agent.id
    const level = map.getHierarchyLevel(aid, rootAgentId)
    const directChildren = map.getDirectChildren(aid)
    const descendants = map.getAllDescendants(aid)

    // Personal policies
    const ownPols = policiesByAgent.get(aid) || []
    let personalBiz = 0
    let rdVol = 0
    let fdVol = 0

    ownPols.forEach(p => {
      const b = calculatePolicyBusiness(p)
      personalBiz += b.businessAmount
      if (b.isRD) rdVol += b.businessAmount
      else fdVol += b.businessAmount
    })

    // Direct Downline Business
    let directDownlineBiz = 0
    directChildren.forEach(child => {
      const cPols = policiesByAgent.get(child.id) || []
      cPols.forEach(p => {
        const b = calculatePolicyBusiness(p)
        directDownlineBiz += b.businessAmount
      })
    })

    // Total Network Business
    let networkBiz = personalBiz
    descendants.forEach(desc => {
      const dPols = policiesByAgent.get(desc.id) || []
      dPols.forEach(p => {
        const b = calculatePolicyBusiness(p)
        networkBiz += b.businessAmount
      })
    })

    // Personal customers
    const custSet = customersByAgent.get(aid) || new Set()
    ownPols.forEach(p => {
      const cid = p.customerId || p.customer_id
      if (cid) custSet.add(cid)
    })

    const parentId = map.parentMap.get(aid)
    const parentAgent = parentId ? map.byId.get(parentId) : null

    return {
      agentId: aid,
      agentName: agent.name || '—',
      sponsorCode: agent.sponsorCode || agent.agentCode || '—',
      rank: agent.rank || 1,
      rankCode: agent.rankCode || `Rank ${agent.rank || 1}`,
      directSponsorName: parentAgent?.name || '—',
      directSponsorId: parentAgent?.sponsorCode || parentAgent?.id || '—',
      hierarchyLevel: level === 0 ? 'Root' : `Level ${level}`,
      levelNumber: level,
      directDownlineCount: directChildren.length,
      networkDownlineCount: descendants.length,
      personalBusiness: personalBiz,
      directDownlineBusiness: directDownlineBiz,
      totalNetworkBusiness: networkBiz,
      rdBusiness: rdVol,
      fdBusiness: fdVol,
      totalPolicies: ownPols.length,
      totalCustomers: custSet.size,
      status: agent.status || 'active',
      joiningDate: agent.createdAt || agent.created_at || '—',
      phone: agent.phone || '—',
      email: agent.email || '—'
    }
  })
}

/**
 * Aggregates business performance by Rank (1 to 18).
 */
export function generateRankSummary(downlineTable = []) {
  const rankMap = new Map()

  for (let r = 1; r <= 18; r++) {
    rankMap.set(r, {
      rank: r,
      agentCount: 0,
      totalPolicies: 0,
      personalBusiness: 0,
      totalNetworkBusiness: 0,
      agents: []
    })
  }

  downlineTable.forEach(row => {
    const r = Number(row.rank) || 1
    if (rankMap.has(r)) {
      const item = rankMap.get(r)
      item.agentCount += 1
      item.totalPolicies += row.totalPolicies
      item.personalBusiness += row.personalBusiness
      item.totalNetworkBusiness += row.totalNetworkBusiness
      item.agents.push(row)
    }
  })

  return Array.from(rankMap.values()).filter(r => r.agentCount > 0)
}

/**
 * Exports complete 5-sheet agent and downline report to an Excel (.xlsx) file.
 */
export function exportAgentExcelReport({
  rootAgent,
  metrics,
  downlineTable = [],
  policiesList = [],
  rankSummary = [],
  isAgentScope = false
}) {
  const wb = xlsx.utils.book_new()
  const genDateStr = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  const autoFit = (ws, rows) => {
    if (!rows || rows.length === 0) return
    const keys = Object.keys(rows[0])
    ws['!cols'] = keys.map(k => {
      let maxLen = String(k).length
      rows.forEach(r => {
        const val = r[k]
        if (val !== null && val !== undefined) {
          const l = String(val).length
          if (l > maxLen) maxLen = l
        }
      })
      return { wch: Math.min(Math.max(maxLen + 4, 12), 40) }
    })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 1: Agent Profile & Business Summary
  // ───────────────────────────────────────────────────────────────────────────
  const profileHeader = [
    ['APEX MULTISOLUTIONS — AGENT PROFILE & BUSINESS REPORT'],
    ['Generated On:', genDateStr],
    ['Report Scope:', isAgentScope ? 'Authorized Network Downline' : 'Complete Executive Audit'],
    [''],
    ['AGENT BASIC INFORMATION', 'VALUE'],
    ['Agent Name', rootAgent?.name || '—'],
    ['Agent ID / UUID', rootAgent?.id || '—'],
    ['Sponsor Code', rootAgent?.sponsorCode || rootAgent?.agentCode || '—'],
    ['Rank Level', rootAgent?.rank || 1],
    ['Email Address', rootAgent?.email || '—'],
    ['Mobile Number', rootAgent?.phone || '—'],
    ['Branch', rootAgent?.branchName || '—'],
    ['Current Status', (rootAgent?.status || 'active').toUpperCase()],
    ['Joining Date', rootAgent?.createdAt ? fmtDate(rootAgent.createdAt) : '—'],
    ['Direct Sponsor', rootAgent?.sponsorName ? `${rootAgent.sponsorName} (${rootAgent.sponsorId || '—'})` : 'Root Leader'],
    [''],
    ['BUSINESS SUMMARY METRICS', 'AMOUNT / COUNT'],
    ['Total Personal Business (₹)', Number(metrics?.personalBusiness?.toFixed(2) || 0)],
    ['Direct Downline Business (₹)', Number(metrics?.directDownlineBusiness?.toFixed(2) || 0)],
    ['Total Network Business (₹)', Number(metrics?.totalNetworkBusiness?.toFixed(2) || 0)],
    ['Total RD Business (₹)', Number(metrics?.networkRDBusiness?.toFixed(2) || 0)],
    ['Total FD Business (₹)', Number(metrics?.networkFDBusiness?.toFixed(2) || 0)],
    ['Total Policies', metrics?.totalPolicies || 0],
    ['Active Policies', metrics?.activePolicies || 0],
    ['Total Network Customers', metrics?.totalCustomers || 0],
    ['Total Collections (₹)', Number(metrics?.totalCollections?.toFixed(2) || 0)],
    ['Total Commissions Earned (₹)', Number(metrics?.totalCommissionGenerated?.toFixed(2) || 0)],
    ['Total Direct Downline Agents', metrics?.directDownlineCount || 0],
    ['Total Network Downline Agents', metrics?.networkDownlineCount || 0],
  ]

  const ws1 = xlsx.utils.aoa_to_sheet(profileHeader)
  ws1['!cols'] = [{ wch: 32 }, { wch: 45 }]
  xlsx.utils.book_append_sheet(wb, ws1, 'Agent Profile')

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 2: Complete Downline Hierarchy
  // ───────────────────────────────────────────────────────────────────────────
  const downlineRows = downlineTable.map((row, idx) => ({
    'Sr. No.': idx + 1,
    'Agent Name': row.agentName,
    'Agent ID': row.agentId,
    'Sponsor Code': row.sponsorCode,
    'Rank': row.rank,
    'Hierarchy Level': row.hierarchyLevel,
    'Parent / Sponsor Name': row.directSponsorName,
    'Parent / Sponsor Code': row.directSponsorId,
    'Direct Downline Count': row.directDownlineCount,
    'Total Network Downline': row.networkDownlineCount,
    'Personal Business (₹)': Number(row.personalBusiness.toFixed(2)),
    'Total Network Business (₹)': Number(row.totalNetworkBusiness.toFixed(2)),
    'Status': row.status
  }))

  const ws2 = xlsx.utils.json_to_sheet(downlineRows)
  autoFit(ws2, downlineRows)
  xlsx.utils.book_append_sheet(wb, ws2, 'Complete Downline')

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 3: Business Details (Policies)
  // ───────────────────────────────────────────────────────────────────────────
  const businessRows = policiesList.map((p, idx) => {
    const b = calculatePolicyBusiness(p)
    return {
      'Sr. No.': idx + 1,
      'Customer ID': p.customerId || p.customer_id || p.customerAccount || '—',
      'Customer Name': p.customerName || p.customers?.name || '—',
      'Policy / Account Number': p.policyNumber || p.policy_number || '—',
      'Agent ID': p.agentId || p.agent_id || '—',
      'Agent Name': p.agentName || p.profiles?.name || '—',
      'Plan Type': b.isRD ? 'RD' : 'FD',
      'Plan Code': p.planCode || p.plan_code || '—',
      'Business Amount (₹)': Number(b.businessAmount.toFixed(2)),
      'Total Paid / Collections (₹)': Number(b.collectionsAmount.toFixed(2)),
      'Start / Enrollment Date': p.startDate ? (String(p.startDate).split('T')[0]) : '—',
      'Policy Status': p.status || 'active'
    }
  })

  const ws3 = xlsx.utils.json_to_sheet(businessRows)
  autoFit(ws3, businessRows)
  xlsx.utils.book_append_sheet(wb, ws3, 'Business Details')

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 4: Agent-wise Business Summary
  // ───────────────────────────────────────────────────────────────────────────
  const agentSummaryRows = downlineTable.map((row, idx) => ({
    'Sr. No.': idx + 1,
    'Agent Name': row.agentName,
    'Agent ID': row.agentId,
    'Sponsor Code': row.sponsorCode,
    'Rank': row.rank,
    'Direct Sponsor': row.directSponsorName,
    'Personal Business (₹)': Number(row.personalBusiness.toFixed(2)),
    'Direct Downline Business (₹)': Number(row.directDownlineBusiness.toFixed(2)),
    'Total Network Business (₹)': Number(row.totalNetworkBusiness.toFixed(2)),
    'RD Business (₹)': Number(row.rdBusiness.toFixed(2)),
    'FD Business (₹)': Number(row.fdBusiness.toFixed(2)),
    'Total Policies': row.totalPolicies,
    'Total Customers': row.totalCustomers
  }))

  const ws4 = xlsx.utils.json_to_sheet(agentSummaryRows)
  autoFit(ws4, agentSummaryRows)
  xlsx.utils.book_append_sheet(wb, ws4, 'Agent-wise Business')

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 5: Rank-wise Summary
  // ───────────────────────────────────────────────────────────────────────────
  const rankRows = rankSummary.map(r => ({
    'Rank Level': `Rank ${r.rank}`,
    'Agent Count': r.agentCount,
    'Total Policies Closed': r.totalPolicies,
    'Combined Personal Business (₹)': Number(r.personalBusiness.toFixed(2)),
    'Combined Network Business (₹)': Number(r.totalNetworkBusiness.toFixed(2))
  }))

  const ws5 = xlsx.utils.json_to_sheet(rankRows)
  autoFit(ws5, rankRows)
  xlsx.utils.book_append_sheet(wb, ws5, 'Rank-wise Summary')

  // Save workbook
  const safeCode = (rootAgent?.sponsorCode || rootAgent?.agentCode || 'AGENT').replace(/[^a-zA-Z0-9_-]/g, '_')
  const fileName = `APEX_AGENT_${safeCode}_REPORT_${new Date().toISOString().split('T')[0]}.xlsx`
  xlsx.writeFile(wb, fileName)
  return fileName
}
