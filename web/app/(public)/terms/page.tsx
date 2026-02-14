import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | FlashFlow AI',
  description: 'Terms and conditions for using FlashFlow AI services.',
};

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl sm:text-5xl font-bold mb-4">Terms of Service</h1>
      <p className="text-zinc-500 mb-12">Effective date: February 13, 2026</p>

      <div className="prose prose-invert max-w-none space-y-10 text-zinc-300">
        {/* 1 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">1. Acceptance of Terms</h2>
          <p className="leading-relaxed">
            By creating an account or using FlashFlow AI (&ldquo;Service&rdquo;), you agree to
            these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do not use the
            Service. We may update these Terms from time to time; continued use after changes
            constitutes acceptance.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">2. Account Terms</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>You must be at least 16 years old to use the Service.</li>
            <li>You must provide accurate and complete registration information.</li>
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>You must notify us immediately at{' '}
              <a href="mailto:hello@flashflowai.com" className="text-teal-400 hover:underline">
                hello@flashflowai.com
              </a>{' '}
              if you suspect unauthorized access.</li>
            <li>One person or legal entity per account. Shared or machine accounts require prior approval.</li>
          </ul>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">3. Acceptable Use</h2>
          <p className="leading-relaxed mb-3">You agree <strong>not</strong> to use the Service to:</p>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Violate any applicable law or regulation</li>
            <li>Generate or distribute hateful, violent, sexually exploitative, or illegal content</li>
            <li>Harass, threaten, impersonate, or defame any person</li>
            <li>Send spam, phishing messages, or malware</li>
            <li>Attempt to gain unauthorized access to accounts, systems, or data</li>
            <li>Reverse-engineer, scrape, or copy the Service or its underlying technology</li>
            <li>Circumvent usage limits, rate limits, or security controls</li>
            <li>Resell access to the Service without written permission</li>
            <li>Infringe any third-party intellectual property rights</li>
          </ul>
          <p className="leading-relaxed mt-3">
            We reserve the right to suspend or terminate accounts that violate this policy, with
            or without notice.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">4. AI-Generated Content &amp; Ownership</h2>
          <p className="leading-relaxed">
            <strong className="text-white">You own your content.</strong> Scripts, audience personas,
            product descriptions, and all other content you create or generate using FlashFlow AI
            belong to you. We claim no ownership over your inputs or the AI-generated outputs
            produced for you.
          </p>
          <p className="leading-relaxed mt-3">
            <strong>License to us:</strong> You grant FlashFlow AI a limited, non-exclusive license
            to process your content solely to operate and improve the Service (e.g., generating
            scripts, training recommendation models on aggregated anonymized data). We will not
            publish or share your content with other users.
          </p>
          <p className="leading-relaxed mt-3">
            <strong>No guarantee of uniqueness:</strong> AI-generated content is provided
            &ldquo;as-is.&rdquo; Similar prompts may produce similar outputs for different users.
            You are responsible for reviewing content before use and ensuring it does not infringe
            third-party rights.
          </p>
          <p className="leading-relaxed mt-3">
            <strong>FlashFlow IP:</strong> All trademarks, logos, UI design, and proprietary
            technology of FlashFlow AI remain our exclusive property.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">5. Subscription &amp; Billing</h2>
          <p className="leading-relaxed">
            FlashFlow AI offers free and paid plans. By subscribing to a paid plan you agree to:
          </p>
          <ul className="list-disc list-inside space-y-1.5 mt-2">
            <li>
              <strong>Recurring billing:</strong> Your chosen payment method will be charged at the
              start of each billing cycle (monthly or annual) at the then-current rate.
            </li>
            <li>
              <strong>Plan changes:</strong> Upgrades take effect immediately with prorated charges.
              Downgrades take effect at the end of the current billing period.
            </li>
            <li>
              <strong>Cancellation:</strong> You may cancel anytime from your account settings.
              Access continues through the end of the paid period. No partial refunds are issued.
            </li>
            <li>
              <strong>Price changes:</strong> We may adjust pricing with at least 30 days notice.
              Continued use after the effective date constitutes acceptance.
            </li>
            <li>
              <strong>Credits:</strong> AI credits included in your plan expire at the end of each
              billing cycle and do not roll over unless your plan states otherwise.
            </li>
          </ul>
          <p className="leading-relaxed mt-3">
            All payments are processed by Stripe. We do not store your credit card details.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">6. Free Tier</h2>
          <p className="leading-relaxed">
            The free tier provides limited access to core features. We reserve the right to modify
            free-tier limits at any time. Free accounts inactive for more than 12 months may be
            deleted after a 30-day warning email.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">7. Service Availability</h2>
          <p className="leading-relaxed">
            We target 99.5% uptime but do not guarantee uninterrupted access. Planned maintenance
            windows will be communicated in advance when possible. We are not liable for downtime
            caused by third-party providers, internet outages, or force majeure events.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">8. Disclaimer of Warranties</h2>
          <p className="leading-relaxed">
            The Service is provided <strong>&ldquo;as is&rdquo;</strong> and{' '}
            <strong>&ldquo;as available&rdquo;</strong> without warranties of any kind, whether
            express or implied, including but not limited to implied warranties of merchantability,
            fitness for a particular purpose, and non-infringement.
          </p>
          <p className="leading-relaxed mt-3">
            We do not warrant that AI-generated content will be accurate, original, or suitable
            for any particular purpose. You use all outputs at your own risk.
          </p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">9. Limitation of Liability</h2>
          <p className="leading-relaxed">
            To the maximum extent permitted by law, FlashFlow AI, its officers, directors,
            employees, and agents shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages &mdash; including but not limited to loss of
            profits, data, business opportunities, or goodwill &mdash; arising out of or related
            to your use of or inability to use the Service, regardless of the theory of liability.
          </p>
          <p className="leading-relaxed mt-3">
            Our total aggregate liability for any claims arising under these Terms shall not
            exceed the amount you paid to FlashFlow AI in the twelve (12) months preceding the
            claim, or $100 USD, whichever is greater.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">10. Indemnification</h2>
          <p className="leading-relaxed">
            You agree to indemnify and hold harmless FlashFlow AI from any claims, damages, or
            expenses (including reasonable attorneys&rsquo; fees) arising from your use of the
            Service, your content, or your violation of these Terms.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">11. Termination</h2>
          <p className="leading-relaxed">
            <strong>By you:</strong> You may delete your account at any time from your settings.
            Upon deletion, your data will be removed per our{' '}
            <a href="/privacy" className="text-teal-400 hover:underline">Privacy Policy</a>.
          </p>
          <p className="leading-relaxed mt-3">
            <strong>By us:</strong> We may suspend or terminate your account immediately if you
            violate these Terms, engage in fraud, fail to pay, or at our sole discretion with
            30 days notice. Upon termination, your right to access the Service ceases immediately.
          </p>
          <p className="leading-relaxed mt-3">
            <strong>Survival:</strong> Sections on intellectual property, limitation of liability,
            indemnification, and governing law survive termination.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">12. Governing Law</h2>
          <p className="leading-relaxed">
            These Terms are governed by the laws of the State of California, United States,
            without regard to conflict-of-law principles. Any disputes shall be resolved in the
            state or federal courts located in San Francisco County, California.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">13. Contact</h2>
          <p className="leading-relaxed">
            Questions about these Terms? Contact us:
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
