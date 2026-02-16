'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PersonasRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/audience?tab=creator');
  }, [router]);
  return null;
}
