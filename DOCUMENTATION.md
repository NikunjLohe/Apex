# APEX Branch Operations System
## Complete Software Documentation

**Version:** 1.0.0  
**Stack:** React 18 + Vite + Firebase (Firestore, Auth, Storage)  
**Production URL:** https://apex-branch-ops.vercel.app  
**Deployment Platform:** Vercel

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Folder Structure](#2-folder-structure)
3. [Environment Variables](#3-environment-variables)
4. [Third-Party Integrations](#4-third-party-integrations)
5. [User Roles & Permissions](#5-user-roles--permissions)
6. [Application Modules](#6-application-modules)
7. [All Pages & Routes](#7-all-pages--routes)
8. [Database Collections](#8-database-collections)
9. [Collection Relationships](#9-collection-relationships)
10. [Business Rules](#10-business-rules)
11. [Commission Rules](#11-commission-rules)
12. [Promotion Rules](#12-promotion-rules)
13. [Excel Import Process](#13-excel-import-process)
14. [Workflows](#14-workflows)
15. [Security Features](#15-security-features)
16. [Performance Optimizations](#16-performance-optimizations)
17. [API Structure](#17-api-structure)
18. [Deployment Steps](#18-deployment-steps)
19. [Future Improvements](#19-future-improvements)

---

## 1. Project Overview

APEX Branch Operations is a **multi-role financial services management platform** for insurance/savings plan organizations. It manages agents, customers, savings policies, commission payouts, promotion eligibility, genealogy network visualization, and comprehensive reporting.

### Core Capabilities
- Multi-level agent hierarchy management (18 ranks)
- Customer onboarding with KYC data capture
- RD (Recurring Deposit) and FD (Fixed Deposit) policy management
- Automated commission calculation on policy enrollment and payments
- Monthly payout processing
- Excel-based bulk data import with validation
- Real-time genealogy tree visualization (lazy-loaded for 10,000+ agents)
- Role-based access control across all modules
- Pre-calculated dashboard summaries for production-scale performance

---

## 2. Folder Structure

```
Apex/
├── public/
├── src/
│   ├── App.jsx                     # Root router — all routes defined here
│   ├── main.jsx                    # React entry point
│   ├── firebase.js                 # Firebase SDK initialization
│   ├── index.css                   # Global design tokens & utility classes
│   │
│   ├── contexts/
│   │   ├── AuthContext.jsx         # Authenticated user state & session
│   │   └── RanksContext.jsx        # Dynamic rank configuration stream
│   │
│   ├── hooks/
│   │   ├── useFirestore.js         # useDoc, useCollection, fetchCollection
│   │   └── usePermission.js        # Capability checks per role
│   │
│   ├── lib/
│   │   ├── admin.js                # createMember, createBranch, updateMember
│   │   ├── calc.js                 # computePlan, buildSchedule (pure functions)
│   │   ├── customers.js            # createCustomer, updateCustomer
│   │   ├── earnings.js             # computeEarnings (MDA, MFA, TA, PB, CMD)
│   │   ├── ids.js                  # generatePlanAccountNumber, generateReceiptNumber
│   │   ├── payments.js             # recordPayment (atomic Firestore transaction)
│   │   ├── pdf.js                  # Receipt PDF generation (jsPDF)
│   │   ├── plans.js                # createPlan (enrollment)
│   │   ├── schemas.js              # Zod validation schemas
│   │   ├── storage.js              # Firebase Storage upload helpers
│   │   ├── summary.js              # updateDashboardSummary (pre-aggregation)
│   │   └── whatsapp.js             # WhatsApp deep-link message builders
│   │
│   ├── data/
│   │   ├── compensation.js         # MDA, FD, MFA, TA, PB, CMD tables (defaults)
│   │   └── ranks.js                # 18-rank ladder definitions (defaults)
│   │
│   ├── utils/
│   │   └── format.js               # formatINR, fmtDate, toDate, daysBetween
│   │
│   ├── components/
│   │   ├── AgentProfileCompletionModal.jsx
│   │   ├── ErrorBoundary.jsx
│   │   ├── RouteGuards.jsx          # Protected, PublicOnly route wrappers
│   │   ├── layout/
│   │   │   └── Layout.jsx           # App shell: sidebar + topbar + outlet
│   │   └── ui/
│   │       ├── ConfirmDialog.jsx
│   │       ├── EmptyState.jsx
│   │       ├── GenealogyTree.jsx    # Lazy-loaded network tree visualizer
│   │       ├── LoadingSkeleton.jsx
│   │       ├── Logo.jsx
│   │       ├── RankBadge.jsx
│   │       ├── StatusBadge.jsx
│   │       └── icons.jsx
│   │
│   └── pages/
│       ├── Login.jsx
│       ├── Dashboard.jsx
│       ├── ChangePassword.jsx
│       ├── customers/
│       │   ├── CustomerList.jsx
│       │   ├── CustomerNew.jsx
│       │   └── CustomerProfile.jsx
│       ├── plans/
│       │   ├── PlanEnroll.jsx
│       │   ├── PlanStart.jsx
│       │   └── Passbook.jsx
│       ├── payments/
│       │   ├── CollectPayment.jsx
│       │   └── Receipt.jsx
│       ├── reports/
│       │   ├── Collections.jsx
│       │   ├── Defaulters.jsx
│       │   └── Maturities.jsx
│       ├── earnings/
│       │   ├── MyEarnings.jsx
│       │   ├── MyDownline.jsx
│       │   └── CmdAwards.jsx
│       ├── errors/
│       │   ├── NotFound.jsx
│       │   └── Unauthorized.jsx
│       └── admin/
│           ├── AllReports.jsx
│           ├── BranchDetail.jsx
│           ├── Branches.jsx
│           ├── CustomerDetail.jsx
│           ├── Customers.jsx
│           ├── ImportData.jsx
│           ├── ImportHistory.jsx
│           ├── MemberDetail.jsx
│           ├── Members.jsx
│           ├── Overview.jsx
│           ├── Payouts.jsx
│           ├── Policies.jsx
│           ├── PolicyDetail.jsx
│           ├── Promotions.jsx
│           ├── Settings.jsx
│           └── SystemLogs.jsx
│
├── DOCUMENTATION.md                 # This file
├── .env.local                       # Firebase credentials (never commit)
├── package.json
├── vite.config.js
└── vercel.json                      # Vercel SPA rewrite rules
```

---

## 3. Environment Variables

Create a `.env.local` file in the project root. **Never commit this file to version control.**

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

> All variables must be prefixed with `VITE_` to be exposed to the browser bundle by Vite.
> Set identical variables in the Vercel project's Environment Variables panel for production.

---

## 4. Third-Party Integrations

| Integration | Package | Purpose |
|---|---|---|
| Firebase Auth | `firebase/auth` | Email/password authentication, session management |
| Firestore | `firebase/firestore` | Real-time NoSQL database for all collections |
| Firebase Storage | `firebase/storage` | KYC document file uploads |
| Firebase Functions | `firebase/functions` | (SDK initialized, reserved for future use) |
| React Router v6 | `react-router-dom` | Client-side SPA routing with lazy loading |
| React Hook Form | `react-hook-form` | Performant form state management |
| Zod | `zod` | Runtime form validation schemas |
| Recharts | `recharts` | Bar charts on dashboard and reports |
| xlsx | `xlsx` | Excel (.xlsx) file parsing for bulk import |
| date-fns | `date-fns` | Date arithmetic (maturity, schedules, due dates) |
| jsPDF | `jspdf` | Receipt PDF generation |
| html2canvas | `html2canvas` | HTML-to-canvas for PDF rendering |
| Framer Motion | `framer-motion` | Dashboard card animations |
| react-hot-toast | `react-hot-toast` | Toast notification system |
| WhatsApp Web | `wa.me` deep links | Send payment receipts and reminders via WhatsApp |

---

## 5. User Roles & Permissions

### Rank Ladder (18 Levels)

| Rank # | Code | Title |
|---|---|---|
| 1 | AO | Administrative Officer |
| 2 | AM | Assistant Manager |
| 3 | ADM | Admin Division Manager |
| 4 | DM | Division Manager |
| 5 | SDM | Senior Division Manager |
| 6 | CM | Chief Manager |
| 7 | AGM | Assistant General Manager |
| 8 | GM | General Manager |
| 9 | ZM | Zonal Manager |
| 10 | ED | Executive Director |
| 11 | SED | Senior Executive Director |
| 12 | MD | Marketing Director |
| 13 | CMD | Chief Marketing Director |
| 14 | AVP | Assistant Vice President |
| 15 | VP | Vice President |
| 16 | SVP | Senior Vice President |
| 17 | EVP | Executive Vice President |
| 18 | MD | Managing Director |

> Ranks are fully dynamic. The Admin can add, edit, reorder, or deactivate ranks in Settings → Rank Master. All dropdowns, reports, and permission checks update automatically.

### Capability Matrix

| Capability | Constant | Minimum Rank | Notes |
|---|---|---|---|
| Onboard Customer | `CAP.ONBOARD` | Rank ≥ 10 (ED) | Also enroll plans |
| Collect Payment | `CAP.COLLECT` | Rank ≥ 10 (ED) | Record installment payments |
| Recruit Agent | `CAP.RECRUIT` | Rank ≥ 2 (AM) | Overridable per-rank in Settings |
| Branch Reports | `CAP.BRANCH_REPORTS` | Rank ≥ 10 (ED) | View branch performance data |
| Manage Downline | `CAP.MANAGE_DOWNLINE` | Rank ≥ 10 (ED) | Team genealogy access |
| Zone Reports | `CAP.ZONE_REPORTS` | Rank ≥ 14 (AVP) | Cross-branch reporting |
| Admin Panel | `CAP.ADMIN` | Rank ≥ 14 (AVP) | Members, branches, settings |
| Super Admin | `CAP.SUPER_ADMIN` | `isSuperAdmin: true` | Full unrestricted access |

### Role Descriptions

**Agent (Rank 1–9)**
- View own MyEarnings dashboard
- View own customers and policies
- View plan passbook
- Access own genealogy tree

**Senior Agent / Branch Manager (Rank 10–13)**
- All agent capabilities plus:
- Onboard new customers (with KYC)
- Enroll customers in savings plans
- Collect installment payments
- View branch-level reports (Collections, Defaulters, Maturities)
- Recruit new agents

**Senior Manager / VP (Rank 14–17)**
- All branch manager capabilities plus:
- Full Admin Panel access (Members, Branches, Import, Payouts, Promotions, Settings)
- Zone-wide cross-branch reports

**Super Admin**
- Complete access to every module and action
- System Logs, Organization Overview, All Reports
- Full Settings control (ranks, commissions, plans, promotion rules)

---

## 6. Application Modules

### Module 1 — Authentication
**Files:** `Login.jsx`, `ChangePassword.jsx`, `AuthContext.jsx`

- Email/password login via Firebase Authentication
- First-login forced password change (`mustChangePassword: true` on user document)
- Session persisted via Firebase local persistence
- `AuthContext` provides `profile`, `uid`, `rank`, `isSuperAdmin` to all child components

### Module 2 — Dashboard
**File:** `Dashboard.jsx`

Two dashboard variants served from the same route:
- **Admin Dashboard** (Rank 14+ or Super Admin): KPI cards, Recharts bar charts, activity feeds
- **Agent Dashboard** (Rank 1–13): Redirects to `MyEarnings` widget

Data loaded from single `system_summaries/dashboard` document (O(1) reads).

KPI Cards: Total Business Volume, MTD Business, Paid Commissions, Active Policies, Today's Collection, Monthly Collection, Pending Payouts, Active Agents.

Charts: 6-month business growth (bar), Top 5 branch performance (bar).

### Module 3 — Customer Management
**Files:** `CustomerList.jsx`, `CustomerNew.jsx`, `CustomerProfile.jsx`
**Admin Files:** `Customers.jsx`, `CustomerDetail.jsx`

- Full KYC form: personal details, addresses, Aadhaar, PAN, nominee
- Agents see only their own enrolled customers
- Admin sees all customers across branches
- Customer profile shows all plans, payment history, and KYC details

### Module 4 — Policy Management
**Files:** `PlanEnroll.jsx`, `PlanStart.jsx`, `Passbook.jsx`
**Admin Files:** `Policies.jsx`, `PolicyDetail.jsx`

- Enroll customers in dynamic plans from plan master (RD or FD)
- `computePlan()` auto-calculates: maturity date, installments, maturity amount, interest rate
- Passbook renders full installment schedule showing paid/due/upcoming
- Admin view: all policies with status filters and search

### Module 5 — Payment Collection
**Files:** `CollectPayment.jsx`, `Receipt.jsx`

- 3-step wizard: Find Customer → Select Plan → Payment Details
- Payment modes: Cash, UPI (requires transaction ID), Cheque (requires number + bank)
- Atomic Firestore transaction ensures consistency
- Auto-generates receipt number; PDF + WhatsApp share options

### Module 6 — Reports
**Files:** `Collections.jsx`, `Defaulters.jsx`, `Maturities.jsx`
**Admin File:** `AllReports.jsx`

- **Collections**: Payments in a date range, filterable
- **Defaulters**: Active RD plans with `nextDueDate` in the past
- **Maturities**: Plans maturing within 90 days
- **All Reports** (Super Admin): Agent, Business, Policy reports with Excel export

### Module 7 — Earnings & Downline
**Files:** `MyEarnings.jsx`, `MyDownline.jsx`, `CmdAwards.jsx`

- **MyEarnings**: MDA, MFA, TA, Performance Bonus, promotion progress bar
- **MyDownline**: Members list, lazy genealogy tree, team dashboard, recruit modal
- **CMD Awards**: Weighted BV eligibility, leg composition check, award progress

### Module 8 — Admin Panel

#### Members Management
- Full agent directory with search and filters
- Create agents via secondary Firebase Auth instance (temp password shown once)
- Agent detail: stats, downline list, rank history, promote action

#### Branch Management
- Create/edit branches with auto-generated codes
- Branch detail: manager, member count, policy count, business volume

#### Excel Data Import
- Upload → Map Columns → Validate → Preview → Confirm → Import
- Batched Firestore writes (50 rows per batch)
- Commission auto-calculated per row
- Error log per session stored in `imports` collection

#### Payout Processing
- Aggregate unpaid commissions by agent
- Generate payout batches, mark as paid

#### Promotion Management
- Eligibility check against configurable rules
- Manual confirmation by admin
- History log

#### Settings
- Rank Master (fully dynamic), Commission Config, Plan Master, Promotion Rules, Excel Mapping

### Module 9 — Super Admin Only
- **Overview**: Org-wide summary stats
- **All Reports**: Multi-dimensional cross-branch reports
- **System Logs**: Admin action audit trail

---

## 7. All Pages & Routes

| Route | Component | Capability Guard | Min Access |
|---|---|---|---|
| `/login` | Login | Public only | Unauthenticated |
| `/change-password` | ChangePassword | Auth | Any |
| `/dashboard` | Dashboard | Protected | Any |
| `/customers` | CustomerList | Protected | Any |
| `/customers/new` | CustomerNew | `ONBOARD` | Rank ≥ 10 |
| `/customers/:id` | CustomerProfile | Protected | Any |
| `/customers/:id/enroll` | PlanEnroll | `ONBOARD` | Rank ≥ 10 |
| `/customers/:id/plans/:planId/passbook` | Passbook | Protected | Any |
| `/plans/new` | PlanStart | `ONBOARD` | Rank ≥ 10 |
| `/payments/collect` | CollectPayment | `COLLECT` | Rank ≥ 10 |
| `/payments/:id/receipt` | Receipt | Protected | Any |
| `/reports/collections` | Collections | Protected | Any |
| `/reports/defaulters` | Defaulters | Protected | Any |
| `/reports/maturities` | Maturities | Protected | Any |
| `/my-earnings` | MyEarnings | Protected | Any |
| `/my-downline` | MyDownline | Protected | Any |
| `/cmd-awards` | CmdAwards | Protected | Any |
| `/admin/members` | Members | `ADMIN` | Rank ≥ 14 |
| `/admin/members/:id` | MemberDetail | `ADMIN` | Rank ≥ 14 |
| `/admin/branches` | Branches | `ADMIN` | Rank ≥ 14 |
| `/admin/branches/:id` | BranchDetail | `ADMIN` | Rank ≥ 14 |
| `/admin/import` | ImportData | `ADMIN` | Rank ≥ 14 |
| `/admin/import/history` | ImportHistory | `ADMIN` | Rank ≥ 14 |
| `/admin/payouts` | Payouts | `ADMIN` | Rank ≥ 14 |
| `/admin/promotions` | Promotions | `ADMIN` | Rank ≥ 14 |
| `/admin/customers` | Customers (admin) | `ADMIN` | Rank ≥ 14 |
| `/admin/customers/:id` | CustomerDetail | `ADMIN` | Rank ≥ 14 |
| `/admin/policies` | Policies | `ADMIN` | Rank ≥ 14 |
| `/admin/policies/:id` | PolicyDetail | `ADMIN` | Rank ≥ 14 |
| `/admin/settings` | Settings | `ADMIN` | Rank ≥ 14 |
| `/admin/overview` | Overview | `SUPER_ADMIN` | Super Admin |
| `/admin/all-reports` | AllReports | `SUPER_ADMIN` | Super Admin |
| `/admin/logs` | SystemLogs | `SUPER_ADMIN` | Super Admin |
| `/unauthorized` | Unauthorized | Protected | Any |
| `*` | NotFound | — | Public |

---

## 8. Database Collections

### `users`
| Field | Type | Description |
|---|---|---|
| `id` | string | Firebase Auth UID (document ID) |
| `name` | string | Full name |
| `email` | string | Login email |
| `phone` | string | 10-digit mobile |
| `rank` | number | Rank number 1–18 |
| `isSuperAdmin` | boolean | Super admin flag |
| `branchId` | string | Assigned branch document ID |
| `status` | string | `active` or `inactive` |
| `sponsorCode` | string | Unique agent code (`AG000001`) |
| `referredBy` | string | UID of sponsor/upline agent |
| `mustChangePassword` | boolean | Force password change on login |
| `businessVolume` | number | Accumulated lifetime business volume |
| `activePolicies` | number | Count of active policies enrolled |
| `totalCustomers` | number | Customers enrolled by this agent |
| `joinDate` | timestamp | Account creation date |
| `createdAt` | timestamp | Document creation timestamp |

---

### `customers`
| Field | Type | Description |
|---|---|---|
| `customerId` | string | Unique account number (`CUS000001`) |
| `name` | string | Full name |
| `dob` | string | Date of birth |
| `gender` | string | Male / Female / Other |
| `phone` | string | Primary mobile |
| `email` | string | Email (optional) |
| `address1`, `address2` | string | Street address |
| `city`, `state`, `pincode` | string | Location |
| `aadhaar` | string | 12-digit Aadhaar number |
| `pan` | string | PAN card number |
| `nomineeName` | string | Nominee full name |
| `nomineeRelation` | string | Nominee relationship |
| `nomineePhone` | string | Nominee mobile |
| `kycStatus` | string | `pending` or `verified` |
| `enrolledBy` | string | Agent UID who onboarded |
| `enrolledByName` | string | Agent name (denormalized) |
| `branchId` | string | Branch document ID |
| `plansCount` | number | Number of enrolled plans |
| `createdAt` | timestamp | Onboarding timestamp |

---

### `plans`
| Field | Type | Description |
|---|---|---|
| `customerId` | string | Customer document ID |
| `customerName` | string | Denormalized |
| `customerAccount` | string | Customer account number |
| `agentId` | string | Enrolling agent UID |
| `agentName` | string | Denormalized |
| `branchId` | string | Branch document ID |
| `type` | string | Plan code (e.g. `RD-3Y`, `FD-2Y`) |
| `planType` | string | `RD` or `FD` |
| `planAccountNumber` | string | Unique plan account (`RD-000001`) |
| `policyNumber` | string | Customer-facing policy number |
| `monthlyAmount` | number | Monthly deposit (RD only) |
| `fdAmount` | number | Lump sum amount (FD only) |
| `totalInstallments` | number | Total payment count |
| `paidInstallments` | number | Payments made so far |
| `totalPaid` | number | Total amount collected |
| `startDate` | timestamp | Policy start date |
| `maturityDate` | timestamp | Maturity date |
| `nextDueDate` | timestamp | Next installment due date |
| `paymentDate` | number | Day of month for RD (1–28) |
| `maturityAmount` | number | Expected maturity payout |
| `ratePct` | number | Interest rate % |
| `status` | string | `active`, `matured`, or `closed` |
| `createdAt` | timestamp | Enrollment timestamp |

---

### `payments`
| Field | Type | Description |
|---|---|---|
| `planId` | string | Plan document ID |
| `planAccountNumber` | string | Denormalized |
| `customerId` | string | Customer document ID |
| `customerName` | string | Denormalized |
| `agentId` | string | Collecting agent UID |
| `branchId` | string | Branch ID |
| `installmentNumber` | number | Which installment |
| `amount` | number | Amount collected |
| `paymentMode` | string | `cash`, `upi`, `cheque` |
| `transactionRef` | string | UPI transaction ID |
| `chequeNumber` | string | Cheque number |
| `bankName` | string | Bank name |
| `paidDate` | timestamp | Date payment was made |
| `dueDate` | timestamp | Scheduled due date |
| `isLate` | boolean | Whether payment was overdue |
| `daysLate` | number | Days past due |
| `receiptNumber` | string | Linked receipt number |
| `status` | string | `completed` |

---

### `receipts`
| Field | Type | Description |
|---|---|---|
| `paymentId` | string | Payment document ID |
| `receiptNumber` | string | Human-readable receipt number |
| `customerId` | string | Customer document ID |
| `planId` | string | Plan document ID |
| `generatedBy` | string | Agent UID |
| `generatedAt` | timestamp | Generation timestamp |
| `pdfUrl` | string | Storage URL (if PDF saved) |

---

### `commissions`
| Field | Type | Description |
|---|---|---|
| `agentId` | string | Agent who earned commission |
| `agentName` | string | Denormalized |
| `sponsorCode` | string | Agent code |
| `customerId` | string | Customer ID |
| `policyId` | string | Plan document ID |
| `policyNumber` | string | Policy number |
| `planCode` | string | Plan type code |
| `planType` | string | RD or FD |
| `policyYear` | number | Which year of policy |
| `percentage` | number | Commission rate (%) |
| `amount` | number | Commission amount (₹) |
| `month` | number | Calculation month |
| `year` | number | Calculation year |
| `status` | string | `unpaid` or `paid` |

---

### `income_ledger`
| Field | Type | Description |
|---|---|---|
| `type` | string | `commission`, `bonus`, `payout` |
| `agentName` | string | Agent name |
| `policyNumber` | string | Related policy |
| `amount` | number | Ledger amount |
| `percentage` | number | Rate used |
| `status` | string | `unpaid` or `paid` |
| `refId` | string | Related commission document ID |
| `createdAt` | timestamp | Entry date |

---

### `payouts`
| Field | Type | Description |
|---|---|---|
| `agentId` | string | Agent being paid |
| `agentName` | string | Denormalized |
| `totalCommission` | number | Sum of commissions |
| `totalPayable` | number | Final payout amount |
| `commissionIds` | array | Commission document IDs |
| `status` | string | `pending` or `paid` |
| `generatedDate` | timestamp | Payout creation date |
| `paidDate` | timestamp | Date marked as paid |

---

### `branches`
| Field | Type | Description |
|---|---|---|
| `name` | string | Branch name |
| `branchCode` | string | Auto-generated (`BR000001`) |
| `address` | string | Full address |
| `city`, `state` | string | Location |
| `managerId` | string | Branch manager agent UID |
| `contactNumber` | string | Branch phone |
| `email` | string | Branch email |
| `status` | string | `active` or `inactive` |

---

### `imports`
| Field | Type | Description |
|---|---|---|
| `fileName` | string | Uploaded file name |
| `importDate` | timestamp | When import ran |
| `totalRows` | number | Total rows parsed |
| `successRows` | number | Successfully imported rows |
| `duplicateRows` | number | Duplicate rows skipped |
| `failedRows` | number | Failed rows |
| `status` | string | `completed` or `failed` |
| `triggeredBy` | string | Admin name |
| `logs` | array | Per-row errors (up to 100) |

---

### `promotions_history`
| Field | Type | Description |
|---|---|---|
| `agentId` | string | Agent UID |
| `agentName` | string | Denormalized |
| `fromRank` | number | Previous rank |
| `toRank` | number | New rank |
| `promotedAt` | timestamp | Promotion date |
| `promotedBy` | string | Admin who confirmed |

---

### `config` (sub-documents)
| Document | Contents |
|---|---|
| `config/ranks` | Dynamic `RANKS` array + all compensation tables |
| `config/commissions` | Per-plan per-year per-rank commission override matrix |
| `config/plans` | Dynamic plan master |
| `config/promotions` | Per-rank promotion eligibility rules |
| `config/excel_mapping` | Excel column-to-field name mappings |

---

### `system_summaries`
| Document | Fields |
|---|---|
| `system_summaries/dashboard` | `totalBusiness`, `monthlyBusiness`, `totalCommission`, `pendingPayouts`, `activeAgents`, `activePlans`, `todayCollection`, `monthCollection`, `defaulters`, `totalAgents`, `totalBranches`, `promotionsCount`, `growthData[]`, `branchPerformance[]`, `topAgentsList[]`, `lastUpdated` |

---

## 9. Collection Relationships

```
users (agents)
  ├── referredBy → users (self-referential parent-child hierarchy)
  └── branchId  → branches

customers
  ├── enrolledBy → users
  ├── branchId   → branches
  └── id ──────► plans
                   ├── agentId → users
                   ├── id ─────► payments ──► receipts
                   └── id ─────► commissions ──► income_ledger ──► payouts

config/* ──────────────────► (read by RanksContext, ImportData, Settings)
system_summaries/dashboard ► (written on every write event; read by Dashboard)
imports ────────────────────► (written by ImportData on completion)
promotions_history ─────────► (written by Promotions on confirmation)
```

---

## 10. Business Rules

1. **RD Plans** — monthly deposits over 1–5 years; minimum ₹500/month.
2. **FD Plans** — single lump-sum deposit; minimum ₹5,000.
3. After each RD payment, `nextDueDate` advances by 1 calendar month.
4. When `paidInstallments >= totalInstallments`, plan status becomes `matured`.
5. A plan is a **defaulter** when `nextDueDate < today` and `status === 'active'`.
6. Plans maturing within **90 days** appear in the Maturities report.
7. `planAccountNumber` is unique system-wide, auto-incremented per plan type.
8. `receiptNumber` is unique system-wide, auto-incremented per fiscal counter.
9. `sponsorCode` is unique per agent, format `AG000001`, auto-incremented.
10. A customer may hold multiple plans (tracked via `plansCount`).
11. Agent `businessVolume` on the user document is updated at Excel import time.
12. The `referredBy` field defines the genealogy/upline relationship.
13. Branch codes auto-generated as `BR000001` sequentially.
14. All plan types are dynamic — no plan codes are hardcoded in the application.
15. All rank names are dynamic — fetched from `config/ranks`; none hardcoded.

---

## 11. Commission Rules

**Base amount for commission calculation:**
- **RD**: `monthlyAmount × 12` (annual equivalent)
- **FD**: `fdAmount` (full lump sum)

### MDA (Monthly Distribution Allowance)
- Per payment installment, based on agent rank + plan year band (Year 1 vs Year 2+)
- Plan index: 0=1Y, 1=2Y, 2=3Y, 3=4Y, 4=5Y
- Example: AO, RD-3Y, Year 1 = **7%** of installment amount

### FD/Pension Commission
- One-time at enrollment, based on agent rank + plan duration
- Example: AO, FD-3Y = **6%** of lump sum

### MFA (Monthly Field Allowance)
- Flat monthly allowance by rank: ₹400 (AO) → ₹20,000 (MD)
- Paid when monthly business meets rank target

### TA (Travel Allowance)
- Flat monthly by rank: ₹0 (AO) → ₹12,000 (MD)

### Performance Bonus (PB)
- Monthly BV must meet rank-specific target
- Range: ₹3,000 (DM) → ₹75,000 (MD)

### CMD Award
- Based on **weighted BV**:
  - RD weights: 1Y=0.25×, 2Y=0.5×, 3Y/4Y/5Y=1× (counted after 12 installments)
  - FD: full value
- Qualification: ≥80% from main personal leg, ≥20% from other legs
- Award amounts: ₹3,000 (AO) → ₹10,00,000 (MD)

### Commission Override
Admin can override all commission rates per plan code + year + rank code via `config/commissions`. Import process reads override first, then falls back to `data/compensation.js` defaults.

---

## 12. Promotion Rules

All rules stored dynamically in `config/promotions`. Promotion from rank N to N+1 requires **all** criteria:

1. **Business Target** — agent's lifetime personal business volume ≥ target
2. **Downline Count** — minimum N directly sponsored agents at a specified rank
3. **Required Rank** — the rank code those sponsored agents must have achieved

### Default Promotion Targets

| To Rank | BV Target |
|---|---|
| AO (1) | ₹50,000 |
| AM (2) | ₹1,50,000 |
| ADM (3) | ₹3,00,000 |
| DM (4) | ₹5,00,000 |
| SDM (5) | ₹7,50,000 |
| CM (6) | ₹15,00,000 |
| AGM (7) | ₹20,00,000 |
| GM (8) | ₹30,00,000 |
| ZM (9) | ₹45,00,000 |
| ED (10) | ₹60,00,000 |
| ... | ... |
| MD (18) | ₹3,00,00,000 |

Promotion confirmation is **manual** — Admin checks eligibility in the Promotions module and clicks "Confirm Promotion". This writes a `promotions_history` record and updates the agent's `rank` field.

---

## 13. Excel Import Process

### Required Column Names (Default Mapping — configurable in Settings)

| Excel Column | Field | Validation |
|---|---|---|
| Customer ID | `customerId` | Must be unique |
| Customer Name | `customerName` | Required |
| Mobile | `mobile` | 10 digits |
| Address | `address` | Optional |
| Agent Code | `agentCode` | Must match existing `sponsorCode` |
| Policy Number | `policyNumber` | Must be unique |
| Plan Code | `planCode` | Must match plan master |
| Monthly Amount | `monthlyAmount` | Required for RD plans |
| Total Amount | `totalAmount` | Required for FD plans |
| Start Date | `startDate` | Parseable date |

### Import Pipeline

```
1. Upload .xlsx file
2. Parse using xlsx → JSON rows
3. Apply configured column mapping
4. Pre-validate each row:
   - Check policyNumber for duplicates (against existing Firestore policies)
   - Resolve agentCode → agent UID (must exist in users collection)
   - Determine plan type (RD or FD) from planCode against plan master
   - Parse and validate amounts
   - Parse startDate
5. Display preview table with row-level validation errors and warnings
6. User clicks "Confirm Import":
   a. Initialize totalImportedBusiness = 0, totalImportedCommissions = 0
   b. Loop valid rows in batches of 50
   c. For each batch, open writeBatch:
      i.   Set customers document
      ii.  Set plans document
      iii. Update agent doc (businessVolume++, activePolicies++)
      iv.  Look up commission rate from config/commissions (or default tables)
      v.   Set commissions document
      vi.  Set income_ledger document
      vii. successCount++, accumulate totals
   d. batch.commit()
   e. Update progress bar
7. Write import session log to `imports` collection
8. Call updateDashboardSummary({ totalBusiness, activePlans, totalCommission, ... })
9. Display import result summary
```

---

## 14. Workflows

### Agent Onboarding
```
Admin opens Recruit Agent modal
  → Enters name, email, phone, rank, branch
  → Enters Sponsor ID (sponsorCode of upline)
  → System validates Sponsor ID exists in users collection
  → referredBy = sponsor's UID
  → System creates Firebase Auth account (via secondary app instance)
  → Writes users/{uid} with mustChangePassword: true
  → updateDashboardSummary({ totalAgents: +1, activeAgents: +1 })
  → Temp password shown once in UI (never saved to Firestore)
  → Optional: send WhatsApp welcome message to agent

Agent first login:
  → Enters temp password
  → Forced redirect to /change-password
  → Updates Firebase Auth password
  → Clears mustChangePassword flag on user document
```

### Customer Enrollment
```
Agent → /customers/new
  → Fills KYC form, validates Aadhaar/PAN/phone
  → customers document created in Firestore
Agent → /customers/:id/enroll
  → Selects plan from dynamic plan master
  → Enters deposit amount and start date
  → computePlan() calculates maturity date, installments, maturity amount
  → plans document created
  → customers.plansCount incremented
  → commissions document created
  → updateDashboardSummary({ totalBusiness, activePlans, ... })
```

### Payment Collection
```
Agent → /payments/collect
  → Step 1: Search customer by name or account number
  → Step 2: Select active plan from customer's policy list
  → Step 3: Enter amount, payment mode, date; confirm
  → recordPayment() runs Firestore runTransaction():
     - Creates payments document
     - Updates plan: paidInstallments++, totalPaid, nextDueDate
     - Creates receipts document
  → updateDashboardSummary({ todayCollection, monthCollection })
  → Redirect to /payments/:id/receipt
  → Receipt: print PDF or share via WhatsApp
```

### Payout Generation
```
Admin → /admin/payouts
  → Views unpaid commissions aggregated per agent
  → Selects agents → Generate Payout
  → payouts document created (status: pending)
  → Admin completes bank transfer offline
  → Marks payout as "Paid" in the system
  → commissions documents updated to status: paid
  → income_ledger updated
```

---

## 15. Security Features

### Authentication
- Firebase Authentication (Email/Password) — no custom auth server
- Passwords never stored in Firestore
- Forced password change on first login (`mustChangePassword` flag)
- Secondary Firebase App (`apex-secondary`) used to create agent accounts without disrupting the admin session

### Route Protection
- `<Protected>` — redirects unauthenticated users to `/login`
- `<Protected capability={CAP.X}>` — redirects unauthorized users to `/unauthorized`
- `<PublicOnly>` — redirects authenticated users away from login page

### Input Validation (Client-side)
- Zod schemas on all forms (customer, plan, payment, member, branch, plan master)
- Aadhaar: 12 digits; PAN: `ABCDE1234F`; Phone: 10 digits; Pincode: 6 digits
- Payment mode–specific validation: UPI requires transaction ID, Cheque requires number + bank

### Error Handling
- `ErrorBoundary` component wraps entire app — prevents white-screen crashes
- All async operations wrapped in try/catch with toast feedback
- Import errors stored per-row in `imports.logs` for admin review

### Data Integrity
- Payment recording uses `runTransaction()` to atomically update `plans`, create `payments` and `receipts` in a single Firestore transaction — preventing partial writes
- Excel import uses `writeBatch()` for atomic batch commits

---

## 16. Performance Optimizations

### Dashboard — O(1) Reads
- All aggregate stats read from single `system_summaries/dashboard` document
- Updated incrementally via `updateDashboardSummary()` on every write event
- Recent feeds use `orderBy + limit(5)` — no full collection scans

### Genealogy Tree — On-Demand Loading
| Action | Firestore Reads |
|---|---|
| Initial load | 1 document (root only) |
| Expand a node | 1 query (`where referredBy == nodeId`) |
| Collapse & re-expand | 0 reads (in-memory `nodeCache`) |
| Search | 2 prefix queries (name + sponsorCode) |

### Code Splitting
- All 30+ pages wrapped in `React.lazy()` + `Suspense`
- Each page bundles independently — users download only visited pages

### Targeted Queries
- `MyDownline.jsx`: `where('referredBy', '==', uid)` for direct team only
- Full downline loaded via BFS `useEffect` asynchronously (not blocking render)
- `MemberDetail.jsx`: Downline loaded lazily via BFS; sponsor name resolved via single `getDoc`

### Required Firestore Indexes
| Collection | Field(s) | Type |
|---|---|---|
| `users` | `referredBy` | ASC |
| `users` | `name` | ASC |
| `users` | `sponsorCode` | ASC |
| `plans` | `agentId` + `status` | Composite |
| `payments` | `agentId` + `paidDate` | Composite |
| `commissions` | `agentId` + `status` | Composite |

---

## 17. API Structure

This is a **frontend-only SPA** with no custom backend server. All operations go directly to Firebase:

### Firestore Operations
| Hook / Function | Type | Used For |
|---|---|---|
| `useDoc(path)` | `onSnapshot` real-time | Single document streams |
| `useCollection(path, constraints)` | `onSnapshot` real-time | Collection streams |
| `fetchCollection(path, constraints)` | `getDocs` one-shot | Reports, one-time reads |
| `updateDashboardSummary(deltas)` | `updateDoc` + `increment` | Pre-aggregated summary updates |

### Firebase Auth Operations
| Function | Purpose |
|---|---|
| `signInWithEmailAndPassword` | Login |
| `signOut` | Logout |
| `updatePassword` | Change password |
| `createUserWithEmailAndPassword` | Agent provisioning (secondary app) |

### Client-Side Services
| Module | Responsibility |
|---|---|
| `lib/admin.js` | Create/update members and branches |
| `lib/plans.js` | Enroll customer plans |
| `lib/payments.js` | Record payment (atomic transaction) |
| `lib/customers.js` | Create/update customer KYC |
| `lib/earnings.js` | Compute earnings model (pure function) |
| `lib/calc.js` | Compute plan maturity + schedule (pure function) |
| `lib/ids.js` | Auto-increment plan account + receipt numbers |
| `lib/pdf.js` | Generate receipt PDF |
| `lib/whatsapp.js` | Build and open WhatsApp deep links |
| `lib/summary.js` | Increment/update system_summaries document |

---

## 18. Deployment Steps

### Local Development

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Edit .env.local with your Firebase project credentials

# Start dev server
npm run dev
# App available at http://localhost:5173
```

### Production Build (Verify)

```bash
npm run build
# Check dist/ folder — verify zero errors
```

### Deploy to Vercel

```bash
# Authenticate (first time only)
npx vercel login

# Deploy to production
npx vercel --prod --yes
```

### Vercel SPA Routing

Ensure `vercel.json` exists in project root:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Firebase Setup Checklist

- [ ] Enable **Email/Password** in Firebase Console → Authentication
- [ ] Create Firestore database in **production mode**
- [ ] Configure Firestore Security Rules (require `request.auth != null`)
- [ ] Create single-field indexes: `users.referredBy`, `users.name`, `users.sponsorCode`
- [ ] Create composite indexes: `plans(agentId+status)`, `payments(agentId+paidDate)`, `commissions(agentId+status)`
- [ ] Enable Firebase Storage
- [ ] Set all `VITE_FIREBASE_*` variables in Vercel → Settings → Environment Variables
- [ ] Create first Super Admin user in Firebase Console → Authentication, then manually write their `users/{uid}` Firestore document with `isSuperAdmin: true`, `rank: 18`

---

## 19. Future Improvements

### High Priority

1. **Firestore Security Rules** — Implement server-side rules matching the client-side permission model (rank-based read/write restrictions per collection). Currently relies entirely on client-side guards.

2. **Firebase Cloud Functions** — Move commission calculations, summary aggregation, and payout generation to Cloud Functions to prevent any possibility of client-side data manipulation.

3. **Daily/Monthly Counter Reset** — Scheduled Cloud Function to reset `todayCollection` at midnight and `monthlyBusiness` at month-end in `system_summaries`.

### Medium Priority

4. **Full-text Search** — Integrate Algolia or Typesense for agent/customer name search. Current Firestore prefix queries have limitations on mid-word matches.

5. **Push Notifications** — Firebase Cloud Messaging (FCM) for defaulter alerts, payout ready, promotion eligibility.

6. **Progressive Web App (PWA)** — Service worker + Firestore offline persistence for agents operating in low-connectivity rural areas.

7. **Audit Trail** — Store structured admin action logs in Firestore per operation (currently only System Logs page with basic entries).

8. **Bulk Payout CSV** — Export payout batch as a bank-compatible CSV for direct upload to NEFT/RTGS portals.

### Low Priority

9. **Multi-language Support** — i18n for Hindi and regional languages.

10. **Customer Mobile App** — Separate React Native or Flutter app for customers to view passbook, policies, and download receipts.

11. **Biometric / OTP Login** — Replace password authentication with Firebase Phone Auth OTP for field agents.

12. **Performance Analytics** — Google Analytics / Mixpanel for usage tracking and identifying heavily-used features.

13. **Document OCR** — Auto-populate Aadhaar and PAN fields from photo scan using Google Vision API.

14. **API Gateway** — A Node.js/Express backend to add a REST/GraphQL API layer for future ERP or third-party integrations.

---

*This documentation was generated for APEX Branch Operations System v1.0.0.*  
*Last Updated: July 2026*
