import React from 'react'
import { Link } from 'react-router-dom'
import { LegalLayout, Section, Mail } from './LegalLayout'

const ITEMS: { name: string; type: string; purpose: string; kept: string }[] = [
  { name: 'Sign-in session (sb-…-auth-token)', type: 'Local storage', purpose: 'Keeps you signed in to the app', kept: 'Until you sign out' },
  { name: 'Unsent work and invite link', type: 'Session storage', purpose: 'Keeps a draft you are typing, and a team invite link, while you sign up', kept: 'Until the browser tab closes' },
  { name: 'axrflows-wa-seen', type: 'Local storage', purpose: 'Remembers which WhatsApp messages you have already seen, so you are only notified about new ones', kept: 'Until you clear your browser data' },
  { name: 'axr_admin_payment_link', type: 'Local storage', purpose: 'Admin console only: remembers the last payment link used', kept: 'Until you clear your browser data' },
]

export const CookiePolicy: React.FC = () => (
  <LegalLayout
    title="Cookies"
    summary={
      <>
        We don't use advertising, tracking or analytics cookies, and we don't sell browsing data. AxrflowsQuotes only stores what it needs to work,
        so there is no cookie banner to accept.
      </>
    }
  >
    <Section title="What we store in your browser">
      <p>
        The app uses your browser's local storage and session storage, not cookies, for the items below. These are strictly necessary for the features you use,
        so they don't require consent under the EU ePrivacy rules or similar laws.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Purpose</th>
              <th className="px-3 py-2 font-medium">Kept</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {ITEMS.map((i) => (
              <tr key={i.name} className="align-top">
                <td className="px-3 py-2.5 text-slate-100">{i.name}</td>
                <td className="px-3 py-2.5 text-slate-300">{i.type}</td>
                <td className="px-3 py-2.5 text-slate-300">{i.purpose}</td>
                <td className="px-3 py-2.5 text-slate-300">{i.kept}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>

    <Section title="Third parties">
      <p>
        Our website loads fonts from Google Fonts, so Google receives your IP address when the page loads. Google Fonts doesn't set cookies. Our hosting providers may keep
        short-lived security logs, such as IP addresses, to protect the service. See the <Link to="/privacy" className="text-brand-300 underline underline-offset-2">Privacy Policy</Link>.
      </p>
      <p>
        When you open a link to another site from our pages, for example WhatsApp or Payoneer, that site's own cookie policy applies.
      </p>
    </Section>

    <Section title="Your choices">
      <p>
        You can clear this storage at any time in your browser settings. Doing so signs you out. If we ever add optional cookies, such as analytics, we will ask for your consent first
        and update this page.
      </p>
      <p>Questions: <Mail /></p>
    </Section>
  </LegalLayout>
)

export default CookiePolicy
