import { Link } from 'react-router-dom'
import { IAlert } from '../../components/ui/icons'

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-1/10 text-gold-1 border border-gold-1/25 animate-bounce">
        <IAlert size={32} />
      </span>
      <h1 className="font-serif text-3xl font-extrabold text-ink-1 tracking-tight">404 — Page Not Found</h1>
      <p className="max-w-md text-sm text-ink-2 leading-relaxed">
        The workspace path you are looking for does not exist or has been relocated.
      </p>
      <Link to="/dashboard" className="btn-gold px-6 py-2.5 text-xs font-bold uppercase tracking-wider mt-2">
        Return to Dashboard
      </Link>
    </div>
  )
}
