import { NavLink } from 'react-router-dom'
import { usePermission, CAP } from '../../hooks/usePermission'
import Logo from '../ui/Logo'
import {
  IDashboard, IUsers, ICash, IReport, IAlert, ICalendar,
  ITrophy, INetwork, IShield, IBuilding, ISettings, IDoc, IClock,
} from '../ui/icons'

// ─── Navigation definition ───────────────────────────────────────────────────
// cap: null means any authenticated user
// cap: CAP.AGENT_ONLY means rank 1-18 agents only (NOT super admin / admin-only accounts)
// cap: CAP.ADMIN means rank 14+ or super admin
// cap: CAP.SUPER_ADMIN means only isSuperAdmin flag accounts
//
// Role → visible groups:
//   Agent (rank 1–9)          → Operations, Reports, My Earnings
//   Branch Manager (rank 10–13)→ Operations, Reports, My Earnings
//   Admin (rank 14–17)        → Operations, Reports, My Earnings, Admin
//   Super Admin               → Operations, Reports, Admin, Super Admin
//   (Super Admin never sees My Earnings — they have no personal agent records)

const GROUPS = [
  {
    title: 'Operations',
    items: [
      { to: '/dashboard',         label: 'Dashboard',       Icon: IDashboard, cap: null,           end: true },
      { to: '/customers',         label: 'Customers',       Icon: IUsers,     cap: null },
      { to: '/payments/collect',  label: 'Collect Payment', Icon: ICash,      cap: CAP.COLLECT },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/reports/collections', label: 'Collections', Icon: IReport,   cap: null },
      { to: '/reports/defaulters',  label: 'Defaulters',  Icon: IAlert,    cap: null },
      { to: '/reports/maturities',  label: 'Maturities',  Icon: ICalendar, cap: null },
    ],
  },
  {
    // "My Earnings" section — only visible to actual agent accounts (not pure Super Admin)
    title: 'My Earnings',
    sectionCap: CAP.AGENT_ONLY, // hide entire section when user cannot pass this check
    items: [
      { to: '/my-earnings', label: 'My Dashboard', Icon: ITrophy,  cap: CAP.AGENT_ONLY },
      { to: '/my-downline', label: 'My Downline',  Icon: INetwork, cap: CAP.AGENT_ONLY },
      { to: '/cmd-awards',  label: 'CMD Awards',   Icon: IShield,  cap: CAP.AGENT_ONLY },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/admin/members',     label: 'Members',          Icon: IUsers,    cap: CAP.ADMIN },
      { to: '/admin/branches',    label: 'Branches',         Icon: IBuilding, cap: CAP.ADMIN },
      { to: '/admin/customers',   label: 'Customers',        Icon: IUsers,    cap: CAP.ADMIN },
      { to: '/admin/policies',    label: 'Policies',         Icon: IDoc,      cap: CAP.ADMIN },
      { to: '/admin/import',      label: 'Import Center',    Icon: IDoc,      cap: CAP.ADMIN },
      { to: '/admin/payouts',     label: 'Payout Engine',    Icon: ICash,     cap: CAP.ADMIN },
      { to: '/admin/promotions',  label: 'Promotion Engine', Icon: ITrophy,   cap: CAP.ADMIN },
      { to: '/admin/settings',    label: 'Settings',         Icon: ISettings, cap: CAP.ADMIN },
    ],
  },
  {
    title: 'Super Admin',
    items: [
      { to: '/admin/overview',     label: 'Overview',      Icon: IBuilding, cap: CAP.SUPER_ADMIN },
      { to: '/admin/all-reports',  label: 'All Reports',   Icon: IReport,   cap: CAP.SUPER_ADMIN },
      { to: '/admin/system-logs',  label: 'System Logs',   Icon: IClock,    cap: CAP.SUPER_ADMIN },
      { to: '/admin/seed',         label: 'Seed Demo Data',Icon: IAlert,    cap: CAP.ADMIN },
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

  const groups = GROUPS
    // Filter items within each group
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => it.cap === null || can(it.cap)),
    }))
    // Hide entire group if it has a sectionCap the user doesn't pass
    .filter((g) => {
      if (g.sectionCap && !can(g.sectionCap)) return false
      return g.items.length > 0
    })

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
