import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import Logo from '../components/ui/Logo';
import HeroPlatformPreview from '../components/landing/HeroPlatformPreview';
import PlatformCapabilitiesSection from '../components/landing/PlatformCapabilitiesSection';
import {
  OrganizationalStructureSection,
  CommissionVisibilitySection,
  PerformanceTargetsSection,
} from '../components/landing/HierarchyAndPreviewsSection';
import {
  IChevron,
  IMenu,
  IClose,
  IDashboard,
  INetwork,
  IDoc,
  ICash,
  ITrophy,
  IReport,
  IShield,
  IUsers,
  ICheck,
} from '../components/ui/icons';

const NAV_LINKS = [
  { name: 'Platform', id: 'about' },
  { name: 'Capabilities', id: 'capabilities' },
  { name: 'Hierarchy', id: 'hierarchy' },
  { name: 'Commissions', id: 'commissions' },
  { name: 'Targets & MFA', id: 'performance' },
];

const WHY_APEX = [
  {
    icon: IDashboard,
    title: 'Centralized Business Operations',
    desc: 'Bring customer CIF records, policies, collections, agent accounts, and administrative logs into one structured system.',
  },
  {
    icon: IReport,
    title: 'Organizational Performance Visibility',
    desc: 'Monitor personal, direct team, and full network business volume with monthly and cumulative views scoped by role.',
  },
  {
    icon: INetwork,
    title: 'Structured Agent Management',
    desc: 'Manage an 18-level sponsor hierarchy with clear recruitment permissions, profile verification, and downline inspection.',
  },
  {
    icon: ICash,
    title: 'Clear Commission Reconciliation',
    desc: 'Trace every direct and upline commission share per policy and installment back to configurable rank-wise rate tables.',
  },
  {
    icon: IShield,
    title: 'Structured Monthly Target Monitoring',
    desc: 'Track duration-weighted Monthly Field Allowance targets with strict calendar-month resets and reward qualification clarity.',
  },
  {
    icon: IDoc,
    title: 'Reduced Spreadsheet Dependency',
    desc: 'Validate bulk imports cleanly, inspect diagnostics row by row, and export standardized Excel reports directly from live records.',
  },
];

const UNIFIED_NODES = [
  { label: 'Management Oversight', sub: 'Approvals, master configs & audit trail', icon: IShield },
  { label: 'Agent Network', sub: '18-rank hierarchy & genealogy explorer', icon: INetwork },
  { label: 'Business Records', sub: 'Customer CIF, RD/FD/Pension & receipts', icon: IDoc },
  { label: 'Commission Ledger', sub: 'Direct & upline reconciliation bills', icon: ICash },
  { label: 'Monthly Targets', sub: 'MFA duration credits & promotions', icon: ITrophy },
  { label: 'Reporting Suite', sub: 'Collections, maturities & .xlsx exports', icon: IReport },
];

