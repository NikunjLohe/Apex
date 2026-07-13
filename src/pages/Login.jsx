import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import Logo from '../components/ui/Logo'

const friendly = (code) =>
  ({
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/invalid-email': 'That email looks invalid.',
    'auth/user-not-found': 'No account found.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  })[code] || `Login failed (${code || 'unknown error'})`

const ROUTE_CAPS = [
  ['/admin/overview', 'superAdmin'],
  ['/admin/all-reports', 'superAdmin'],
  ['/admin/logs', 'superAdmin'],
  ['/admin/members', 'admin'],
  ['/admin/branches', 'admin'],
  ['/admin/settings', 'admin'],
  ['/admin/policies', 'admin'],
  ['/admin/payouts', 'admin'],
  ['/admin/promotions', 'admin'],
  ['/admin/import', 'admin'],
  ['/admin/customers', 'admin'],
  ['/my-earnings', 'agentOnly'],
  ['/my-downline', 'agentOnly'],
  ['/cmd-awards', 'agentOnly'],
]

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { loginWithEmail } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { remember: true },
  })

  const submit = async ({ email, password, remember }) => {
    setIsSubmitting(true)
    const toastId = toast.loading('Authenticating security credentials...')
    try {
      const cred = await loginWithEmail(email.trim(), password, remember)
      
      // Perform security check to make sure redirect destination is allowed
      let allowed = true
      const targetPath = location.state?.from?.pathname
      if (targetPath) {
        const userDoc = await getDoc(doc(db, 'users', cred.user.uid))
        const userData = userDoc.exists() ? userDoc.data() : null
        const r = Number(userData?.rank) || 0
        const isSuper = Boolean(userData?.isSuperAdmin)
        
        const match = ROUTE_CAPS.find(([p]) => targetPath.startsWith(p))
        if (match) {
          const cap = match[1]
          if (cap === 'superAdmin') {
            allowed = isSuper
          } else if (cap === 'admin') {
            allowed = isSuper || (r >= 14 && r <= 18)
          } else if (cap === 'agentOnly') {
            allowed = !isSuper && r >= 1
          }
        }
      }

      toast.success('Access Granted. Welcome to Krantibhumi.', { id: toastId })
      navigate(allowed ? (targetPath || '/dashboard') : '/dashboard', { replace: true })
    } catch (e) {
      console.error('[Krantibhumi login error]', e)
      toast.error(friendly(e.code), { id: toastId })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-[#04281e] via-[#0b3c2e] to-[#04281e] p-4 sm:p-6 overflow-hidden">
      {/* Decorative Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      {/* Radial Premium Glows */}
      <div className="absolute -left-1/4 -top-1/4 h-[80%] w-[80%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute -right-1/4 -bottom-1/4 h-[80%] w-[80%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        {/* Logo and Branding header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <motion.div 
            initial={{ scale: 0.8, rotate: -5 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex items-center justify-center p-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-inner"
          >
            <Logo size={48} showText={false} />
          </motion.div>
          <h1 className="mt-3 text-2xl font-serif font-extrabold tracking-wide text-white">Krantibhumi</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">Branch Operations Portal</p>
        </div>

        {/* Login Form Container Card */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.3)] border border-emerald-950/10 overflow-hidden">
          {/* Card Accent Top Bar */}
          <div className="h-1.5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600" />
          
          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-serif font-bold text-gray-900">Sign In</h2>
              <p className="text-xs text-gray-500 mt-1">Enter your system credentials to access the secure portal.</p>
            </div>

            <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
              {/* Email Field */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-700 block">Email Address</label>
                <div className="relative group">
                  <input
                    type="email"
                    autoComplete="email"
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 text-gray-900 border border-gray-200 rounded-lg outline-none transition-all duration-300 focus:bg-white focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10 group-hover:border-gray-300"
                    placeholder="you@apex.local"
                    {...register('email', { required: 'Email address is required' })}
                  />
                </div>
                {errors.email && <p className="text-xs text-red-600 font-semibold">{errors.email.message}</p>}
              </div>

              {/* Password Field */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-700 block">Password</label>
                </div>
                <div className="relative group">
                  <input
                    type="password"
                    autoComplete="current-password"
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 text-gray-900 border border-gray-200 rounded-lg outline-none transition-all duration-300 focus:bg-white focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10 group-hover:border-gray-300"
                    placeholder="••••••••"
                    {...register('password', { required: 'Password is required' })}
                  />
                </div>
                {errors.password && <p className="text-xs text-red-600 font-semibold">{errors.password.message}</p>}
              </div>

              {/* Remember Me Toggle */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-700/25 accent-emerald-700" 
                    {...register('remember')} 
                  />
                  Remember my session
                </label>
              </div>

              {/* Submit Button */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={isSubmitting}
                className="relative w-full py-3 px-4 bg-gradient-to-r from-[#0a382b] to-[#04281e] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md hover:from-[#0d4737] hover:to-[#093528] active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none mt-2 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying Credentials...
                  </>
                ) : (
                  'Secure Login'
                )}
              </motion.button>
            </form>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-6 flex flex-col items-center space-y-2 text-[10px] text-emerald-300/40">
          <p className="text-center font-medium tracking-wide">SECURE 256-BIT ENCRYPTED CHANNEL</p>
          <p className="text-center">© {new Date().getFullYear()} Krantibhumi. All rights reserved.</p>
        </div>
      </motion.div>
    </div>
  )
}
