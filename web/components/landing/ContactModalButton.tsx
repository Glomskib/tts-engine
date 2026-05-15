'use client';

// ============================================================
// ContactModalButton — encapsulates the "Contact Us" / "Contact"
// trigger and the VideoServiceContact modal so the page itself
// doesn't need state for it.
// ============================================================

import { useState, type ReactNode } from 'react';
import { VideoServiceContact } from '@/components/VideoServiceContact';

export default function ContactModalButton({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <VideoServiceContact isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
