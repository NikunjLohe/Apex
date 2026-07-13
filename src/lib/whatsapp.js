// WhatsApp share helpers.
import { formatINR, fmtDate } from '../utils/format'

/** Open WhatsApp with an arbitrary message (optionally to a phone). */
export function shareWhatsApp(message, phone) {
  const text = encodeURIComponent(message)
  const num = phone ? String(phone).replace(/\D/g, '') : ''
  const to = num ? (num.length === 10 ? `91${num}` : num) : ''
  window.open(`https://wa.me/${to}?text=${text}`, '_blank')
}

export function receiptMessage({ name, amount, planAccount, receiptNumber, branch }) {
  return `Apex Multisolutions Receipt ${receiptNumber}\nDear ${name}, we have received your installment of ${formatINR(amount)} for plan ${planAccount}.\nThank you for banking with Apex Multisolutions${branch ? ` – ${branch}` : ''}.`
}

export function reminderMessage({ name, amount, planAccount, dueDate, agentName, agentPhone }) {
  return `Dear ${name}, your Apex Multisolutions installment of ${formatINR(amount)} for plan ${planAccount} was due on ${fmtDate(dueDate)}. Please visit your nearest branch or contact your agent ${agentName || ''}${agentPhone ? ` at ${agentPhone}` : ''}. Thank you.`
}
