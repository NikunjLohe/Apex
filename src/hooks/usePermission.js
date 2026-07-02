// ============================================================================
// Permission helpers based on rank (1–18) + isSuperAdmin flag.
//   ranks 1–9   : onboard customers, collect payments, view own data
//   ranks 10–13 : branch reports, manage downline
//   ranks 14–17 : zone-wide reports
//   rank 18 / superadmin : full access
// ============================================================================
import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useRanks } from '../contexts/RanksContext'

export const CAP = {
  ONBOARD: 'onboard',
  COLLECT: 'collect',
  BRANCH_REPORTS: 'branchReports',
  MANAGE_DOWNLINE: 'manageDownline',
  ZONE_REPORTS: 'zoneReports',
  ADMIN: 'admin', // members/branches/settings (rank 14+ or superadmin)
  SUPER_ADMIN: 'superAdmin',
  RECRUIT: 'recruit',
}

export function can(rank, isSuperAdmin, capability) {
  const r = Number(rank) || 0
  if (isSuperAdmin) return true
  switch (capability) {
    case CAP.ONBOARD:
    case CAP.COLLECT:
      return r >= 10 && r <= 18
    case CAP.RECRUIT:
      return r >= 2 && r <= 18 // Fallback default
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
  const { config } = useRanks()
  return useMemo(
    () => ({
      rank,
      isSuperAdmin,
      can: (capability) => {
        if (isSuperAdmin) return true
        if (capability === CAP.RECRUIT) {
          const rankObj = config?.RANKS?.find((r) => r.rank === Number(rank))
          if (rankObj && rankObj.recruitPermission !== undefined) {
            return Boolean(rankObj.recruitPermission)
          }
          return Number(rank) >= 2 // fallback default
        }
        return can(rank, isSuperAdmin, capability)
      },
      CAP,
    }),
    [rank, isSuperAdmin, config]
  )
}

export default usePermission
