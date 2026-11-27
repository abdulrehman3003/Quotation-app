import React from 'react'
import { LegalLayout, Section, List, Mail } from './LegalLayout'

export const AcceptableUse: React.FC = () => (
  <LegalLayout
    title="Acceptable Use Policy"
    summary={
      <>
        AxrflowsQuotes is for answering real customer enquiries. Use it the way you would want a supplier to treat your own inbox: no spam,
        nothing illegal, and no attempts to break the service.
      </>
    }
  >
    <Section title="Messaging your customers">
      <List
        items={[
          'Only message people who contacted you, or who agreed to hear from you. Don\'t use the Service for cold bulk email or WhatsApp campaigns.',
          'Follow the WhatsApp Business Messaging Policy and Commerce Policy, Twilio\'s Acceptable Use Policy, and the anti-spam laws that apply to you and your customers.',
          'Respect opt-outs. When a customer replies STOP, the Service stops automatic follow-ups to them. Don\'t work around this.',
          'Don\'t impersonate another business or person, or send misleading quotes.',
        ]}
      />
    </Section>

    <Section title="Content">
      <p>Don't upload or send content that:</p>
      <List
        items={[
          'is unlawful, fraudulent, defamatory, harassing or discriminatory,',
          'infringes someone else\'s intellectual property or privacy,',
          'contains malware or links to it,',
          'includes special-category personal data, such as health or biometric data, or payment card numbers.',
        ]}
      />
    </Section>

    <Section title="The Service itself">
      <List
        items={[
          'Don\'t try to access other clients\' workspaces, probe or scan the Service for vulnerabilities, or bypass security or plan limits. Report suspected issues to us instead (see Security).',
          'Don\'t overload the Service, automate sign-ups, or scrape it.',
          'Don\'t resell access, share logins between people, or use the Service to build a competing product.',
          'Don\'t use AI features to generate content for purposes that have nothing to do with your quotations.',
        ]}
      />
    </Section>

    <Section title="What happens if this policy is broken">
      <p>
        We may remove content, pause automations or suspend a workspace to stop serious harm. Where we can, we'll tell you first and give you a chance to fix the problem.
        Repeated or severe breaches may lead to termination under the Terms of Service.
      </p>
      <p>To report abuse, email <Mail />.</p>
    </Section>
  </LegalLayout>
)

export default AcceptableUse
