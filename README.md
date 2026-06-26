# APEX — Branch Operations Portal

A production web app for a non-banking chit-fund / RD-FD savings company. Branch
employees onboard customers (KYC), enroll them in RD/FD plans, collect payments,
generate receipts & passbooks, track defaulters and maturities, and report to
super admin. Members also see their own earnings (MDA, MFA, PB, TA, FD, CMD award).

## Stack
React 18 + Vite · Tailwind (dark navy + gold) · Firebase v9 (Auth, Firestore,
Storage, Functions) · React Router v6 · React Hook Form + Zod · jsPDF + html2canvas
· date-fns · react-hot-toast.

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```
Firebase credentials are read from `.env.local` (already configured).

## Modules
1. Auth + layout (sidebar/topbar, role-filtered nav, login email + phone OTP)
2. Customers — list (search/filter/paginate), KYC onboarding form, profile (tabs)
3. Plan enrollment — RD/FD with live maturity preview
4. Payment collection — 3-step flow + receipt (PDF + WhatsApp)
5. Passbook — full installment schedule, progress ring, PDF
6. Reports — collections, defaulters (WhatsApp reminders), maturities
7. My earnings — rank, MDA/MFA/PB/TA/FD, CMD award progress
8. Admin — members (Auth + Firestore), branches, super-admin overview, settings,
   all reports, system logs

## Roles (rank 1–18 + isSuperAdmin)
- 1–9: onboard customers, collect payments, view own data
- 10–13: branch reports, downline
- 14–17: zone/admin (members, branches, settings)
- 18 / isSuperAdmin: full access (overview, all reports, logs)

## Firestore setup
Collections are created on first write. Add the composite index from
`firestore.indexes.json` (plans: customerId + status) — or click the link Firebase
shows in the console the first time the payment screen queries active plans.

Deploy rules/indexes:
```bash
firebase deploy --only firestore:rules,storage:rules,firestore:indexes
```

### First login
There is no public sign-up (staff accounts are admin-created). Bootstrap your first
super-admin:
1. Firebase Console → Authentication → add a user (email/password)
2. Firestore → create `users/{uid}` with:
   `{ name, email, phone, rank: 18, isSuperAdmin: true, status: "active" }`
3. Log in — you now have full access and can add members from `/admin/members`.

Auto-generated IDs use atomic counters in `/counters` (`customers`, `plans`,
`receipts`). They self-initialize on first use.

## Notes
- All amounts use Indian formatting (₹1,00,000).
- Mobile responsive: sidebar collapses to a drawer; bottom-safe padding for counters.
- Realtime dashboards via `onSnapshot`; reports filter client-side to avoid extra indexes.
- New members are provisioned via a secondary Firebase app so the admin stays logged in;
  a temporary password is shown once on creation.
