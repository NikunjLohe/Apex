import { Link } from 'react-router-dom'
import { IShield } from '../../components/ui/icons'

export default function Unauthorized() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger border border-danger/25">
        <IShield size={32} />
      </span>
      <h1 className="font-serif text-3xl font-extrabold text-ink-1 tracking-tight">403 — Access Denied</h1>
      <p className="max-w-md text-sm text-ink-2 leading-relaxed">
        You do not have the required authorization rank to access this operational segment. Contact system administration if this is an error.
      </p>
      <Link to="/dashboard" className="btn-gold px-6 py-2.5 text-xs font-bold uppercase tracking-wider mt-2">
        Return to Dashboard
      </Link>
    </div>
  )
}
