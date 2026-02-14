import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Getting Started with FlashFlow AI — Your First Script in 60 Seconds',
  description:
    'Step-by-step guide to generating your first TikTok script. Add a product, pick a persona, generate, save. No experience needed.',
  openGraph: {
    title: 'Getting Started with FlashFlow AI',
    description: 'Your first AI script in 60 seconds. Beginner-friendly guide.',
    type: 'article',
    images: [{ url: '/FFAI.png', width: 512, height: 512 }],
  },
};

export default function GettingStartedArticle() {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Getting Started with FlashFlow AI — Your First Script in 60 Seconds',
    description:
      'Step-by-step guide to generating your first TikTok script. Add a product, pick a persona, generate, save. No experience needed.',
    image: 'https://flashflowai.com/FFAI.png',
    datePublished: '2026-02-14',
    dateModified: '2026-02-14',
    author: {
      '@type': 'Organization',
      name: 'FlashFlow AI',
      url: 'https://flashflowai.com',
    },
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <article className="max-w-3xl mx-auto px-4 py-16">
        <div className="mb-12">
          <div className="text-sm text-teal-400 mb-4">Getting Started</div>
          <h1 className="text-5xl font-bold mb-4">
            Getting Started with FlashFlow AI — Your First Script in 60 Seconds
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            Never written a TikTok script before? No problem. In the next 60 seconds, you'll have your first AI-generated script ready to film. Follow along.
          </p>
          <div className="flex gap-4 text-sm text-gray-400">
            <span>Feb 14, 2026</span>
            <span>•</span>
            <span>5 min read</span>
          </div>
        </div>

        <div className="mb-12 p-6 bg-gray-800/30 rounded-lg border border-gray-700">
          <h3 className="font-bold mb-4">What You'll Do</h3>
          <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
            <li>Sign up (free)</li>
            <li>Add a product</li>
            <li>Choose a character/persona</li>
            <li>Generate your script</li>
            <li>Save and review</li>
          </ol>
          <p className="text-xs text-gray-400 mt-4">Total time: 60 seconds (not including reading the explanation)</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-3xl font-bold mb-4">Step 1: Sign Up (15 seconds)</h2>
            <p className="text-gray-300 leading-relaxed">
              Go to <Link href="/signup" className="text-teal-400 hover:text-teal-300">FlashFlow's signup page</Link>. Enter your email and create a password. That's it. No credit card required for the free tier.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>Screenshot:</strong> Sign-up form with email field, password field, and "Create Account" button.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">Step 2: Add Your First Product (10 seconds)</h2>
            <p className="text-gray-300 leading-relaxed">
              After signing up, you'll see the dashboard. Click "Add Product" (big blue button, top right). A form appears:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li><strong>Product Name:</strong> e.g., "Creatine Powder", "Water Bottle", "Sleep Supplement"</li>
              <li><strong>Category:</strong> Pick one (supplements, home, gadgets, fashion, etc.)</li>
              <li><strong>Price:</strong> $0-$100 range (for targeting)</li>
              <li><strong>Key Benefit:</strong> 1-2 words (e.g., "Better sleep", "More energy", "Cleaner home")</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              Click "Save Product". Done.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>Screenshot:</strong> Product form with fields filled in. Product card showing in the library below.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">Step 3: Choose Your Persona (10 seconds)</h2>
            <p className="text-gray-300 leading-relaxed">
              Click "Generate Script" (next to your product). A modal opens asking: "How do you want to present this?"
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              Pick one:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li><strong>The Skeptic:</strong> "I was skeptical too, but then..." (relatable, honest)</li>
              <li><strong>The Educator:</strong> "Here's why this works..." (informative, expert)</li>
              <li><strong>The Entertainer:</strong> "This is insanely fun..." (funny, high-energy)</li>
              <li><strong>The Aspirational:</strong> "This is the lifestyle hack you need..." (aspirational, cool)</li>
              <li><strong>The Relatable:</strong> "You know that problem when..." (relatable, empathetic)</li>
              <li><strong>The Performance:</strong> "Watch what happens..." (dramatic, surprising)</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              Start with "The Skeptic" if you're unsure — it works for most products.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>Screenshot:</strong> Persona selection screen with 6 cards (one per persona), each with a brief description and icon.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">Step 4: Generate Your Script (10 seconds)</h2>
            <p className="text-gray-300 leading-relaxed">
              Click your persona. FlashFlow generates 3 script variations in real-time. You'll see:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li><strong>Hook:</strong> The first 3 seconds that stops the scroll</li>
              <li><strong>Body:</strong> 10-15 second explanation of the benefit</li>
              <li><strong>Call-to-Action:</strong> How to buy or learn more</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              Each script is optimized for a 15-30 second TikTok video.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>Screenshot:</strong> Three script cards displayed side-by-side. Each shows hook, body, CTA. "Save" button visible on each.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">Step 5: Save Your Favorite (5 seconds)</h2>
            <p className="text-gray-300 leading-relaxed">
              Click "Save" on your favorite script (or save all 3). The script is now in your library under "Saved Scripts".
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              From here you can:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li><strong>Copy & Film:</strong> Read the script to a camera</li>
              <li><strong>Generate Video:</strong> (Premium) AI avatar performs the script</li>
              <li><strong>Regenerate:</strong> Get different variations</li>
              <li><strong>Share:</strong> Send to a team member or VA</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>Screenshot:</strong> Saved script in the library, with copy/share/generate buttons visible.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">That's It. You're Done.</h2>
            <p className="text-gray-300 leading-relaxed">
              Seriously. In less than a minute, you went from "I don't know how to write a script" to "I have 3 ready-to-film scripts."
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              Now what?
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li><strong>Film it yourself:</strong> Read the script to your phone camera</li>
              <li><strong>Hire a VA:</strong> Send the script to a freelancer to film</li>
              <li><strong>Use AI avatars (Premium):</strong> Let an AI character perform it</li>
              <li><strong>Iterate:</strong> Generate 3 new scripts with a different persona</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">Pro Tips for Beginners</h2>
            <ul className="space-y-4 text-gray-300">
              <li>
                <strong>🎯 Test Multiple Personas:</strong> Generate scripts with all 6 personas for the same product. See which one feels most natural to film.
              </li>
              <li>
                <strong>🎯 Regenerate If You Don't Like It:</strong> Click "Regenerate" to get completely different scripts. Keep clicking until you find one you love.
              </li>
              <li>
                <strong>🎯 Read It Out Loud:</strong> Before filming, read the script aloud. Does it sound natural? If not, edit it or regenerate.
              </li>
              <li>
                <strong>🎯 Add Your Own Personality:</strong> The script is a skeleton. Improvise. Add pauses. Add reactions. Make it feel like YOU.
              </li>
              <li>
                <strong>🎯 Track What Works:</strong> Film 3 versions with different scripts. Post them. See which hook gets the most engagement. Double down on the winner.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-bold mb-4">What's Next?</h2>
            <p className="text-gray-300 leading-relaxed">
              Once you've generated your first script, you can:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 mt-4">
              <li><strong>Upgrade your plan</strong> for unlimited scripts and AI video generation</li>
              <li><strong>Analyze competitor videos</strong> with our free transcriber to find winning hooks</li>
              <li><strong>Join a challenge</strong> (like Forest Leaf) to earn bonuses for posting content</li>
              <li><strong>Build a winners library</strong> of scripts that convert</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              But first: Get your 60-second script. Film it. Post it. See what happens.
            </p>
          </section>
        </div>

        {/* CTA */}
        <div className="mt-16 p-8 bg-teal-500/10 border border-teal-500/20 rounded-lg">
          <h3 className="text-2xl font-bold mb-4">Ready to Generate Your First Script?</h3>
          <p className="text-gray-300 mb-6">
            Join thousands of creators using FlashFlow to generate TikTok scripts in seconds. Free to start.
          </p>
          <Link
            href="/signup"
            className="inline-block px-6 py-3 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition"
          >
            Get Started Free
          </Link>
        </div>

        {/* Back to Blog */}
        <div className="mt-12 text-center">
          <Link href="/blog" className="text-teal-400 hover:text-teal-300">
            ← Back to Blog
          </Link>
        </div>
      </article>
    </div>
  );
}
