import React from 'react'
import { Link } from 'react-router-dom'
import { LegalLayout, Section, List, Mail } from './LegalLayout'

const SUBPROCESSORS: { name: string; purpose: string; data: string; site: string }[] = [
  { name: 'Supabase, Inc.', purpose: 'Database, sign-in and file storage', data: 'All workspace data, account data and uploaded files', site: 'supabase.com' },
  { name: 'Railway Corporation', purpose: 'Application server hosting', data: 'All workspace data while it is being processed', site: 'railway.com' },
  { name: 'Vercel, Inc.', purpose: 'Website hosting and delivery', data: 'IP address and browser details of visitors', site: 'vercel.com' },
  { name: 'AI/ML API (aimlapi.com)', purpose: 'Access to AI language models for drafting quotes and WhatsApp replies', data: 'Enquiry text, the relevant parts of the knowledge base, customer name', site: 'aimlapi.com' },
  { name: 'OpenAI, L.L.C. (through AI/ML API)', purpose: 'AI language model that produces the drafts', data: 'Same as AI/ML API', site: 'openai.com' },
  { name: 'Twilio Inc.', purpose: 'WhatsApp message delivery, when the Client connects WhatsApp', data: 'Customer phone numbers and message content', site: 'twilio.com' },
  { name: 'Payoneer Inc.', purpose: 'Invoicing and payment collection', data: 'Client billing contact and payment details (not the Client\'s customers\' data)', site: 'payoneer.com' },
  { name: 'FormSubmit (formsubmit.co)', purpose: 'Delivers demo requests from our website to our inbox', data: 'Name, company, email, phone and message of people who request a demo', site: 'formsubmit.co' },
  { name: 'Google LLC (Google Fonts)', purpose: 'Website fonts', data: 'IP address of visitors', site: 'fonts.google.com' },
]

