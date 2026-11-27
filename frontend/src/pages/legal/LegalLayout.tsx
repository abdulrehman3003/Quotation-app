import React, { useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'

export const LEGAL_PAGES = [
  { path: '/privacy', label: 'Privacy Policy' },
  { path: '/terms', label: 'Terms of Service' },
  { path: '/dpa', label: 'Data Processing Agreement' },
  { path: '/security', label: 'Security' },
  { path: '/acceptable-use', label: 'Acceptable Use' },
  { path: '/cookies', label: 'Cookies' },
]

export const LEGAL_PATHS = LEGAL_PAGES.map((p) => p.path)

export const CONTACT_EMAIL = 'axrflows@gmail.com'
export const EFFECTIVE_DATE = '27 November 2026'

export const Mail: React.FC = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-300 hover:text-brand-200 underline underline-offset-2">
    {CONTACT_EMAIL}
  </a>
)

export const Section: React.FC<{ id?: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section id={id} className="mt-10 first:mt-0 scroll-mt-24">
    <h2 className="text-lg font-semibold text-slate-50">{title}</h2>
    <div className="mt-3 space-y-3 text-[15px] leading-7 text-slate-300">{children}</div>
  </section>
)

export const List: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1.5 marker:text-slate-600">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
)

export const LegalLayout: React.FC<{ title: string; summary: React.ReactNode; children: React.ReactNode }> = ({ title, summary, children }) => {
  useEffect(() => {
    document.title = `${title} · AxrflowsQuotes`
    window.scrollTo(0, 0)
    return () => { document.title = 'AxrflowsQuotes' }
  }, [title])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-brand-500 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">A</span>
            </div>
            <span className="font-semibold text-white tracking-wide">AxrflowsQuotes</span>
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm text-slate-400 hover:text-white transition-colors">Contact</a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 lg:grid lg:grid-cols-[200px_1fr] lg:gap-12">
        <nav aria-label="Legal pages" className="mb-8 lg:mb-0">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1 lg:sticky lg:top-8">
            {LEGAL_PAGES.map((p) => (
              <li key={p.path}>
                <NavLink
                  to={p.path}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-1.5 text-sm transition-colors ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`
                  }
                >
                  {p.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 max-w-3xl">
          <p className="text-xs uppercase tracking-wider text-slate-500">Effective {EFFECTIVE_DATE}</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{title}</h1>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm leading-6 text-slate-300">
            {summary}
          </div>
          <article className="mt-10">{children}</article>
          <p className="mt-14 border-t border-slate-900 pt-6 text-sm text-slate-500">
            Questions about this page? Email <Mail />.
          </p>
        </main>
      </div>
    </div>
  )
}