export default function Landing() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#04120E] font-sans text-white selection:bg-[#BFA256] selection:text-[#04120E]">
      {/* ── STICKY ENTERPRISE HEADER ──────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 py-3 sm:px-6 lg:px-8">
        <div
          className={`mx-auto max-w-7xl rounded-2xl border transition-all duration-300 ${
            isScrolled || mobileMenuOpen
              ? 'border-white/12 bg-[#061813]/95 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.75)] backdrop-blur-xl'
              : 'border-white/8 bg-[#04120E]/65 backdrop-blur-md'
          }`}
        >
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            {/* Brand Identity */}
            <button
              type="button"
              onClick={() => scrollTo('home')}
              className="flex min-w-0 items-center gap-3 text-left"
              aria-label="Apex Multisolutions Home"
            >
              <Logo size={42} showText={false} />
              <div className="min-w-0">
                <span className="block truncate font-serif text-lg font-bold tracking-tight text-white sm:text-xl">
                  Apex Multisolutions
                </span>
                <span className="block truncate text-[10px] font-bold uppercase tracking-[0.2em] text-[#BFA256]">
                  Branch Operations Portal
                </span>
              </div>
            </button>

            {/* Desktop Links */}
            <nav aria-label="Primary sections" className="hidden items-center gap-1 lg:flex">
              {NAV_LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => scrollTo(link.id)}
                  className="rounded-lg px-3.5 py-2 text-xs font-semibold tracking-wide text-[#B4C2BC] transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  {link.name}
                </button>
              ))}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="hidden items-center gap-2 rounded-xl bg-gradient-to-r from-[#E6C97A] via-[#BFA256] to-[#9B7F3D] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#04120E] shadow-sm transition-transform hover:-translate-y-0.5 sm:inline-flex"
              >
                Login to Dashboard
              </Link>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-[#C5D1CC] hover:text-white lg:hidden"
              >
                {mobileMenuOpen ? <IClose size={20} /> : <IMenu size={20} />}
              </button>
            </div>
          </div>

          {/* Mobile Collapsible Nav */}
          {mobileMenuOpen && (
            <nav
              aria-label="Mobile navigation"
              className="space-y-1 border-t border-white/10 px-4 py-3 lg:hidden"
            >
              {NAV_LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => scrollTo(link.id)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#D6DFDB] hover:bg-white/[0.05] hover:text-white"
                >
                  <span>{link.name}</span>
                  <IChevron size={15} className="text-[#BFA256]" />
                </button>
              ))}
              <div className="pt-2">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#E6C97A] to-[#BFA256] px-4 py-3 text-sm font-bold text-[#04120E]"
                >
                  Login to Your Dashboard
                </Link>
              </div>
            </nav>
          )}
        </div>
      </header>

      <main>
        {/* ── 1. HERO SECTION ───────────────────────────────────────────── */}
        <section
          id="home"
          className="relative overflow-hidden bg-[#04120E] pt-28 pb-16 sm:pt-32 sm:pb-24 lg:pt-36 lg:pb-28"
        >
          {/* Architectural Background Grid & Radial Accent */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle at 18% 15%, rgba(191, 162, 86, 0.14), transparent 42%), radial-gradient(circle at 82% 30%, rgba(29, 70, 52, 0.35), transparent 48%)',
            }}
          />

          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
              {/* Left Narrative Column */}
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                className="lg:col-span-5"
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-[#BFA256]/30 bg-[#BFA256]/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#E6C97A]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E6C97A]" />
                  Agency &amp; Financial Network Operations
                </div>

                <h1 className="mt-5 font-serif text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[3.35rem]">
                  Your Entire Business Network.{' '}
                  <span className="text-[#E6C97A]">One Intelligent Platform.</span>
                </h1>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-[#A6B5AF] sm:text-lg">
                  Manage agents, 18-level sponsor hierarchies, RD/FD/Pension policy lifecycles, reconciled commission ledgers, monthly MFA targets, and branch reporting from one centralized operations portal.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => scrollTo('capabilities')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#E6C97A] to-[#BFA256] px-6 py-3.5 text-sm font-bold text-[#04120E] shadow-lg transition-transform hover:-translate-y-0.5"
                  >
                    Explore the Platform
                    <IChevron size={17} />
                  </button>
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:border-[#BFA256]/50 hover:bg-white/[0.08]"
                  >
                    Login to Your Dashboard
                  </Link>
                </div>

                {/* Factual System Architecture Highlights */}
                <div className="mt-10 grid grid-cols-3 gap-3 border-t border-white/10 pt-6">
                  <div>
                    <p className="font-serif text-lg font-bold text-white sm:text-xl">18 Ranks</p>
                    <p className="mt-0.5 text-[11px] text-[#9AA8A2]">AO through MGD hierarchy</p>
                  </div>
                  <div>
                    <p className="font-serif text-lg font-bold text-white sm:text-xl">3 Portfolios</p>
                    <p className="mt-0.5 text-[11px] text-[#9AA8A2]">RD, FD &amp; Pension tracking</p>
                  </div>
                  <div>
                    <p className="font-serif text-lg font-bold text-[#E6C97A] sm:text-xl">MFA + Bills</p>
                    <p className="mt-0.5 text-[11px] text-[#9AA8A2]">Targets &amp; commission audit</p>
                  </div>
                </div>
              </motion.div>

              {/* Right Interactive Software Preview */}
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.1, ease: 'easeOut' }}
                className="lg:col-span-7"
              >
                <HeroPlatformPreview />
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── 2. ABOUT THE PLATFORM ────────────────────────────────────── */}
        <section id="about" className="bg-[#FAF8F5] py-20 text-[#16221F] sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
              <div className="space-y-5 lg:col-span-6">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8D7952]">
                  About Apex Multisolutions
                </p>
                <h2 className="font-serif text-3xl font-bold tracking-tight text-[#132E22] sm:text-4xl lg:text-5xl">
                  Built to Manage Growth. Designed to Simplify Operations.
                </h2>
                <p className="text-base leading-relaxed text-[#4E5F5A] sm:text-lg">
                  Growing field-agent networks often struggle with disconnected spreadsheets, manual commission reconciliations, and unclear target progress. Apex Multisolutions replaces fragmented workflows with a unified system of record for both executives and field advisors.
                </p>
                <p className="text-sm leading-relaxed text-[#5F716B] sm:text-base">
                  Branch administrators maintain structured customer CIF folders, onboard multi-year policies, and audit payouts across every sponsor tier — while individual agents log in to see their real-time team volume, earnings statements, and monthly incentive standing.
                </p>
              </div>

              <div className="lg:col-span-6">
                <div className="rounded-2xl border border-[#EBE6DC] bg-white p-5 shadow-sm sm:p-7">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8D7952]">
                    End-to-End Operational Flow
                  </p>
                  <div className="mt-5 space-y-3">
                    {[
                      {
                        step: '01',
                        title: 'Customer CIF & Policy Enrollment',
                        desc: 'Onboard KYC profiles and start RD (1Y–5Y), FD (1Y–5Y), or Pension plans manually or via validated Excel imports.',
                      },
                      {
                        step: '02',
                        title: 'Sponsor Chain & Commission Allocation',
                        desc: 'Credit direct sellers and eligible upline sponsors per policy year and installment in a reconciled commission ledger.',
                      },
                      {
                        step: '03',
                        title: 'Monthly MFA & Target Monitoring',
                        desc: 'Apply 25% / 50% / 100% duration rules cleanly each calendar month across Ranks 1–10 without carry-forward ambiguity.',
                      },
                      {
                        step: '04',
                        title: 'Payout Bills & Executive Reporting',
                        desc: 'Generate monthly payout bills (TDS 5% + Admin 5%), analyze collections, and export multi-sheet workbooks.',
                      },
                    ].map((flow) => (
                      <div
                        key={flow.step}
                        className="flex items-start gap-4 rounded-xl border border-[#EBE6DC] bg-[#FAF8F5] p-3.5"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#132E22] font-mono text-xs font-bold text-[#E6C97A]">
                          {flow.step}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-[#132E22]">{flow.title}</h3>
                          <p className="mt-0.5 text-xs leading-relaxed text-[#5F716B]">
                            {flow.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. PLATFORM CAPABILITIES (INTERACTIVE EXPLORER) ──────────── */}
        <PlatformCapabilitiesSection />

        {/* ── 4. ORGANIZATIONAL STRUCTURE (REAL 18-RANK HIERARCHY) ─────── */}
        <OrganizationalStructureSection />

        {/* ── 5. COMMISSION VISIBILITY ───────────────────────────────────── */}
        <CommissionVisibilitySection />

        {/* ── 6. PERFORMANCE & MFA TARGET TRACKING ─────────────────────── */}
        <PerformanceTargetsSection />

        {/* ── 7. WHY ORGANIZATIONS USE APEX ────────────────────────────── */}
        <section id="why-apex" className="bg-white py-20 text-[#16221F] sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8D7952]">
                Why Organizations Choose Apex
              </p>
              <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#132E22] sm:text-4xl">
                Practical discipline across every operational layer.
              </h2>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {WHY_APEX.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-[#EBE6DC] bg-[#FAF8F5] p-6 transition-colors hover:border-[#8D7952]/60"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#132E22] text-[#E6C97A]">
                      <Icon size={20} />
                    </span>
                    <h3 className="mt-4 font-serif text-xl font-bold text-[#132E22]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#546560]">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── 8. UNIFIED PLATFORM EXPERIENCE ───────────────────────────── */}
        <section id="experience" className="bg-[#F4EFEA] py-20 text-[#16221F] sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
            <div className="rounded-3xl border border-[#E2DACB] bg-white p-6 shadow-sm sm:p-10">
              <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-5">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8D7952]">
                    Unified Operations Architecture
                  </p>
                  <h2 className="font-serif text-2xl font-bold tracking-tight text-[#132E22] sm:text-3xl lg:text-4xl">
                    One connected platform for leadership and field teams.
                  </h2>
                  <p className="text-sm leading-relaxed text-[#546560] sm:text-base">
                    Instead of reconciling policies, commissions, agent rosters, and incentives across separate tools, every module shares verified data inside a single permission-governed architecture.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2 text-xs font-semibold text-[#132E22]">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EBE6DC] bg-[#FAF8F5] px-3 py-1">
                      <IUsers size={13} className="text-[#8D7952]" /> Super Admin Workspace
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EBE6DC] bg-[#FAF8F5] px-3 py-1">
                      <ICheck size={13} className="text-[#8D7952]" /> Field Agent Self-Service Portal
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-7 lg:grid-cols-3">
                  {UNIFIED_NODES.map((node) => {
                    const Icon = node.icon;
                    return (
                      <div
                        key={node.label}
                        className="rounded-xl border border-[#EBE6DC] bg-[#FAF8F5] p-4"
                      >
                        <div className="flex items-center gap-2 text-[#132E22]">
                          <Icon size={17} className="shrink-0 text-[#8D7952]" />
                          <span className="text-xs font-bold uppercase tracking-wide">
                            {node.label}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-[#667873]">
                          {node.sub}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 9. FINAL CALL TO ACTION ──────────────────────────────────── */}
        <section id="cta" className="bg-[#04120E] py-20 text-white sm:py-28">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#BFA256]">
              Authorized Portal Access
            </p>
            <h2 className="mt-4 font-serif text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Bring Your Business Operations Together.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#9AA8A2] sm:text-lg">
              Sign in with your administrator credentials or assigned Agent ID to access policy records, commission ledgers, downline analytics, and monthly target dashboards.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#E6C97A] to-[#BFA256] px-8 py-4 text-sm font-bold uppercase tracking-wider text-[#04120E] shadow-xl transition-transform hover:-translate-y-0.5 sm:w-auto"
              >
                Access Your Dashboard
                <IChevron size={17} />
              </Link>
              <button
                type="button"
                onClick={() => scrollTo('home')}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08] sm:w-auto"
              >
                Back to Top
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── 10. ENTERPRISE FOOTER ─────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-[#030D0A] py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3">
                <Logo size={42} showText={false} />
                <div>
                  <span className="block font-serif text-lg font-bold text-white">
                    Apex Multisolutions
                  </span>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[#BFA256]">
                    Performance &amp; Reward Operations
                  </span>
                </div>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#9AA8A2]">
                A centralized platform for managing field-agent hierarchies, RD/FD/Pension policy lifecycles, commission visibility, and monthly target tracking.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 md:col-span-7 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white">
                  Platform Sections
                </h3>
                <ul className="mt-3.5 space-y-2.5 text-sm text-[#9AA8A2]">
                  <li>
                    <button type="button" onClick={() => scrollTo('about')} className="hover:text-white">
                      About Platform
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => scrollTo('capabilities')} className="hover:text-white">
                      Capabilities
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => scrollTo('hierarchy')} className="hover:text-white">
                      18-Rank Hierarchy
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => scrollTo('commissions')} className="hover:text-white">
                      Commission Visibility
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => scrollTo('performance')} className="hover:text-white">
                      Targets &amp; MFA
                    </button>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white">
                  System Access
                </h3>
                <ul className="mt-3.5 space-y-2.5 text-sm text-[#9AA8A2]">
                  <li>
                    <Link to="/login" className="font-semibold text-[#E6C97A] hover:underline">
                      Login to Your Dashboard
                    </Link>
                  </li>
                  <li>
                    <button type="button" onClick={() => scrollTo('why-apex')} className="hover:text-white">
                      Why Apex
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => scrollTo('experience')} className="hover:text-white">
                      Unified Architecture
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-center text-xs text-[#7D8F89] sm:flex-row sm:text-left">
            <p>&copy; {new Date().getFullYear()} Apex Multisolutions. All rights reserved.</p>
            <p>Internal Role-Governed Operations Portal</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
