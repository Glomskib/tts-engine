import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const url = process.env.COBALT_API_URL || null;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || null;
  const deploymentTime = process.env.VERCEL_GIT_COMMIT_SHA
    ? process.env.VERCEL_DEPLOYMENT_CREATED_AT || null
    : null;

  let reachable: boolean | null = null;
  let cobaltVersion: string | null = null;

  if (url) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      clearTimeout(timer);
      reachable = res.ok;
      if (res.ok) {
        const body = (await res.json()) as { cobalt?: { version?: string } };
        cobaltVersion = body?.cobalt?.version ?? null;
      }
    } catch {
      reachable = false;
    }
  }

  return NextResponse.json(
    {
      url,
      reachable,
      cobalt_version: cobaltVersion,
      deployment_id: deploymentId,
      deployment_created_at: deploymentTime,
      checked_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
