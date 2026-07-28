import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  INetwork, 
  IShield, 
  IReport, 
  IUsers, 
  ITrophy, 
  IAlert, 
  IChevron,
  IMenu,
  IClose,
  ICheck,
  ISearch
} from '../components/ui/icons';

// Minimalist, premium logo
const Logo = ({ size = 32, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" fill="none" className={className}>
    <circle cx="100" cy="100" r="100" fill="transparent" />
    <path d="M100 30 L170 150 L30 150 Z" fill="url(#premiumGold)" />
    <path d="M100 65 L145 140 L55 140 Z" fill="#04120E" />
    <path d="M100 85 L125 130 L75 130 Z" fill="url(#premiumGold)" />
    <defs>
      <linearGradient id="premiumGold" x1="30" y1="30" x2="170" y2="150" gradientUnits="userSpaceOnUse">
        <stop stopColor="#E6C97A" />
        <stop offset="0.5" stopColor="#BFA256" />
        <stop offset="1" stopColor="#8C7335" />
      </linearGradient>
    </defs>
  </svg>
);

const Landing = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const navLinks = [
    { name: 'Platform', href: '#home' },
    { name: 'Solutions', href: '#why-us' },
    { name: 'Infrastructure', href: '#services' },
    { name: 'Enterprise', href: '#opportunity' }
  ];

  return (
    <div className="min-h-screen bg-[#04120E] text-white font-sans selection:bg-[#BFA256] selection:text-[#04120E] overflow-x-hidden">
      
      {/* FLOATING GLASS NAVBAR */}
      <nav 
        className={`fixed top-0 w-full z-50 transition-all duration-700 ease-in-out px-4 sm:px-6 lg:px-8 ${
          isScrolled ? 'py-4' : 'py-8'
        }`}
      >
        <div 
          className={`max-w-7xl mx-auto rounded-full transition-all duration-700 ${
            isScrolled 
              ? 'bg-[#081C16]/80 backdrop-blur-2xl border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.6)] px-8' 
              : 'bg-transparent px-4'
          }`}
        >
          <div className="flex justify-between items-center h-16">
            
            {/* Logo area */}
            <div className="flex-shrink-0 cursor-pointer flex items-center gap-4 transition-transform duration-500 hover:scale-[1.02]" onClick={() => scrollTo('home')}>
              <Logo size={44} />
              <div className="hidden sm:block mt-1">
                <div className="text-white font-extrabold text-2xl leading-none tracking-tight">Apex Multisolutions</div>
                <div className="text-[#BFA256] text-[0.7rem] font-bold uppercase tracking-[0.2em] mt-1.5">Performance Portal</div>
              </div>
            </div>

            {/* Nav links */}
            <div className="hidden lg:flex items-center space-x-2">
              {navLinks.map((link) => (
                <button 
                  key={link.name} 
                  onClick={() => scrollTo(link.href.substring(1))}
                  className="px-5 py-2 text-sm font-medium tracking-wide text-[#9AA8A2] hover:text-white rounded-full hover:bg-white/[0.03] transition-all duration-300"
                >
                  {link.name}
                </button>
              ))}
            </div>
            
            {/* CTA */}
            <div className="hidden lg:block">
              <Link 
                to="/login"
                className="group relative inline-flex items-center justify-center bg-gradient-to-r from-[#E6C97A] via-[#BFA256] to-[#8C7335] text-[#04120E] px-8 py-3 rounded-full font-bold text-sm transition-all duration-500 hover:-translate-y-0.5"
              >
                <span className="relative z-10">Sign In</span>
                <div className="absolute inset-0 rounded-full bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute -inset-1 rounded-full bg-[#BFA256]/30 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </Link>
            </div>

            {/* Mobile Nav Toggle */}
            <div className="lg:hidden flex items-center">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-[#9AA8A2] hover:text-white p-2">
                {mobileMenuOpen ? <IClose size={28} /> : <IMenu size={28} />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* CINEMATIC HERO SECTION */}
      <section id="home" className="relative pt-48 pb-40 lg:pt-64 lg:pb-56 overflow-hidden min-h-screen flex items-center">
        
        {/* Background Textures & Lighting */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          {/* Abstract map texture */}
          <div className="absolute inset-0 bg-map-pattern mix-blend-overlay" />
          
          {/* Cinematic Spotlights */}
          <div className="absolute -top-[10%] left-[20%] w-[50%] h-[50%] rounded-full bg-[#BFA256]/10 blur-[180px]" />
          <div className="absolute top-[20%] right-[10%] w-[40%] h-[60%] rounded-full bg-[#081C16] blur-[150px]" />
          <div className="absolute bottom-[-20%] left-[30%] w-[40%] h-[50%] rounded-full bg-emerald-900/20 blur-[150px]" />
          
          {/* Light Rays */}
          <div className="absolute -top-[30%] left-[10%] w-[100%] h-[30%] bg-white/[0.01] blur-[80px] rotate-[35deg] transform origin-top-left" />
          
          {/* Floating Particles */}
          <div className="absolute top-[20%] left-[15%] w-2 h-2 rounded-full bg-[#BFA256]/40 blur-[1px] animate-particle-1" />
          <div className="absolute top-[60%] left-[5%] w-3 h-3 rounded-full bg-emerald-500/30 blur-[2px] animate-particle-2" />
          <div className="absolute top-[30%] right-[20%] w-1.5 h-1.5 rounded-full bg-white/30 blur-[1px] animate-particle-3" />
          <div className="absolute bottom-[20%] right-[10%] w-2 h-2 rounded-full bg-[#BFA256]/20 blur-[1px] animate-particle-1" style={{ animationDelay: '2s' }} />
        </div>

        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-16 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-20 lg:gap-16 items-center">
            
            {/* LEFT TYPOGRAPHY */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} // smooth apple-like ease
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/[0.02] border border-white/5 text-[#BFA256] text-[0.7rem] font-bold uppercase tracking-[0.2em] mb-10 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#BFA256] animate-pulse" />
                Trusted Performance Management Platform
              </div>
              
              <h1 className="text-6xl sm:text-7xl lg:text-[5rem] font-bold tracking-[-0.03em] text-white mb-8 leading-[1.05]">
                Elevating Performance. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E6C97A] via-[#BFA256] to-[#8C7335]">
                  Expanding Horizons.
                </span>
              </h1>
              
              <p className="text-xl text-[#9AA8A2] mb-12 leading-[1.8] font-medium max-w-lg tracking-wide">
                Partner with Apex Multisolutions for transparent commission management, actionable analytics, and the institutional infrastructure required to scale your business network.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-5 mb-16">
                <Link 
                  to="/login" 
                  className="group relative inline-flex justify-center items-center gap-3 bg-gradient-to-r from-[#E6C97A] to-[#BFA256] text-[#04120E] px-10 py-4.5 rounded-2xl font-bold text-lg transition-all duration-500 hover:-translate-y-1 shadow-[0_10px_30px_rgba(191,162,86,0.15)]"
                >
                  <span className="relative z-10">Access Portal</span>
                  <IChevron size={20} className="relative z-10 ml-1 transition-transform duration-300 group-hover:translate-x-1" />
                  <div className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Link>
                <button 
                  onClick={() => scrollTo('contact')}
                  className="inline-flex justify-center items-center gap-2 bg-white/[0.02] backdrop-blur-md border border-white/10 text-white px-10 py-4.5 rounded-2xl font-bold text-lg transition-all duration-500 hover:bg-white/[0.05] hover:border-white/20"
                >
                  Contact Sales
                </button>
              </div>

              {/* Minimal Trust Indicators */}
              <div className="flex items-center gap-8 border-t border-white/5 pt-8">
                <div className="flex flex-col">
                  <span className="text-white font-bold text-2xl">99.9%</span>
                  <span className="text-[#9AA8A2] text-xs font-semibold uppercase tracking-wider">Uptime SLA</span>
                </div>
                <div className="w-px h-10 bg-white/5" />
                <div className="flex flex-col">
                  <span className="text-white font-bold text-2xl">SOC 2</span>
                  <span className="text-[#9AA8A2] text-xs font-semibold uppercase tracking-wider">Certified</span>
                </div>
                <div className="w-px h-10 bg-white/5" />
                <div className="flex flex-col">
                  <span className="text-white font-bold text-2xl">256-bit</span>
                  <span className="text-[#9AA8A2] text-xs font-semibold uppercase tracking-wider">Encryption</span>
                </div>
              </div>
            </motion.div>

            {/* RIGHT: HIGH-FIDELITY SaaS DASHBOARD MOCKUP */}
            <motion.div 
              initial={{ opacity: 0, x: 50, rotateY: -10 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative hidden lg:block perspective-1000 w-full h-[700px] mt-10"
            >
              <div className="rotate-dashboard transition-transform duration-1000 hover:rotate-dashboard-hover relative w-[130%] -ml-[15%] h-full">
                
                {/* Dashboard Frame Container */}
                <div className="absolute inset-0 bg-[#081C16]/80 backdrop-blur-3xl rounded-[2rem] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.8),inset_0_0_0_1px_rgba(255,255,255,0.05)] flex overflow-hidden">
                  
                  {/* SIDEBAR */}
                  <div className="w-64 bg-black/20 border-r border-white/5 p-6 flex flex-col gap-8">
                    {/* Fake Logo */}
                    <div className="flex items-center gap-3 px-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E6C97A] to-[#8C7335] p-[1px]">
                        <div className="w-full h-full bg-[#04120E] rounded-md" />
                      </div>
                      <div className="h-4 w-24 bg-white/20 rounded-md" />
                    </div>

                    {/* Nav Items */}
                    <div className="flex flex-col gap-2">
                      <div className="h-10 rounded-xl bg-white/10 border border-white/5 flex items-center px-4 gap-4 shadow-inner">
                        <div className="w-4 h-4 rounded-md bg-[#BFA256]" />
                        <div className="h-2.5 w-20 bg-white/80 rounded-md" />
                      </div>
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-10 rounded-xl flex items-center px-4 gap-4 hover:bg-white/5 transition-colors">
                          <div className="w-4 h-4 rounded-md bg-white/20" />
                          <div className="h-2 w-24 bg-white/30 rounded-md" />
                        </div>
                      ))}
                    </div>

                    {/* Profile */}
                    <div className="mt-auto h-16 rounded-2xl bg-white/5 border border-white/5 p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#BFA256] to-emerald-700 p-[2px]">
                        <div className="w-full h-full rounded-full bg-[#081C16] border-2 border-[#081C16]" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="h-2 w-20 bg-white/80 rounded-md" />
                        <div className="h-1.5 w-12 bg-white/30 rounded-md" />
                      </div>
                    </div>
                  </div>

                  {/* MAIN CONTENT AREA */}
                  <div className="flex-1 p-8 flex flex-col gap-8 overflow-hidden bg-gradient-to-br from-transparent to-black/10">
                    
                    {/* Top Bar */}
                    <div className="flex justify-between items-center">
                      <div className="h-8 w-48 bg-white/10 rounded-lg" />
                      <div className="flex gap-4">
                        <div className="h-10 w-64 bg-black/20 border border-white/5 rounded-xl flex items-center px-4 gap-3">
                          <ISearch size={16} className="text-white/30" />
                          <div className="h-2 w-20 bg-white/20 rounded-md" />
                        </div>
                        <div className="h-10 w-10 bg-white/5 border border-white/5 rounded-xl flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-[#BFA256] absolute top-2 right-2" />
                        </div>
                      </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-3 gap-6">
                      {[
                        { trend: '+12.5%', color: 'text-emerald-400' },
                        { trend: '+4.2%', color: 'text-emerald-400' },
                        { trend: '-1.8%', color: 'text-red-400' }
                      ].map((kpi, i) => (
                        <div key={i} className="bg-white/5 border border-white/5 p-6 rounded-3xl relative overflow-hidden backdrop-blur-md">
                          <div className="flex justify-between items-start mb-4">
                            <div className="h-2.5 w-24 bg-white/30 rounded-md" />
                            <div className={`text-[10px] font-bold px-2 py-1 rounded-md bg-black/30 ${kpi.color}`}>
                              {kpi.trend}
                            </div>
                          </div>
                          <div className="h-8 w-32 bg-white/90 rounded-lg mb-2" />
                          <div className="h-2 w-16 bg-white/20 rounded-md" />
                          
                          {/* Subtle background glow per card */}
                          {i === 0 && <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-[#BFA256]/10 rounded-full blur-2xl" />}
                        </div>
                      ))}
                    </div>

                    {/* Charts & Graphs Row */}
                    <div className="flex gap-6 h-64">
                      {/* Main Chart */}
                      <div className="flex-[2] bg-white/5 border border-white/5 p-6 rounded-3xl flex flex-col justify-between">
                        <div className="flex justify-between">
                          <div className="h-3 w-32 bg-white/40 rounded-md" />
                          <div className="h-6 w-20 bg-white/10 rounded-lg" />
                        </div>
                        <div className="flex items-end gap-3 h-32 mt-6">
                          {[30, 45, 20, 60, 80, 50, 95, 75, 40, 85].map((h, i) => (
                            <div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-[#BFA256]/20 to-[#BFA256]" style={{ height: `${h}%` }} />
                          ))}
                        </div>
                        <div className="flex justify-between mt-4 px-2">
                          {[...Array(10)].map((_, i) => (
                            <div key={i} className="h-1.5 w-4 bg-white/20 rounded-sm" />
                          ))}
                        </div>
                      </div>
                      
                      {/* Side Widget */}
                      <div className="flex-1 bg-white/5 border border-white/5 p-6 rounded-3xl flex flex-col">
                        <div className="h-3 w-24 bg-white/40 rounded-md mb-8" />
                        <div className="relative w-32 h-32 mx-auto">
                          <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#BFA256" strokeWidth="3" strokeDasharray="75, 100" />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="h-4 w-12 bg-white/90 rounded-md mb-1" />
                            <div className="h-1.5 w-6 bg-white/30 rounded-sm" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Data Table */}
                    <div className="flex-1 bg-white/5 border border-white/5 p-6 rounded-3xl flex flex-col">
                      <div className="h-3 w-32 bg-white/40 rounded-md mb-6" />
                      
                      <div className="flex justify-between border-b border-white/5 pb-3 mb-3">
                        <div className="h-2 w-16 bg-white/20 rounded-md" />
                        <div className="h-2 w-16 bg-white/20 rounded-md" />
                        <div className="h-2 w-16 bg-white/20 rounded-md" />
                        <div className="h-2 w-16 bg-white/20 rounded-md" />
                      </div>

                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
                          <div className="flex items-center gap-4 w-1/4">
                            <div className="w-8 h-8 rounded-full bg-white/10" />
                            <div className="flex flex-col gap-1.5">
                              <div className="h-2 w-20 bg-white/80 rounded-md" />
                              <div className="h-1.5 w-12 bg-white/30 rounded-md" />
                            </div>
                          </div>
                          <div className="w-1/4 flex justify-center">
                            <div className="h-2 w-16 bg-white/60 rounded-md" />
                          </div>
                          <div className="w-1/4 flex justify-center">
                            <div className={`h-5 w-16 rounded-full flex items-center justify-center bg-white/5 border border-white/10`}>
                              <div className="h-1 w-8 bg-[#BFA256] rounded-full" />
                            </div>
                          </div>
                          <div className="w-1/4 flex justify-end">
                            <div className="h-2 w-16 bg-white/90 rounded-md" />
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                </div>

                {/* Floating Notification Glass */}
                <motion.div 
                  animate={{ y: [0, -15, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -right-12 top-20 bg-[#081C16]/90 backdrop-blur-2xl p-4 rounded-2xl border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.5)] flex items-center gap-4 z-20"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-inner">
                    <IShield size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="h-1.5 w-16 bg-white/40 rounded-sm mb-2" />
                    <div className="h-2.5 w-24 bg-white rounded-md" />
                  </div>
                </motion.div>

              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SECTION DIVIDER: Soft Gradient & Blur */}
      <div className="relative h-48 bg-gradient-to-b from-[#04120E] via-[#04120E] to-white z-20">
        <div className="absolute inset-0 bg-[#04120E] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      </div>

      {/* SECOND SECTION: The "White" Section */}
      <section id="why-us" className="relative bg-white pt-10 pb-40">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-16">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mb-24 md:mb-32 max-w-4xl"
          >
            <h2 className="text-[#BFA256] font-bold tracking-[0.2em] uppercase text-[0.65rem] mb-6">Why Choose Apex</h2>
            <h3 className="text-5xl md:text-6xl font-bold text-[#04120E] leading-[1.1] tracking-tight">
              A transparent ecosystem designed for <span className="text-[#8C7335]">sustainable</span> network growth.
            </h3>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 lg:gap-12">
            {[
              { title: 'Secure & Reliable', icon: IShield, desc: 'Bank-level encryption protecting your personal data, network hierarchy, and financial earnings with zero compromise.' },
              { title: 'Transparent Operations', icon: IReport, desc: 'Every policy, commission, and payout is completely traceable and clearly reported in real-time.' },
              { title: 'Growth Opportunities', icon: INetwork, desc: 'A structured promotion system designed to intelligently reward your hard work and consistent network expansion.' },
              { title: 'Fast Payouts', icon: IAlert, desc: 'Automated processing ensures your commissions and allowances are calculated accurately and distributed on time.' },
              { title: 'Dedicated Support', icon: IUsers, desc: 'Professional management support ready to help you navigate the platform and maximize your earning potential.' },
              { title: 'Performance Driven', icon: ITrophy, desc: 'Clear metrics, intuitive dashboards, and actionable insights to help you track business volume and achieve leadership ranks.' },
            ].map((feature, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.8, delay: idx * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white p-10 rounded-[2rem] border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] hover:-translate-y-2 transition-all duration-500 group"
              >
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-8 border border-gray-100 group-hover:bg-[#04120E] transition-colors duration-500 shadow-sm">
                  <feature.icon className="text-[#081C16] group-hover:text-[#BFA256] transition-colors duration-500" size={28} />
                </div>
                <h4 className="font-bold text-[#04120E] text-2xl mb-4 tracking-tight">{feature.title}</h4>
                <p className="text-gray-500 text-lg leading-relaxed font-medium">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TRANSITION BACK TO DARK */}
      <div className="w-full h-40 bg-gradient-to-b from-white to-[#04120E]" />

      {/* SERVICES SECTION */}
      <section id="services" className="py-32 bg-[#04120E] relative overflow-hidden">
        
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-[#BFA256]/5 blur-[200px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-16 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mb-24"
          >
            <h2 className="text-[#BFA256] font-bold tracking-[0.2em] uppercase text-[0.65rem] mb-6">Infrastructure</h2>
            <h3 className="text-5xl md:text-6xl font-bold text-white tracking-tight leading-tight max-w-2xl">
              Professional tools designed for network leaders.
            </h3>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {[
              'Network & Hierarchy Management',
              'Real-time Performance Dashboard',
              'Automated Commission Tracking',
              'Detailed Earnings Reports',
              'Rank & Promotion Pathways',
              'Secure Document Management'
            ].map((service, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: idx * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white/[0.02] backdrop-blur-xl p-8 rounded-3xl border border-white/5 hover:bg-white/[0.04] hover:border-white/10 transition-all duration-500 flex items-center gap-6 group"
              >
                <div className="w-1.5 h-10 bg-gradient-to-b from-[#E6C97A] to-[#8C7335] rounded-full scale-y-50 group-hover:scale-y-100 transition-transform duration-500 origin-top" />
                <h4 className="font-bold text-white text-xl tracking-tight">{service}</h4>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#04120E] pt-32 pb-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-16">
          <div className="grid md:grid-cols-12 gap-12 lg:gap-16 mb-24">
            <div className="col-span-12 md:col-span-5">
              <div className="mb-8 flex items-center gap-4">
                <Logo size={40} />
                <span className="text-white font-extrabold text-2xl tracking-tight">Apex</span>
              </div>
              <p className="text-[#9AA8A2] text-lg max-w-sm leading-[1.8] font-medium">
                Providing network leaders and partners with robust performance tracking, secure operations, and a clear foundation for financial success.
              </p>
            </div>
            
            <div className="col-span-6 md:col-span-3 md:col-start-7">
              <h5 className="text-white font-bold mb-6 uppercase tracking-[0.15em] text-xs">Platform</h5>
              <ul className="space-y-4">
                <li><button onClick={() => scrollTo('home')} className="text-[#9AA8A2] hover:text-white text-sm font-medium transition-colors">Home</button></li>
                <li><button onClick={() => scrollTo('why-us')} className="text-[#9AA8A2] hover:text-white text-sm font-medium transition-colors">Solutions</button></li>
                <li><button onClick={() => scrollTo('services')} className="text-[#9AA8A2] hover:text-white text-sm font-medium transition-colors">Infrastructure</button></li>
              </ul>
            </div>

            <div className="col-span-6 md:col-span-3">
              <h5 className="text-white font-bold mb-6 uppercase tracking-[0.15em] text-xs">Resources</h5>
              <ul className="space-y-4">
                <li><Link to="/login" className="text-[#9AA8A2] hover:text-white text-sm font-medium transition-colors">Sign In</Link></li>
                <li><a href="#" className="text-[#9AA8A2] hover:text-white text-sm font-medium transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="text-[#9AA8A2] hover:text-white text-sm font-medium transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[#9AA8A2] text-sm font-medium tracking-wide">
              &copy; {new Date().getFullYear()} Apex Multisolutions. All rights reserved.
            </p>
            <p className="text-[#9AA8A2] text-sm font-medium tracking-wide">
              Designed & Developed by <a href="https://fyndevs.com" target="_blank" rel="noopener noreferrer" className="text-white hover:text-[#BFA256] transition-colors font-semibold">Fyndevs</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
