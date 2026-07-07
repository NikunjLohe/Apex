import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import Logo from './ui/Logo'

function FullLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse">
        <Logo size={48} tagline />
      </div>
    </div>
  )
}

/** Requires authentication; optionally a capability. */
export function Protected({ children, capability, ignorePasswordForce }) {
  const { isAuthenticated, authLoading, profileLoading, profile } = useAuth()
  const { can } = usePermission()
  const location = useLocation()

  if (authLoading || (isAuthenticated && (profileLoading || !profile))) return <FullLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (!ignorePasswordForce && profile?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  if (capability && !can(capability)) return <Navigate to="/unauthorized" replace />
  return children
}

/** Auth pages — bounce signed-in users to the dashboard. */
export function PublicOnly({ children }) {
  const { isAuthenticated, authLoading } = useAuth()
  if (authLoading) return <FullLoader />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return children
}
