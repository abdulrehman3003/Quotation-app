import React from 'react'
import { Link } from 'react-router-dom'
import { LegalLayout, Section, List, Mail } from './LegalLayout'

const L: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="text-brand-300 underline underline-offset-2">{children}</Link>
)

export const TermsOfService: React.FC = () => (
  <LegalLayout
    title="Terms of Service"
    summary={
      <>
        These terms are the agreement between your business and AxrflowsQuotes. In short: you pay in advance for your plan, you can cancel
        at the end of any billing period, your data stays yours, and you review every AI-drafted quote before it goes to a customer.
      </>
    }
  >
    <Section title="1. The agreement">
      <p>
        These Terms of Service ("Terms") govern your use of AxrflowsQuotes (the "Service"). The Service is operated by Abdul Rehman, a sole proprietor based in Pakistan
        ("we", "us"). By creating an account, signing an order form or using the Service, the business you represent ("you", the "Client") agrees to these Terms.
        You confirm that you have authority to bind that business.
      </p>
      <p>
        The Service is for business use only, not for consumers. If you and we sign an order form or proposal, it forms part of this agreement and
        prevails over these Terms where they conflict. Our <L to="/privacy">Privacy Policy</L>, <L to="/dpa">Data Processing Agreement</L> and <L to="/acceptable-use">Acceptable Use Policy</L> also apply.
      </p>
    </Section>

    <Section title="2. The Service">
      <p>
        AxrflowsQuotes reads customer enquiries that arrive by email or WhatsApp, drafts priced quotations from the price lists and rules you provide,
        and helps you send, track and follow them up. Features differ by plan, as described on our website or your order form. We may improve or change features over time.
        We won't make changes that materially reduce the core Service during a paid period without telling you in advance.
      </p>
    </Section>

    <Section title="3. Accounts">
      <List
        items={[
          'New accounts are approved by us before they can be used.',
          'You are responsible for your team members, for keeping passwords confidential and for all activity in your workspace.',
          'Each user must have their own login. Tell us straight away if you suspect unauthorised access.',
        ]}
      />
    </Section>

    <Section title="4. Plans, fees and payment">
      <List
        items={[
          'Fees, including any one-off setup fee, are as shown on our website or in your order form when you sign up.',
          'Subscription fees are invoiced in advance, monthly or yearly. Invoices are sent by email and can be paid through Payoneer (card or bank transfer) or another method we agree.',
          'Invoices are due within 7 days unless your order form says otherwise.',
          'Prices exclude taxes such as VAT, which are added where they apply. Bank and transfer charges are paid by you.',
          'Plan limits, such as the number of users and AI quotes per month, apply as described for your plan. If you regularly exceed them, we will discuss an upgrade with you before changing anything.',
          'We may change prices for future billing periods with at least 30 days\' notice. Changes never apply to a period you have already paid for.',
        ]}
      />
    </Section>

    <Section title="5. Late payment and suspension">
      <p>
        If an invoice is more than 14 days overdue, we may suspend access to the workspace after giving you notice by email or in the app. Your data is kept safe during
        a suspension, and access is restored once the balance is paid. We may also suspend access immediately when necessary to stop a serious security threat
        or a breach of the <L to="/acceptable-use">Acceptable Use Policy</L>.
      </p>
    </Section>

    <Section title="6. Cancellation and refunds">
      <List
        items={[
          'You can cancel at any time by emailing us. Cancellation takes effect at the end of the current paid billing period, and you keep access until then.',
          'Monthly fees already paid are not refunded for partly used months.',
          'Yearly plans: if you cancel within the first 30 days, we refund the unused months, minus any setup fee. After 30 days, yearly fees are non-refundable.',
          'The setup fee covers onboarding work (configuring your price lists, mailbox and WhatsApp) and is non-refundable once that work has started.',
          'If we end the Service for reasons other than your breach, we refund any prepaid fees for the unused period.',
          'After cancellation you can ask for an export of your data within 30 days, and we then delete it as described in the Privacy Policy.',
        ]}
      />
    </Section>

    <Section title="7. Your data">
      <p>
        You own all data you or your customers put into the Service ("Client Data"). You give us permission to host, process and transmit Client Data only as needed
        to provide and support the Service. We handle personal data in Client Data as your processor under the <L to="/dpa">Data Processing Agreement</L>.
      </p>
      <p>
        You are responsible for having the right to use the data you upload, and for having a lawful basis to contact your customers by email and WhatsApp.
        This includes any opt-in or consent that WhatsApp or anti-spam rules require.
      </p>
    </Section>

    <Section title="8. AI-generated quotes">
      <p>
        Quote drafts are produced by AI from the information you provide, and they can contain mistakes, such as wrong quantities, prices or descriptions.
        <strong className="text-slate-100"> You must review and approve every quote before it is sent</strong>, and you are responsible for the prices, terms and commitments
        you send to your customers. We are not a party to any contract between you and your customers.
      </p>
    </Section>

    <Section title="9. Third-party services">
      <p>
        The Service connects to services you choose to use, such as Gmail, Microsoft 365, Twilio and WhatsApp. Their own terms apply to your use of them. We aren't responsible
        for their outages, policy decisions or account restrictions, for example if Meta restricts a WhatsApp number.
      </p>
    </Section>

    <Section title="10. Our intellectual property">
      <p>
        We own the Service, its software and its design. You get a non-exclusive, non-transferable right to use it for your business during your subscription. You may not
        copy, resell, reverse engineer or build a competing product from it. If you send us feedback, we may use it freely to improve the Service.
      </p>
    </Section>

    <Section title="11. Confidentiality">
      <p>
        Each party will keep the other's non-public business information confidential, and use it only for this agreement. This includes your price lists and our software.
        This obligation lasts for three years after the agreement ends, and indefinitely for personal data and trade secrets.
      </p>
    </Section>

    <Section title="12. Availability and support">
      <p>
        We aim to keep the Service available around the clock, but we don't guarantee uninterrupted operation. Planned maintenance is announced in advance where possible.
        Support is by email at <Mail /> on business days. We aim to reply within one business day.
      </p>
    </Section>

    <Section title="13. Warranties and disclaimers">
      <p>
        We will provide the Service with reasonable skill and care. Apart from that, and to the extent the law allows, the Service is provided "as is", without other
        warranties, whether express or implied, including warranties of fitness for a particular purpose or that AI output will be accurate.
      </p>
    </Section>

    <Section title="14. Limitation of liability">
      <List
        items={[
          'Neither party is liable for indirect or consequential losses, or for lost profits, revenue, business or goodwill.',
          'Each party\'s total liability under this agreement is limited to the fees you paid us in the 12 months before the claim arose.',
          'These limits don\'t apply to your payment obligations, to breaches of confidentiality, or to liability that the law doesn\'t allow to be limited, such as liability for fraud.',
        ]}
      />
    </Section>

    <Section title="15. Indemnity">
      <p>
        You will defend and compensate us for third-party claims arising from the content you send through the Service, from your messages to your customers,
        or from your breach of the Acceptable Use Policy.
      </p>
    </Section>

    <Section title="16. Term and termination">
      <p>
        This agreement runs for as long as you have an account. Either party may end it with written notice: you as described in section 6, and we with 30 days'
        notice. Either party may end it immediately if the other materially breaches it and doesn't fix the breach within 14 days of being told about it.
        Sections that by their nature should survive termination will do so, such as fees owed, confidentiality and liability.
      </p>
    </Section>

    <Section title="17. Governing law and disputes">
      <p>
        These Terms are governed by the laws of Pakistan. We will first try to resolve any dispute in good faith by email within 30 days. If that fails,
        the courts of Pakistan have jurisdiction, unless we both agree in writing to another forum, such as arbitration.
      </p>
    </Section>

    <Section title="18. General">
      <List
        items={[
          'We may update these Terms. Meaningful changes are announced at least 30 days in advance by email or in the app. If you continue to use the Service after the change takes effect, you accept the updated Terms.',
          'Neither party is responsible for delays caused by events beyond its reasonable control.',
          'You may not transfer this agreement without our consent. We may transfer it as part of a sale or reorganisation of the business, and we will tell you if we do.',
          'If any part of these Terms is unenforceable, the rest remains in force.',
          'Notices to us go to the email address below. Notices to you go to the account owner\'s email address.',
        ]}
      />
      <p>Contact: <Mail /></p>
    </Section>
  </LegalLayout>
)

export default TermsOfService
