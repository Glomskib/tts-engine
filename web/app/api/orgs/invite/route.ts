/**
 * /api/orgs/invite — invite a teammate by email.
 *
 * Inserts a row in `organization_invites` with a unique token, then sends the
 * invite email via Resend (if RESEND_API_KEY is configured). Either way the
 * invite URL is returned in the response so the caller can fall back to
 * manual sharing.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOrgRole, InsufficientOrgRoleError, NotAuthenticatedError } from '@/lib/auth/current-org';
import { sendEmail } from '@/lib/email/resend';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireOrgRole('admin');
  } catch (err) {
    if (err instanceof NotAuthenticatedError) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof InsufficientOrgRoleError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'unknown' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body?.role === 'string' ? body.role : 'editor';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid email' }, { status: 400 });
  }
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({ ok: false, error: 'invalid role' }, { status: 400 });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 14 * 86400 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('organization_invites')
    .upsert(
      {
        org_id: ctx.orgId,
        email,
        role,
        token,
        expires_at: expires,
      },
      { onConflict: 'org_id,email' },
    )
    .select('id, token')
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || 'insert failed' }, { status: 500 });
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com'}/invite/${data.token}`;

  // Enrich with the org name + inviter email for a nicer body (best-effort,
  // not a hard requirement — defaults if the lookups fail).
  let orgName = 'a FlashFlow team';
  let inviterEmail = 'A teammate';
  try {
    const supabase = await createClient();
    const [{ data: org }, { data: { user } }] = await Promise.all([
      supabaseAdmin.from('organizations').select('name').eq('id', ctx.orgId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (org?.name) orgName = org.name;
    if (user?.email) inviterEmail = user.email;
  } catch {
    /* fall back to defaults */
  }

  // Send the invite email via Resend (no-ops gracefully when key absent).
  // Wired during the 2026-05-27 audit — previously the route returned the URL
  // and relied on the caller to share it manually, which never happened.
  const emailResult = await sendEmail({
    to: email,
    subject: `You've been invited to FlashFlow`,
    html: inviteEmailHtml({ inviteUrl, role, orgName, inviterEmail }),
    tags: [
      { name: 'type', value: 'org_invite' },
      { name: 'org_id', value: ctx.orgId || 'unknown' },
    ],
  });

  return NextResponse.json({
    ok: true,
    inviteUrl,
    emailSent: emailResult.success,
    emailError: emailResult.success ? undefined : 'Email not sent — share the URL manually',
  });
}

function inviteEmailHtml({ inviteUrl, role, orgName, inviterEmail }: {
  inviteUrl: string;
  role: string;
  orgName: string;
  inviterEmail: string;
}): string {
  const safeOrg = String(orgName).replace(/</g, '&lt;');
  const safeInviter = String(inviterEmail).replace(/</g, '&lt;');
  const safeRole = String(role).replace(/</g, '&lt;');
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;color:#0a0a0a;line-height:1.6;max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="display:inline-flex;align-items:center;gap:8px;font-weight:700;color:#0d9488;font-size:18px;margin-bottom:24px;">
    ⚡ FlashFlow
  </div>
  <h1 style="font-size:22px;font-weight:700;margin:0 0 12px 0;">You've been invited to ${safeOrg}</h1>
  <p style="font-size:15px;color:#3f3f46;margin:0 0 24px 0;">
    ${safeInviter} added you as a <strong>${safeRole}</strong>. Click below to accept the invitation and join the team.
  </p>
  <p style="margin:0 0 32px 0;">
    <a href="${inviteUrl}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">
      Accept invite
    </a>
  </p>
  <p style="font-size:13px;color:#71717a;margin:0 0 8px 0;">Or paste this link in your browser:</p>
  <p style="font-size:13px;color:#3f3f46;word-break:break-all;margin:0 0 32px 0;">
    <a href="${inviteUrl}" style="color:#0d9488;">${inviteUrl}</a>
  </p>
  <p style="font-size:12px;color:#a1a1aa;margin:32px 0 0 0;border-top:1px solid #e4e4e7;padding-top:16px;">
    This invite expires in 14 days. If you weren't expecting this, you can ignore the email.
  </p>
</body></html>`;
}
