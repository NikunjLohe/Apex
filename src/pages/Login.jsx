import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/ui/Logo'

const friendly = (code) =>
  ({
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/invalid-email': 'That email looks invalid.',
    'auth/user-not-found': 'No account found.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/invalid-verification-code': 'That OTP is incorrect.',
    'auth/code-expired': 'OTP expired. Request a new one.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  })[code] || `Login failed (${code || 'unknown error'})`

const toE164 = (raw) => {
  const d = String(raw).replace(/\D/g, '')
  if (d.length === 10) return `+91${d}`
  if (d.length === 12 && d.startsWith('91')) return `+${d}`
  return ''
}

export default function Login() {
  const [mode, setMode] = useState('email')
  const navigate = useNavigate()
  const location = useLocation()
  const redirect = () => navigate(location.state?.from?.pathname || '/dashboard', { replace: true })

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-1 p-5">
      <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-gold-1/5 blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={56} showText={false} />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink-1">APEX</h1>
          <p className="text-sm font-medium uppercase tracking-widest text-gold">Performance Portal</p>
        </div>

        <div className="card p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-card border border-navy-4 bg-navy-2 p-1">
            {[
              { id: 'email', label: 'Email' },
              { id: 'phone', label: 'Phone OTP' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className={`relative rounded-md py-2 text-sm font-semibold transition-colors ${
                  mode === t.id ? 'text-navy-1' : 'text-ink-2 hover:text-ink-1'
                }`}
              >
                {mode === t.id && <motion.span layoutId="login-tab" className="absolute inset-0 rounded-md bg-gold-1" />}
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {mode === 'email' ? (
              <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <EmailForm onSuccess={redirect} />
              </motion.div>
            ) : (
              <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <PhoneForm onSuccess={redirect} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-5 text-center text-xs text-ink-2">Secure branch operations portal · APEX</p>
      </motion.div>
    </div>
  )
}

function EmailForm({ onSuccess }) {
  const { loginWithEmail } = useAuth()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { remember: true },
  })

  const submit = async ({ email, password, remember }) => {
    try {
      await loginWithEmail(email.trim(), password, remember)
      toast.success('Signed in')
      onSuccess()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[APEX login error]', e)
      toast.error(friendly(e.code))
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div>
        <label className="label">Email address</label>
        <input
          type="email"
          autoComplete="email"
          className="field"
          placeholder="you@apex.com"
          {...register('email', { required: 'Email is required' })}
        />
        {errors.email && <p className="err">{errors.email.message}</p>}
      </div>
      <div>
        <label className="label">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          className="field"
          placeholder="••••••••"
          {...register('password', { required: 'Password is required' })}
        />
        {errors.password && <p className="err">{errors.password.message}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="accent-gold-1" {...register('remember')} />
        Remember me
      </label>
      <button type="submit" disabled={isSubmitting} className="btn-gold w-full">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

function PhoneForm({ onSuccess }) {
  const { setupRecaptcha, sendOtp } = useAuth()
  const [confirmation, setConfirmation] = useState(null)
  const [sentTo, setSentTo] = useState('')
  const phoneForm = useForm()
  const otpForm = useForm()

  const request = async ({ phone }) => {
    const e164 = toE164(phone)
    if (!e164) return toast.error('Enter a valid 10-digit mobile number')
    try {
      const verifier = setupRecaptcha('recaptcha')
      const res = await sendOtp(e164, verifier)
      setConfirmation(res)
      setSentTo(e164)
      toast.success(`OTP sent to ${e164}`)
    } catch (e) {
      toast.error(friendly(e.code))
      if (window.__recaptcha) { window.__recaptcha.clear?.(); window.__recaptcha = null }
    }
  }

  const verify = async ({ otp }) => {
    try {
      await confirmation.confirm(otp)
      toast.success('Signed in')
      onSuccess()
    } catch (e) {
      toast.error(friendly(e.code))
    }
  }

  return (
    <div>
      {!confirmation ? (
        <form onSubmit={phoneForm.handleSubmit(request)} className="space-y-4" noValidate>
          <div>
            <label className="label">Mobile number</label>
            <div className="flex">
              <span className="flex items-center rounded-l-card border border-r-0 border-navy-4 bg-navy-2 px-3 text-sm text-ink-2">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                className="field rounded-l-none"
                placeholder="98765 43210"
                {...phoneForm.register('phone', { required: 'Mobile number is required' })}
              />
            </div>
            {phoneForm.formState.errors.phone && <p className="err">{phoneForm.formState.errors.phone.message}</p>}
          </div>
          <button type="submit" disabled={phoneForm.formState.isSubmitting} className="btn-gold w-full">
            {phoneForm.formState.isSubmitting ? 'Sending OTP…' : 'Send OTP'}
          </button>
        </form>
      ) : (
        <form onSubmit={otpForm.handleSubmit(verify)} className="space-y-4" noValidate>
          <div>
            <label className="label">Enter OTP</label>
            <p className="mb-2 text-xs text-ink-2">Sent to {sentTo}</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="field tracking-[0.5em]"
              placeholder="6-digit code"
              {...otpForm.register('otp', { required: 'OTP is required', minLength: { value: 6, message: '6 digits' } })}
            />
            {otpForm.formState.errors.otp && <p className="err">{otpForm.formState.errors.otp.message}</p>}
          </div>
          <button type="submit" disabled={otpForm.formState.isSubmitting} className="btn-gold w-full">
            {otpForm.formState.isSubmitting ? 'Verifying…' : 'Verify & sign in'}
          </button>
          <button type="button" onClick={() => { setConfirmation(null); setSentTo('') }} className="w-full text-center text-sm text-ink-2 hover:text-gold">
            ← Use a different number
          </button>
        </form>
      )}
      <div id="recaptcha" />
    </div>
  )
}
