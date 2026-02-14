'use client';

import { useCredits } from '@/hooks/useCredits';
import TranscriberCore from '@/components/TranscriberCore';

export default function AdminTranscribePage() {
  const { subscription } = useCredits();

  return <TranscriberCore isPortal={true} isLoggedIn={true} planId={subscription?.planId} />;
}
