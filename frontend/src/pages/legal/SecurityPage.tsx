import React from 'react'
import { LegalLayout, Section, List, Mail } from './LegalLayout'

export const SecurityPage: React.FC = () => (
  <LegalLayout
    title="Security"
    summary={
      <>
        Your price lists and your customers' enquiries are sensitive business data. This page explains how AxrflowsQuotes protects them.
        To report a vulnerability, email <Mail />.
      </>
    }
  >
    <Section title="Your workspace is yours alone">
      <List
        items={[
          'Every company has its own isolated workspace. Each request is checked on the server against the signed-in user\'s company, so one client can\'t see another\'s data.',
          'Browsers have no direct access to the database. All reads and writes go through our server, which enforces these checks. Database access rules provide a second layer of protection.',
          'New accounts are approved by us before they can be used, and team members join only through an invite from the workspace owner.',
        ]}
      />
    </Section>

    <Section title="Encryption">
      <List
        items={[
          'All traffic to the website and the application uses HTTPS (TLS), and browsers are told to always use HTTPS (HSTS).',
          'Mailbox app passwords, sign-in tokens and WhatsApp (Twilio) credentials are encrypted before they are stored, and are decrypted only on the server when they are used.',
          'Passwords are hashed by our authentication provider. Nobody, including us, can read them.',
        ]}
      />
    </Section>

    <Section title="Mailbox and WhatsApp connections">
      <List
        items={[
          'For mailboxes, you can use Google or Microsoft sign-in, or an app password. You can revoke either at any time from your Google or Microsoft account.',
          'Incoming WhatsApp webhooks are accepted only with a valid Twilio signature.',
          'Quote links sent to customers contain a long random token that can\'t be guessed, and show only that one quote.',
        ]}
      />
    </Section>

    <Section title="AI with a human in the loop">
      <List
        items={[
          'The AI drafts quotes; it never sends one on its own. A person on your team approves every quote before it goes out.',
          'The WhatsApp assistant is instructed not to reveal internal price lists or other confidential knowledge-base content.',
          'We don\'t use your content or your customers\' data to train AI models.',
        ]}
      />
    </Section>

    <Section title="Application security">
      <List
        items={[
          'Security headers on every page: a Content Security Policy, and protection against clickjacking and content-type sniffing.',
          'Outgoing webhooks may only point to public HTTPS addresses, never to internal networks.',
          'Size limits on uploads and email attachments, and rate limits on WhatsApp messages.',
          'Dependencies are checked for known vulnerabilities and kept up to date. Interactive API documentation is switched off in production.',
        ]}
      />
    </Section>

    <Section title="Infrastructure">
      <p>
        The service runs on established cloud providers (Supabase for the database and storage, Railway for the application, Vercel for the website). Each runs its own
        security programme, including physical security, network protection and backups. The full list is in our Data Processing Agreement.
      </p>
    </Section>

    <Section title="If something goes wrong">
      <p>
        If a security incident affects your data, we will tell you without undue delay, and within 72 hours at most. We'll explain what happened, what it means for you
        and what we're doing about it.
      </p>
    </Section>

    <Section title="Reporting a vulnerability">
      <p>
        If you believe you've found a security issue, please email <Mail /> with the details and steps to reproduce it. Please give us reasonable time to fix it before
        disclosing it, and don't access other clients' data or disrupt the service while testing. We'll acknowledge your report within 3 business days.
      </p>
    </Section>
  </LegalLayout>
)

export default SecurityPage
