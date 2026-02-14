import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | FlashFlow AI',
  description: 'How FlashFlow AI collects, uses, and protects your personal data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <article className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-5xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-gray-400 mb-12">Last updated: February 14, 2026</p>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-3xl font-bold mb-4">1. Introduction</h2>
            <p className="text-gray-300 leading-relaxed">
              FlashFlow AI ("we," "us," "our," or "Company") operates the website flashflowai.com and related services (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              Please read this Privacy Policy carefully. If you do not agree with our practices, please do not use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">2. Information We Collect</h2>
            <p className="text-gray-300 leading-relaxed">
              <strong>Information You Provide Directly:</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li>Email address, name, password (account creation)</li>
              <li>Product information you input for script generation</li>
              <li>Payment information (processed by Stripe, not stored by us)</li>
              <li>Support messages and feedback</li>
              <li>Profile information and preferences</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>Information Collected Automatically:</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li>IP address, browser type, device information</li>
              <li>Pages visited, time spent, referring website</li>
              <li>Cookies and similar tracking technologies</li>
              <li>Usage analytics (scripts generated, transcriptions used)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-300 leading-relaxed">
              We use collected information for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li>Providing and improving the Service</li>
              <li>Processing transactions and sending invoices</li>
              <li>Sending service announcements and updates</li>
              <li>Responding to your inquiries and support requests</li>
              <li>Analyzing usage patterns to improve features</li>
              <li>Preventing fraud and ensuring security</li>
              <li>Complying with legal obligations</li>
              <li>Marketing (only with your consent)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">4. Data Sharing & Disclosure</h2>
            <p className="text-gray-300 leading-relaxed">
              We do not sell your personal information. We may share data with:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li><strong>Service Providers:</strong> Stripe (payments), Supabase (hosting), SendGrid (email)</li>
              <li><strong>Legal Requirements:</strong> Law enforcement if required by law</li>
              <li><strong>Business Transfers:</strong> In case of merger, acquisition, or bankruptcy</li>
              <li><strong>With Your Consent:</strong> Other third parties as you authorize</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">5. Data Security</h2>
            <p className="text-gray-300 leading-relaxed">
              We implement industry-standard security measures including:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li>SSL/TLS encryption for all data in transit</li>
              <li>Password hashing using bcrypt</li>
              <li>Row-level security (RLS) in database</li>
              <li>Regular security audits and updates</li>
              <li>Automatic daily backups</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              However, no security system is impenetrable. We cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">6. Cookies & Tracking</h2>
            <p className="text-gray-300 leading-relaxed">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li>Remember your login session</li>
              <li>Track usage for analytics (Google Analytics)</li>
              <li>Measure ad campaign performance (Meta Pixel, TikTok Pixel)</li>
              <li>Personalize your experience</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              You can disable cookies in your browser settings, though this may affect Service functionality.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">7. Your Rights</h2>
            <p className="text-gray-300 leading-relaxed">
              You have the right to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li><strong>Access:</strong> Request a copy of your data</li>
              <li><strong>Correction:</strong> Update or correct your information</li>
              <li><strong>Deletion:</strong> Request we delete your account and data</li>
              <li><strong>Opt-Out:</strong> Unsubscribe from marketing emails</li>
              <li><strong>Portability:</strong> Export your data in standard format</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              To exercise these rights, contact us at support@flashflowai.com.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">8. Retention</h2>
            <p className="text-gray-300 leading-relaxed">
              We retain personal data as long as necessary to provide the Service and comply with legal obligations. After account deletion, we retain anonymized usage data for 90 days before purging.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">9. GDPR & CCPA Compliance</h2>
            <p className="text-gray-300 leading-relaxed">
              <strong>For EU users (GDPR):</strong> You have rights to access, correct, delete, and port your data. We process data based on consent and legitimate business interests.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>For California users (CCPA):</strong> You have rights to know, delete, and opt-out of sale. FlashFlow does not sell personal information.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">10. Third-Party Links</h2>
            <p className="text-gray-300 leading-relaxed">
              Our Service may contain links to third-party websites. We are not responsible for their privacy practices. Please review their privacy policies before sharing information.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">11. Policy Changes</h2>
            <p className="text-gray-300 leading-relaxed">
              We may update this Privacy Policy periodically. We will notify you of significant changes via email or prominent notice on the Service. Your continued use constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">12. Contact Us</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have questions about this Privacy Policy, contact us at:
            </p>
            <div className="mt-4 text-gray-300">
              <p><strong>FlashFlow AI</strong></p>
              <p>Email: support@flashflowai.com</p>
              <p>Website: https://flashflowai.com</p>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
