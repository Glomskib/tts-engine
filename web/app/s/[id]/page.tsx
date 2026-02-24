import { supabaseAdmin } from '@/lib/supabaseAdmin';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface SkitData {
  visual_hook?: string;
  text_on_screen_hook?: string;
  verbal_hook?: string;
  hook_line?: string;
  beats: Array<{
    t: string;
    action: string;
    dialogue?: string;
    on_screen_text?: string;
  }>;
  cta_line: string;
  cta_overlay?: string;
  b_roll?: string[];
  overlays?: string[];
}

interface ScriptRecord {
  id: string;
  title: string;
  skit_data: SkitData;
  product_name?: string;
  product_brand?: string;
  created_at: string;
  is_public?: boolean;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { data } = await supabaseAdmin
    .from('skits')
    .select('title, skit_data')
    .eq('id', id)
    .single();

  if (!data) return { title: 'Script Not Found | FlashFlow AI' };

  const skit = data.skit_data as SkitData;
  const hookText = skit?.visual_hook || skit?.verbal_hook || skit?.hook_line || '';

  return {
    title: `${data.title || 'Script'} | FlashFlow AI`,
    description: hookText ? `${hookText.substring(0, 150)}...` : 'AI-generated TikTok script by FlashFlow AI',
    openGraph: {
      title: data.title || 'FlashFlow AI Script',
      description: hookText.substring(0, 200),
    },
  };
}

export default async function SharedScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: script } = await supabaseAdmin
    .from('skits')
    .select('id, title, skit_data, product_name, product_brand, created_at, is_public')
    .eq('id', id)
    .single();

  if (!script) {
    notFound();
  }

  const skit = (script as ScriptRecord).skit_data;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      color: '#e4e4e7',
    }}>
      {/* Top CTA Banner */}
      <div style={{
        background: 'linear-gradient(to right, #6366f1, #8b5cf6)',
        padding: '12px 16px',
        textAlign: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'white' }}>
            Create viral scripts like this for free
          </span>
          <Link
            href="/login?mode=signup"
            style={{
              padding: '6px 16px',
              backgroundColor: 'white',
              color: '#6366f1',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Try FlashFlow AI Free
          </Link>
        </div>
      </div>

      {/* Script Content */}
      <div style={{
        maxWidth: '700px',
        margin: '0 auto',
        padding: '32px 16px 80px',
      }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <Link href="/" style={{ color: '#a5b4fc', fontSize: '14px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px' }}>
            FlashFlow AI
          </Link>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', margin: '0 0 8px 0' }}>
            {script.title || 'Untitled Script'}
          </h1>
          {script.product_name && (
            <p style={{ fontSize: '14px', color: '#71717a', margin: 0 }}>
              {script.product_brand ? `${script.product_brand} — ` : ''}{script.product_name}
            </p>
          )}
        </div>

        {/* 3-Part Hook */}
        {(skit.visual_hook || skit.text_on_screen_hook || skit.verbal_hook) ? (
          <div style={{
            padding: '20px',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '12px',
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#6366f1', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              3-Part Hook
            </div>
            {skit.visual_hook && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#71717a', marginBottom: '4px' }}>
                  🎬 VISUAL HOOK
                </div>
                <div style={{ fontSize: '15px', color: 'white', lineHeight: 1.5 }}>
                  {skit.visual_hook}
                </div>
              </div>
            )}
            {skit.text_on_screen_hook && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#71717a', marginBottom: '4px' }}>
                  📝 TEXT ON SCREEN
                </div>
                <div style={{ fontSize: '15px', color: 'white', lineHeight: 1.5, fontStyle: 'italic' }}>
                  &ldquo;{skit.text_on_screen_hook}&rdquo;
                </div>
              </div>
            )}
            {skit.verbal_hook && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#71717a', marginBottom: '4px' }}>
                  🗣️ VERBAL HOOK
                </div>
                <div style={{ fontSize: '15px', color: 'white', lineHeight: 1.5 }}>
                  {skit.verbal_hook}
                </div>
              </div>
            )}
          </div>
        ) : skit.hook_line ? (
          <div style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '12px',
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6366f1', marginBottom: '6px', textTransform: 'uppercase' }}>
              Hook
            </div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>
              {skit.hook_line}
            </div>
          </div>
        ) : null}

        {/* Scenes/Beats */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#71717a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            📽️ Scenes ({skit.beats?.length || 0})
          </div>
          {skit.beats?.map((beat, idx) => (
            <div key={idx} style={{
              padding: '14px 16px',
              backgroundColor: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '10px',
              marginBottom: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{
                  padding: '2px 8px',
                  backgroundColor: '#3b82f6',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'white',
                }}>
                  {beat.t}
                </span>
                <span style={{ fontSize: '11px', color: '#71717a' }}>Scene {idx + 1}</span>
              </div>
              <div style={{ fontSize: '14px', color: '#d4d4d8', marginBottom: beat.dialogue ? '6px' : '0' }}>
                {beat.action}
              </div>
              {beat.dialogue && (
                <div style={{ fontSize: '14px', color: '#a78bfa', fontStyle: 'italic' }}>
                  &ldquo;{beat.dialogue}&rdquo;
                </div>
              )}
              {beat.on_screen_text && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#f59e0b' }}>
                  [TEXT: {beat.on_screen_text}]
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{
          padding: '16px 20px',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          marginBottom: '24px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', marginBottom: '6px', textTransform: 'uppercase' }}>
            Call to Action
          </div>
          <div style={{ fontSize: '15px', color: 'white', fontWeight: 500 }}>
            {skit.cta_line}
          </div>
          {skit.cta_overlay && (
            <div style={{ fontSize: '13px', color: '#fca5a5', marginTop: '4px' }}>
              Overlay: {skit.cta_overlay}
            </div>
          )}
        </div>

        {/* B-Roll */}
        {skit.b_roll && skit.b_roll.length > 0 && (
          <div style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(139, 92, 246, 0.08)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            borderRadius: '12px',
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#8b5cf6', marginBottom: '8px', textTransform: 'uppercase' }}>
              B-Roll Suggestions
            </div>
            <ul style={{ margin: 0, paddingLeft: '16px', color: '#a1a1aa', fontSize: '14px' }}>
              {skit.b_roll.map((br, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>{br}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom CTA */}
        <div style={{
          padding: '24px',
          background: 'linear-gradient(to bottom right, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '16px',
          textAlign: 'center',
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'white', fontWeight: 700 }}>
            Create scripts like this — Free
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#a1a1aa' }}>
            FlashFlow AI generates viral TikTok scripts with 3-part hooks, AI scoring, and one-click pipeline delivery.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/login?mode=signup"
              style={{
                padding: '12px 24px',
                backgroundColor: '#6366f1',
                color: 'white',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Sign Up Free
            </Link>
            <Link
              href="/generator"
              style={{
                padding: '12px 24px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: 'white',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 500,
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              Try the Generator
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
