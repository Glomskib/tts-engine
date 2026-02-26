'use client';

import { ReactNode } from 'react';
import CCSubnav from './CCSubnav';

interface CommandCenterShellProps {
  children: ReactNode;
}

export default function CommandCenterShell({ children }: CommandCenterShellProps) {
  return (
    <div className="space-y-6 max-w-[1440px]">
      <CCSubnav />
      {children}
    </div>
  );
}
