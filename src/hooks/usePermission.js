// ============================================================================
// Permission helpers.
//   AGENT_ONLY  : rank 1–18 agents (not super admin)
//   RECRUIT     : rank 2–18 (can add members)
//   SUPER_ADMIN : isSuperAdmin flag only — all admin pages
// ============================================================================
import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'

export const CAP = {
  // Agents
  COLLECT:        'collect',
  ONBOARD:        'onboard',
  RECRUIT:        'recruit',
  AGENT_ONLY:     'agentOnly',
  // Shared (all authenticated)
  BRANCH_REPORTS: 'branchReports',
  MANAGE_DOWNLINE:'manageDownline',
  ZONE_REPORTS:   'zoneReports',
  // Super admin only
  ADMIN:          'admin',
  SUPER_ADMIN:    'superAdmin',
}

export function can(rank, isSuperAdmin, capability) {
  const r = Number(rank) || 0

  // Agent-only pages: must be rank 1–18 AND not a pure super admin account
  if (capability === CAP.AGENT_ONLY) {
    return !isSuperAdmin && r >= 1
  }

  // Super admin: unrestricted access to admin pages
  if (isSuperAdmin) return true

  // Rank-based agent capabilities
  switch (capability) {
    case CAP.RECRUIT:      return r >= 2 && r <= 18
    case CAP.ONBOARD:      return r >= 1 && r <= 18
    case CAP.COLLECT:      return r >= 1 && r <= 18
    case CAP.BRANCH_REPORTS:
    case CAP.MANAGE_DOWNLINE:
    case CAP.ZONE_REPORTS: return r >= 1 && r <= 18
    // Admin pages — Super Admin only
    case CAP.ADMIN:
    case CAP.SUPER_ADMIN:  return false
    default:               return false
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
