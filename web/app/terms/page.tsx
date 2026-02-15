import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | FlashFlow AI',
  description: 'Terms of Service for FlashFlow AI - Legal agreement for using our platform.',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link href="/" className="text-sm text-zinc-400 hover:text-white transition-colors">
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-6">Terms of Service</h1>
        <p className="text-zinc-400 mb-8">Effective Date: February 15, 2026</p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p>
              Welcome to FlashFlow AI. By accessing or using our platform, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use our services.
            </p>
            <p className="mt-4">
              These Terms constitute a legally binding agreement between you ("User", "you", "your") and FlashFlow AI, a service operated by Making Miles Matter INC ("FlashFlow", "we", "us", "our"), located in Findlay, Ohio.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Description of Service</h2>
            <p>
              FlashFlow AI is a Software-as-a-Service (SaaS) platform that provides AI-powered tools for generating TikTok scripts, managing content calendars, tracking performance analytics, and accessing competitive intelligence through Winners Bank.
            </p>
            <p className="mt-4">
              Our services include:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>AI script generation using advanced language models</li>
              <li>TikTok Shop product import and integration</li>
              <li>Content calendar and retainer tracking</li>
              <li>Winners Bank (competitive research database)</li>
              <li>Performance analytics and reporting</li>
              <li>Persona customization and script editing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. Account Registration</h2>
            <p>
              To use FlashFlow AI, you must create an account by providing accurate and complete information. You are responsible for:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Notifying us immediately of any unauthorized access or security breach</li>
            </ul>
            <p className="mt-4">
              You must be at least 13 years old to use FlashFlow AI (or 16 in the European Economic Area). By creating an account, you represent that you meet these age requirements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Subscription Plans and Billing</h2>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">4.1 Credit-Based Usage</h3>
            <p>
              FlashFlow AI operates on a credit-based system. Each script generation consumes one (1) credit. Credits are allocated monthly based on your subscription plan:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li><strong>Free Trial:</strong> 5 credits per month</li>
              <li><strong>Lite:</strong> 50 credits per month at $9/month</li>
              <li><strong>Creator Pro:</strong> Unlimited credits at $29/month</li>
              <li><strong>Business:</strong> Unlimited credits at $59/month</li>
              <li><strong>Brand & Agency:</strong> Custom pricing (contact us)</li>
            </ul>
            <p className="mt-4">
              Credits do not roll over to the next billing period. Unused credits expire at the end of each monthly cycle.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">4.2 Billing and Payments</h3>
            <p>
              Subscription fees are billed monthly or annually (as selected) in advance. Payments are processed via Stripe. By subscribing to a paid plan, you authorize us to charge your payment method on a recurring basis.
            </p>
            <p className="mt-4">
              If a payment fails, we will attempt to retry the charge. If payment cannot be processed after multiple attempts, your account may be suspended or downgraded to the free plan.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">4.3 Cancellation and Refunds</h3>
            <p>
              You may cancel your subscription at any time from your account settings. Cancellations take effect at the end of the current billing period. You will retain access to paid features until the end of the billing cycle.
            </p>
            <p className="mt-4">
              <strong>No refunds:</strong> We do not provide refunds for partial months or unused credits. All sales are final. If you cancel mid-cycle, you will not receive a pro-rated refund.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">4.4 Price Changes</h3>
            <p>
              We reserve the right to change our pricing at any time. We will provide at least 30 days' notice of any price increases. Continued use of FlashFlow AI after a price change constitutes acceptance of the new pricing.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. AI-Generated Content Disclaimer</h2>
            <p>
              <strong>No Guarantee of Performance:</strong> FlashFlow AI uses artificial intelligence to generate scripts and content. While we strive to provide high-quality outputs, we make no guarantees regarding the performance, effectiveness, or results of AI-generated content.
            </p>
            <p className="mt-4">
              By using our AI generation tools, you acknowledge that:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>AI-generated scripts may require editing and customization</li>
              <li>We do not guarantee that AI-generated content will result in sales, views, or engagement</li>
              <li>You are responsible for reviewing and approving all content before publishing</li>
              <li>AI outputs may occasionally contain errors, inaccuracies, or nonsensical text</li>
              <li>You must ensure generated content complies with TikTok's Community Guidelines and Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. Intellectual Property and Content Ownership</h2>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">6.1 Your Content</h3>
            <p>
              <strong>You own the scripts you generate.</strong> All AI-generated scripts, edits, and customizations you create using FlashFlow AI are your property. You are free to use, modify, publish, and monetize your generated content without restriction.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">6.2 Our Platform</h3>
            <p>
              FlashFlow AI and all associated intellectual property (including our software, logo, branding, and proprietary technology) are owned by Making Miles Matter INC. You may not copy, modify, reverse-engineer, or create derivative works based on our platform.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">6.3 License to Use Your Content</h3>
            <p>
              By using FlashFlow AI, you grant us a limited, non-exclusive, royalty-free license to store, process, and display your content solely for the purpose of providing our services. We may also use anonymized, aggregated data for analytics and improvement purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. TikTok Integration</h2>
            <p>
              FlashFlow AI integrates with TikTok via third-party APIs. By connecting your TikTok account, you authorize us to access your TikTok data (including profile information, video metrics, and TikTok Shop products) in accordance with TikTok's API Terms of Service.
            </p>
            <p className="mt-4">
              <strong>Third-Party Service:</strong> TikTok is an independent third party. We are not responsible for TikTok's policies, service interruptions, or changes to their API. If TikTok revokes API access or changes their terms, certain FlashFlow features may be affected.
            </p>
            <p className="mt-4">
              You are responsible for ensuring your use of TikTok and TikTok Shop complies with TikTok's policies and applicable laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">8. Prohibited Uses</h2>
            <p>
              You agree NOT to use FlashFlow AI for any of the following purposes:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>Violating any laws, regulations, or third-party rights</li>
              <li>Generating harmful, fraudulent, or misleading content</li>
              <li>Spamming, phishing, or engaging in deceptive practices</li>
              <li>Reselling or redistributing FlashFlow AI services without permission</li>
              <li>Reverse-engineering, scraping, or attempting to extract our proprietary algorithms</li>
              <li>Uploading malware, viruses, or malicious code</li>
              <li>Impersonating others or creating fake accounts</li>
              <li>Harassing, abusing, or threatening other users or our staff</li>
            </ul>
            <p className="mt-4">
              Violation of these restrictions may result in immediate account termination without refund.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">9. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 ml-4">
              <li>
                <strong>No Warranties:</strong> FlashFlow AI is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
              </li>
              <li>
                <strong>No Liability for Damages:</strong> We are not liable for any indirect, incidental, consequential, or punitive damages arising from your use of FlashFlow AI, including but not limited to lost profits, lost revenue, loss of data, or business interruption.
              </li>
              <li>
                <strong>Cap on Liability:</strong> Our total liability to you for any claims arising from these Terms or your use of FlashFlow AI shall not exceed the amount you paid us in the 12 months preceding the claim.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">10. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless FlashFlow AI, Making Miles Matter INC, and our officers, employees, and affiliates from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>Your use of FlashFlow AI</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights (including TikTok's Terms of Service)</li>
              <li>Content you generate, publish, or monetize using our platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">11. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time, with or without notice, for any reason, including but not limited to:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>Violation of these Terms</li>
              <li>Fraudulent or abusive behavior</li>
              <li>Non-payment of subscription fees</li>
              <li>Extended inactivity</li>
            </ul>
            <p className="mt-4">
              Upon termination, your access to FlashFlow AI will be revoked, and your data may be deleted after a reasonable grace period (typically 90 days).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">12. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time to reflect changes in our services, legal requirements, or business practices. We will notify you of material changes by posting the updated Terms on our website and updating the "Effective Date" at the top of this page.
            </p>
            <p className="mt-4">
              Your continued use of FlashFlow AI after any changes constitutes acceptance of the updated Terms. If you do not agree to the new Terms, you must stop using our services and cancel your subscription.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">13. Governing Law and Dispute Resolution</h2>
            <p>
              These Terms are governed by the laws of the State of Ohio, United States, without regard to conflict of law principles.
            </p>
            <p className="mt-4">
              Any disputes arising from these Terms or your use of FlashFlow AI shall be resolved through binding arbitration in accordance with the American Arbitration Association's rules. You waive your right to participate in class-action lawsuits or class-wide arbitration.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">14. Severability</h2>
            <p>
              If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">15. Contact Us</h2>
            <p>
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="mt-4">
              <strong>Email:</strong> <a href="mailto:brandon@flashflowai.com" className="text-teal-400 hover:underline">brandon@flashflowai.com</a><br />
              <strong>Company:</strong> FlashFlow AI / Making Miles Matter INC<br />
              <strong>Location:</strong> Findlay, Ohio
            </p>
          </section>
        </div>

        {/* Back to top */}
        <div className="mt-12 pt-8 border-t border-white/5 text-center">
          <Link href="/" className="text-teal-400 hover:underline">
            Return to Homepage
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 mt-12">
        <div className="max-w-4xl mx-auto text-center text-sm text-zinc-500">
          <p>&copy; 2026 FlashFlow AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
