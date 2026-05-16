// ============================================================
// BreadcrumbSchema — emits a Schema.org BreadcrumbList as JSON-LD.
//
// Google + Bing render the breadcrumb under each search result and
// give more SERP real estate to pages that include it. We don't
// render a visible breadcrumb UI — this is structured data only.
//
// Use from a server component (or layout) by passing the trail:
//   <BreadcrumbSchema trail={[
//     { name: 'Home', url: 'https://flashflowai.com/' },
//     { name: 'Blog', url: 'https://flashflowai.com/blog' },
//   ]} />
// ============================================================

type Crumb = { name: string; url: string };

export function BreadcrumbSchema({ trail }: { trail: Crumb[] }) {
  if (!trail || trail.length === 0) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
