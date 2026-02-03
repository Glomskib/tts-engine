# Code Audit Report
Date: 2026-02-03

## Summary
- **console.log statements**: 147 found
- **TODO/FIXME comments**: 8 found
- **Hardcoded localhost URLs**: 20 found (mostly in code comments/examples)
- **`any` type usage**: 29 found
- **Missing index.ts files**: 5 lib directories

---

## TODO/FIXME Items Found

| File | Line | Content |
|------|------|---------|
| `app/api/ai/chat/route.ts` | - | `orgId: null, // TODO: Add org context when available` |
| `app/api/ai/hook-feedback/route.ts` | - | `created_by: "admin", // TODO: get from auth` |
| `app/api/ai/rate-skit/route.ts` | - | `org_id: null, // TODO: Add org support when available` |
| `app/api/video-service/inquiry/route.ts` | - | `// TODO: Send notification email to sales team` |
| `app/api/video-service/inquiry/route.ts` | - | `// TODO: Send confirmation email to user` |
| `lib/createVideoFromProduct.ts` | - | `// TODO: If shouldNotifyRecorder, trigger pipeline notification` |
| `lib/createVideoFromProduct.ts` | - | `// TODO: Trigger AI script generation job` |
| `lib/errorTracking.ts` | - | `// TODO: Replace with actual error tracking service` |

**Recommendation**: These TODOs represent future features, not bugs. Leave as-is for future implementation.

---

## Console.log Statements (High-Priority Removals)

### Files with excessive logging (should clean up):
- `app/api/ai/draft-video-brief/route.ts` - 20+ logs (AI debugging)
- `app/api/ai/generate-image/route.ts` - 10+ logs (image generation debugging)
- `app/api/ai/generate-skit/route.ts` - 5+ logs (script generation debugging)
- `app/api/ai/analyze-winner/route.ts` - 5+ logs

### Acceptable logging (keep):
- `app/api/admin/backfill-video-codes/route.ts` - Admin operation logs with correlation IDs
- Error-related logging in catch blocks

---

## Hardcoded localhost URLs

Most localhost references are in:
1. **Code comments/examples** (PowerShell test snippets) - Safe to keep
2. **Fallback URLs** with proper `process.env` checks - Acceptable pattern

Files with fallback localhost (acceptable):
- `app/api/checkout/route.ts` - Uses `process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"`
- `app/api/credits/purchase/route.ts` - Uses `process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"`
- `app/api/subscriptions/portal/route.ts` - Fallback for local development

**Recommendation**: These are safe fallbacks for development. No changes needed.

---

## `any` Type Usage

### High Priority (should fix):
| File | Usage |
|------|-------|
| `app/api/scripts/generate/route.ts` | `generatedScript: any` |
| `app/api/variants/generate/route.ts` | `createdVariants: any[]` |
| `app/api/variants/scale/route.ts` | Multiple function parameters typed as `any` |
| `lib/email.ts` | `supabaseAdmin: any` (3 occurrences) |

### Lower Priority (complex types):
- `app/accounts/[id]/pipeline/page.tsx` - Array iterations
- `lib/performance-schema.ts` - Database query results
- `components/MobileNav.tsx` - Prop spreading

---

## Missing Index Files

The following lib directories need index.ts exports:
1. `lib/ai/`
2. `lib/analytics/`
3. `lib/client/`
4. `lib/http/`
5. `lib/supabase/`

---

## Recommendations

1. **Console.log cleanup**: Remove debug logs from AI routes, keep correlation ID logs
2. **Type safety**: Create proper interfaces for variant/script generation
3. **Index files**: Add barrel exports to improve import organization
4. **TODO items**: Leave as documentation for future features
5. **Localhost URLs**: Current fallback pattern is acceptable

---

## Next Steps
- [ ] Remove unnecessary console.log statements
- [ ] Create index.ts files for lib modules
- [ ] Add JSDoc to major components
- [ ] Improve type safety where feasible
