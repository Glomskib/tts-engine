'use client';

import { useCredits } from '@/hooks/useCredits';
import TranscriberCore from '@/components/TranscriberCore';

export default function AdminYouTubeTranscribePage() {
  const { subscription } = useCredits();

  return <TranscriberCore isPortal={true} isLoggedIn={true} planId={subscription?.planId} platform="youtube" />;
}
