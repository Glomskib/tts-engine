'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { BRAND } from '@/lib/brand';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="font-semibold text-zinc-100">{BRAND.name}</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
        <p className="text-zinc-500 mb-12">Last updated: February 1, 2026</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. Introduction</h2>
            <p>
              FlashFlow AI (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) respects your privacy and is committed to protecting your
              personal data. This privacy policy explains how we collect, use, and safeguard your information
              when you use our AI-powered content generation platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-zinc-200 mt-6 mb-3">Account Information</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Email address</li>
              <li>Name (if provided)</li>
              <li>Password (encrypted)</li>
              <li>Billing information (processed by Stripe)</li>
            </ul>

            <h3 className="text-lg font-medium text-zinc-200 mt-6 mb-3">Content You Provide</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Product information and descriptions</li>
              <li>Brand details and guidelines</li>
              <li>Audience personas and preferences</li>
              <li>Scripts and generated content you save</li>
            </ul>

            <h3 className="text-lg font-medium text-zinc-200 mt-6 mb-3">Usage Data</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Features used and actions taken</li>
              <li>Generation history and preferences</li>
              <li>Device and browser information</li>
              <li>IP address and approximate location</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong className="text-white">Provide the Service:</strong> Process your inputs to generate AI content</li>
              <li><strong className="text-white">Improve the Service:</strong> Analyze usage patterns to enhance features</li>
              <li><strong className="text-white">Communicate:</strong> Send service updates, security alerts, and support messages</li>
              <li><strong className="text-white">Process Payments:</strong> Handle subscriptions and billing</li>
              <li><strong className="text-white">Ensure Security:</strong> Detect and prevent fraud or abuse</li>
              <li><strong className="text-white">Legal Compliance:</strong> Meet legal obligations and respond to legal requests</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Third-Party Services</h2>
            <p className="mb-4">We use the following third-party services to operate FlashFlow AI:</p>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-zinc-900/50 border border-white/5">
                <h4 className="font-medium text-white mb-2">Supabase</h4>
                <p className="text-sm">Database hosting and authentication. Your data is stored securely with encryption at rest.</p>
              </div>

              <div className="p-4 rounded-lg bg-zinc-900/50 border border-white/5">
                <h4 className="font-medium text-white mb-2">Stripe</h4>
                <p className="text-sm">Payment processing. We never store your full credit card details; Stripe handles all payment data securely.</p>
              </div>

              <div className="p-4 rounded-lg bg-zinc-900/50 border border-white/5">
                <h4 className="font-medium text-white mb-2">Anthropic (Claude AI)</h4>
                <p className="text-sm">AI content generation. Your prompts and inputs are processed to generate content but are not used to train models.</p>
              </div>

              <div className="p-4 rounded-lg bg-zinc-900/50 border border-white/5">
                <h4 className="font-medium text-white mb-2">Replicate</h4>
                <p className="text-sm">AI image generation for B-Roll. Image prompts are processed to generate visuals.</p>
              </div>

              <div className="p-4 rounded-lg bg-zinc-900/50 border border-white/5">
                <h4 className="font-medium text-white mb-2">Vercel</h4>
                <p className="text-sm">Application hosting and deployment. Standard server logs may be collected for debugging.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. Cookies and Tracking</h2>
            <p className="mb-3">We use cookies and similar technologies for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong className="text-white">Essential Cookies:</strong> Authentication and session management</li>
              <li><strong className="text-white">Preference Cookies:</strong> Remembering your settings and preferences</li>
              <li><strong className="text-white">Analytics Cookies:</strong> Understanding how users interact with the Service</li>
            </ul>
            <p className="mt-4">
              You can control cookie preferences through your browser settings. Disabling essential cookies
              may affect your ability to use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. Data Retention</h2>
            <p className="mb-3">We retain your data as follows:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong className="text-white">Account Data:</strong> Until you delete your account</li>
              <li><strong className="text-white">Generated Content:</strong> Until you delete it or close your account</li>
              <li><strong className="text-white">Usage Logs:</strong> Up to 90 days for operational purposes</li>
              <li><strong className="text-white">Billing Records:</strong> As required by tax and accounting laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. Your Rights</h2>
            <p className="mb-3">Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong className="text-white">Access:</strong> Request a copy of your personal data</li>
              <li><strong className="text-white">Rectification:</strong> Correct inaccurate data</li>
              <li><strong className="text-white">Deletion:</strong> Request deletion of your data</li>
              <li><strong className="text-white">Portability:</strong> Export your data in a machine-readable format</li>
              <li><strong className="text-white">Opt-out:</strong> Unsubscribe from marketing communications</li>
            </ul>
            <p className="mt-4">
              To exercise these rights, contact us at{' '}
              <a href="mailto:privacy@flashflow.ai" className="text-blue-400 hover:underline">
                privacy@flashflow.ai
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">8. Data Security</h2>
            <p>
              We implement industry-standard security measures including encryption in transit (TLS),
              encryption at rest, secure authentication, and regular security audits. However, no method
              of transmission over the Internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">9. International Transfers</h2>
            <p>
              Your data may be processed in the United States or other countries where our service
              providers operate. We ensure appropriate safeguards are in place for international transfers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">10. Children&apos;s Privacy</h2>
            <p>
              FlashFlow AI is not intended for users under 16 years of age. We do not knowingly collect
              personal information from children. If you believe we have collected data from a child,
              please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">11. Changes to This Policy</h2>
            <p>
              We may update this privacy policy periodically. We will notify you of material changes
              via email or through the Service. The &quot;Last updated&quot; date at the top indicates when
              the policy was last revised.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">12. Contact Us</h2>
            <p>
              For privacy-related questions or concerns, please contact us at:{' '}
              <a href="mailto:privacy@flashflow.ai" className="text-blue-400 hover:underline">
                privacy@flashflow.ai
              </a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-zinc-500">
          <span>&copy; {new Date().getFullYear()} {BRAND.name}</span>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
            <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
