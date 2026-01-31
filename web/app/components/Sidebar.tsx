'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTheme, getThemeColors } from './ThemeProvider';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface NavItem {
  label: string;
  href: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
  collapsed?: boolean;
}

interface SidebarProps {
  role: UserRole;
  unreadNotifications?: number;
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export default function Sidebar({ role, unreadNotifications = 0, isOpen, onClose, isMobile }: SidebarProps) {
  const pathname = usePathname();
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const { toggleTheme, isDark } = useTheme();
  const colors = getThemeColors(isDark);

  const isActive = (href: string) => {
    if (href === '/admin/pipeline') {
      return pathname === '/admin/pipeline' || pathname.startsWith('/admin/pipeline/');
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Role-specific navigation
  const getNavSections = (): NavSection[] => {
    const sections: NavSection[] = [];

    // Everyone gets notifications at top
    sections.push({
      items: [
        {
          label: unreadNotifications > 0 ? `Inbox (${unreadNotifications})` : 'Inbox',
          href: '/admin/notifications',
        },
      ],
    });

    if (role === 'recorder') {
      sections.push({
        title: 'Recording',
        items: [
          { label: 'My Work', href: '/admin/recorder/workbench' },
          { label: 'Recording Queue', href: '/admin/pipeline?filter=record' },
        ],
      });
    }

    if (role === 'editor') {
      sections.push({
        title: 'Editing',
        items: [
          { label: 'My Work', href: '/admin/editor/workbench' },
          { label: 'Editing Queue', href: '/admin/pipeline?filter=edit' },
        ],
      });
    }

    if (role === 'uploader') {
      sections.push({
        title: 'Publishing',
        items: [
          { label: 'My Work', href: '/admin/uploader/workbench' },
          { label: 'Ready to Publish', href: '/uploader' },
          { label: 'Published', href: '/admin/pipeline?filter=posted' },
        ],
      });
    }

    if (role === 'admin') {
      // Primary work section
      sections.push({
        title: 'Work',
        items: [
          { label: 'Work Queue', href: '/admin/pipeline' },
          { label: 'My Work', href: '/admin/pipeline?filter=my_work' },
          { label: 'Ready to Publish', href: '/uploader' },
          { label: 'Calendar', href: '/admin/calendar' },
        ],
      });

      // Content library
      sections.push({
        title: 'Library',
        items: [
          { label: 'Brands', href: '/admin/brands' },
          { label: 'Products', href: '/admin/products' },
          { label: 'Audience', href: '/admin/audience' },
          { label: 'Script Library', href: '/admin/scripts' },
          { label: 'Skit Generator', href: '/admin/skit-generator' },
          { label: 'Templates', href: '/admin/templates' },
          { label: 'Saved Skits', href: '/admin/skit-library' },
          { label: 'Collections', href: '/admin/collections' },
          { label: 'Winners Bank', href: '/admin/winners' },
        ],
      });

      // Insights and reporting
      sections.push({
        title: 'Insights',
        items: [
          { label: 'Usage Analytics', href: '/admin/usage' },
          { label: 'Performance', href: '/admin/analytics' },
          { label: 'My Activity', href: '/admin/activity' },
          { label: 'System Events', href: '/admin/events' },
        ],
      });
    }

    return sections;
  };

  // Admin tools section (collapsed by default)
  const adminToolsItems: NavItem[] = [
    { label: 'System Health', href: '/admin/ops' },
    { label: 'Add Content', href: '/admin/ingestion' },
    { label: 'Work Routing', href: '/admin/assignments' },
    { label: 'Team Members', href: '/admin/users' },
    { label: 'Plans & Access', href: '/admin/upgrade-requests' },
    { label: 'Clients', href: '/admin/client-orgs' },
    { label: 'Requests & Approvals', href: '/admin/requests' },
    { label: 'Billing', href: '/admin/billing' },
    { label: 'System Settings', href: '/admin/settings' },
    { label: 'System Status', href: '/admin/status' },
  ];

  const navSections = getNavSections();

  const handleLinkClick = () => {
    if (isMobile) {
      onClose();
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 99,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      <aside
        style={{
          width: '260px',
          minHeight: '100vh',
          backgroundColor: colors.surface2,
          color: colors.text,
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          overflowY: 'auto',
          borderRight: `1px solid ${colors.border}`,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
        }}
      >
        {/* Logo/Brand */}
        <div
          style={{
            padding: '20px 16px',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link
              href="/"
              onClick={handleLinkClick}
              style={{
                textDecoration: 'none',
                color: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Image
                src="/FFAI.png"
                alt="FlashFlow AI"
                width={28}
                height={28}
                style={{ borderRadius: '6px' }}
              />
              <span style={{
                fontWeight: 600,
                fontSize: '15px',
                letterSpacing: '-0.01em',
              }}>FlashFlow AI</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '6px',
                  borderRadius: '6px',
                  color: colors.textMuted,
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.bgHover;
                  e.currentTarget.style.color = colors.text;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = colors.textMuted;
                }}
              >
                {isDark ? 'Light' : 'Dark'}
              </button>
              {/* Close button for mobile */}
              {isMobile && (
                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    padding: '6px',
                    borderRadius: '6px',
                    color: colors.textMuted,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Nav Sections */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {navSections.map((section, sectionIdx) => (
            <div key={sectionIdx} style={{ marginBottom: '16px' }}>
              {section.title && (
                <div
                  style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: colors.textMuted,
                    letterSpacing: '0.5px',
                  }}
                >
                  {section.title}
                </div>
              )}
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleLinkClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 16px',
                    textDecoration: 'none',
                    color: isActive(item.href) ? colors.text : colors.textMuted,
                    backgroundColor: isActive(item.href) ? colors.accentSubtle : 'transparent',
                    borderLeft: isActive(item.href) ? `2px solid ${colors.accent}` : '2px solid transparent',
                    fontSize: '14px',
                    fontWeight: isActive(item.href) ? 500 : 400,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{item.label}</span>
                  {item.label.includes('Inbox') && unreadNotifications > 0 && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        backgroundColor: colors.danger,
                        color: 'white',
                        borderRadius: '10px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {unreadNotifications}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}

          {/* Admin Tools Section */}
          {role === 'admin' && (
            <div style={{ marginTop: '8px', borderTop: `1px solid ${colors.border}`, paddingTop: '8px' }}>
              <button
                onClick={() => setAdvancedExpanded(!advancedExpanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 16px',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  color: colors.textMuted,
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: '10px',
                  transition: 'transform 0.15s',
                  transform: advancedExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                }}>
                  {'>'}
                </span>
                <span>Admin Tools</span>
              </button>
              {advancedExpanded && (
                <div>
                  {adminToolsItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={handleLinkClick}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 16px 8px 28px',
                        textDecoration: 'none',
                        color: isActive(item.href) ? colors.text : colors.textMuted,
                        backgroundColor: isActive(item.href) ? colors.accentSubtle : 'transparent',
                        fontSize: '13px',
                        fontWeight: isActive(item.href) ? 500 : 400,
                      }}
                    >
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User/Role indicator at bottom */}
        <div
          style={{
            padding: '16px',
            borderTop: `1px solid ${colors.border}`,
            fontSize: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: colors.textMuted,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: colors.success,
              }}
            />
            <span style={{ textTransform: 'capitalize' }}>{role || 'Guest'}</span>
          </div>
        </div>
      </aside>
    </>
  );
}
