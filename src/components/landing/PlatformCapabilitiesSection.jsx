import { useState } from 'react';
import {
  IUsers,
  IDoc,
  ICash,
  ITrophy,
  IShield,
  INetwork,
  IReport,
  ISettings,
  ICheck,
} from '../ui/icons';

const CAPABILITIES = [
  {
    id: 'network',
    title: 'Agent & Network Management',
    icon: IUsers,
    summary:
      'Onboard field agents under verified sponsors, maintain profile and bank KYC records, and navigate complete multi-level downlines with pan-and-zoom genealogy visualization.',
    highlights: [
      'Rank-gated agent recruitment tied to sponsor hierarchy',
      'Interactive genealogy tree & searchable downline directory',
      'Direct vs network downline business aggregation',
    ],
    previewHeader: 'Agent Network & Downline Directory (Illustrative)',
    previewData: {
      type: 'table',
      headers: ['Agent Tier', 'Sponsor Code', 'Direct Team', 'Network Volume'],
      rows: [
        ['Divisional Manager (DM)', 'AX00018', '14 agents', '₹18,40,000'],
        ['Admin. Div. Manager (ADM)', 'AX00042', '9 agents', '₹9,25,000'],
        ['Assistant Manager (AM)', 'AX00089', '5 agents', '₹4,10,000'],
      ],
    },
  },
  {
    id: 'policies',
    title: 'Business & Policy Tracking',
    icon: IDoc,
    summary:
      'Track Recurring Deposit (1Y–5Y), Fixed Deposit (1Y–5Y), and Pension certificates from enrollment through installments, due dates, defaulter follow-ups, and maturity.',
    highlights: [
      'Structured Customer CIF profiles linked to active policies',
      'Installment passbooks with printable receipt & PDF generation',
      'Overdue monitoring and WhatsApp installment reminders',
    ],
    previewHeader: 'Policy Lifecycle Snapshot (Illustrative)',
    previewData: {
      type: 'cards',
      items: [
        { title: 'RD-3Y Certificate', badge: 'Year 2 · Active', detail: '₹5,000/mo · 14/36 paid', value: '₹1,80,000 Term' },
        { title: 'FD-5Y Certificate', badge: 'Lump Sum', detail: 'Single deposit · Active', value: '₹1,00,000 Principal' },
        { title: 'PENS-2Y Plan', badge: 'Active', detail: 'Maturity scheduled · Tracked', value: '₹75,000 Term' },
      ],
    },
  },
  {
    id: 'commissions',
    title: 'Commission Management',
    icon: ICash,
    summary:
      'Automatically allocate commissions per policy year and installment across direct sellers and eligible upline sponsors with full ledger visibility and monthly payout statements.',
    highlights: [
      'Dynamic rate tables per plan family, policy year, and rank',
      'Handles compressed ranks without fabricating missing payouts',
      'Monthly commission bill engine with TDS (5%) & Admin (5%) reconciliation',
    ],
    previewHeader: 'Multi-Tier Commission Ledger Rules (Illustrative)',
    previewData: {
      type: 'bars',
      items: [
        { label: 'Direct Seller Credit (AO · Year 1)', pct: 78, tag: '7.00% RD-3Y' },
        { label: 'Level +1 Upline Differential (AM)', pct: 46, tag: '2.00% Upline' },
        { label: 'Senior Leadership Tiers (ADM → MGD)', pct: 32, tag: 'Reconciled' },
      ],
    },
  },
  {
    id: 'mfa',
    title: 'MFA & Incentive Tracking',
    icon: IShield,
    summary:
      'Track rank-based Monthly Field Allowance (MFA) targets across Ranks 1–10 using duration-weighted business credit (25% / 50% / 100%) and clean monthly resets.',
    highlights: [
      '1-Year business counts 25%, 2-Year 50%, and 3+ Years 100%',
      'Zero carry-forward between calendar months',
      'Clear reward eligibility status across AO (₹50,000) to ED (₹50,00,000)',
    ],
    previewHeader: 'MFA Duration Weighting Rule (System Rules)',
    previewData: {
      type: 'cards',
      items: [
        { title: '1-Year Term Business', badge: '25% Credit', detail: '₹10,000 business', value: '₹2,500 MFA Credit' },
        { title: '2-Year Term Business', badge: '50% Credit', detail: '₹10,000 business', value: '₹5,000 MFA Credit' },
        { title: '3–5 Year Term Business', badge: '100% Credit', detail: '₹10,000 business', value: '₹10,000 MFA Credit' },
      ],
    },
  },
  {
    id: 'hierarchy',
    title: 'Hierarchy & Rank Management',
    icon: INetwork,
    summary:
      'Govern an 18-level career progression from Administrative Officer through Managing Director with configurable promotion quotas and downline rank rules.',
    highlights: [
      'Promotion evaluation engine tracks business and promotee counts',
      'Separate configuration for management Ranks 11–18',
      'Advancement history preserved across evaluation cycles',
    ],
    previewHeader: 'Rank Configuration & Promotion Quotas (Actual System Tiers)',
    previewData: {
      type: 'table',
      headers: ['Rank Code', 'Designation', 'Promotion Target', 'Recruit Access'],
      rows: [
        ['AO (Rank 1)', 'Administrative Officer', '₹50,000', 'Policy Seller'],
        ['AM (Rank 2)', 'Assistant Manager', '₹1,50,000', 'Enabled'],
        ['ADM → MGD', 'Divisional to Director', '₹3L to ₹60L+', 'Multi-Tier'],
      ],
    },
  },
  {
    id: 'targets',
    title: 'Performance & Monthly Targets',
    icon: ITrophy,
    summary:
      'Equip managers and advisors with monthly vs lifetime business totals, Performance Bonus milestones, and CMD Weighted BV Award progress.',
    highlights: [
      'MTD collections and 6-month trajectory analytics',
      'CMD 80/20 multi-leg weighted volume qualification check',
      'Monthly Business breakdown across RD, FD, and Pension portfolios',
    ],
    previewHeader: 'Target & Bonus Tracking Modules',
    previewData: {
      type: 'bars',
      items: [
        { label: 'Monthly MFA Target Attainment', pct: 65, tag: 'Active Cycle' },
        { label: 'Rank Promotion Business Target', pct: 82, tag: 'On Track' },
        { label: 'CMD Weighted BV Leg Qualification', pct: 70, tag: 'Multi-Leg' },
      ],
    },
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    icon: IReport,
    summary:
      'Analyze collections, defaulters, maturities, agent registries, payout summaries, and promotions from unified filterable workspaces with Excel and PDF exports.',
    highlights: [
      '6-tab Reporting Workspace filterable by rank, status, and date range',
      'Single-click `.xlsx` workbooks for team business and MFA audits',
      'Daily collections trends broken down by cash, UPI, and cheque',
    ],
    previewHeader: 'Export & Operational Reporting Workspaces',
    previewData: {
      type: 'cards',
      items: [
        { title: 'Collections Report', badge: 'Mode Split', detail: 'Cash · UPI · Cheque analytics', value: 'Daily Trend' },
        { title: 'Team Business Export', badge: '5-Sheet .xlsx', detail: 'Summary, hierarchy & policies', value: 'Workbook Ready' },
        { title: 'Defaulters & Maturities', badge: '30/60/90d', detail: 'Overdue and upcoming plans', value: 'Proactive View' },
      ],
    },
  },
  {
    id: 'admin',
    title: 'Centralized Administration',
    icon: ISettings,
    summary:
      'Bulk onboard new business and installment payments via validated Excel imports, inspect diagnostic logs, manage master settings, and audit system corrections.',
    highlights: [
      'Excel bulk import with row-level schema checks and error history',
      'Protected policy credential corrections with mandatory audit reason',
      'Controlled View-As-Agent diagnostic mode for support oversight',
    ],
    previewHeader: 'Operational Governance & Controls',
    previewData: {
      type: 'table',
      headers: ['Control Module', 'Purpose', 'Accountability'],
      rows: [
        ['Import Center', 'Bulk policies & payment ingestion', 'Row diagnostics log'],
        ['Master Settings', 'Ranks, plans & commission rates', 'Versioned config'],
        ['Audit Trail', 'Corrections, reversals & admin actions', 'Timestamped records'],
      ],
    },
  },
];

