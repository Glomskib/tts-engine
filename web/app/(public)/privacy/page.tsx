import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | FlashFlow AI',
  description: 'How FlashFlow AI collects, uses, and protects your personal data.',
};

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl sm:text-5xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-zinc-500 mb-12">Effective date: February 13, 2026</p>

      <div className="prose prose-invert max-w-none space-y-10 text-zinc-300">
        {/* 1 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">1. Introduction</h2>
          <p className="leading-relaxed">
            FlashFlow AI (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;Company&rdquo;) operates
            flashflowai.com and related services (the &ldquo;Service&rdquo;). This Privacy Policy
            explains how we collect, use, disclose, and safeguard your information when you use
            our Service. By using FlashFlow AI you consent to the practices described here.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">2. Information We Collect</h2>

          <p className="font-semibold text-white mt-4">Information You Provide</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2">
            <li>Account data &mdash; name, email address, password</li>
            <li>Product information you input for script generation</li>
            <li>Audience personas and customer archetypes you create</li>
            <li>Scripts, winners, and other content you save</li>
            <li>Payment details (processed securely by Stripe; we never store card numbers)</li>
            <li>Support messages, feedback, and survey responses</li>
          </ul>

          <p className="font-semibold text-white mt-6">Information Collected Automatically</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2">
            <li>IP address, browser type, operating system, and device identifiers</li>
            <li>Pages visited, features used, session duration, and referring URLs</li>
            <li>Cookies and similar tracking technologies (see Section 6)</li>
            <li>Usage metrics &mdash; scripts generated, transcriptions run, videos created</li>
          </ul>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Provide, operate, and improve the Service</li>
            <li>Process transactions and send invoices via Stripe</li>
            <li>Personalize your experience (e.g., AI recommendations)</li>
            <li>Send service announcements, product updates, and onboarding emails</li>
            <li>Respond to support requests</li>
            <li>Analyze usage patterns to improve features and performance</li>
            <li>Detect and prevent fraud, abuse, or security incidents</li>
            <li>Comply with legal obligations</li>
            <li>Send marketing communications (only with your opt-in consent)</li>
          </ul>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">4. Third-Party Services</h2>
          <p className="leading-relaxed mb-3">
            We share data only as necessary to operate the Service. We do <strong>not</strong> sell
            your personal information. The third-party services we use include:
          </p>
          <ul className="list-disc list-inside space-y-1.5">
            <li>
              <strong>Stripe</strong> &mdash; payment processing. Stripe receives your billing
              details and is governed by&nbsp;
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">
                Stripe&rsquo;s Privacy Policy
              </a>.
            </li>
            <li>
              <strong>Supabase</strong> &mdash; database hosting and authentication. Data is stored
              in Supabase&rsquo;s SOC 2-compliant infrastructure.
            </li>
            <li>
              <strong>TikTok API</strong> &mdash; video importing, transcription, and performance
              data retrieval. We access only the data you authorize.
            </li>
            <li>
              <strong>Anthropic &amp; OpenAI</strong> &mdash; AI model providers used for script
              generation. Prompts may include your product data; outputs are returned to you and
              not used to train third-party models.
            </li>
            <li>
              <strong>Vercel</strong> &mdash; application hosting and edge delivery.
            </li>
            <li>
              <strong>Google Analytics / Meta Pixel / TikTok Pixel</strong> &mdash; anonymized
              website analytics and ad-campaign measurement.
            </li>
          </ul>
          <p className="leading-relaxed mt-3">
            We may also disclose information when required by law, in response to valid legal
            process, or to protect our rights, property, or safety.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">5. Data Security</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>All data in transit encrypted with TLS 1.2+</li>
            <li>Passwords hashed with bcrypt</li>
            <li>Row-level security (RLS) enforced at the database layer</li>
            <li>API keys stored with one-way hashing</li>
            <li>Regular dependency audits and security patches</li>
          </ul>
          <p className="leading-relaxed mt-3">
            No system is perfectly secure. We take commercially reasonable steps to protect your
            data but cannot guarantee absolute security.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">6. Cookies &amp; Tracking</h2>
          <p className="leading-relaxed mb-3">We use cookies and similar technologies to:</p>
          <ul className="list-disc list-inside space-y-1.5">
            <li><strong>Essential cookies</strong> &mdash; maintain your login session and CSRF protection</li>
            <li><strong>Analytics cookies</strong> &mdash; Google Analytics for aggregated usage data</li>
            <li><strong>Advertising cookies</strong> &mdash; Meta Pixel and TikTok Pixel to measure ad performance</li>
            <li><strong>Preference cookies</strong> &mdash; remember your settings (dark mode, sidebar state)</li>
          </ul>
          <p className="leading-relaxed mt-3">
            You can disable non-essential cookies in your browser settings. Disabling essential
            cookies may prevent you from logging in.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">7. Your Rights</h2>
          <p className="leading-relaxed mb-3">Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc list-inside space-y-1.5">
            <li><strong>Access</strong> &mdash; request a copy of the personal data we hold about you</li>
            <li><strong>Correction</strong> &mdash; update or correct inaccurate information</li>
            <li><strong>Deletion</strong> &mdash; request deletion of your account and associated data</li>
            <li><strong>Portability</strong> &mdash; export your data in a machine-readable format</li>
            <li><strong>Opt-out</strong> &mdash; unsubscribe from marketing emails at any time</li>
            <li><strong>Restriction</strong> &mdash; request that we limit processing of your data</li>
          </ul>
          <p className="leading-relaxed mt-3">
            <strong>GDPR (EU/EEA):</strong> We process data based on consent and legitimate business
            interests. You may lodge a complaint with your local data protection authority.
          </p>
          <p className="leading-relaxed mt-2">
            <strong>CCPA (California):</strong> You have the right to know, delete, and opt out of
            the sale of personal information. FlashFlow AI does not sell personal information.
          </p>
          <p className="leading-relaxed mt-3">
            To exercise any of these rights, email us at{' '}
            <a href="mailto:hello@flashflowai.com" className="text-teal-400 hover:underline">
              hello@flashflowai.com
            </a>.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">8. Data Retention</h2>
          <p className="leading-relaxed">
            We retain your personal data for as long as your account is active or as needed to
            provide the Service. Upon account deletion:
          </p>
          <ul className="list-disc list-inside space-y-1.5 mt-2">
            <li>Account data is deleted within 30 days</li>
            <li>Generated scripts and saved content are permanently removed</li>
            <li>Anonymized, aggregated usage data may be retained for analytics</li>
            <li>Billing records are retained as required by tax and accounting laws (typically 7 years)</li>
          </ul>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">9. Children&rsquo;s Privacy</h2>
          <p className="leading-relaxed">
            FlashFlow AI is not intended for users under 16. We do not knowingly collect personal
            information from children. If you believe a child has provided us with data, please
            contact us and we will delete it promptly.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">10. Changes to This Policy</h2>
          <p className="leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify you of material
            changes via email or a prominent notice on the Service at least 15 days before the
            changes take effect. Continued use after that date constitutes acceptance.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">11. Contact Us</h2>
          <p className="leading-relaxed">
            If you have questions or concerns about this Privacy Policy:
          </p>
          <div className="mt-3">
            <p><strong className="text-white">FlashFlow AI</strong></p>
            <p>
              Email:{' '}
              <a href="mailto:hello@flashflowai.com" className="text-teal-400 hover:underline">
                hello@flashflowai.com
              </a>
            </p>
            <p>
              Website:{' '}
              <a href="https://flashflowai.com" className="text-teal-400 hover:underline">
                flashflowai.com
              </a>
            </p>
          </div>
        </section>
      </div>
    </article>
  );
}
