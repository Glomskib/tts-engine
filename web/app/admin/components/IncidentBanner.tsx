'use client';

import { useState, useEffect } from 'react';

interface IncidentModeData {
  incident_mode_enabled: boolean;
  incident_mode_message: string;
  incident_mode_read_only: boolean;
  is_allowlisted: boolean;
  is_admin: boolean;
}

interface IncidentBannerProps {
  style?: React.CSSProperties;
}

/**
 * IncidentBanner component.
 * Fetches incident mode status from runtime-config and displays a banner
 * when incident mode is enabled. Shows read-only warning if applicable.
 */
export default function IncidentBanner({ style }: IncidentBannerProps) {
  const [incidentData, setIncidentData] = useState<IncidentModeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIncidentStatus = async () => {
      try {
        const res = await fetch('/api/auth/runtime-config');
        const data = await res.json();
        if (data.ok) {
          setIncidentData({
            incident_mode_enabled: data.data.incident_mode_enabled || false,
            incident_mode_message: data.data.incident_mode_message || '',
            incident_mode_read_only: data.data.incident_mode_read_only || false,
            is_allowlisted: data.data.is_allowlisted || false,
            is_admin: data.data.is_admin || false,
          });
        }
      } catch (err) {
        // Silent fail - banner is non-critical
        console.error('Failed to fetch incident status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchIncidentStatus();
    // Poll every 30 seconds to catch incident mode changes
    const interval = setInterval(fetchIncidentStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Don't render if loading or incident mode is not enabled
  if (loading || !incidentData || !incidentData.incident_mode_enabled) {
    return null;
  }

  const { incident_mode_message, incident_mode_read_only, is_allowlisted, is_admin } = incidentData;

  // Determine if user is blocked by read-only mode
  const isBlocked = incident_mode_read_only && !is_admin && !is_allowlisted;

  return (
    <div
      style={{
        padding: '12px 16px',
        backgroundColor: isBlocked ? '#fff5f5' : '#fff9db',
        border: `1px solid ${isBlocked ? '#ffc9c9' : '#ffe066'}`,
        borderRadius: '8px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        ...style,
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: '20px' }}>
        {isBlocked ? '\u26A0' : '\u2139'}
      </span>

      {/* Message */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontWeight: 'bold',
          color: isBlocked ? '#c92a2a' : '#e67700',
          marginBottom: isBlocked ? '4px' : 0,
        }}>
          {incident_mode_message || 'System is in maintenance mode.'}
        </div>
        {isBlocked && (
          <div style={{ fontSize: '13px', color: '#c92a2a' }}>
            Write operations are disabled. You can view data but cannot make changes.
          </div>
        )}
        {incident_mode_read_only && is_admin && (
          <div style={{ fontSize: '13px', color: '#e67700' }}>
            Read-only mode is active for non-admin users. You have admin bypass.
          </div>
        )}
        {incident_mode_read_only && is_allowlisted && !is_admin && (
          <div style={{ fontSize: '13px', color: '#e67700' }}>
            Read-only mode is active. You are on the allowlist and can continue working.
          </div>
        )}
      </div>

      {/* Status badge */}
      <div style={{
        padding: '4px 10px',
        backgroundColor: isBlocked ? '#fa5252' : '#fab005',
        color: 'white',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
      }}>
        {isBlocked ? 'Read-Only' : 'Maintenance'}
      </div>
    </div>
  );
}
