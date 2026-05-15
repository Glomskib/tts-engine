'use client';

// ============================================================
// FAQList — accordion FAQ. The questions and answers are passed
// in as props from the server component so they ALSO render in
// the initial SSR HTML (great for SEO + the FAQPage schema).
// The accordion just toggles open/closed.
// ============================================================

import { useState } from 'react';

export type FAQItem = { q: string; a: string };

export default function FAQList({ items }: { items: FAQItem[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="border-b border-white/5 pb-4">
          <button
            type="button"
            onClick={() => setOpenFaq(openFaq === i ? null : i)}
            className="w-full flex items-center justify-between text-left py-2"
            aria-expanded={openFaq === i}
          >
            <span className="font-medium text-zinc-200">{item.q}</span>
            <svg
              className={`w-5 h-5 text-zinc-500 shrink-0 ml-4 transition-transform ${
                openFaq === i ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {/* Render the answer ALWAYS in DOM, hidden via CSS, so bots see it.
              Previously this was conditional on openFaq === i which meant
              answers were absent from SSR HTML — wasted SEO content. */}
          <p
            className={`mt-2 text-zinc-500 leading-relaxed ${openFaq === i ? 'block' : 'hidden'}`}
          >
            {item.a}
          </p>
        </div>
      ))}
    </div>
  );
}
