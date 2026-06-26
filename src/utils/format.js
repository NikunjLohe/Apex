// Indian number formatting + date helpers
import { format, differenceInDays } from 'date-fns'

const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatINR(value, decimals = false) {
  const n = Number(value) || 0
  return `₹${decimals ? inr2.format(n) : inr0.format(Math.round(n))}`
}

export function formatNumber(value) {
  return inr0.format(Number(value) || 0)
}

export function formatCompactINR(value) {
  const n = Number(value) || 0
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(2).replace(/\.00$/, '')} L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(1).replace(/\.0$/, '')} K`
  return `₹${n}`
}

/** Convert Firestore Timestamp | Date | string | number to a JS Date (or null). */
export function toDate(value) {
  if (!value) return null
  if (value?.toDate) return value.toDate()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtDate(value, fmt = 'dd MMM yyyy') {
  const d = toDate(value)
  return d ? format(d, fmt) : '—'
}

export function fmtDateTime(value) {
  return fmtDate(value, "dd MMM yyyy, hh:mm a")
}

export function daysBetween(a, b) {
  const da = toDate(a)
  const dbb = toDate(b)
  if (!da || !dbb) return 0
  return differenceInDays(da, dbb)
}
