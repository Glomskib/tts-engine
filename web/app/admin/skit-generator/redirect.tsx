'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SkitGeneratorRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Preserve any query params when redirecting
    const params = searchParams.toString();
    const url = params ? `/admin/content-studio?${params}` : '/admin/content-studio';
    router.replace(url);
  }, [router, searchParams]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '50vh',
      color: '#a1a1aa',
    }}>
      Redirecting to Content Studio...
    </div>
  );
}
