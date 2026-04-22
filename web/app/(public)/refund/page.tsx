import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy | FlashFlow AI',
  description: '30-day money-back guarantee on FlashFlow AI subscriptions.',
};

export default function RefundPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl sm:text-5xl font-bold mb-4">Refund Policy</h1>
      <p className="text-zinc-500 mb-12">Effective date: April 15, 2026</p>

      <div className="prose prose-invert max-w-none space-y-10 text-zinc-300">
        <section>
          <h2 className="text-2xl font-bold text-white mb-3">30-Day Money-Back Guarantee</h2>
          <p className="leading-relaxed">
            We stand behind FlashFlow AI. If you&rsquo;re not satisfied with your subscription
            for any reason, you may request a full refund within <strong>30 days</strong> of
            your initial purchase or of any monthly/annual renewal charge. No questions asked.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-3">How to Request a Refund</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>
              Email{' '}
              <a href="mailto:hello@flashflowai.com" className="text-teal-400 hover:underline">
                hello@flashflowai.com
              </a>{' '}
              with your account email and the Stripe receipt or order number.
            </li>
            <li>We respond within 24 hours on business days.</li>
            <li>Approved refunds are returned to your original payment method within 5&ndash;10 business days.</li>
            <li>Your account is downgraded to the free plan at the end of your current billing period.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-3">What Is Not Refundable</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Charges older than 30 days from the request date.</li>
            <li>One-time add-on credit purchases that have been fully consumed.</li>
            <li>Accounts terminated for violations of our{' '}
              <a href="/terms" className="text-teal-400 hover:underline">Terms of Service</a>.
            </li>
            <li>Pay-as-you-go usage charges (e.g., per-render fees) once rendering has completed.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-3">Partial Refunds</h2>
          <p className="leading-relaxed">
            Annual subscribers who cancel mid-cycle may request a pro-rated refund for the
            unused portion of their term, less any usage that exceeded the equivalent monthly
            plan&rsquo;s included quota.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-3">Disputes &amp; Chargebacks</h2>
          <p className="leading-relaxed">
            Please contact us before initiating a chargeback &mdash; we resolve nearly all
            disputes within 24 hours. Chargebacks filed without a prior refund request may
            result in account suspension while we investigate.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-3">Contact</h2>
          <p className="leading-relaxed">
            Questions about this policy?{' '}
            <a href="mailto:hello@flashflowai.com" className="text-teal-400 hover:underline">
              hello@flashflowai.com
            </a>
          </p>
        </section>
      </div>
    </article>
  );
}
