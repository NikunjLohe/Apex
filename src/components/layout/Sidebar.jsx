import { NavLink } from 'react-router-dom'
import { usePermission, CAP } from '../../hooks/usePermission'
import Logo from '../ui/Logo'
import {
  IDashboard, IUsers, ICash, IReport, IAlert, ICalendar,
  ITrophy, INetwork, IShield, IBuilding, ISettings, IDoc, IClock,
} from '../ui/icons'

// Each item: capability required to see it (null = everyone signed in).
const GROUPS = [
  {
    title: 'Operations',
    items: [
      { to: '/dashboard', label: 'Dashboard', Icon: IDashboard, cap: null, end: true },
      { to: '/customers', label: 'Customers', Icon: IUsers, cap: null },
      { to: '/plans/new', label: 'New RD/FD Plan', Icon: ICalendar, cap: CAP.ONBOARD },
      { to: '/payments/collect', label: 'Collect Payment', Icon: ICash, cap: CAP.COLLECT },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/reports/collections', label: 'Collections', Icon: IReport, cap: null },
      { to: '/reports/defaulters', label: 'Defaulters', Icon: IAlert, cap: null },
      { to: '/reports/maturities', label: 'Maturities', Icon: ICalendar, cap: null },
    ],
  },
  {
    title: 'My Earnings',
    items: [
      { to: '/my-earnings', label: 'My Dashboard', Icon: ITrophy, cap: null },
      { to: '/my-downline', label: 'My Downline', Icon: INetwork, cap: null },
      { to: '/cmd-awards', label: 'CMD Awards', Icon: IShield, cap: null },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/admin/members', label: 'Members', Icon: IUsers, cap: CAP.ADMIN },
      { to: '/admin/branches', label: 'Branches', Icon: IBuilding, cap: CAP.ADMIN },
      { to: '/admin/import', label: 'Import Data', Icon: IDoc, cap: CAP.ADMIN },
      { to: '/admin/settings', label: 'Settings', Icon: ISettings, cap: CAP.ADMIN },
    ],
  },
  {
    title: 'Super Admin',
    items: [
      { to: '/admin/overview', label: 'Overview', Icon: IDashboard, cap: CAP.SUPER_ADMIN },
      { to: '/admin/all-reports', label: 'All Reports', Icon: IDoc, cap: CAP.SUPER_ADMIN },
      { to: '/admin/logs', label: 'System Logs', Icon: IClock, cap: CAP.SUPER_ADMIN },
    ],
  },
]

function Item({ to, label, Icon, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-card py-2.5 text-sm font-medium transition-all ${
          isActive
            ? 'bg-[#EAE4D7] border-l-[3.5px] border-gold-1 pl-[9.5px] pr-3 text-gold-1 font-semibold'
            : 'text-ink-2 pl-3 pr-3 hover:bg-navy-4/30 hover:text-ink-1'
        }`
      }
    >
      <Icon size={19} />
      {label}
    </NavLink>
  )
}

export default function Sidebar({ onNavigate }) {
  const { can } = usePermission()
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => it.cap === null || can(it.cap)),
  })).filter((g) => g.items.length)

  return (
    <div className="flex h-full flex-col bg-navy-2 p-4">
      <Logo size={38} tagline className="mb-6 px-1" />
      <nav className="flex-1 space-y-5 overflow-y-auto scrollbar-none">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-ink-2/60">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <Item key={it.to} {...it} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  )
}
