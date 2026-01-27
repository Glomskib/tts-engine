/**
 * Schema Guard Component
 *
 * Server component that validates database schema compatibility on startup.
 * If schema is incompatible, renders a stable error screen.
 * Does NOT redirect - renders error directly to avoid loops.
 *
 * Usage: Wrap children in root layout
 */

import { checkSchema, type SchemaCheckResult } from "@/lib/schema-check";

interface SchemaGuardProps {
  children: React.ReactNode;
}

/**
 * Static error screen rendered when schema is incompatible.
 * Pure HTML/CSS - no client-side JS required.
 */
function SchemaErrorScreen({ result }: { result: SchemaCheckResult }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Schema Mismatch Detected</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #0f0f0f;
                color: #e5e5e5;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
              }
              .container {
                max-width: 700px;
                width: 100%;
                background: #1a1a1a;
                border: 1px solid #dc2626;
                border-radius: 8px;
                padding: 32px;
              }
              .header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid #333;
              }
              .icon {
                width: 48px;
                height: 48px;
                background: #dc2626;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
              }
              h1 {
                font-size: 24px;
                font-weight: 600;
                color: #fca5a5;
              }
              .subtitle {
                font-size: 14px;
                color: #a3a3a3;
                margin-top: 4px;
              }
              .section {
                margin-bottom: 20px;
              }
              .section-title {
                font-size: 14px;
                font-weight: 600;
                color: #a3a3a3;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 12px;
              }
              .error-list {
                list-style: none;
                background: #1f1f1f;
                border-radius: 6px;
                padding: 16px;
                font-family: 'SF Mono', Monaco, monospace;
                font-size: 13px;
              }
              .error-item {
                padding: 8px 0;
                border-bottom: 1px solid #2a2a2a;
                color: #f87171;
              }
              .error-item:last-child {
                border-bottom: none;
              }
              .warning-item {
                color: #fbbf24;
              }
              .info-box {
                background: #1f2937;
                border: 1px solid #374151;
                border-radius: 6px;
                padding: 16px;
                font-size: 14px;
                line-height: 1.6;
              }
              .info-box code {
                background: #374151;
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'SF Mono', Monaco, monospace;
                font-size: 12px;
              }
              .timestamp {
                font-size: 12px;
                color: #666;
                margin-top: 20px;
                text-align: right;
              }
            `,
          }}
        />
      </head>
      <body>
        <div className="container">
          <div className="header">
            <div className="icon">⚠</div>
            <div>
              <h1>Schema Mismatch Detected</h1>
              <div className="subtitle">
                The application cannot start due to database schema incompatibility
              </div>
            </div>
          </div>

          {result.critical_errors.length > 0 && (
            <div className="section">
              <div className="section-title">Critical Errors ({result.critical_errors.length})</div>
              <ul className="error-list">
                {result.critical_errors.map((error, index) => (
                  <li key={index} className="error-item">
                    ✗ {error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="section">
              <div className="section-title">Warnings ({result.warnings.length})</div>
              <ul className="error-list">
                {result.warnings.map((warning, index) => (
                  <li key={index} className="error-item warning-item">
                    ⚠ {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="section">
            <div className="section-title">Resolution</div>
            <div className="info-box">
              <p>To resolve this issue:</p>
              <ol style={{ marginTop: "12px", marginLeft: "20px", lineHeight: "2" }}>
                <li>
                  Verify your database has the required schema by running migrations
                </li>
                <li>
                  Check the health endpoint: <code>GET /api/health/schema</code>
                </li>
                <li>
                  Ensure environment variables point to the correct database
                </li>
              </ol>
            </div>
          </div>

          <div className="timestamp">Checked at: {result.checked_at}</div>
        </div>
      </body>
    </html>
  );
}

/**
 * Schema Guard - validates schema before rendering children.
 * This is an async server component.
 */
export default async function SchemaGuard({ children }: SchemaGuardProps) {
  // Skip schema check if env vars are missing (allows site to load for debugging)
  const hasEnv = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!hasEnv) {
    // Env not configured - skip schema check, let pages handle their own errors
    // This allows /api/health to be accessible for debugging
    console.warn("SchemaGuard: Skipping schema check - env vars not configured");
    return <>{children}</>;
  }

  try {
    const result = await checkSchema();

    if (!result.ok) {
      // Schema is incompatible - render error screen directly
      // No redirect, no client JS needed
      return <SchemaErrorScreen result={result} />;
    }
  } catch (error) {
    // Schema check failed (likely env/connection issue) - log and continue
    console.error("SchemaGuard: Schema check failed", error);
    // Don't block the app - let individual pages handle errors
  }

  // Schema is compatible (or check was skipped) - render children normally
  return <>{children}</>;
}
