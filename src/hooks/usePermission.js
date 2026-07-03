// ============================================================================
// Permission helpers based on rank (1–18) + isSuperAdmin flag.
//   ranks 1–9   : field agents — agent-only pages, own data
//   ranks 10–13 : branch managers — onboard, collect, reports, downline
//   ranks 14–17 : admin — full admin panel, zone reports
//   isSuperAdmin: unrestricted access to all admin/super-admin pages
//                 but NOT agent-only personal pages (no personal agent data)
// ============================================================================
import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useRanks } from '../contexts/RanksContext'

export const CAP = {
  ONBOARD:          'onboard',
  COLLECT:          'collect',
  BRANCH_REPORTS:   'branchReports',
  MANAGE_DOWNLINE:  'manageDownline',
  ZONE_REPORTS:     'zoneReports',
  ADMIN:            'admin',       // members/branches/settings (rank 14+ or superadmin)
  SUPER_ADMIN:      'superAdmin',  // overview/all-reports/logs (only isSuperAdmin flag)
  RECRUIT:          'recruit',
  /** Pages that show *personal* agent data — hidden from admins who have no agent record */
  AGENT_ONLY:       'agentOnly',
}

export function can(rank, isSuperAdmin, capability) {
  const r = Number(rank) || 0

  // Agent-only: must be a real agent (rank 1–18) AND not a pure super admin account
  if (capability === CAP.AGENT_ONLY) {
    return !isSuperAdmin && r >= 1
  }

  // Super admin has access to everything EXCEPT agent-only personal pages (handled above)
  if (isSuperAdmin) return true

  switch (capability) {
    case CAP.ONBOARD:
    case CAP.COLLECT:
      return r >= 10 && r <= 18
    case CAP.RECRUIT:
      return r >= 2 && r <= 18
    case CAP.BRANCH_REPORTS:
    case CAP.MANAGE_DOWNLINE:
      return r >= 10
    case CAP.ZONE_REPORTS:
      return r >= 14
    case CAP.ADMIN:
      return r >= 14
    case CAP.SUPER_ADMIN:
      return false // only isSuperAdmin flag grants this
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
        // Agent-only pages: never for super admins
        if (capability === CAP.AGENT_ONLY) {
          return !isSuperAdmin && Number(rank) >= 1
        }
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
