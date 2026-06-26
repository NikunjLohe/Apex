// Lightweight inline stroke icons (currentColor).
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
function S({ children, size = 20, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...base}>
      {children}
    </svg>
  )
}
export const IDashboard = (p) => (<S {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></S>)
export const IUsers = (p) => (<S {...p}><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0"/><path d="M16 5.5a3 3 0 010 5.8M18 20a6 6 0 00-3-5.2"/></S>)
export const ICash = (p) => (<S {...p}><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5h.01M18 14.5h.01"/></S>)
export const IReport = (p) => (<S {...p}><path d="M4 4v16h16"/><rect x="7" y="11" width="3" height="6" rx="0.5"/><rect x="12" y="7" width="3" height="10" rx="0.5"/><rect x="17" y="13" width="3" height="4" rx="0.5"/></S>)
export const IAlert = (p) => (<S {...p}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></S>)
export const ICalendar = (p) => (<S {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></S>)
export const ITrophy = (p) => (<S {...p}><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z"/><path d="M7 5H4v2a3 3 0 003 3M17 5h3v2a3 3 0 01-3 3"/></S>)
export const INetwork = (p) => (<S {...p}><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5L6 16.5M12 11.5l6 5"/></S>)
export const IBuilding = (p) => (<S {...p}><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h6v6"/></S>)
export const ISettings = (p) => (<S {...p}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 00-1.7-1L14.5 2h-5l-.3 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 000 2l-2 1.5 2 3.5 2.4-1a7 7 0 001.7 1l.3 2.5h5l.3-2.5a7 7 0 001.7-1l2.4 1 2-3.5-2-1.5a7 7 0 00.1-1z"/></S>)
export const IShield = (p) => (<S {...p}><path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z"/></S>)
export const IBell = (p) => (<S {...p}><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></S>)
export const ILogout = (p) => (<S {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></S>)
export const ISearch = (p) => (<S {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></S>)
export const IPlus = (p) => (<S {...p}><path d="M12 5v14M5 12h14"/></S>)
export const IChevron = (p) => (<S {...p}><path d="M9 6l6 6-6 6"/></S>)
export const IChevronDown = (p) => (<S {...p}><path d="M6 9l6 6 6-6"/></S>)
export const IClose = (p) => (<S {...p}><path d="M6 6l12 12M18 6L6 18"/></S>)
export const IMenu = (p) => (<S {...p}><path d="M4 6h16M4 12h16M4 18h16"/></S>)
export const ICheck = (p) => (<S {...p}><path d="M5 12l5 5L20 6"/></S>)
export const IDownload = (p) => (<S {...p}><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></S>)
export const IPrint = (p) => (<S {...p}><path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></S>)
export const IWhatsapp = (p) => (<S {...p}><path d="M3 21l1.8-5A8 8 0 1112 20a8 8 0 01-4-1L3 21z"/><path d="M9 9.5c.5 2 2.5 4 4.5 4.5l1-1.2 2 .8M9.2 9.2l.6-1.4"/></S>)
export const IDoc = (p) => (<S {...p}><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4M9 13h6M9 17h6"/></S>)
export const IClock = (p) => (<S {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></S>)
export const IPhone = (p) => (<S {...p}><path d="M5 3h4l1 5-2.5 1.5a11 11 0 005 5L18 12l5 1v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/></S>)
export const IEdit = (p) => (<S {...p}><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></S>)