export const DataProcessingAgreement: React.FC = () => (
  <LegalLayout
    title="Data Processing Agreement"
    summary={
      <>
        This agreement covers the personal data of your customers that AxrflowsQuotes processes for you. It forms part of the{' '}
        <Link to="/terms" className="text-brand-300 underline underline-offset-2">Terms of Service</Link> and applies automatically. If your organisation needs
        a countersigned copy, or the EU Standard Contractual Clauses attached, email <Mail />.
      </>
    }
  >
    <Section title="1. Parties and roles">
      <p>
        The Client (the business using the Service) is the <strong className="text-slate-100">controller</strong>. AxrflowsQuotes, operated by Abdul Rehman, sole proprietor,
        Pakistan, is the <strong className="text-slate-100">processor</strong> of the personal data in Client Data ("Client Personal Data"). Words such as "personal data",
        "processing" and "data subject" have the meanings given in the applicable data protection law, including the EU/UK GDPR, the UAE PDPL and the Saudi PDPL.
      </p>
    </Section>

    <Section title="2. Details of the processing">
      <List
        items={[
          <><strong className="text-slate-100">Subject matter and purpose:</strong> receiving customer enquiries by email and WhatsApp, drafting, sending and tracking quotations, and automated follow-ups the Client switches on.</>,
          <><strong className="text-slate-100">Duration:</strong> for as long as the Client's subscription runs, plus the deletion period in section 9.</>,
          <><strong className="text-slate-100">Data subjects:</strong> the Client's customers and prospects, and the Client's staff who use the Service.</>,
          <><strong className="text-slate-100">Types of data:</strong> names, email addresses, phone numbers, company names, and the content of enquiries, messages, attachments and quotes.</>,
          <><strong className="text-slate-100">Special categories:</strong> none are intended. The Client should not use the Service to process health, biometric or similar sensitive data.</>,
        ]}
      />
    </Section>

    <Section title="3. Our obligations as processor">
      <p>We will:</p>
      <List
        items={[
          'process Client Personal Data only on the Client\'s documented instructions, which are given through these terms and through the Client\'s use and settings of the Service, unless the law requires otherwise (in which case we will tell the Client, unless the law forbids it),',
          'make sure everyone with access to the data is bound by confidentiality,',
          'apply the security measures in section 5,',
          'help the Client respond to requests from data subjects, and with security, breach notification and impact assessments, taking into account the nature of the processing,',
          'tell the Client promptly if we believe an instruction breaks data protection law.',
        ]}
      />
    </Section>

    <Section title="4. Subprocessors" id="subprocessors">
      <p>
        The Client authorises us to use the subprocessors listed below. Each one is bound by a written contract with data protection obligations at least as protective as
        this agreement. We will give at least 30 days' notice of a new subprocessor, by email or in the app. The Client may object on reasonable data protection grounds.
        If we can't address the objection, the Client may cancel the affected part of the Service and receive a refund of prepaid fees for the unused period.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Subprocessor</th>
              <th className="px-3 py-2 font-medium">Purpose</th>
              <th className="px-3 py-2 font-medium">Data involved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="align-top">
                <td className="px-3 py-2.5 text-slate-100">
                  {s.name}
                  <span className="block text-xs text-slate-500">{s.site}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-300">{s.purpose}</td>
                <td className="px-3 py-2.5 text-slate-300">{s.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-400">
        Mailboxes (Gmail, Microsoft 365) and WhatsApp Business accounts that the Client connects are the Client's own accounts with those providers, not our subprocessors.
      </p>
    </Section>

    <Section title="5. Security measures">
      <List
        items={[
          'Encryption in transit (TLS/HTTPS) for all connections, and encryption of stored mailbox and messaging credentials.',
          'Logical separation of each Client\'s workspace, enforced on the server for every request and by database access controls.',
          'Access to production systems limited to the operator, protected by strong passwords and two-factor authentication.',
          'New accounts must be approved before they can use the Service. Users of a workspace are invited by its owner.',
          'Every AI-drafted quote is approved by a person before it is sent.',
          'Signature checks on incoming WhatsApp webhooks, and restrictions on outgoing webhooks to public addresses only.',
          'Regular dependency updates and security reviews, and backups kept by the database provider.',
        ]}
      />
      <p>More detail is on our <Link to="/security" className="text-brand-300 underline underline-offset-2">Security</Link> page.</p>
    </Section>

    <Section title="6. Personal data breaches">
      <p>
        We will notify the Client without undue delay, and in any case within 72 hours of becoming aware of a personal data breach affecting Client Personal Data.
        The notice will include what we know about the nature of the breach, the likely consequences and the measures taken. We will provide updates as we learn more.
      </p>
    </Section>

    <Section title="7. International transfers">
      <p>
        Client Personal Data may be processed in Pakistan, the United States, the European Union and other countries where our subprocessors operate. Where a transfer
        requires safeguards under the applicable law, for example from the EU/EEA, the UK, the UAE or Saudi Arabia, the parties rely on the European Commission's Standard
        Contractual Clauses (Module 2, controller to processor, or Module 3, processor to processor, as appropriate), the UK Addendum, or the equivalent mechanism under that
        law. These are incorporated by reference, and a signed copy is available on request.
      </p>
    </Section>

    <Section title="8. Audits">
      <p>
        On written request, no more than once a year (or after a breach), we will answer the Client's reasonable security questionnaires and provide the information needed
        to demonstrate compliance with this agreement. Any on-site audit must be agreed in advance, at the Client's cost, and must protect the confidentiality of other clients.
      </p>
    </Section>

    <Section title="9. Return and deletion">
      <p>
        When the subscription ends, the Client may request an export of Client Data within 30 days. We then delete Client Personal Data from live systems within 90 days,
        and from backups as they expire, usually within a further 30 days, unless the law requires us to keep it.
      </p>
    </Section>

    <Section title="10. Liability and precedence">
      <p>
        The limits of liability in the Terms of Service apply to this agreement. If this agreement conflicts with the Terms on data protection, this agreement prevails.
        Where Standard Contractual Clauses apply, they prevail over both.
      </p>
    </Section>
  </LegalLayout>
)

export default DataProcessingAgreement
