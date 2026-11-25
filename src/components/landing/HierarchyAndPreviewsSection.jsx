import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RANKS } from '../../data/ranks';
import { MFA_SLABS } from '../../data/compensation';
import { formatINR } from '../../utils/format';
import { INetwork, ICash, IShield, ICheck } from '../ui/icons';

const COMMISSION_SCENARIOS = {
  rd3y: {
    label: 'RD 3-Year Plan · Sample Inst #1',
    policyNo: 'DEMO-RD3Y-014',
    planCode: 'RD3Y · Year 1',
    businessAmount: '₹20,000 Deposit',
    totalCommission: '₹2,160',
    recipientsCount: '4 Eligible Agents',
    rows: [
      { rank: 'R1 · AO', agent: 'A. Sharma (Sample)', code: 'AX00109', role: 'Direct', pct: '7.00%', amount: '₹1,400', status: 'Paid' },
      { rank: 'R2 · AM', agent: 'K. Verma (Sample)', code: 'AX00064', role: 'Upline (+1)', pct: '2.00%', amount: '₹400', status: 'Paid' },
      { rank: 'R3 · ADM', agent: 'N. Patel (Sample)', code: 'AX00028', role: 'Upline (+2)', pct: '1.00%', amount: '₹200', status: 'Allocated' },
      { rank: 'R4 · DM', agent: 'M. Rao (Sample)', code: 'AX00011', role: 'Upline (+3)', pct: '0.75%', amount: '₹150', status: 'Allocated' },
    ],
  },
  fd5y: {
    label: 'FD 5-Year Plan · Sample Lump Sum',
    policyNo: 'DEMO-FD5Y-008',
    planCode: 'FD5Y · Term Year 5',
    businessAmount: '₹1,00,000 Deposit',
    totalCommission: '₹13,000',
    recipientsCount: '4 Eligible Agents',
    rows: [
      { rank: 'R1 · AO', agent: 'R. Nair (Sample)', code: 'AX00112', role: 'Direct', pct: '7.00%', amount: '₹7,000', status: 'Paid' },
      { rank: 'R2 · AM', agent: 'D. Joshi (Sample)', code: 'AX00051', role: 'Upline (+1)', pct: '3.00%', amount: '₹3,000', status: 'Paid' },
      { rank: 'R3 · ADM', agent: 'V. Menon (Sample)', code: 'AX00019', role: 'Upline (+2)', pct: '2.00%', amount: '₹2,000', status: 'Paid' },
      { rank: 'R4 · DM', agent: 'S. Iyer (Sample)', code: 'AX00005', role: 'Upline (+3)', pct: '1.00%', amount: '₹1,000', status: 'Allocated' },
    ],
  },
};

// Keep reconciled RD sum explicit: 1400 + 400 + 200 + 150 = 2150
COMMISSION_SCENARIOS.rd3y.totalCommission = '₹2,150';

const MFA_SCENARIOS = {
  ao: {
    label: 'Rank 1 · AO (Standard)',
    rankLabel: 'AO — Administrative Officer',
    target: 50000,
    achieved: 32500,
    reward: 3000,
    entries: [
      { label: 'Sample RD 1 (1 Year)', business: '₹10,000', weight: '25%', credit: '₹2,500' },
      { label: 'Sample RD 2 (3 Years)', business: '₹30,000', weight: '100%', credit: '₹30,000' },
    ],
  },
  am: {
    label: 'Rank 2 · AM (Mid-Cycle)',
    rankLabel: 'AM — Assistant Manager',
    target: 350000,
    achieved: 245000,
    reward: 5000,
    entries: [
      { label: 'Sample FD (2 Years)', business: '₹90,000', weight: '50%', credit: '₹45,000' },
      { label: 'Sample RD/FD (3+ Years)', business: '₹2,00,000', weight: '100%', credit: '₹2,00,000' },
    ],
  },
};

