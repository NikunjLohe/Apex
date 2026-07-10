import { NavLink } from 'react-router-dom'
import { usePermission, CAP } from '../../hooks/usePermission'
import Logo from '../ui/Logo'
import {
  IDashboard, IUsers, ICash, IReport, IAlert, ICalendar,
  ITrophy, INetwork, IShield, IBuilding, ISettings, IDoc, IClock,
} from '../ui/icons'

// ─── Agent navigation (Rank 1–18, same for all) ─────────────────────────────
const AGENT_GROUPS = [
  {
    title: 'My Portal',
    items: [
      { to: '/dashboard',     label: 'Dashboard',     Icon: IDashboard, cap: null,           end: true },
      { to: '/my-earnings',   label: 'My Earnings',   Icon: ITrophy,    cap: CAP.AGENT_ONLY },
      { to: '/my-downline',   label: 'My Downline',   Icon: INetwork,   cap: CAP.AGENT_ONLY },
      { to: '/cmd-awards',    label: 'CMD Awards',    Icon: IShield,    cap: CAP.AGENT_ONLY },
    ],
  },
  {
    title: 'Customers',
    items: [
      { to: '/customers',          label: 'My Customers', Icon: IUsers, cap: null },
      { to: '/reports/collections', label: 'Collections',  Icon: IReport, cap: null },
    ],
  },
]

// ─── Super Admin navigation ───────────────────────────────────────────────────
const ADMIN_GROUPS = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard',         label: 'Dashboard',       Icon: IDashboard, cap: null,              end: true },
      { to: '/admin/overview',    label: 'Overview',        Icon: IBuilding,  cap: CAP.SUPER_ADMIN },
      { to: '/admin/all-reports', label: 'All Reports',     Icon: IReport,    cap: CAP.SUPER_ADMIN },
    ],
  },
  {
    title: 'Management',
    items: [
      { to: '/admin/members',    label: 'Members',       Icon: IUsers,    cap: CAP.SUPER_ADMIN },
      { to: '/admin/branches',   label: 'Branches',      Icon: IBuilding, cap: CAP.SUPER_ADMIN },
      { to: '/admin/customers',  label: 'Customers',     Icon: IUsers,    cap: CAP.SUPER_ADMIN },
      { to: '/admin/policies',   label: 'Policies',      Icon: IDoc,      cap: CAP.SUPER_ADMIN },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/import',     label: 'New Business',   Icon: IDoc,    cap: CAP.SUPER_ADMIN },
      { to: '/admin/payment-import', label: 'Payment Engine', Icon: ICash, cap: CAP.SUPER_ADMIN },
      { to: '/admin/payouts',    label: 'Payout Engine',  Icon: ICash,   cap: CAP.SUPER_ADMIN },
      { to: '/admin/promotions', label: 'Promotion Engine', Icon: ITrophy, cap: CAP.SUPER_ADMIN },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/settings', label: 'Settings',      Icon: ISettings, cap: CAP.SUPER_ADMIN },
      { to: '/admin/logs',     label: 'System Logs',   Icon: IClock,    cap: CAP.SUPER_ADMIN },
      { to: '/admin/seed',     label: 'Seed Demo Data', Icon: IAlert,    cap: CAP.SUPER_ADMIN },
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
  const { can, isSuperAdmin } = usePermission()

  const groups = isSuperAdmin ? ADMIN_GROUPS : AGENT_GROUPS

  const filteredGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => it.cap === null || can(it.cap)),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="flex h-full flex-col bg-navy-2 p-4">
      <Logo size={38} tagline className="mb-6 px-1" />
      <nav className="flex-1 space-y-5 overflow-y-auto scrollbar-none">
        {filteredGroups.map((g) => (
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
