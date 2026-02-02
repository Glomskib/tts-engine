'use client';

interface SkipLinkProps {
  href?: string;
  children?: React.ReactNode;
}

/**
 * Skip link for keyboard navigation - allows users to skip to main content
 * Only visible when focused (keyboard users)
 */
export function SkipLink({ href = '#main-content', children = 'Skip to main content' }: SkipLinkProps) {
  return (
    <a
      href={href}
      className="
        sr-only focus:not-sr-only
        focus:fixed focus:top-4 focus:left-4 focus:z-[100]
        focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white
        focus:rounded-lg focus:shadow-lg focus:outline-none
        focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-zinc-950
      "
    >
      {children}
    </a>
  );
}

/**
 * Main content wrapper with id for skip link target
 */
export function MainContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <main id="main-content" tabIndex={-1} className={`outline-none ${className}`}>
      {children}
    </main>
  );
}
