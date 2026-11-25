import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { IDashboard, INetwork, ICash, IShield, IDoc } from '../ui/icons';

const PREVIEW_VIEWS = {
  operations: {
    badge: 'Operations Command',
    heading: 'Branch Operations Overview',
    kpis: [
      { label: 'Sample Business Volume', value: '₹24,80,000', sub: 'RD · FD · Pension' },
      { label: 'Commission Ledger Pool', value: '₹1,84,250', sub: 'Reconciled tiers' },
      { label: 'MFA Qualified Agents', value: '18 / 26', sub: 'Current cycle' },
    ],
    bars: [
      { m: 'Jun', h: 38, val: '₹3.1L' },
      { m: 'Jul', h: 52, val: '₹4.2L' },
      { m: 'Aug', h: 46, val: '₹3.8L' },
      { m: 'Sep', h: 68, val: '₹5.4L' },
      { m: 'Oct', h: 79, val: '₹6.1L' },
      { m: 'Nov', h: 92, val: '₹7.4L' },
    ],
    ledgerTitle: 'Recent Sample Commission Ledger Allocations',
    rows: [
      { agent: 'R. Deshmukh', code: 'AX00104', rank: 'AO · Lvl 1', type: 'Direct', amount: '₹7,000', status: 'Paid' },
      { agent: 'P. Nair', code: 'AX00042', rank: 'AM · Lvl 2', type: 'Upline', amount: '₹2,000', status: 'Paid' },
      { agent: 'S. Kulkarni', code: 'AX00015', rank: 'ADM · Lvl 3', type: 'Upline', amount: '₹1,000', status: 'Allocated' },
    ],
    ringPct: 74,
    ringLabel: 'MTD Target Pace',
  },
  agent: {
    badge: 'Agent Portal',
    heading: 'Field Advisor Performance View',
    kpis: [
      { label: 'Personal Business', value: '₹1,45,000', sub: '12 active policies' },
      { label: 'Direct & Team Credit', value: '₹4,92,000', sub: '8 downline agents' },
      { label: 'Monthly Commission', value: '₹14,650', sub: 'Statement ready' },
    ],
    bars: [
      { m: 'Jun', h: 28, val: '₹0.4L' },
      { m: 'Jul', h: 44, val: '₹0.7L' },
      { m: 'Aug', h: 61, val: '₹0.9L' },
      { m: 'Sep', h: 55, val: '₹0.8L' },
      { m: 'Oct', h: 74, val: '₹1.2L' },
      { m: 'Nov', h: 86, val: '₹1.4L' },
    ],
    ledgerTitle: 'Illustrative Monthly Policy Commission Entries',
    rows: [
      { agent: 'RD-3Y Certificate', code: 'POL-SAMPLE-18', rank: 'Year 1 · Inst #1', type: 'Direct 7.0%', amount: '₹4,200', status: 'Paid' },
      { agent: 'FD-5Y Deposit', code: 'POL-SAMPLE-24', rank: 'Team Lvl +1', type: 'Upline 2.0%', amount: '₹2,000', status: 'Paid' },
      { agent: 'RD-2Y Certificate', code: 'POL-SAMPLE-31', rank: 'Year 1 · Inst #4', type: 'Direct 6.0%', amount: '₹1,800', status: 'Allocated' },
    ],
    ringPct: 65,
    ringLabel: 'MFA Achievement',
  },
};

