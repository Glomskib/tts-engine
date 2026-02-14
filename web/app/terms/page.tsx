import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | FlashFlow AI',
  description: 'Terms and conditions for using FlashFlow AI services.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <article className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-5xl font-bold mb-4">Terms of Service</h1>
        <p className="text-gray-400 mb-12">Last updated: February 14, 2026</p>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-3xl font-bold mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              By accessing and using FlashFlow AI ("Service"), you accept and agree to be bound by the terms of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">2. Use License</h2>
            <p className="text-gray-300 leading-relaxed">
              Permission is granted to temporarily download one copy of the materials (information or software) on FlashFlow AI for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li>Modifying or copying the materials</li>
              <li>Using the materials for any commercial purpose or for any public display</li>
              <li>Attempting to decompile or reverse engineer any software contained on the Service</li>
              <li>Removing any copyright or other proprietary notations from the materials</li>
              <li>Transferring the materials to another person or "mirroring" on any other server</li>
              <li>Using the Service or its content for any illegal or unauthorized purpose</li>
              <li>Harassing, abusing, or threatening other users</li>
              <li>Impersonating another person or entity</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">3. Disclaimer</h2>
            <p className="text-gray-300 leading-relaxed">
              The materials on FlashFlow AI are provided on an 'as is' basis. FlashFlow AI makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              Further, FlashFlow AI does not warrant or make any representations concerning the accuracy, likely results, or reliability of the use of the materials on its internet web site or otherwise relating to such materials or on any sites linked to this site.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">4. Limitations</h2>
            <p className="text-gray-300 leading-relaxed">
              In no event shall FlashFlow AI or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption,) arising out of the use or inability to use the materials on FlashFlow AI, even if FlashFlow AI or a FlashFlow AI authorized representative has been notified orally or in writing of the possibility of such damage.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">5. Accuracy of Materials</h2>
            <p className="text-gray-300 leading-relaxed">
              The materials appearing on FlashFlow AI could include technical, typographical, or photographic errors. FlashFlow AI does not warrant that any of the materials on its website are accurate, complete, or current. FlashFlow AI may make changes to the materials contained on its website at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">6. Materials & Content</h2>
            <p className="text-gray-300 leading-relaxed">
              FlashFlow AI has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by FlashFlow AI of the site. Use of any such linked website is at the user's own risk.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              If you believe that a link on FlashFlow AI directs you to infringing material, please notify us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">7. Modifications</h2>
            <p className="text-gray-300 leading-relaxed">
              FlashFlow AI may revise these terms of service for its website at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of service.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">8. Governing Law</h2>
            <p className="text-gray-300 leading-relaxed">
              These terms and conditions are governed by and construed in accordance with the laws of California, and you irrevocably submit to the exclusive jurisdiction of the courts located in California.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">9. User Accounts</h2>
            <p className="text-gray-300 leading-relaxed">
              If you create an account on FlashFlow AI, you are responsible for maintaining the confidentiality of your login credentials and password. You agree to accept responsibility for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              You may not use another person's account without permission. You may not use the Service for any illegal or unauthorized purpose.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">10. Payment & Billing</h2>
            <p className="text-gray-300 leading-relaxed">
              By purchasing a paid plan, you authorize FlashFlow AI to charge your payment method for the plan price and any applicable taxes. Billing occurs at the beginning of each billing cycle (monthly or yearly, as selected).
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>Refunds:</strong> Paid plans are non-refundable. Upon cancellation, you retain access through the end of your billing period.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>Cancellation:</strong> You may cancel your subscription anytime from your account settings. Cancellation takes effect at the end of your current billing period.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">11. Intellectual Property Rights</h2>
            <p className="text-gray-300 leading-relaxed">
              You retain ownership of scripts you generate using FlashFlow AI. However, you grant FlashFlow AI a limited license to use, analyze, and improve the Service based on your usage.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              All FlashFlow AI trademarks, logos, and brand elements are our property. You may not use them without permission.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              AI-generated content is provided "as-is." FlashFlow AI does not guarantee originality. You are responsible for ensuring content does not infringe third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">12. Acceptable Use Policy</h2>
            <p className="text-gray-300 leading-relaxed">
              You agree not to use FlashFlow AI for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li>Illegal activities or content (hate speech, violence, exploitation)</li>
              <li>Harassment, cyberbullying, or defamation</li>
              <li>Spam, phishing, or malware distribution</li>
              <li>Unauthorized access or hacking attempts</li>
              <li>Privacy violations or data theft</li>
              <li>Infringement of intellectual property rights</li>
              <li>Circumventing security or usage limits</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              We reserve the right to suspend or terminate your account for violations of this policy.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">13. Free vs. Paid Tiers</h2>
            <p className="text-gray-300 leading-relaxed">
              <strong>Free Tier:</strong> 5 transcriptions per day, 10 scripts per month, basic features.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>Paid Tiers:</strong> Vary by plan (Creator Lite, Creator Pro, Brand, Agency). See pricing page for details.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              We reserve the right to modify plan limits, pricing, and features with 30 days notice.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">14. Limitation of Liability</h2>
            <p className="text-gray-300 leading-relaxed">
              In no case shall FlashFlow AI, its directors, officers, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">15. Termination</h2>
            <p className="text-gray-300 leading-relaxed">
              We may terminate your account at any time for violations of these Terms, nonpayment, or at our sole discretion. Upon termination, your access to the Service ceases immediately. Certain provisions (intellectual property, liability limitations) survive termination.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">16. Support & Service Availability</h2>
            <p className="text-gray-300 leading-relaxed">
              We aim to provide 99.5% uptime. However, we do not guarantee uninterrupted service. Scheduled maintenance may cause temporary outages.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              Support is available at support@flashflowai.com during business hours (Monday-Friday, 9 AM - 5 PM PT).
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">17. Contact</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have questions about these Terms, contact us at:
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