export function OrganizationalStructureSection() {
  const [tierGroup, setTierGroup] = useState('field');
  const [selectedRank, setSelectedRank] = useState(RANKS[0]);

  const fieldRanks = RANKS.slice(0, 10);
  const execRanks = RANKS.slice(10, 18);
  const visibleRanks = tierGroup === 'field' ? fieldRanks : execRanks;
  const activeSlab = MFA_SLABS[selectedRank.rank];

  const handleGroupChange = (group) => {
    setTierGroup(group);
    setSelectedRank(group === 'field' ? fieldRanks[0] : execRanks[0]);
  };

  return (
    <section id="hierarchy" className="bg-[#061A14] py-20 text-white sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#BFA256]">
              Organizational Architecture
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              An exact 18-rank hierarchy built for multi-level oversight.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#9AA8A2]">
              Every advisor and manager operates inside an explicit sponsor-linked chain from Rank 1 (Administrative Officer) to Rank 18 (Managing Director).
            </p>
          </div>

          <div className="inline-flex w-full rounded-xl border border-white/10 bg-black/30 p-1 sm:w-auto">
            {[
              { id: 'field', label: 'Ranks 1–10 · Field & Divisional' },
              { id: 'exec', label: 'Ranks 11–18 · Executive Tiers' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleGroupChange(tab.id)}
                className={`flex-1 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all sm:flex-initial ${
                  tierGroup === tab.id
                    ? 'bg-[#BFA256] text-[#04120E]'
                    : 'text-[#9AA8A2] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Vertical Progression Flow Diagram */}
          <div className="rounded-2xl border border-white/10 bg-[#04120E]/80 p-5 sm:p-6 lg:col-span-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E6C97A]">
              <INetwork size={16} /> Sponsor Chain Flow
            </div>

            <div className="space-y-2.5">
              {[
                {
                  tier: 'Ranks 14–18 · Top Executive Directorate',
                  codes: 'AVP · VP · SVP · EVP · MGD',
                  desc: 'Strategic network leadership & organization-wide oversight',
                },
                {
                  tier: 'Ranks 9–13 · Zonal & Corporate Management',
                  codes: 'ZM · ED · SED · MD · CMD',
                  desc: 'Multi-zone team scaling, upline differentials & CMD targets',
                },
                {
                  tier: 'Ranks 2–8 · Divisional & Branch Managers',
                  codes: 'AM · ADM · DM · SDM · CM · AGM · GM',
                  desc: 'Team recruitment, supervisory upline commissions & promotions',
                },
                {
                  tier: 'Rank 1 · Frontline Field Advisor',
                  codes: 'AO — Administrative Officer',
                  desc: 'Customer onboarding, RD/FD/Pension sales & direct commissions',
                },
              ].map((band, idx) => (
                <div key={band.tier}>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#BFA256]">
                      {band.tier}
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">{band.codes}</p>
                    <p className="mt-0.5 text-xs text-[#9AA8A2]">{band.desc}</p>
                  </div>
                  {idx < 3 && (
                    <div className="flex justify-center py-1 text-xs font-bold text-[#BFA256]/70" aria-hidden="true">
                      ↑
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-[#BFA256]/30 bg-[#BFA256]/10 p-3 text-center text-xs font-semibold text-[#E6C97A]">
              Customer CIF Profiles &amp; RD / FD / Pension Business Network
            </div>
          </div>

          {/* Interactive Rank Ladder Inspector */}
          <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#081C16] p-5 sm:p-6 lg:col-span-7">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#BFA256]">
                Select Any Configured Rank Level
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {visibleRanks.map((r) => {
                  const isSel = r.rank === selectedRank.rank;
                  return (
                    <button
                      key={r.rank}
                      type="button"
                      onClick={() => setSelectedRank(r)}
                      className={`rounded-xl border p-2.5 text-left transition-all ${
                        isSel
                          ? 'border-[#E6C97A] bg-[#BFA256]/15 text-white'
                          : 'border-white/10 bg-white/[0.02] text-[#9AA8A2] hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <span className="block font-mono text-[10px] text-[#BFA256]">R{r.rank}</span>
                      <span className="block font-serif text-sm font-bold text-white">{r.code}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-[#04120E] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  <span className="font-mono text-xs uppercase text-[#BFA256]">
                    Rank {selectedRank.rank} Configuration
                  </span>
                  <h3 className="font-serif text-xl font-bold text-white">
                    {selectedRank.code} — {selectedRank.name}
                  </h3>
                </div>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  {selectedRank.rank > 1 ? 'Team Recruiting Active' : 'Direct Business Tier'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                  <span className="block text-[10px] uppercase tracking-wider text-[#9AA8A2]">
                    MFA Qualification
                  </span>
                  <span className="mt-1 block font-mono text-sm font-bold text-white">
                    {activeSlab ? `${formatINR(activeSlab.mfaTarget)} / mo` : 'Leadership Tier'}
                  </span>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                  <span className="block text-[10px] uppercase tracking-wider text-[#9AA8A2]">
                    Monthly MFA Reward
                  </span>
                  <span className="mt-1 block font-mono text-sm font-bold text-[#E6C97A]">
                    {activeSlab ? formatINR(activeSlab.mfaReward) : 'Not Applicable (11–18)'}
                  </span>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                  <span className="block text-[10px] uppercase tracking-wider text-[#9AA8A2]">
                    5Y RD / FD Base Slab
                  </span>
                  <span className="mt-1 block font-mono text-sm font-bold text-white">
                    RD {Number(selectedRank.mdaY1?.[4] || 0).toFixed(2)}% · FD{' '}
                    {Number(selectedRank.fdPension?.[4] || 0).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CommissionVisibilitySection() {
  const [scenarioKey, setScenarioKey] = useState('rd3y');
  const scenario = COMMISSION_SCENARIOS[scenarioKey];

  return (
    <section id="commissions" className="bg-[#FAF8F5] py-20 text-[#16221F] sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
          {/* Narrative Left */}
          <div className="space-y-5 lg:col-span-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8D7952]">
              Commission Visibility
            </p>
            <h2 className="font-serif text-3xl font-bold tracking-tight text-[#132E22] sm:text-4xl">
              Clear, reconciled payouts across every policy and tier.
            </h2>
            <p className="text-base leading-relaxed text-[#51635E]">
              Every policy and installment links directly to a transparent commission ledger breakdown. Administrators audit complete upline distributions, while individual agents inspect their own earned commissions and payout statements.
            </p>

            <ul className="space-y-3 pt-1">
              {[
                'Direct seller vs upline commission role clarity',
                'Exact policy-year percentage and rupee share per agent',
                'Commission status tracking (Allocated, Paid, Reconciled)',
                'Monthly Commission Bills detailing TDS (5%) and Admin (5%) charges',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-[#132E22]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#132E22] text-[#E6C97A]">
                    <ICheck size={12} />
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Preview Right */}
          <div className="rounded-2xl border border-[#EBE6DC] bg-white p-4 shadow-sm sm:p-6 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EBE6DC] pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8D7952]">
                  Illustrative Preview · Sample Ledger
                </span>
                <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-[#132E22]">
                  <ICash size={18} className="text-[#8D7952]" /> Commission Allocation Breakdown
                </h3>
              </div>

              <div className="inline-flex rounded-lg border border-[#EBE6DC] bg-[#FAF8F5] p-0.5 text-xs">
                {[
                  { id: 'rd3y', label: 'RD-3Y Sample' },
                  { id: 'fd5y', label: 'FD-5Y Sample' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setScenarioKey(opt.id)}
                    className={`rounded-md px-3 py-1 font-semibold transition-all ${
                      scenarioKey === opt.id
                        ? 'bg-[#132E22] text-white'
                        : 'text-[#667873] hover:text-[#132E22]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary Strip */}
            <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-[#EBE6DC] bg-[#FAF8F5] p-3.5 sm:grid-cols-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#667873]">
                  Sample Policy
                </span>
                <span className="mt-0.5 block font-mono text-xs font-bold text-[#132E22]">
                  {scenario.policyNo} · {scenario.planCode}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#667873]">
                  Business Volume
                </span>
                <span className="mt-0.5 block text-sm font-bold text-[#132E22]">
                  {scenario.businessAmount}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#667873]">
                  Total Distributed
                </span>
                <span className="mt-0.5 block font-serif text-base font-bold text-[#8D7952]">
                  {scenario.totalCommission}{' '}
                  <span className="font-sans text-[11px] font-normal text-[#667873]">
                    ({scenario.recipientsCount})
                  </span>
                </span>
              </div>
            </div>

            {/* Responsive Cards on Mobile + Table on Desktop */}
            <div className="mt-4 space-y-2.5 sm:hidden">
              {scenario.rows.map((r) => (
                <div
                  key={r.code}
                  className="rounded-xl border border-[#EBE6DC] bg-[#FAF8F5]/60 p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-[#132E22]">{r.agent}</p>
                      <p className="font-mono text-[10px] text-[#667873]">
                        {r.code} · {r.rank}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-bold text-[#8D7952]">{r.amount}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-[#EBE6DC] pt-2 text-[11px]">
                    <span className="text-[#667873]">
                      {r.role} · Rate {r.pct}
                    </span>
                    <span className="rounded-full bg-[#132E22]/10 px-2 py-0.5 text-[10px] font-bold text-[#132E22]">
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#EBE6DC] text-[10px] font-bold uppercase tracking-wider text-[#667873]">
                    <th className="py-2 pr-3">Rank</th>
                    <th className="py-2 pr-3">Agent</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3 text-right">Rate</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE6DC]">
                  {scenario.rows.map((r) => (
                    <tr key={r.code}>
                      <td className="py-2.5 pr-3 font-mono font-semibold text-[#8D7952]">
                        {r.rank}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="block font-semibold text-[#132E22]">{r.agent}</span>
                        <span className="font-mono text-[10px] text-[#667873]">{r.code}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-[#667873]">{r.role}</td>
                      <td className="py-2.5 pr-3 text-right font-mono">{r.pct}</td>
                      <td className="py-2.5 pr-3 text-right font-mono font-bold text-[#132E22]">
                        {r.amount}
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="rounded-full bg-[#132E22]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#132E22]">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PerformanceTargetsSection() {
  const [mfaKey, setMfaKey] = useState('ao');
  const shouldReduceMotion = useReducedMotion();
  const s = MFA_SCENARIOS[mfaKey];
  const remaining = Math.max(0, s.target - s.achieved);
  const pct = Math.min(100, Math.round((s.achieved / s.target) * 100));

  return (
    <section id="performance" className="bg-[#04120E] py-20 text-white sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
          {/* Interactive MFA Tracker Card Left */}
          <div className="order-2 rounded-2xl border border-white/12 bg-[#081C16] p-5 shadow-2xl sm:p-7 lg:order-1 lg:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#BFA256]/15 text-[#E6C97A]">
                  <IShield size={18} />
                </span>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#BFA256]">
                    Illustrative MFA Progress Card
                  </span>
                  <h3 className="font-serif text-lg font-bold text-white">{s.rankLabel}</h3>
                </div>
              </div>

              <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5 text-xs">
                {[
                  { id: 'ao', label: 'AO Example (65%)' },
                  { id: 'am', label: 'AM Example (70%)' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMfaKey(opt.id)}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                      mfaKey === opt.id
                        ? 'bg-[#BFA256] text-[#04120E]'
                        : 'text-[#9AA8A2] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4 Key Target Metrics */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <span className="block text-[10px] uppercase tracking-wider text-[#9AA8A2]">
                  Monthly Target
                </span>
                <span className="mt-1 block font-mono text-sm font-bold text-white sm:text-base">
                  {formatINR(s.target)}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <span className="block text-[10px] uppercase tracking-wider text-[#9AA8A2]">
                  Achieved
                </span>
                <span className="mt-1 block font-mono text-sm font-bold text-emerald-300 sm:text-base">
                  {formatINR(s.achieved)}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <span className="block text-[10px] uppercase tracking-wider text-[#9AA8A2]">
                  Remaining
                </span>
                <span className="mt-1 block font-mono text-sm font-bold text-white sm:text-base">
                  {formatINR(remaining)}
                </span>
              </div>
              <div className="rounded-xl border border-[#BFA256]/30 bg-[#BFA256]/10 p-3">
                <span className="block text-[10px] uppercase tracking-wider text-[#E6C97A]">
                  Achievement
                </span>
                <span className="mt-1 block font-serif text-base font-bold text-[#E6C97A] sm:text-lg">
                  {pct}%
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Calendar Month Qualification</span>
                <span className="font-mono text-[#E6C97A]">
                  Monthly Reward: {formatINR(s.reward)} at 100%
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full border border-white/10 bg-black/40">
                <motion.div
                  key={mfaKey}
                  initial={shouldReduceMotion ? false : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.65, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-[#8C7335] via-[#BFA256] to-[#E6C97A]"
                />
              </div>
            </div>

            {/* Duration Credit Calculation Sample */}
            <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#9AA8A2]">
                Duration-Weighted MFA Credit Formula
              </p>
              {s.entries.map((entry) => (
                <div
                  key={entry.label}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs"
                >
                  <span className="font-medium text-white">{entry.label}</span>
                  <span className="font-mono text-[#9AA8A2]">
                    {entry.business} × {entry.weight} ={' '}
                    <strong className="text-[#E6C97A]">{entry.credit}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Copy Right */}
          <div className="order-1 space-y-5 lg:order-2 lg:col-span-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#BFA256]">
              Performance &amp; Target Tracking
            </p>
            <h2 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Monthly MFA quotas and career targets in real time.
            </h2>
            <p className="text-base leading-relaxed text-[#9AA8A2]">
              Track every advisor’s progress toward rank-specific Monthly Field Allowance (MFA) rewards alongside long-term rank promotion quotas and CMD weighted awards — without mixing incentives into commission calculations.
            </p>

            <div className="grid grid-cols-1 gap-3.5 pt-2 sm:grid-cols-2">
              {[
                {
                  title: 'Duration-Weighted Credit',
                  desc: '1-Year business counts 25%, 2-Year counts 50%, and 3+ Years counts 100% toward MFA.',
                },
                {
                  title: 'Strict Monthly Reset',
                  desc: 'Every calendar month starts fresh with zero carry-forward of incomplete targets.',
                },
                {
                  title: 'Rank Slabs (Ranks 1–10)',
                  desc: 'Dedicated monthly MFA targets from ₹50,000 (AO) to ₹50,00,000 (ED).',
                },
                {
                  title: 'Promotion & CMD Tracking',
                  desc: 'Monitor promotion quotas, promotee legs, and 80/20 weighted business volume.',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-white/10 bg-white/[0.025] p-4"
                >
                  <h4 className="text-sm font-bold text-white">{card.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-[#9AA8A2]">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