export default function HeroPlatformPreview() {
  const [activeView, setActiveView] = useState('operations');
  const shouldReduceMotion = useReducedMotion();
  const data = PREVIEW_VIEWS[activeView];

  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (data.ringPct / 100) * circumference;

  return (
    <div className="relative w-full">
      {/* Subtle ambient glow behind dashboard frame */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-[#BFA256]/15 via-emerald-500/5 to-transparent blur-2xl"
      />

      <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-[#071914]/95 shadow-[0_32px_90px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        {/* Top Window Chrome */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#05130F] px-3.5 py-2.5 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#BFA256]/70" />
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9AA8A2]">
              Illustrative Preview Data
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Preview Workspace Mode"
            className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5 text-[11px]"
          >
            {[
              { id: 'operations', label: 'Operations' },
              { id: 'agent', label: 'Agent View' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeView === tab.id}
                onClick={() => setActiveView(tab.id)}
                className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                  activeView === tab.id
                    ? 'bg-[#BFA256] text-[#04120E]'
                    : 'text-[#9AA8A2] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Compact Simulated Sidebar (Desktop preview only) */}
          <div className="hidden border-r border-white/10 bg-black/20 p-4 lg:col-span-3 lg:flex lg:flex-col lg:justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#BFA256]/15 text-[#E6C97A]">
                  <IDashboard size={15} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-white">Apex Portal</p>
                  <p className="truncate text-[9px] uppercase tracking-wider text-[#BFA256]">
                    {data.badge}
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5 text-[11px] font-medium text-[#9AA8A2]">
                {[
                  { icon: IDashboard, text: 'Dashboard', active: true },
                  { icon: INetwork, text: 'Network & Ranks', active: false },
                  { icon: IDoc, text: 'Policies Ledger', active: false },
                  { icon: ICash, text: 'Commissions', active: false },
                  { icon: IShield, text: 'Monthly MFA', active: false },
                ].map((nav) => (
                  <li
                    key={nav.text}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                      nav.active
                        ? 'border-l-2 border-[#BFA256] bg-white/[0.06] text-white'
                        : 'text-[#9AA8A2]/80'
                    }`}
                  >
                    <nav.icon size={13} className={nav.active ? 'text-[#E6C97A]' : ''} />
                    <span className="truncate">{nav.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[10px]">
              <p className="font-semibold text-[#E6C97A]">Demo Workspace</p>
              <p className="mt-0.5 text-[#9AA8A2]">Role-scoped permissions enforced</p>
            </div>
          </div>

          {/* Main Dashboard Preview Canvas */}
          <div className="space-y-4 p-4 sm:p-5 lg:col-span-9">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#BFA256]">
                  {data.badge}
                </p>
                <h3 className="font-serif text-base font-bold text-white sm:text-lg">
                  {data.heading}
                </h3>
              </div>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
                Sample Calendar Cycle
              </span>
            </div>

            {/* 3 KPI Cards */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {data.kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[#9AA8A2]">
                    {kpi.label}
                  </p>
                  <p className="mt-1 font-serif text-lg font-bold tabular-nums text-white sm:text-xl">
                    {kpi.value}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[#BFA256]">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Middle Analytics + Target Ring */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              {/* Bar Trend Chart */}
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3.5 sm:col-span-8">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white">
                    6-Month Volume Trajectory
                  </span>
                  <span className="font-mono text-[10px] text-[#9AA8A2]">RD · FD · Pension</span>
                </div>
                <div className="flex h-28 items-end gap-2 sm:gap-3">
                  {data.bars.map((bar, idx) => (
                    <div key={bar.m} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="hidden font-mono text-[9px] text-[#9AA8A2] sm:block">
                        {bar.val}
                      </span>
                      <div className="flex h-20 w-full items-end rounded-md bg-white/[0.03] p-0.5">
                        <motion.div
                          initial={shouldReduceMotion ? false : { height: 0 }}
                          animate={{ height: `${bar.h}%` }}
                          transition={{ duration: 0.45, delay: idx * 0.04 }}
                          className="w-full rounded-sm bg-gradient-to-t from-[#8C7335] to-[#E6C97A]"
                        />
                      </div>
                      <span className="text-[10px] font-medium text-[#9AA8A2]">{bar.m}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Target Achievement Gauge */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-center sm:col-span-4">
                <div className="relative h-24 w-24">
                  <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="6"
                    />
                    <motion.circle
                      cx="40"
                      cy="40"
                      r={radius}
                      fill="none"
                      stroke="#E6C97A"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      initial={shouldReduceMotion ? false : { strokeDashoffset: circumference }}
                      animate={{ strokeDashoffset }}
                      transition={{ duration: 0.65, ease: 'easeOut' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-serif text-lg font-bold tabular-nums text-white">
                      {data.ringPct}%
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-white">{data.ringLabel}</p>
                <p className="text-[10px] text-[#9AA8A2]">Resets monthly</p>
              </div>
            </div>

            {/* Bottom Ledger Rows */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
              <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-[11px] font-semibold text-white">{data.ledgerTitle}</span>
                <span className="font-mono text-[10px] text-[#BFA256]">Ledger Verified</span>
              </div>
              <div className="space-y-2">
                {data.rows.map((row) => (
                  <div
                    key={row.code}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.025] px-2.5 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{row.agent}</p>
                      <p className="font-mono text-[10px] text-[#9AA8A2]">
                        {row.code} · {row.rank}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="hidden rounded border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] text-[#9AA8A2] sm:inline-block">
                        {row.type}
                      </span>
                      <span className="font-mono font-bold tabular-nums text-[#E6C97A]">
                        {row.amount}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          row.status === 'Paid'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-[#BFA256]/20 text-[#E6C97A]'
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
