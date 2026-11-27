import React from 'react'
import { Link } from 'react-router-dom'
import { LegalLayout, Section, List, Mail } from './LegalLayout'

export const PrivacyPolicy: React.FC = () => (
  <LegalLayout
    title="Privacy Policy"
    summary={
      <>
        We collect what we need to run AxrflowsQuotes, and nothing else. We don't sell personal data or use it for advertising.
        For your customers' enquiries and quotes, you are in control and we process them only on your instructions
        (see the <Link to="/dpa" className="text-brand-300 underline underline-offset-2">Data Processing Agreement</Link>).
      </>
    }
  >
    <Section title="1. Who we are">
      <p>
        AxrflowsQuotes ("we", "us") is an AI-assisted quotation service for businesses. It is operated by Abdul Rehman, a sole
        proprietor based in Pakistan. You can reach us at <Mail />.
      </p>
      <p>This policy explains how we handle personal data when you visit our website, book a demo, or use the service.</p>
    </Section>

    <Section title="2. Our two roles">
      <List
        items={[
          <><strong className="text-slate-100">Controller</strong> for data about our own clients and website visitors: account details, billing contacts, demo requests and support emails.</>,
          <><strong className="text-slate-100">Processor</strong> for data that our clients put into the service about their own customers, such as enquiry emails, WhatsApp chats, names, phone numbers and quotes. The client decides why and how this data is used; we follow our <Link to="/dpa" className="text-brand-300 underline underline-offset-2">Data Processing Agreement</Link>. If you are a client's customer and want to exercise your rights, please contact that business first. We will help them respond.</>,
        ]}
      />
    </Section>

    <Section title="3. What we collect">
      <List
        items={[
          <><strong className="text-slate-100">Account data:</strong> name, business email, company name, role and password. Passwords are stored as one-way hashes by our authentication provider, and we can't read them.</>,
          <><strong className="text-slate-100">Business content:</strong> price lists, product catalogues, terms and other files you upload to the knowledge base, and the quotes you create.</>,
          <><strong className="text-slate-100">Customer enquiries (as processor):</strong> emails and attachments arriving in a mailbox you connect, WhatsApp messages to a number you connect, and customer names, phone numbers, email addresses and company names.</>,
          <><strong className="text-slate-100">Connection credentials:</strong> mailbox app passwords or sign-in tokens, and Twilio WhatsApp credentials. These are encrypted before they are stored.</>,
          <><strong className="text-slate-100">Billing data:</strong> billing contact, plan, invoice dates and payment status. Payments go through Payoneer; we never see or store card numbers.</>,
          <><strong className="text-slate-100">Technical data:</strong> IP address, browser type and server logs needed for security and troubleshooting.</>,
          <><strong className="text-slate-100">Communications:</strong> demo requests, support emails and the details you share in them.</>,
        ]}
      />
    </Section>

    <Section title="4. Why we use it, and our legal basis">
      <List
        items={[
          <>To provide the service you signed up for, including drafting quotes with AI, sending them on your approval, and follow-ups you switch on (<em>performance of a contract</em>).</>,
          <>To bill you and keep financial records (<em>contract</em> and <em>legal obligation</em>).</>,
          <>To keep the service secure, prevent abuse and fix problems (<em>legitimate interests</em>).</>,
          <>To reply to demo requests and support questions (<em>legitimate interests</em>, or steps you ask for before a contract).</>,
          <>To send service and billing notices. We send marketing emails only if you agree, and you can opt out at any time (<em>consent</em>).</>,
        ]}
      />
      <p>We do not sell personal data, share it for advertising, or make decisions about people that have legal or similarly significant effects based solely on automated processing.</p>
    </Section>

    <Section title="5. AI processing">
      <p>
        To draft a quote, the text of an enquiry and the relevant parts of your knowledge base are sent to a large language model through
        our AI provider (see <Link to="/dpa#subprocessors" className="text-brand-300 underline underline-offset-2">subprocessors</Link>). The draft comes back to you,
        and no quote is sent to a customer until a person on your team approves it. We don't use your content or your customers' data to train AI models.
      </p>
    </Section>

    <Section title="6. Who we share data with">
      <p>
        We use a small number of service providers (subprocessors) for hosting, database, AI, messaging and payments. Each one only
        gets the data it needs for its task, under a contract. The current list is in our <Link to="/dpa#subprocessors" className="text-brand-300 underline underline-offset-2">Data Processing Agreement</Link>.
      </p>
      <p>We may also disclose data if the law requires it, to protect our rights or users' safety, or as part of a sale of the business (we would tell you first).</p>
    </Section>

    <Section title="7. International transfers">
      <p>
        Our providers may process data in the United States, the European Union and other countries. Where data protection law requires it,
        for example for data from the EU, UK, UAE or Saudi Arabia, we rely on appropriate safeguards such as the European Commission's Standard
        Contractual Clauses and our providers' own transfer commitments.
      </p>
    </Section>

    <Section title="8. How long we keep it">
      <List
        items={[
          'Account data and business content: for as long as your account is active.',
          'After you cancel: we delete or return your workspace data within 30 days of a request, and in any case within 90 days of the account closing. Backups are overwritten within a further 30 days.',
          'Invoices and billing records: as long as tax law requires, usually up to 7 years.',
          'Security logs: up to 90 days.',
        ]}
      />
    </Section>

    <Section title="9. Security">
      <p>
        We use encryption in transit (HTTPS), encryption of stored credentials, strict separation between client workspaces, and admin approval for
        new accounts. See our <Link to="/security" className="text-brand-300 underline underline-offset-2">Security</Link> page for details. No system is perfectly
        secure. If a breach affects your personal data, we will tell you without undue delay.
      </p>
    </Section>

    <Section title="10. Your rights">
      <p>Depending on where you live, including under the EU/UK GDPR, the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) and the Saudi Personal Data Protection Law, you may have the right to:</p>
      <List
        items={[
          'access the personal data we hold about you and get a copy of it,',
          'have it corrected or deleted,',
          'restrict or object to certain processing,',
          'receive it in a portable format,',
          'withdraw consent at any time, where we rely on consent,',
          'complain to your local data protection authority.',
        ]}
      />
      <p>Email <Mail /> to use any of these rights. We reply within 30 days and may need to confirm your identity first.</p>
    </Section>

    <Section title="11. Cookies and browser storage">
      <p>We don't use advertising or analytics cookies. We use only the storage the app needs to keep you signed in. See the <Link to="/cookies" className="text-brand-300 underline underline-offset-2">Cookies</Link> page.</p>
    </Section>

    <Section title="12. Children">
      <p>The service is for businesses and is not directed at anyone under 18. We don't knowingly collect children's data.</p>
    </Section>

    <Section title="13. Changes">
      <p>If we change this policy in a meaningful way, we will update the date at the top and notify active clients by email or in the app before the change takes effect.</p>
    </Section>
  </LegalLayout>
)

export default PrivacyPolicy
