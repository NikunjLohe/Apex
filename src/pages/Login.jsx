import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
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
      let loginEmail = email.trim()

      if (!loginEmail.includes('@')) {
        const q = query(collection(db, 'users'), where('sponsorCode', '==', loginEmail.toUpperCase()))
        const snapshot = await getDocs(q)
        if (snapshot.empty) {
          throw { code: 'auth/user-not-found', customMessage: 'Invalid Agent Code. Please check your Agent Code or contact your administrator.' }
        }
        loginEmail = snapshot.docs[0].data().email
      }

      const cred = await loginWithEmail(loginEmail, password, remember)
      
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

      toast.success('Access Granted. Welcome to Apex Multisolutions.', { id: toastId })
      navigate(allowed ? (targetPath || '/dashboard') : '/dashboard', { replace: true })
    } catch (e) {
      console.error('[Apex Multisolutions login error]', e)
      toast.error(e.customMessage || friendly(e.code), { id: toastId })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-between bg-gradient-to-br from-[#021812] via-[#052e22] to-[#021812] p-4 sm:p-6 overflow-hidden font-sans">
      {/* Decorative Financial Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      
      {/* Radial Premium Glows */}
      <div className="absolute -left-1/4 -top-1/4 h-[80%] w-[80%] rounded-full bg-emerald-500/5 blur-[140px] pointer-events-none" />
      <div className="absolute -right-1/4 -bottom-1/4 h-[80%] w-[80%] rounded-full bg-emerald-500/5 blur-[140px] pointer-events-none" />

      {/* Spacer to push content down */}
      <div className="flex-1 flex items-center justify-center w-full">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative w-full max-w-[420px] py-8"
        >
          {/* Logo and Branding header with subtle glow */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative">
              {/* Backglow element */}
              <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-xl scale-125" />
              <motion.div 
                initial={{ scale: 0.8, rotate: -3 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="relative flex items-center justify-center p-4 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-lg"
              >
                <Logo size={46} showText={false} />
              </motion.div>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-wide text-white font-serif">
              Apex Multisolutions
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#e8b84b] mt-1">
              Performance Portal
            </p>
          </div>

          {/* Login Form Container Card */}
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] border border-emerald-950/10 overflow-hidden relative">
            {/* Card Accent Top Bar - Gold Accent line */}
            <div className="h-[3px] bg-gradient-to-r from-[#8D7952] via-[#E5C66A] to-[#8D7952]" />
            
            <div className="p-6 sm:p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Sign In</h2>
                <p className="text-xs text-gray-500 mt-1 max-w-[280px] mx-auto">
                  Access the Apex Performance & Reward management portal.
                </p>
              </div>

              <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
                {/* Email Field */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Agent Code or Admin Email</label>
                  <div className="relative flex items-center bg-[#FAF8F5] border border-gray-200 rounded-lg transition-all duration-200 focus-within:border-[#8D7952] focus-within:ring-2 focus-within:ring-[#8D7952]/15">
                    <span className="pl-3 text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0l-7.5-4.615a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      autoComplete="username"
                      className="w-full px-3 py-2.5 text-sm bg-transparent text-gray-900 border-none outline-none focus:ring-0 placeholder-gray-400"
                      placeholder="KB000001 or admin@apex.com"
                      {...register('email', { required: 'Agent Code or Admin Email is required' })}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-600 font-semibold">{errors.email.message}</p>}
                </div>

                {/* Password Field */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Password</label>
                  <div className="relative flex items-center bg-[#FAF8F5] border border-gray-200 rounded-lg transition-all duration-200 focus-within:border-[#8D7952] focus-within:ring-2 focus-within:ring-[#8D7952]/15">
                    <span className="pl-3 text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    </span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      className="w-full px-3 py-2.5 text-sm bg-transparent text-gray-900 border-none outline-none focus:ring-0 placeholder-gray-400"
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
                      className="h-4 w-4 rounded border-gray-300 text-[#132E22] focus:ring-[#132E22]/20 accent-[#132E22]" 
                      {...register('remember')} 
                    />
                    Remember my session
                  </label>
                </div>

                {/* Submit Button */}
                <motion.button
                  whileHover={{ translateY: -1 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  disabled={isSubmitting}
                  className="relative w-full py-3 px-4 bg-gradient-to-r from-[#132E22] to-[#0A1D15] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md hover:from-[#1b4231] hover:to-[#0f2b1f] active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none mt-2 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Verifying Security Credentials...
                    </>
                  ) : (
                    'Secure Login'
                  )}
                </motion.button>
              </form>

              {/* Trust Indicators */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-center gap-4 text-[10px] text-gray-400 font-medium">
                <span className="flex items-center gap-1">
                  🛡️ SSL Secured
                </span>
                <span className="text-gray-200">•</span>
                <span className="flex items-center gap-1">
                  🔒 256-bit Encryption
                </span>
                <span className="text-gray-200">•</span>
                <span className="flex items-center gap-1">
                  🔑 Secure Access
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Elegant, clean Footer */}
      <footer className="w-full max-w-7xl mx-auto py-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left text-[11px] text-emerald-300/40">
        <p className="font-medium tracking-wide">
          SECURE 256-BIT ENCRYPTED CHANNEL
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3">
          <p>
            &copy; 2026{' '}
            <a
              href="https://fyndevs.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#e8b84b] hover:underline hover:text-white transition-colors"
            >
              Fyndevs
            </a>{' '}
            Technologies. All Rights Reserved.
          </p>
          <span className="hidden sm:inline text-white/10">|</span>
          <p>
            Designed &amp; Developed by{' '}
            <a
              href="https://fyndevs.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#e8b84b] hover:underline hover:text-white transition-colors"
            >
              Fyndevs
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
