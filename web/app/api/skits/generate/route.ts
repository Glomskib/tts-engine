/**
 * POST /api/skits/generate
 * Proxy to /api/ai/generate-skit for backward compatibility with Content Studio Quick Generate
 */

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const baseUrl = new URL(request.url).origin;

  const body = await request.text();

  const response = await fetch(`${baseUrl}/api/ai/generate-skit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") || "",
      authorization: request.headers.get("authorization") || "",
      "x-correlation-id": request.headers.get("x-correlation-id") || "",
    },
    body,
  });

  const data = await response.text();
  return new Response(data, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "x-correlation-id": response.headers.get("x-correlation-id") || "",
    },
  });
}
