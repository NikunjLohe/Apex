import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  IShield, 
  INetwork, 
  IReport, 
  IUsers, 
  ITrophy, 
  IAlert, 
  IChevron,
  IMenu,
  IClose,
  IBuilding,
  IDoc,
  IPhone
} from '../components/ui/icons'
import Logo from '../components/ui/Logo'

export default function Landing() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Handle document title and scroll for navbar
  useEffect(() => {
    document.title = 'Apex Multisolutions | Performance Portal'
    const metaDescription = document.createElement('meta')
    metaDescription.name = 'description'
    metaDescription.content = 'Join Apex Multisolutions and build your financial future through a transparent, technology-driven platform designed for long-term success.'
    document.head.appendChild(metaDescription)
    
    const canonical = document.createElement('link')
    canonical.rel = 'canonical'
    canonical.href = 'https://apexmultisolutions.com'
    document.head.appendChild(canonical)

    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true)
      } else {
        setIsScrolled(false)
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    { name: 'Home', href: '#home' },
    { name: 'About', href: '#about' },
    { name: 'Why Apex', href: '#why-us' },
    { name: 'Services', href: '#services' },
    { name: 'Opportunity', href: '#opportunity' },
    { name: 'Contact', href: '#contact' },
  ]

  const scrollTo = (id) => {
    setMobileMenuOpen(false)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="min-h-screen bg-[#061A15] text-white font-sans selection:bg-gold-1 selection:text-navy-1 overflow-x-hidden">
      {/* Navigation */}
      <nav 
        className={`fixed top-0 w-full z-50 transition-all duration-500 ease-in-out ${
          isScrolled 
            ? 'bg-[#061A15]/80 backdrop-blur-xl border-b border-gold-1/20 py-4 shadow-[0_4px_30px_rgba(0,0,0,0.5)]' 
            : 'bg-gradient-to-b from-[#061A15]/80 to-transparent py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <div className="flex-shrink-0 cursor-pointer transition-transform duration-300 hover:scale-105" onClick={() => scrollTo('home')}>
              <Logo size={36} />
            </div>

            {/* Desktop Menu */}
            <div className="hidden lg:flex items-center space-x-10">
              {navLinks.map((link) => (
                <button 
                  key={link.name} 
                  onClick={() => scrollTo(link.href.substring(1))}
                  className="text-sm font-semibold tracking-wide text-gray-300 hover:text-gold-1 transition-all duration-300 hover:-translate-y-0.5"
                >
                  {link.name}
                </button>
              ))}
              <Link 
                to="/login"
                className="bg-gradient-to-r from-gold-1 to-gold-2 text-[#04120e] px-7 py-2.5 rounded-full font-bold text-sm transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]"
              >
                Login to Portal
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden flex items-center">
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-gray-300 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5"
              >
                {mobileMenuOpen ? <IClose size={28} /> : <IMenu size={28} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="lg:hidden bg-[#0a231d]/95 backdrop-blur-xl border-b border-gold-1/20 overflow-hidden"
            >
              <div className="px-6 pt-4 pb-8 space-y-2 shadow-2xl">
                {navLinks.map((link) => (
                  <button
                    key={link.name}
                    onClick={() => scrollTo(link.href.substring(1))}
                    className="block w-full text-left px-4 py-3 text-base font-semibold text-gray-300 hover:text-gold-1 hover:bg-white/5 rounded-xl transition-all"
                  >
                    {link.name}
                  </button>
                ))}
                <div className="pt-6">
                  <Link 
                    to="/login"
                    className="flex justify-center items-center w-full bg-gradient-to-r from-gold-1 to-gold-2 text-[#04120e] px-6 py-3.5 rounded-xl font-bold transition-all hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]"
                  >
                    Login to Portal
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section id="home" className="relative pt-36 pb-24 lg:pt-52 lg:pb-40 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-gold-1/10 blur-[150px]" />
          <div className="absolute bottom-[0%] -left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px]" />
          
          {/* Subtle Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_80%,transparent_100%)]" />
        </div>

        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-12 items-center">
            
            {/* Hero Content */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="max-w-2xl"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-1/10 border border-gold-1/20 text-gold-1 text-xs sm:text-sm font-bold uppercase tracking-widest mb-8 backdrop-blur-md"
              >
                <INetwork size={16} /> Official Performance Portal
              </motion.div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-8 leading-[1.15]">
                Empowering Growth Through <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-1 via-yellow-200 to-gold-1 bg-300% animate-gradient">Trusted Opportunities</span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-300 mb-12 leading-relaxed max-w-xl font-medium">
                Join Apex Multisolutions and build your financial future through a transparent, enterprise-grade platform designed for long-term success.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-5">
                <Link 
                  to="/login" 
                  className="inline-flex justify-center items-center gap-3 bg-gradient-to-r from-gold-1 to-gold-2 text-[#04120e] px-9 py-4 rounded-xl font-extrabold text-lg transition-all duration-300 hover:scale-[1.03] shadow-[0_0_30px_rgba(212,175,55,0.3)] hover:shadow-[0_0_40px_rgba(212,175,55,0.5)]"
                >
                  Access Portal <IChevron size={22} className="ml-1" />
                </Link>
                <button 
                  onClick={() => scrollTo('contact')}
                  className="inline-flex justify-center items-center gap-2 bg-white/5 backdrop-blur-sm border border-gray-600 text-white px-9 py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:border-gold-1 hover:text-gold-1 hover:bg-white/10"
                >
                  Contact Us
                </button>
              </div>
            </motion.div>

            {/* Hero Visual - Premium Illustration representation */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
              className="relative hidden lg:block"
            >
              <div className="relative w-full aspect-square max-w-lg mx-auto">
                {/* Abstract Data/Financial representation using CSS and SVGs */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0a231d] to-[#04120e] rounded-3xl border border-gray-800 shadow-2xl overflow-hidden transform rotate-3 scale-105 z-0 transition-transform duration-700 hover:rotate-6" />
                <div className="absolute inset-0 bg-gradient-to-tr from-gold-1/10 to-transparent rounded-3xl border border-gold-1/20 shadow-2xl backdrop-blur-2xl z-10 flex flex-col p-10 justify-between">
                  
                  {/* Mock UI Elements for financial feel */}
                  <div className="flex justify-between items-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gold-1/20 flex items-center justify-center shadow-inner">
                      <INetwork className="text-gold-1" size={28} />
                    </div>
                    <div className="text-right space-y-3">
                      <div className="w-28 h-2.5 bg-gray-700 rounded-full ml-auto" />
                      <div className="w-16 h-2 bg-gray-600 rounded-full ml-auto" />
                    </div>
                  </div>

                  <div className="space-y-6 flex-1 justify-center flex flex-col">
                    {[85, 45, 92, 35, 65].map((width, i) => (
                      <div key={i} className="flex items-center gap-5">
                        <div className="w-10 h-10 rounded-xl bg-gray-800/80 flex items-center justify-center shadow-sm">
                          <IReport className="text-gray-400" size={16} />
                        </div>
                        <div className="flex-1 h-3 bg-gray-800/80 rounded-full overflow-hidden shadow-inner">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${width}%` }}
                            transition={{ duration: 1.5, delay: 0.6 + (i * 0.15), ease: "easeOut" }}
                            className="h-full bg-gradient-to-r from-emerald-500 to-gold-1 rounded-full" 
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Floating Elements */}
                  <motion.div 
                    animate={{ y: [0, -15, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -right-8 -bottom-8 bg-[#061A15]/90 backdrop-blur-xl p-6 rounded-2xl border border-gray-700 shadow-2xl flex items-center gap-5"
                  >
                    <div className="bg-emerald-500/20 p-4 rounded-xl shadow-inner">
                      <IShield className="text-emerald-400" size={28} />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">Enterprise</div>
                      <div className="font-bold text-white text-lg">Secure Portal</div>
                    </div>
                  </motion.div>

                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 lg:py-32 bg-[#04120e] relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto mb-20"
          >
            <h2 className="text-gold-1 font-bold tracking-widest uppercase text-sm mb-4 flex items-center justify-center gap-4">
              <span className="w-12 h-px bg-gold-1/30"></span>
              About Apex
              <span className="w-12 h-px bg-gold-1/30"></span>
            </h2>
            <h3 className="text-4xl md:text-5xl font-extrabold text-white mb-8 leading-tight">Built on Trust. <br className="hidden sm:block"/>Powered by Technology.</h3>
            <p className="text-gray-400 text-lg md:text-xl leading-relaxed">
              At Apex Multisolutions, our mission is to create sustainable financial opportunities for driven individuals. 
              We combine enterprise-grade technology with transparent business practices.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-10">
            {[
              { icon: INetwork, title: 'Our Mission', desc: 'To provide a robust, reliable platform where members can confidently grow their financial portfolios and build long-term success.' },
              { icon: IUsers, title: 'Our Vision', desc: 'To become the industry standard for transparent, technology-driven financial network organizations globally.' },
              { icon: IShield, title: 'Our Commitment', desc: 'We are committed to absolute integrity, offering secure payouts, clear performance metrics, and unwavering support to our community.' }
            ].map((item, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: idx * 0.15 }}
                className="bg-gradient-to-b from-[#0a231d] to-[#061A15] p-10 rounded-3xl border border-gray-800 hover:border-gold-1/40 hover:shadow-[0_10px_40px_rgba(212,175,55,0.05)] transition-all duration-500 group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gold-1/5 rounded-bl-full -mr-10 -mt-10 transition-transform duration-500 group-hover:scale-110" />
                <div className="w-16 h-16 bg-gold-1/10 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-gold-1/20 transition-all duration-300 relative z-10 shadow-inner">
                  <item.icon className="text-gold-1" size={32} />
                </div>
                <h4 className="text-2xl font-bold text-white mb-4 relative z-10">{item.title}</h4>
                <p className="text-gray-400 leading-relaxed text-lg relative z-10">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Apex */}
      <section id="why-us" className="py-24 lg:py-32 relative overflow-hidden bg-[#061A15]">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="mb-20"
          >
            <h2 className="text-gold-1 font-bold tracking-widest uppercase text-sm mb-4 flex items-center gap-4">
              <span className="w-12 h-px bg-gold-1/30"></span>
              Why Choose Apex
            </h2>
            <h3 className="text-4xl md:text-5xl font-extrabold text-white max-w-3xl leading-tight">The Enterprise Standard for Performance Tracking</h3>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {[
              { title: 'Secure Member Portal', icon: IShield },
              { title: 'Transparent Commission', icon: IReport },
              { title: 'Real-Time Dashboard', icon: IAlert },
              { title: 'Growth Opportunities', icon: INetwork },
              { title: 'Fast Payout Management', icon: IShield },
              { title: 'Dedicated Support', icon: IUsers },
              { title: 'Modern Technology', icon: INetwork },
              { title: 'Leadership Rewards', icon: ITrophy },
            ].map((feature, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className="bg-white/[0.02] backdrop-blur-xl p-8 rounded-2xl border border-white/5 hover:bg-white/[0.05] hover:border-gold-1/30 hover:-translate-y-1 transition-all duration-300 flex flex-col items-start group shadow-lg"
              >
                <div className="p-3 bg-[#0a231d] rounded-xl mb-5 group-hover:scale-110 transition-transform duration-300 shadow-inner">
                  <feature.icon className="text-emerald-400 group-hover:text-gold-1 transition-colors duration-300" size={28} />
                </div>
                <h4 className="font-bold text-gray-200 text-lg leading-snug">{feature.title}</h4>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Services */}
      <section id="services" className="py-24 lg:py-32 bg-[#0a231d] relative border-y border-gray-800 shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <h2 className="text-gold-1 font-bold tracking-widest uppercase text-sm mb-4 flex items-center justify-center gap-4">
              <span className="w-12 h-px bg-gold-1/30"></span>
              Our Services
              <span className="w-12 h-px bg-gold-1/30"></span>
            </h2>
            <h3 className="text-4xl md:text-5xl font-extrabold text-white">Comprehensive Financial Tools</h3>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10">
            {[
              { title: 'Business Network', desc: 'Advanced tools to manage and visualize your entire organizational hierarchy.' },
              { title: 'Performance Tracking', desc: 'Real-time analytics and metrics to monitor sales, volume, and rank progression.' },
              { title: 'Secure Member Portal', desc: 'Enterprise-grade security ensuring your data and financial information remain protected.' },
              { title: 'Business Reports', desc: 'Detailed, exportable reports for collections, maturities, and network performance.' },
              { title: 'Growth Planning', desc: 'Strategic insights and clear targets to help you reach the next promotion tier.' },
              { title: 'Digital Management', desc: 'Completely paperless, cloud-based management for all your operations.' }
            ].map((service, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="bg-[#061A15] p-10 rounded-3xl border border-gray-800 hover:border-emerald-500/30 hover:bg-[#071f19] transition-all duration-300 shadow-lg"
              >
                <h4 className="text-xl font-bold text-white mb-4">{service.title}</h4>
                <p className="text-gray-400 text-base leading-relaxed">{service.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Business Opportunity (Timeline) */}
      <section id="opportunity" className="py-24 lg:py-32 relative bg-[#04120e]">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-24"
          >
            <h2 className="text-gold-1 font-bold tracking-widest uppercase text-sm mb-4 flex items-center justify-center gap-4">
              <span className="w-12 h-px bg-gold-1/30"></span>
              The Journey
              <span className="w-12 h-px bg-gold-1/30"></span>
            </h2>
            <h3 className="text-4xl md:text-5xl font-extrabold text-white">Your Path to Leadership</h3>
          </motion.div>

          <div className="relative max-w-5xl mx-auto">
            {/* Connecting Line */}
            <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-gold-1 via-emerald-500 to-[#04120e] transform md:-translate-x-1/2 rounded-full opacity-50" />
            
            {[
              { step: '01', title: 'Join Apex', desc: 'Onboard securely through our digital portal and gain immediate access to performance tracking.' },
              { step: '02', title: 'Build Your Network', desc: 'Utilize our structural tools to enroll clients and expand your organization strategically.' },
              { step: '03', title: 'Grow Your Business', desc: 'Increase your business volume and monitor real-time contributions from your direct downlines.' },
              { step: '04', title: 'Track Performance', desc: 'Use advanced analytics to see exact requirements for your next promotion and commission payouts.' },
              { step: '05', title: 'Earn Rewards', desc: 'Receive transparent, automated payouts including Marketing Allowances and Performance Bonuses.' },
              { step: '06', title: 'Leadership Growth', desc: 'Achieve executive ranks and unlock exclusive CMD awards and global organizational benefits.' },
            ].map((item, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 30, x: idx % 2 === 0 ? 30 : -30 }}
                whileInView={{ opacity: 1, y: 0, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, type: "spring", bounce: 0.2 }}
                className={`relative flex items-center mb-16 lg:mb-12 ${idx % 2 === 0 ? 'md:flex-row-reverse' : ''}`}
              >
                {/* Number node */}
                <div className="absolute left-4 md:left-1/2 w-10 h-10 rounded-full bg-[#04120e] border-2 border-gold-1 flex items-center justify-center transform -translate-x-1/2 z-10 text-sm font-extrabold text-gold-1 shadow-[0_0_15px_rgba(212,175,55,0.4)]">
                  {item.step}
                </div>

                {/* Content Card */}
                <div className={`ml-20 md:ml-0 md:w-1/2 ${idx % 2 === 0 ? 'md:pl-16' : 'md:pr-16 text-left md:text-right'}`}>
                  <div className="bg-[#0a231d] p-8 rounded-3xl border border-gray-800 shadow-xl hover:border-gold-1/40 hover:-translate-y-1 transition-all duration-300 group">
                    <h4 className="text-2xl font-bold text-white mb-3 group-hover:text-gold-1 transition-colors">{item.title}</h4>
                    <p className="text-gray-400 text-base leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-24 lg:py-32 bg-[#04120e] relative border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-y-16 gap-x-8 text-center">
            {[
              'Transparency', 'Integrity', 'Commitment', 'Growth', 'Innovation', 'Trust'
            ].map((value, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="flex flex-col items-center group"
              >
                <div className="text-gold-1 mb-6 p-4 rounded-full bg-gold-1/5 group-hover:bg-gold-1/20 group-hover:scale-110 transition-all duration-300 shadow-inner">
                  <IShield size={36} strokeWidth={1.5} />
                </div>
                <h4 className="text-lg lg:text-xl font-bold text-white tracking-wide">{value}</h4>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Features Section (Placeholders) */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#061A15] to-[#0a231d] z-0" />
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none -translate-y-1/2 translate-x-1/3" />
        
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-center"
          >
            {[
              { label: 'Network Reliability', value: 'Expansion & Growth', icon: INetwork },
              { label: 'Technology Stack', value: 'Modern Infrastructure', icon: IAlert },
              { label: 'Security & Compliance', value: 'Enterprise Grade', icon: IShield },
              { label: 'Agent Assistance', value: 'Professional Support', icon: IUsers },
            ].map((stat, idx) => (
              <div key={idx} className="p-8 bg-white/[0.03] backdrop-blur-xl rounded-3xl border border-white/10 hover:bg-white/[0.06] hover:border-gold-1/30 transition-all duration-300 shadow-xl group">
                <div className="w-12 h-12 mx-auto bg-[#04120e] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                  <stat.icon className="text-emerald-400" size={24} />
                </div>
                <div className="text-xl font-bold text-gold-1 mb-3">{stat.value}</div>
                <div className="text-sm text-gray-400 uppercase tracking-widest font-semibold">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 lg:py-32 bg-[#04120e] relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-16 xl:gap-24 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-gold-1 font-bold tracking-widest uppercase text-sm mb-4 flex items-center gap-4">
                <span className="w-12 h-px bg-gold-1/30"></span>
                Get in Touch
              </h2>
              <h3 className="text-4xl md:text-5xl font-extrabold text-white mb-8 leading-tight">Contact Our Professional Support Team</h3>
              <p className="text-gray-400 mb-12 leading-relaxed text-lg">
                Whether you have questions about the platform, need support with your account, or want to learn more about the business opportunity, we are here to help.
              </p>

              <div className="space-y-8">
                <div className="flex items-start gap-6 group">
                  <div className="w-14 h-14 rounded-2xl bg-[#0a231d] border border-gray-800 flex items-center justify-center flex-shrink-0 group-hover:border-gold-1/40 group-hover:bg-gold-1/10 transition-all duration-300 shadow-inner">
                    <IBuilding className="text-emerald-400 group-hover:text-gold-1 transition-colors" size={24} />
                  </div>
                  <div>
                    <h5 className="text-white font-bold mb-2 text-lg">Corporate Headquarters</h5>
                    <p className="text-gray-400 leading-relaxed">[Company Name], Suite [Number]<br/>[Business Center City], [ZIP]</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-6 group">
                  <div className="w-14 h-14 rounded-2xl bg-[#0a231d] border border-gray-800 flex items-center justify-center flex-shrink-0 group-hover:border-gold-1/40 group-hover:bg-gold-1/10 transition-all duration-300 shadow-inner">
                    <IDoc className="text-emerald-400 group-hover:text-gold-1 transition-colors" size={24} />
                  </div>
                  <div>
                    <h5 className="text-white font-bold mb-2 text-lg">Email Inquiry</h5>
                    <p className="text-gray-400 leading-relaxed">contact@[company-domain].com</p>
                  </div>
                </div>

                <div className="flex items-start gap-6 group">
                  <div className="w-14 h-14 rounded-2xl bg-[#0a231d] border border-gray-800 flex items-center justify-center flex-shrink-0 group-hover:border-gold-1/40 group-hover:bg-gold-1/10 transition-all duration-300 shadow-inner">
                    <IPhone className="text-emerald-400 group-hover:text-gold-1 transition-colors" size={24} />
                  </div>
                  <div>
                    <h5 className="text-white font-bold mb-2 text-lg">Direct Line</h5>
                    <p className="text-gray-400 leading-relaxed">+1 (000) 000-0000</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Contact Form UI (Placeholder) */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-gradient-to-br from-[#0a231d] to-[#061A15] p-10 rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gold-1/5 rounded-bl-full -mr-10 -mt-10 pointer-events-none" />
              
              <h4 className="text-2xl font-extrabold text-white mb-8 relative z-10">Send us a message</h4>
              <form className="space-y-5 relative z-10" onSubmit={(e) => e.preventDefault()}>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 ml-1">First Name</label>
                    <input type="text" className="w-full bg-[#04120e] border border-gray-800 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-gold-1 focus:ring-1 focus:ring-gold-1/50 transition-all" placeholder="John" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 ml-1">Last Name</label>
                    <input type="text" className="w-full bg-[#04120e] border border-gray-800 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-gold-1 focus:ring-1 focus:ring-gold-1/50 transition-all" placeholder="Doe" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 ml-1">Email Address</label>
                  <input type="email" className="w-full bg-[#04120e] border border-gray-800 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-gold-1 focus:ring-1 focus:ring-gold-1/50 transition-all" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 ml-1">Message</label>
                  <textarea rows="4" className="w-full bg-[#04120e] border border-gray-800 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-gold-1 focus:ring-1 focus:ring-gold-1/50 transition-all resize-none" placeholder="How can we help you?"></textarea>
                </div>
                <button type="button" className="w-full bg-gradient-to-r from-gold-1 to-gold-2 text-[#061A15] py-4 rounded-xl font-bold text-lg hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] hover:scale-[1.02] transition-all duration-300 mt-4">
                  Submit Inquiry
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#020806] pt-20 pb-10 border-t border-gray-900">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid md:grid-cols-4 gap-12 lg:gap-16 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="mb-8">
                <Logo size={36} />
              </div>
              <p className="text-gray-500 text-base max-w-md leading-relaxed">
                Empowering individuals and organizations with robust performance tracking, secure operations, and scalable network solutions. Built for the modern enterprise.
              </p>
            </div>
            
            <div>
              <h5 className="text-white font-bold mb-6 uppercase tracking-widest text-xs">Quick Links</h5>
              <ul className="space-y-4">
                <li><button onClick={() => scrollTo('about')} className="text-gray-400 hover:text-gold-1 text-sm font-medium transition-colors">About Us</button></li>
                <li><button onClick={() => scrollTo('services')} className="text-gray-400 hover:text-gold-1 text-sm font-medium transition-colors">Services</button></li>
                <li><button onClick={() => scrollTo('opportunity')} className="text-gray-400 hover:text-gold-1 text-sm font-medium transition-colors">Opportunity</button></li>
                <li><button onClick={() => scrollTo('contact')} className="text-gray-400 hover:text-gold-1 text-sm font-medium transition-colors">Contact</button></li>
              </ul>
            </div>

            <div>
              <h5 className="text-white font-bold mb-6 uppercase tracking-widest text-xs">Legal & Access</h5>
              <ul className="space-y-4">
                <li><Link to="/login" className="text-gray-400 hover:text-gold-1 text-sm font-medium transition-colors">Agent Login</Link></li>
                <li><a href="#" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-900 pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-gray-600 text-sm font-medium">
              &copy; {new Date().getFullYear()} Apex Multisolutions. All rights reserved.
            </p>
            <p className="text-gray-600 text-sm font-medium">
              Designed & Developed by <a href="https://fyndevs.com" target="_blank" rel="noopener noreferrer" className="text-gold-1 hover:text-gold-2 hover:underline transition-colors">Fyndevs</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