export default function PlatformCapabilitiesSection() {
  const [selectedId, setSelectedId] = useState('network');
  const active = CAPABILITIES.find((c) => c.id === selectedId) || CAPABILITIES[0];
  const ActiveIcon = active.icon;

  return (
    <section id="capabilities" className="bg-white py-20 text-[#16221F] sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8D7952]">
            Platform Capabilities
          </p>
          <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#132E22] sm:text-4xl lg:text-5xl">
            Every workflow your network needs, working in sync.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#51635E] sm:text-lg">
            Inspect each operational module built inside Apex Multisolutions — from hierarchy governance and installment ledgers to monthly target monitoring.
          </p>
        </div>

        {/* Interactive Split Capability Workspace */}
        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Selector Rail */}
          <div
            role="tablist"
            aria-label="Platform capabilities"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1"
          >
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              const isSelected = cap.id === selectedId;
              return (
                <button
                  key={cap.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedId(cap.id)}
                  className={`flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? 'border-[#132E22] bg-[#FAF8F5] shadow-sm'
                      : 'border-[#EBE6DC] bg-white hover:border-[#8D7952]/50 hover:bg-[#FAF8F5]/60'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-[#132E22] bg-[#132E22] text-[#E6C97A]'
                        : 'border-[#EBE6DC] bg-[#FAF8F5] text-[#132E22]'
                    }`}
                  >
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#132E22]">
                      {cap.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#667873]">
                      {cap.highlights[0]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Interactive Detail & Live Mockup Panel */}
          <div className="rounded-2xl border border-[#EBE6DC] bg-[#FAF8F5] p-5 sm:p-8 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-3 border-b border-[#EBE6DC] pb-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#132E22] text-[#E6C97A]">
                <ActiveIcon size={22} />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8D7952]">
                  Capability Module
                </p>
                <h3 className="font-serif text-2xl font-bold text-[#132E22]">{active.title}</h3>
              </div>
            </div>

            <p className="mt-5 text-sm leading-relaxed text-[#465752] sm:text-base">
              {active.summary}
            </p>

            <ul className="mt-5 space-y-2.5">
              {active.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-[#16221F]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#132E22]/10 text-[#132E22]">
                    <ICheck size={12} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {/* Contextual Interactive Preview Box */}
            <div className="mt-7 rounded-xl border border-[#EBE6DC] bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#EBE6DC] pb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[#132E22]">
                  {active.previewHeader}
                </span>
                <span className="rounded bg-[#FAF8F5] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#8D7952]">
                  Preview UI
                </span>
              </div>

              {active.previewData.type === 'table' && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#EBE6DC] text-[10px] font-bold uppercase tracking-wider text-[#667873]">
                        {active.previewData.headers.map((h) => (
                          <th key={h} className="pb-2 pr-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EBE6DC]/70">
                      {active.previewData.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((cell, ci) => (
                            <td
                              key={ci}
                              className={`py-2.5 pr-3 ${
                                ci === 0
                                  ? 'font-semibold text-[#132E22]'
                                  : ci === r.length - 1
                                    ? 'font-mono font-bold text-[#8D7952]'
                                    : 'text-[#667873]'
                              }`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {active.previewData.type === 'cards' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {active.previewData.items.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-lg border border-[#EBE6DC] bg-[#FAF8F5] p-3"
                    >
                      <span className="inline-block rounded bg-[#132E22]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#132E22]">
                        {item.badge}
                      </span>
                      <p className="mt-2 text-xs font-bold text-[#132E22]">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-[#667873]">{item.detail}</p>
                      <p className="mt-2 font-mono text-xs font-bold text-[#8D7952]">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {active.previewData.type === 'bars' && (
                <div className="space-y-3.5">
                  {active.previewData.items.map((b) => (
                    <div key={b.label} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#132E22]">{b.label}</span>
                        <span className="font-mono text-[11px] font-bold text-[#8D7952]">
                          {b.tag}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#EBE6DC]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#132E22] to-[#8D7952]"
                          style={{ width: `${b.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
