// ============================================================================
// Permission helpers based on rank (1–18) + isSuperAdmin flag.
//   ranks 1–9   : onboard customers, collect payments, view own data
//   ranks 10–13 : branch reports, manage downline
//   ranks 14–17 : zone-wide reports
//   rank 18 / superadmin : full access
// ============================================================================
import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'

export const CAP = {
  ONBOARD: 'onboard',
  COLLECT: 'collect',
  BRANCH_REPORTS: 'branchReports',
  MANAGE_DOWNLINE: 'manageDownline',
  ZONE_REPORTS: 'zoneReports',
  ADMIN: 'admin', // members/branches/settings (rank 14+ or superadmin)
  SUPER_ADMIN: 'superAdmin',
}

export function can(rank, isSuperAdmin, capability) {
  const r = Number(rank) || 0
  if (isSuperAdmin) return true
  switch (capability) {
    case CAP.ONBOARD:
    case CAP.COLLECT:
      return r >= 1 && r <= 18
    case CAP.BRANCH_REPORTS:
    case CAP.MANAGE_DOWNLINE:
      return r >= 10
    case CAP.ZONE_REPORTS:
      return r >= 14
    case CAP.ADMIN:
      return r >= 14
    case CAP.SUPER_ADMIN:
      return false // only superadmin flag grants this
    default:
      return false
  }
}

export function usePermission() {
  const { rank, isSuperAdmin } = useAuth()
  return useMemo(
    () => ({
      rank,
      isSuperAdmin,
      can: (capability) => can(rank, isSuperAdmin, capability),
      CAP,
    }),
    [rank, isSuperAdmin]
  )
}

export default usePermission
