import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import {
  ArrowRight,
  Zap,
  Bot,
  Database,
  Inbox,
  Sparkles,
  Calculator,
  Mail,
  MessageSquare,
  Shield,
  Layers,
  ArrowRightLeft,
  ChevronDown,
  Clock,
  TrendingUp,
  DollarSign,
  Menu,
  X
} from 'lucide-react'

export const LandingPage: React.FC = () => {
  const navigate = useNavigate()
  const { session } = useAuthStore()

  // Interactive Sandbox state
  const [leadsCount, setLeadsCount] = useState<number>(120)
  const [dealValue, setDealValue] = useState<number>(1500)
  const [manualHours, setManualHours] = useState<number>(45) // minutes spent per quote manually

  // Navbar dynamic scroll & mobile menu states
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('features')

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
      
      // Dynamic active indicator on scroll
      const sections = ['features', 'sandbox', 'how-it-works', 'faq']
      for (const sectionId of sections) {
        const el = document.getElementById(sectionId)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 120 && rect.bottom >= 120) {
            setActiveSection(sectionId)
            break
          }
        }
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Calculator computations
  const totalMinutesSaved = leadsCount * manualHours
  const hoursSavedPerMonth = Math.round(totalMinutesSaved / 60)
  const conversionBoost = 18 // standard 18% boost by speed to lead
  const extraDealsWon = Math.round((leadsCount * 0.15) * 0.18) // assuming 15% close rate baseline, 18% improvement
  const estimatedValueCreated = extraDealsWon * dealValue + (hoursSavedPerMonth * 45) // value of hours + deals

  // FAQ state
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  const faqs = [
    {
      q: 'How does AXRFLOWS ingest pricing and lead data?',
      a: 'AXRFLOWS features direct integration with email inboxes, WhatsApp APIs, and uploaded Knowledge Base sheets. Our AI-driven processing pipeline extracts semantic context, products, and customer needs to automatically run calculations.'
    },
    {
      q: 'Is the pricing calculation engine customizable?',
      a: 'Absolutely. You can import custom knowledge base Excel/PDF files containing product catalogs, tier structures, and markup rules. Our engine matches customer request parameters against these sheets to deliver exact calculations.'
    },
    {
      q: 'How does the email and WhatsApp automation workflow function?',
      a: 'Incoming messages are monitored, processed via the workspace context extractor, computed inside the pricing workspace, and draft quotation reports are generated. You can choose to review and send quotes manually, or configure automatic dispatch.'
    },
    {
      q: 'Is my proprietary pricing data kept secure?',
      a: 'Yes. All system resources, databases, and client files are encrypted both at rest and in transit. Your custom pricing models are private and isolated, accessed only by authorized team workspaces.'
    }
  ]

  const handleCta = () => {
    if (session) {
      navigate('/dashboard')
    } else {
      navigate('/auth')
    }
  }

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false)
    setActiveSection(id)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-x-hidden pt-24 sm:pt-28">
      {/* Background visual accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-brand-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

      {/* Dynamic Floating Glassmorphism Header Navigation */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled ? 'py-3' : 'py-5 sm:py-6'
      }`}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-500 ${
          isScrolled 
            ? 'mx-4 bg-slate-950/70 border border-slate-900 backdrop-blur-xl rounded-full shadow-[0_10px_35px_-10px_rgba(0,0,0,0.5)] px-6 py-2.5' 
            : 'bg-transparent border border-transparent py-2'
        }`}>
          <div className="flex items-center justify-between h-14">
            
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center shadow-glow-sm">
                <span className="text-white font-extrabold font-outfit text-xl">A</span>
              </div>
              <span className="text-xl font-extrabold text-white tracking-wider font-outfit">AXRFLOWS</span>
            </div>

            {/* Desktop Navigation Links with sliding dynamic indicators */}
            <nav className="hidden md:flex items-center gap-1.5 p-1.5 bg-slate-900/30 border border-slate-900/50 rounded-full backdrop-blur-md">
              {[
                { id: 'features', label: 'Features' },
                { id: 'sandbox', label: 'Sandbox Calculator' },
                { id: 'how-it-works', label: 'How It Works' },
                { id: 'faq', label: 'FAQ' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => scrollToSection(tab.id)}
                  className={`text-xs font-semibold px-4 py-2 rounded-full cursor-pointer transition-all duration-300 relative ${
                    activeSection === tab.id 
                      ? 'text-white bg-slate-800 border border-slate-700/50 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={handleCta}
                id="nav-cta-login"
                className="text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer px-4 py-2"
              >
                {session ? 'Dashboard' : 'Sign In'}
              </button>
              <button
                onClick={handleCta}
                id="nav-cta-get-started"
                className="text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-full shadow-glow-sm transition-all cursor-pointer hover:shadow-glow-md transform hover:-translate-y-0.5"
              >
                Get Started
              </button>
            </div>

            {/* Hamburger menu for Mobile */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-full border border-slate-900 bg-slate-950/60 hover:bg-slate-900 transition-colors text-slate-300 cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel with Dynamic Glassmorphism */}
        <div className={`md:hidden absolute left-4 right-4 mt-2 overflow-hidden transition-all duration-500 rounded-2xl border border-slate-900 bg-slate-950/90 backdrop-blur-xl shadow-2xl ${
          isMobileMenuOpen ? 'max-h-[350px] opacity-100 p-6' : 'max-h-0 opacity-0 pointer-events-none'
        }`}>
          <div className="flex flex-col gap-4">
            <button 
              onClick={() => scrollToSection('features')} 
              className={`text-left text-sm font-semibold py-2.5 border-b border-slate-900/60 transition-colors ${activeSection === 'features' ? 'text-brand-400' : 'text-slate-400'}`}
            >
              Features
            </button>
            <button 
              onClick={() => scrollToSection('sandbox')} 
              className={`text-left text-sm font-semibold py-2.5 border-b border-slate-900/60 transition-colors ${activeSection === 'sandbox' ? 'text-brand-400' : 'text-slate-400'}`}
            >
              Sandbox Calculator
            </button>
            <button 
              onClick={() => scrollToSection('how-it-works')} 
              className={`text-left text-sm font-semibold py-2.5 border-b border-slate-900/60 transition-colors ${activeSection === 'how-it-works' ? 'text-brand-400' : 'text-slate-400'}`}
            >
              How It Works
            </button>
            <button 
              onClick={() => scrollToSection('faq')} 
              className={`text-left text-sm font-semibold py-2.5 border-b border-slate-900/60 transition-colors ${activeSection === 'faq' ? 'text-brand-400' : 'text-slate-400'}`}
            >
              FAQ
            </button>
            
            <div className="flex gap-4 pt-2">
              <button
                onClick={handleCta}
                className="flex-1 py-3 text-center text-sm font-semibold text-slate-300 bg-slate-900 rounded-xl border border-slate-800"
              >
                {session ? 'Dashboard' : 'Sign In'}
              </button>
              <button
                onClick={handleCta}
                className="flex-1 py-3 text-center text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}

      <main className="max-w-7xl mx-auto px-6 relative z-10">
        
        {/* Hero Section */}
        <section className="pt-20 pb-24 text-center flex flex-col items-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-brand-400 mb-8 animate-fade-in shadow-glow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Introducing AXRFLOWS Pricing & Ingestion Engine</span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white font-outfit max-w-4xl leading-tight">
            Automate Your Quotation Engine with{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-400 via-indigo-400 to-sky-300 text-glow">
              Intelligent Lead Ingestion
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
            Ingest structured or unstructured inquiries from WhatsApp, emails, and Excel files. 
            Instantly map items against proprietary knowledge models to formulate precise quotation drafts automatically.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center">
            <button
              onClick={handleCta}
              id="hero-cta-primary"
              className="w-full sm:w-auto px-8 py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl shadow-glow-md hover:shadow-glow-lg transition-all cursor-pointer flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
            >
              Deploy Your Engine
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollToSection('sandbox')}
              id="hero-cta-secondary"
              className="w-full sm:w-auto px-8 py-4 bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-300 hover:text-white font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Interactive ROI Sandbox
            </button>
          </div>

          {/* Visual Showcase (Pipeline Mockup) */}
          <div className="mt-20 w-full max-w-5xl p-4 rounded-2xl bg-slate-900/20 border border-slate-850 glass-panel shadow-2xl relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-indigo-500/20 rounded-2xl blur-xl opacity-40 pointer-events-none" />
            
            <div className="relative rounded-xl overflow-hidden bg-slate-950/80 border border-slate-800 p-6 sm:p-10">
              <div className="flex items-center justify-between border-b border-slate-900 pb-4 mb-8 text-left">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    Interactive Engine flow
                  </div>
                  <h3 className="text-lg font-bold text-white mt-1">AXRFLOWS Execution Pipeline</h3>
                </div>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-800" />
                  <div className="w-3 h-3 rounded-full bg-slate-800" />
                  <div className="w-3 h-3 rounded-full bg-slate-800" />
                </div>
              </div>

              {/* Pipeline Nodes Map */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
                {/* Node 1 */}
                <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-col items-center text-center group hover:border-brand-500/50 hover:shadow-glow-sm transition-all duration-300">
                  <div className="w-12 h-12 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4 group-hover:scale-110 transition-transform">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">1. Ingest Leads</h4>
                  <p className="text-xs text-slate-400 mt-2">Catch incoming customer emails, WhatsApp chats, or uploaded specs.</p>
                  <div className="flex gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-950 border border-slate-800 text-slate-400">Email</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-950 border border-slate-800 text-slate-400">WhatsApp</span>
                  </div>
                </div>

                {/* Node 2 */}
                <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-col items-center text-center group hover:border-indigo-500/50 hover:shadow-glow-sm transition-all duration-300">
                  <div className="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
                    <Database className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">2. Match Context</h4>
                  <p className="text-xs text-slate-400 mt-2">Query active knowledge sheets, product lists, and rule models.</p>
                  <div className="flex gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-950 border border-slate-800 text-indigo-400 font-mono">vector_db</span>
                  </div>
                </div>

                {/* Node 3 */}
                <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-col items-center text-center group hover:border-pink-500/50 hover:shadow-glow-sm transition-all duration-300">
                  <div className="w-12 h-12 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-4 group-hover:scale-110 transition-transform">
                    <Calculator className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">3. Run Math Engine</h4>
                  <p className="text-xs text-slate-400 mt-2">Compute exact quote breakdown using logic models & margin margins.</p>
                  <div className="flex gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Auto-Calculate</span>
                  </div>
                </div>

                {/* Node 4 */}
                <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-col items-center text-center group hover:border-cyan-500/50 hover:shadow-glow-sm transition-all duration-300">
                  <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">4. Output Quote</h4>
                  <p className="text-xs text-slate-400 mt-2">Instantly compile formatted quotation PDFs or email draft reports.</p>
                  <div className="flex gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-950 border border-slate-800 text-cyan-400">PDF Report</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section id="features" className="py-24 border-t border-slate-900">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-white font-outfit">Built for Modern Pipeline Automation</h2>
            <p className="text-slate-400 text-sm mt-3 max-w-lg mx-auto">
              Everything your quote team needs to eliminate manual data entry, incorrect calculations, and slow sales cycles.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-xl bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-all hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-6 group-hover:scale-110 transition-all">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">AI-Powered Extraction</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Extract details from free-text emails or WhatsApp messages instantly. AXRFLOWS identifies products requested, sizes, counts, and customer specs.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-xl bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-all hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6 group-hover:scale-110 transition-all">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Knowledge Base Synchronization</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Upload price lists, vendor specs, or regulatory guidelines as Knowledge Sheets. System automatically references current models to avoid errors.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-xl bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-all hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 group-hover:scale-110 transition-all">
                <Calculator className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Complex Formula Engine</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Supports volume tier breaks, dynamic margins, shipping calculations, and bulk discounts. Configured easily within your pricing workspace.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-8 rounded-xl bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-all hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-110 transition-all">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">WhatsApp Sandbox Integrator</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Connect directly to your team WhatsApp numbers. Customer requests are processed instantly and drafts appear inside your pricing workspace.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-8 rounded-xl bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-all hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-6 group-hover:scale-110 transition-all">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Smart Email Channels</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Link sales inboxes. Parse incoming client messages or Request For Quotations (RFQs) and export finished calculations with one single click.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-8 rounded-xl bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-all hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6 group-hover:scale-110 transition-all">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Full Revision Auditing</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Track every pricing calculation made, export reports, audit logs, and monitor conversion metrics from a central, secure administrator dashboard.
              </p>
            </div>
          </div>
        </section>

        {/* Interactive ROI Sandbox Section */}
        <section id="sandbox" className="py-24 border-t border-slate-900">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Sliders */}
            <div className="lg:col-span-5 space-y-8">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-xs font-semibold text-brand-400 mb-4">
                  <Calculator className="w-3.5 h-3.5" />
                  <span>ROI Simulator</span>
                </div>
                <h2 className="text-3xl font-extrabold text-white font-outfit">Calculate Your Savings & Boost</h2>
                <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                  Adjust the inputs below to see how automated quotation pipelines, faster response speeds, and active context retrieval optimize your bottom line.
                </p>
              </div>

              {/* Slider 1 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-300">Monthly Quote Queries Ingested</span>
                  <span className="text-brand-400 font-mono">{leadsCount} leads</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="1000"
                  step="10"
                  value={leadsCount}
                  onChange={(e) => setLeadsCount(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-brand-500 border border-slate-800"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                  <span>10 leads</span>
                  <span>1,000 leads</span>
                </div>
              </div>

              {/* Slider 2 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-300">Average Deal Size (USD)</span>
                  <span className="text-brand-400 font-mono">${dealValue.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="15000"
                  step="100"
                  value={dealValue}
                  onChange={(e) => setDealValue(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-brand-500 border border-slate-800"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                  <span>$200</span>
                  <span>$15,000</span>
                </div>
              </div>

              {/* Slider 3 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-300">Manual Ingestion Time (min/quote)</span>
                  <span className="text-brand-400 font-mono">{manualHours} mins</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="5"
                  value={manualHours}
                  onChange={(e) => setManualHours(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-brand-500 border border-slate-800"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                  <span>10 mins</span>
                  <span>120 mins</span>
                </div>
              </div>
            </div>

            {/* Right Column: ROI Results Card */}
            <div className="lg:col-span-7 p-8 rounded-2xl bg-slate-900/30 border border-slate-850 glass-panel shadow-xl relative">
              <div className="absolute top-0 right-0 p-4">
                <span className="text-[10px] font-bold font-mono tracking-widest text-slate-500 uppercase">Live calculations</span>
              </div>

              <h3 className="text-xl font-bold text-white mb-6">AXRFLOWS Dynamic Impact</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                {/* Result Block 1 */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-850 flex flex-col">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-brand-400" />
                    Time Reclaimed
                  </span>
                  <span className="text-2xl font-bold text-white mt-2 font-outfit">
                    {hoursSavedPerMonth} hrs
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">saved per month</span>
                </div>

                {/* Result Block 2 */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-850 flex flex-col">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    Win Rate Lift
                  </span>
                  <span className="text-2xl font-bold text-emerald-400 mt-2 font-outfit">
                    +{conversionBoost}%
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">due to instant response</span>
                </div>

                {/* Result Block 3 */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-850 flex flex-col">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
                    Deals Incremented
                  </span>
                  <span className="text-2xl font-bold text-white mt-2 font-outfit">
                    +{extraDealsWon} deals
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">won per month</span>
                </div>
              </div>

              {/* Big Estimated ROI Block */}
              <div className="p-6 rounded-xl bg-gradient-to-br from-brand-500/10 to-indigo-500/10 border border-brand-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest">Est. Monthly Value Created</span>
                  <h4 className="text-3xl sm:text-4xl font-extrabold text-white font-outfit mt-1">
                    ${estimatedValueCreated.toLocaleString()}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">Based on saved engineering hours + sales acceleration.</p>
                </div>
                <button
                  onClick={handleCta}
                  id="sandbox-cta-action"
                  className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg transition-all shadow-glow-sm hover:shadow-glow-md flex items-center gap-2 cursor-pointer whitespace-nowrap self-stretch sm:self-auto justify-center"
                >
                  Unlock This ROI
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* How it works workflow */}
        <section id="how-it-works" className="py-24 border-t border-slate-900">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-white font-outfit">Simplifying the Pipeline in 3 Steps</h2>
            <p className="text-slate-400 text-sm mt-3 max-w-sm mx-auto">
              No complex coding or lengthy integrations needed to start running.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-brand-400 font-bold font-outfit text-lg flex items-center justify-center mb-6">
                1
              </div>
              <h3 className="text-lg font-bold text-white">Ingest Client Files or Texts</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed max-w-xs">
                Upload your inventory catalogs, rate files, or connect email/WhatsApp numbers directly inside the system.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-brand-400 font-bold font-outfit text-lg flex items-center justify-center mb-6">
                2
              </div>
              <h3 className="text-lg font-bold text-white">Define Calculation Workspaces</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed max-w-xs">
                Map input labels to Excel columns or pricing variables to compile quote tables in real time.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-brand-400 font-bold font-outfit text-lg flex items-center justify-center mb-6">
                3
              </div>
              <h3 className="text-lg font-bold text-white">Automate Despatch Reports</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed max-w-xs">
                Receive pricing drafts. Review, print to PDF, or dispatch quotes directly to client channels automatically.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 border-t border-slate-900 max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-white font-outfit">Frequently Answered Queries</h2>
            <p className="text-slate-400 text-sm mt-3">
              Everything you need to know about setting up AXRFLOWS.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="rounded-xl border border-slate-900 bg-slate-900/10 hover:border-slate-800 transition-all overflow-hidden"
              >
                <button
                  onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                  className="w-full px-6 py-5 flex justify-between items-center text-left text-white font-bold text-base hover:text-brand-400 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${
                      activeFaq === index ? 'transform rotate-180 text-brand-400' : ''
                    }`}
                  />
                </button>
                <div
                  className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    activeFaq === index ? 'max-h-40 border-t border-slate-900/50' : 'max-h-0'
                  }`}
                >
                  <p className="p-6 text-sm text-slate-400 leading-relaxed bg-slate-950/20">
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Final Call to Action Banner */}
        <section className="py-20 my-12 rounded-2xl bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950 border border-slate-850 glass-panel text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-brand-500/10 blur-[80px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto px-6">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-outfit">Ready to Scale Quotation Lifecycles?</h2>
            <p className="text-slate-400 text-sm sm:text-base mt-4 leading-relaxed">
              Deploy your workspace pricing model in minutes. Integrate with WhatsApp, parsing bots, and email automation today.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={handleCta}
                id="footer-cta-primary"
                className="w-full sm:w-auto px-8 py-3.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-lg shadow-glow-sm hover:shadow-glow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                Launch Workspace
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollToSection('features')}
                className="w-full sm:w-auto px-8 py-3.5 bg-slate-950 border border-slate-850 hover:border-slate-750 text-slate-400 hover:text-white text-sm font-semibold rounded-lg transition-all cursor-pointer"
              >
                Learn More
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6 text-sm text-slate-500">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-brand-500 flex items-center justify-center">
              <span className="text-white font-extrabold font-outfit text-sm">A</span>
            </div>
            <span className="font-extrabold text-white font-outfit tracking-wide">AXRFLOWS</span>
          </div>
          <p>© {new Date().getFullYear()} AXRFLOWS. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-slate-300 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-slate-300 transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
