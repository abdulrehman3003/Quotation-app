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
  X,
  Check
} from 'lucide-react'

// Where "Book a demo" and "Talk to us" send people. Change these to your real details.
// SALES_WHATSAPP: international number, digits only (e.g. '971501234567'). When set,
// demo buttons open a WhatsApp chat; when empty they open an email to SALES_EMAIL.
const SALES_EMAIL = 'axrflows@gmail.com'
const SALES_WHATSAPP = ''

const DEMO_MESSAGE = 'Hi, I would like a demo of AXRFLOWS for my workshop.'
const DEMO_URL = SALES_WHATSAPP
  ? `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(DEMO_MESSAGE)}`
  : `mailto:${SALES_EMAIL}?subject=${encodeURIComponent('AXRFLOWS demo request')}&body=${encodeURIComponent(DEMO_MESSAGE)}`

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
      const sections = ['features', 'sandbox', 'how-it-works', 'pricing', 'faq']
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
  const conversionBoost = 10 // assumed lift from replying faster; shown to the visitor as an estimate
  const extraDealsWon = Math.round(leadsCount * 0.15 * (conversionBoost / 100)) // 15% baseline close rate
  const estimatedValueCreated = extraDealsWon * dealValue + (hoursSavedPerMonth * 20) // hours at $20 + extra jobs

  // Pricing state
  const [billingYearly, setBillingYearly] = useState(false)

  const plans = [
    {
      name: 'Starter',
      blurb: 'For a small team quoting from email.',
      monthly: 59,
      yearly: 49,
      setup: 249 as number | null,
      cta: 'Start with Starter',
      highlight: false,
      features: [
        'Up to 2 users',
        'One email inbox connected',
        'Up to 150 AI-drafted quotes a month',
        'Price lists from Excel, CSV or PDF',
        'Online quote page with accept / decline',
        'Win-rate and quote reports',
        'Email support',
      ],
    },
    {
      name: 'Growth',
      blurb: 'For businesses whose customers ask on WhatsApp.',
      monthly: 99,
      yearly: 82,
      setup: 499 as number | null,
      cta: 'Start with Growth',
      highlight: true,
      features: [
        'Up to 5 users',
        'Email inbox and a WhatsApp Business number, set up for you',
        'Up to 500 AI-drafted quotes a month',
        'Automatic drafts from incoming enquiries',
        'Automatic follow-up on unanswered quotes',
        'Customer directory with price history',
        'Priority support on WhatsApp',
      ],
    },
    {
      name: 'Scale',
      blurb: 'For several branches or a high quote volume.',
      monthly: 249,
      yearly: 207,
      setup: null as number | null,
      cta: 'Talk to us',
      highlight: false,
      features: [
        'Several branches or companies',
        'Unlimited users',
        'Higher quote volume to match your business',
        'Custom pricing rules and part-file costing',
        'Webhooks into your own systems',
        'Named onboarding contact',
      ],
    },
  ]

  // FAQ state
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  const faqs = [
    {
      q: 'Will the AI send prices to my customers without my approval?',
      a: 'No. Every quote stays a draft until someone on your team checks it and presses send. Lines the AI could not price from your list are flagged, and the quote cannot be sent until they are confirmed.'
    },
    {
      q: 'What kind of business is it for?',
      a: 'Workshops that quote custom work from a price list: steel and metal fabrication, aluminium and glass, signage, joinery and fit-out. If you send 30 or more quotes a month, one extra job won usually pays for the plan.'
    },
    {
      q: 'What do I need to get started?',
      a: 'Your price list, a few recent quotes, your sales email and a WhatsApp Business number. We handle the setup and test it with you before you go live.'
    },
    {
      q: 'How do I pay, and what does the setup fee cover?',
      a: 'You receive an invoice in US dollars and can pay by card or bank transfer. The one-time setup fee covers loading your price lists, connecting your inbox and WhatsApp number, and running test quotes with you until the prices are right. Monthly plans can be cancelled at any time.'
    },
    {
      q: 'Is my pricing data private?',
      a: 'Yes. Each company’s price lists, customers and quotes are kept separate from every other company, connections use HTTPS, and stored mailbox and WhatsApp credentials are encrypted.'
    }
  ]

  const bookDemo = () => {
    // A mailto: link opened in a new tab leaves a blank tab behind, so only
    // WhatsApp opens in a new tab; email hands off to the mail app in place.
    if (SALES_WHATSAPP) window.open(DEMO_URL, '_blank', 'noopener')
    else window.location.href = DEMO_URL
  }

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
      <div className="absolute inset-0 opacity-30 pointer-events-none" />

      {/* Dynamic Floating Glassmorphism Header Navigation */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-500 ${
        isScrolled ? 'py-3' : 'py-5 sm:py-6'
      }`}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 transition-colors duration-500 ${
          isScrolled 
            ? 'mx-4 bg-slate-950/70 border border-slate-900 rounded-full shadow-[0_10px_35px_-10px_rgba(0,0,0,0.5)] px-6 py-2.5' 
            : 'bg-transparent border border-transparent py-2'
        }`}>
          <div className="flex items-center justify-between h-14">
            
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center">
                <span className="text-white font-semibold text-xl">A</span>
              </div>
              <span className="text-xl font-semibold text-white tracking-wide">AXRFLOWS</span>
            </div>

            {/* Desktop Navigation Links with sliding dynamic indicators */}
            <nav className="hidden md:flex items-center gap-1.5 p-1.5 bg-slate-900/30 border border-slate-900/50 rounded-full">
              {[
                { id: 'features', label: 'Features' },
                { id: 'sandbox', label: 'Savings' },
                { id: 'how-it-works', label: 'How It Works' },
                { id: 'pricing', label: 'Pricing' },
                { id: 'faq', label: 'FAQ' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => scrollToSection(tab.id)}
                  className={`text-xs font-semibold px-4 py-2 rounded-full cursor-pointer transition-colors relative ${
                    activeSection === tab.id 
                      ? 'text-white bg-slate-800 border border-slate-700/50' 
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
                onClick={bookDemo}
                id="nav-cta-get-started"
                className="text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-full transition-colors cursor-pointer"
              >
                Book a demo
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
        <div className={`md:hidden absolute left-4 right-4 mt-2 overflow-hidden transition-colors duration-500 rounded-lg border border-slate-900 bg-slate-950/90 ${
          isMobileMenuOpen ? 'max-h-[420px] opacity-100 p-6' : 'max-h-0 opacity-0 pointer-events-none'
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
              Savings
            </button>
            <button 
              onClick={() => scrollToSection('how-it-works')} 
              className={`text-left text-sm font-semibold py-2.5 border-b border-slate-900/60 transition-colors ${activeSection === 'how-it-works' ? 'text-brand-400' : 'text-slate-400'}`}
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className={`text-left text-sm font-semibold py-2.5 border-b border-slate-900/60 transition-colors ${activeSection === 'pricing' ? 'text-brand-400' : 'text-slate-400'}`}
            >
              Pricing
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
                className="flex-1 py-3 text-center text-sm font-semibold text-slate-300 bg-slate-900 rounded-lg border border-slate-800"
              >
                {session ? 'Dashboard' : 'Sign In'}
              </button>
              <button
                onClick={bookDemo}
                className="flex-1 py-3 text-center text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg"
              >
                Book a demo
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
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-brand-400 mb-8 animate-fade-in">
            <Sparkles className="w-3.5 h-3.5" />
            <span>For metal, aluminium and glass workshops in the UAE</span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-white max-w-4xl leading-tight">
            Reply to every quote request{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-400 via-indigo-400 to-brand-300">
              before your competitor does
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
            Customers send a message, a sketch or a drawing on WhatsApp or email. AXRFLOWS reads it, prices it from
            your own rate sheet and drafts the quote in AED, ready for your estimator to check and send. Minutes, not days.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center">
            <button
              onClick={bookDemo}
              id="hero-cta-primary"
              className="w-full sm:w-auto px-8 py-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              Book a free demo
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollToSection('sandbox')}
              id="hero-cta-secondary"
              className="w-full sm:w-auto px-8 py-4 bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-300 hover:text-white font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              See what you'd save
            </button>
          </div>

          <p className="mt-6 text-xs sm:text-sm text-slate-500">
            Set up for you in 48 hours · Uses your own prices · Cancel any time
          </p>

          {/* Visual Showcase (Pipeline Mockup) */}
          <div className="mt-20 w-full max-w-5xl p-4 rounded-lg bg-slate-900/20 border border-slate-850 glass-panel relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-indigo-500/20 rounded-lg blur-xl opacity-40 pointer-events-none" />
            
            <div className="relative rounded-lg overflow-hidden bg-slate-950/80 border border-slate-800 p-6 sm:p-10">
              <div className="flex items-center justify-between border-b border-slate-900 pb-4 mb-8 text-left">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    How a quote moves
                  </div>
                  <h3 className="text-lg font-semibold text-white mt-1">From WhatsApp message to accepted quote</h3>
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
                <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800 flex flex-col items-center text-center group hover:border-brand-500/50 transition-colors">
                  <div className="w-12 h-12 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4 transition-transform">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-white">1. Enquiry arrives</h4>
                  <p className="text-xs text-slate-400 mt-2">A WhatsApp message, an email, or a DXF / STL drawing from your customer.</p>
                  <div className="flex gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-950 border border-slate-800 text-slate-400">Email</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-950 border border-slate-800 text-slate-400">WhatsApp</span>
                  </div>
                </div>

                {/* Node 2 */}
                <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800 flex flex-col items-center text-center group hover:border-indigo-500/50 transition-colors">
                  <div className="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 transition-transform">
                    <Database className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-white">2. Priced from your rates</h4>
                  <p className="text-xs text-slate-400 mt-2">Matched to your own price list: material, cutting, welding, coating, glass per m².</p>
                  <div className="flex gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-950 border border-slate-800 text-indigo-400">Your price list</span>
                  </div>
                </div>

                {/* Node 3 */}
                <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800 flex flex-col items-center text-center group hover:border-brand-500/50 transition-colors">
                  <div className="w-12 h-12 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4 transition-transform">
                    <Calculator className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-white">3. Totals checked</h4>
                  <p className="text-xs text-slate-400 mt-2">Line items, discount and VAT added up by the system, not guessed by the AI.</p>
                  <div className="flex gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">VAT included</span>
                  </div>
                </div>

                {/* Node 4 */}
                <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-800 flex flex-col items-center text-center group hover:border-brand-500/50 transition-colors">
                  <div className="w-12 h-12 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4 transition-transform">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-white">4. Sent and tracked</h4>
                  <p className="text-xs text-slate-400 mt-2">Your customer gets a quote link to accept online. You see when they open it.</p>
                  <div className="flex gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-950 border border-slate-800 text-brand-400">Accept online</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section id="features" className="py-24 border-t border-slate-900">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-semibold text-white">Built for workshops that quote every day</h2>
            <p className="text-slate-400 text-sm mt-3 max-w-lg mx-auto">
              Your estimator stops retyping messages into Excel, and every request gets a priced answer the same day.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-lg bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-colors hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-6 transition-colors">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Reads messy requests</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Understands “20 brackets, 6 mm MS, galvanised, deliver to Jebel Ali” and turns it into line items with sizes and quantities.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-lg bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-colors hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6 transition-colors">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Uses your own price list</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Upload your rate sheets in Excel, CSV or PDF. Prices come from your numbers, and anything not on the list is flagged for you to confirm.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-lg bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-colors hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 transition-colors">
                <Calculator className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Totals you can trust</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Discount, VAT and a validity date on every quote. The system recalculates every total, so a wrong sum never reaches a customer.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-8 rounded-lg bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-colors hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-6 transition-colors">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">WhatsApp, where your customers are</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Enquiries to your WhatsApp Business number arrive as draft quotes. Your team can take over the chat at any time.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-8 rounded-lg bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-colors hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-6 transition-colors">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Your inbox, handled</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Connect your sales email. Requests and attachments become drafts, and unanswered quotes can get one polite follow-up automatically.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-8 rounded-lg bg-slate-900/25 border border-slate-850 hover:border-slate-700 transition-colors hover:bg-slate-900/40 group">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6 transition-colors">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Know what you win</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Win rate, won value and time to quote at a glance, with each customer's past prices on hand for the next job.
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
                  <span>Savings estimate</span>
                </div>
                <h2 className="text-3xl font-semibold text-white">How much is slow quoting costing you?</h2>
                <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                  Move the sliders to match your workshop. This is a rough estimate, not a promise: it assumes replying faster wins a few more jobs.
                </p>
              </div>

              {/* Slider 1 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-300">Quote requests per month</span>
                  <span className="text-brand-400 font-mono">{leadsCount} requests</span>
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
                <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                  <span>10</span>
                  <span>1,000</span>
                </div>
              </div>

              {/* Slider 2 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-300">Average job value (USD)</span>
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
                <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                  <span>$200</span>
                  <span>$15,000</span>
                </div>
              </div>

              {/* Slider 3 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-300">Time to prepare one quote by hand</span>
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
                <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                  <span>10 mins</span>
                  <span>120 mins</span>
                </div>
              </div>
            </div>

            {/* Right Column: ROI Results Card */}
            <div className="lg:col-span-7 p-8 rounded-lg bg-slate-900/30 border border-slate-850 glass-panel relative">
              <div className="absolute top-0 right-0 p-4">
                <span className="text-[11px] font-semibold font-mono tracking-wide text-slate-500 uppercase">Estimate</span>
              </div>

              <h3 className="text-xl font-semibold text-white mb-6">What AXRFLOWS could be worth to you</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                {/* Result Block 1 */}
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-850 flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-brand-400" />
                    Time saved
                  </span>
                  <span className="text-2xl font-semibold text-white mt-2">
                    {hoursSavedPerMonth} hrs
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">saved per month</span>
                </div>

                {/* Result Block 2 */}
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-850 flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    Win-rate lift
                  </span>
                  <span className="text-2xl font-semibold text-emerald-400 mt-2">
                    +{conversionBoost}%
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">assumed, from faster replies</span>
                </div>

                {/* Result Block 3 */}
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-850 flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
                    Extra jobs
                  </span>
                  <span className="text-2xl font-semibold text-white mt-2">
                    +{extraDealsWon} deals
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">won per month</span>
                </div>
              </div>

              {/* Big Estimated ROI Block */}
              <div className="p-6 rounded-lg bg-gradient-to-br from-brand-500/10 to-indigo-500/10 border border-brand-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-xs font-semibold text-brand-400 uppercase tracking-wide">Estimated value per month</span>
                  <h4 className="text-3xl sm:text-4xl font-semibold text-white mt-1">
                    ${estimatedValueCreated.toLocaleString()}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">Hours saved at $20 an hour, plus the extra jobs. The Growth plan costs $99 a month.</p>
                </div>
                <button
                  onClick={bookDemo}
                  id="sandbox-cta-action"
                  className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap self-stretch sm:self-auto justify-center"
                >
                  Book a free demo
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* How it works workflow */}
        <section id="how-it-works" className="py-24 border-t border-slate-900">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-semibold text-white">Live in 48 hours. We do the setup.</h2>
            <p className="text-slate-400 text-sm mt-3 max-w-sm mx-auto">
              No IT team and no training course. You send us your prices; we hand you a working system.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-brand-400 font-semibold text-lg flex items-center justify-center mb-6">
                1
              </div>
              <h3 className="text-lg font-semibold text-white">Send us your price list</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed max-w-xs">
                Your rate sheet in any format, plus a few recent quotes. We load it and test it until the prices match yours.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-brand-400 font-semibold text-lg flex items-center justify-center mb-6">
                2
              </div>
              <h3 className="text-lg font-semibold text-white">We connect WhatsApp and email</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed max-w-xs">
                Your WhatsApp Business number and sales inbox, connected for you. Enquiries start arriving as drafts.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-brand-400 font-semibold text-lg flex items-center justify-center mb-6">
                3
              </div>
              <h3 className="text-lg font-semibold text-white">Check, send, win</h3>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed max-w-xs">
                Review each draft, change anything you like, send it in one click, and see the moment your customer accepts.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 border-t border-slate-900">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-semibold text-white">Simple pricing</h2>
            <p className="text-slate-400 text-sm mt-3 max-w-lg mx-auto">
              We set the system up for you, so you are sending quotes within 48 hours. One extra job won a month usually pays for the plan.
            </p>

            <div className="mt-8 inline-flex items-center p-1 bg-slate-900/40 border border-slate-900 rounded-full">
              <button
                onClick={() => setBillingYearly(false)}
                className={`text-xs font-semibold px-4 py-2 rounded-full cursor-pointer transition-colors ${!billingYearly ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingYearly(true)}
                className={`text-xs font-semibold px-4 py-2 rounded-full cursor-pointer transition-colors ${billingYearly ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Yearly <span className="text-brand-400">· 2 months free</span>
              </button>
            </div>
          </div>

          <div className="max-w-3xl mx-auto mb-10 rounded-lg border border-brand-500/30 bg-brand-500/5 px-5 py-4 text-center text-sm text-slate-300">
            <span className="font-semibold text-white">Founding customers:</span> the first three businesses get the setup fee waived in exchange for a short case study.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-lg border p-7 ${plan.highlight ? 'border-brand-500/60 bg-slate-900/50' : 'border-slate-900 bg-slate-900/10'}`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-7 text-[11px] font-semibold uppercase tracking-wider bg-brand-500 text-white px-3 py-1 rounded-full">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <p className="text-slate-400 text-sm mt-1">{plan.blurb}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  {plan.setup === null && <span className="text-slate-400 text-sm mr-1">from</span>}
                  <span className="text-4xl font-semibold text-white">${billingYearly ? plan.yearly : plan.monthly}</span>
                  <span className="text-slate-400 text-sm">/ month</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {billingYearly ? `Billed yearly at $${plan.yearly * 12}` : 'Billed monthly'}
                  {' · '}
                  {plan.setup === null ? 'Setup quoted for your business' : `$${plan.setup} one-time setup`}
                </p>

                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-sm text-slate-300">
                      <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {plan.setup === null ? (
                  <a
                    href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('AXRFLOWS Scale plan')}`}
                    className="mt-8 w-full py-3 text-center text-sm font-semibold rounded-lg border border-slate-800 text-slate-200 hover:border-slate-700 hover:text-white transition-colors"
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <button
                    onClick={bookDemo}
                    className={`mt-8 w-full py-3 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${plan.highlight ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'border border-slate-800 text-slate-200 hover:border-slate-700 hover:text-white'}`}
                  >
                    {plan.cta}
                  </button>
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-slate-500 mt-8 max-w-2xl mx-auto leading-relaxed">
            Prices in US dollars, excluding local taxes. WhatsApp conversation fees charged by Meta are passed on at cost. Paid by invoice: card or bank transfer.
          </p>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 border-t border-slate-900 max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-semibold text-white">Questions workshop owners ask</h2>
            <p className="text-slate-400 text-sm mt-3">
              Short answers. Ask us anything else on the demo call.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="rounded-lg border border-slate-900 bg-slate-900/10 hover:border-slate-800 transition-colors overflow-hidden"
              >
                <button
                  onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                  className="w-full px-6 py-5 flex justify-between items-center text-left text-white font-semibold text-base hover:text-brand-400 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-500 transition-transform ${
                      activeFaq === index ? 'rotate-180 text-brand-400' : ''
                    }`}
                  />
                </button>
                <div
                  className={`transition-colors ease-in-out overflow-hidden ${
                    activeFaq === index ? 'max-h-96 border-t border-slate-900/50' : 'max-h-0'
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
        <section className="py-20 my-12 rounded-lg bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950 border border-slate-850 glass-panel text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-brand-500/10 blur-[80px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto px-6">
            <h2 className="text-3xl sm:text-4xl font-semibold text-white">Stop losing jobs to slow quotes</h2>
            <p className="text-slate-400 text-sm sm:text-base mt-4 leading-relaxed">
              Book a 20-minute demo. Send us one of your real enquiries and we will show you the priced quote it turns into.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={bookDemo}
                id="footer-cta-primary"
                className="w-full sm:w-auto px-8 py-3.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                Book a free demo
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollToSection('pricing')}
                className="w-full sm:w-auto px-8 py-3.5 bg-slate-950 border border-slate-850 hover:border-slate-750 text-slate-400 hover:text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                See pricing
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
              <span className="text-white font-semibold text-sm">A</span>
            </div>
            <span className="font-semibold text-white tracking-wide">AXRFLOWS</span>
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
