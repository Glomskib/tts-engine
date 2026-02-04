'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';

// Test status types
type TestStatus = 'pending' | 'pass' | 'fail' | 'skip';

interface TestItem {
  id: string;
  name: string;
  description: string;
  status: TestStatus;
  notes?: string;
}

interface TestCategory {
  id: string;
  name: string;
  description: string;
  tests: TestItem[];
}

// Default test categories
const DEFAULT_TEST_CATEGORIES: TestCategory[] = [
  {
    id: 'skit-generator',
    name: 'Skit Generator',
    description: 'Test the AI skit generation workflow',
    tests: [
      { id: 'sg-1', name: 'Product Selection', description: 'Select a product from dropdown or enter manually', status: 'pending' },
      { id: 'sg-2', name: 'Preset Selection', description: 'Choose a skit preset and verify it loads', status: 'pending' },
      { id: 'sg-3', name: 'Template Selection', description: 'Select a template and verify structure loads', status: 'pending' },
      { id: 'sg-4', name: 'Generate Skit', description: 'Click Generate and verify skit appears', status: 'pending' },
      { id: 'sg-5', name: 'Variation Tabs', description: 'Switch between multiple variations', status: 'pending' },
      { id: 'sg-6', name: 'Inline Editing', description: 'Edit hook, scenes, CTA inline', status: 'pending' },
      { id: 'sg-7', name: 'AI Improve Section', description: 'Use AI to improve a specific section', status: 'pending' },
      { id: 'sg-8', name: 'Quick Actions', description: 'Test punch up hook, add twist, etc.', status: 'pending' },
      { id: 'sg-9', name: 'Refine Skit', description: 'Use custom instruction to refine', status: 'pending' },
      { id: 'sg-10', name: 'AI Scoring', description: 'Get AI score and verify all metrics display', status: 'pending' },
      { id: 'sg-11', name: 'User Rating', description: 'Rate skit 1-5 stars and save', status: 'pending' },
      { id: 'sg-12', name: 'Save to Library', description: 'Save skit with title and status', status: 'pending' },
      { id: 'sg-13', name: 'Send to Video Queue', description: 'Create video from saved skit', status: 'pending' },
      { id: 'sg-14', name: 'Load from Library', description: 'Load a saved skit into generator', status: 'pending' },
      { id: 'sg-15', name: 'Export .txt', description: 'Download skit as plain text file', status: 'pending' },
      { id: 'sg-16', name: 'Copy for Docs', description: 'Copy rich text to clipboard', status: 'pending' },
    ],
  },
  {
    id: 'skit-library',
    name: 'Script Library',
    description: 'Test the script library management',
    tests: [
      { id: 'sl-1', name: 'List Skits', description: 'View list of saved skits', status: 'pending' },
      { id: 'sl-2', name: 'Search Skits', description: 'Search by title', status: 'pending' },
      { id: 'sl-3', name: 'Filter by Status', description: 'Filter by draft/approved/produced/posted', status: 'pending' },
      { id: 'sl-4', name: 'Sort Options', description: 'Sort by newest, oldest, rating, AI score', status: 'pending' },
      { id: 'sl-5', name: 'Expand Skit Details', description: 'Click to view full skit content', status: 'pending' },
      { id: 'sl-6', name: 'Edit in Generator', description: 'Open skit in generator for editing', status: 'pending' },
      { id: 'sl-7', name: 'Duplicate Skit', description: 'Create a copy of a skit', status: 'pending' },
      { id: 'sl-8', name: 'Change Status', description: 'Update skit status', status: 'pending' },
      { id: 'sl-9', name: 'Delete Skit', description: 'Delete with confirmation', status: 'pending' },
      { id: 'sl-10', name: 'Get AI Score', description: 'Score an existing skit', status: 'pending' },
      { id: 'sl-11', name: 'Export JSON', description: 'Download skit as JSON', status: 'pending' },
      { id: 'sl-12', name: 'Export Markdown', description: 'Download skit as Markdown', status: 'pending' },
      { id: 'sl-13', name: 'View Linked Video', description: 'Click through to pipeline for linked videos', status: 'pending' },
      { id: 'sl-14', name: 'Pagination', description: 'Navigate through multiple pages', status: 'pending' },
      { id: 'sl-15', name: 'Stats Dashboard', description: 'Verify status counts are accurate', status: 'pending' },
    ],
  },
  {
    id: 'video-pipeline',
    name: 'Video Pipeline',
    description: 'Test the video production workflow',
    tests: [
      { id: 'vp-1', name: 'View Queue', description: 'See list of videos in queue', status: 'pending' },
      { id: 'vp-2', name: 'Create from Product', description: 'Create new video from product selection', status: 'pending' },
      { id: 'vp-3', name: 'Video Detail View', description: 'View full video details', status: 'pending' },
      { id: 'vp-4', name: 'Script Lock/Unlock', description: 'Lock and unlock script for editing', status: 'pending' },
      { id: 'vp-5', name: 'Status Transitions', description: 'Move through recording statuses', status: 'pending' },
      { id: 'vp-6', name: 'Claim Video', description: 'Claim video for work', status: 'pending' },
      { id: 'vp-7', name: 'Release Video', description: 'Release claim on video', status: 'pending' },
      { id: 'vp-8', name: 'Assignment System', description: 'Assign videos to team members', status: 'pending' },
      { id: 'vp-9', name: 'Filter by Status', description: 'Filter queue by recording status', status: 'pending' },
      { id: 'vp-10', name: 'Sort by Priority', description: 'Sort by priority score', status: 'pending' },
    ],
  },
  {
    id: 'ai-endpoints',
    name: 'AI Endpoints',
    description: 'Test AI-powered API endpoints',
    tests: [
      { id: 'ai-1', name: 'Generate Skit API', description: 'POST /api/ai/generate-skit', status: 'pending' },
      { id: 'ai-2', name: 'Score Skit API', description: 'POST /api/ai/score-skit', status: 'pending' },
      { id: 'ai-3', name: 'Refine Skit API', description: 'POST /api/ai/refine-skit', status: 'pending' },
      { id: 'ai-4', name: 'Improve Section API', description: 'POST /api/ai/improve-section', status: 'pending' },
      { id: 'ai-5', name: 'Rate Skit API', description: 'POST /api/ai/rate-skit', status: 'pending' },
      { id: 'ai-6', name: 'Error Handling', description: 'Verify proper error responses', status: 'pending' },
      { id: 'ai-7', name: 'Auth Required', description: 'Verify 401 without auth', status: 'pending' },
    ],
  },
  {
    id: 'mobile-responsive',
    name: 'Mobile Responsiveness',
    description: 'Test on mobile viewports (< 768px)',
    tests: [
      { id: 'mr-1', name: 'Skit Generator Layout', description: 'Forms stack vertically on mobile', status: 'pending' },
      { id: 'mr-2', name: 'Touch Targets', description: 'Buttons are at least 44px', status: 'pending' },
      { id: 'mr-3', name: 'Input Font Size', description: 'Inputs are 16px+ to prevent iOS zoom', status: 'pending' },
      { id: 'mr-4', name: 'Variation Tabs', description: 'Tabs scroll horizontally', status: 'pending' },
      { id: 'mr-5', name: 'Script Library Cards', description: 'Cards stack properly on mobile', status: 'pending' },
      { id: 'mr-6', name: 'Breadcrumbs', description: 'Breadcrumbs visible and usable', status: 'pending' },
      { id: 'mr-7', name: 'Export Buttons', description: 'Export buttons accessible', status: 'pending' },
    ],
  },
  {
    id: 'navigation',
    name: 'Navigation & UX',
    description: 'Test navigation and user experience',
    tests: [
      { id: 'nav-1', name: 'Breadcrumbs', description: 'Breadcrumbs show correct path', status: 'pending' },
      { id: 'nav-2', name: 'Quick Nav Links', description: 'Links between related pages work', status: 'pending' },
      { id: 'nav-3', name: 'View Library Button', description: 'Generator -> Library link works', status: 'pending' },
      { id: 'nav-4', name: 'Create New Skit', description: 'Library -> Generator link works', status: 'pending' },
      { id: 'nav-5', name: 'Video Pipeline Link', description: 'Links to pipeline work', status: 'pending' },
      { id: 'nav-6', name: 'View in Pipeline', description: 'Linked video opens correctly', status: 'pending' },
      { id: 'nav-7', name: 'Admin Sidebar', description: 'Skit Generator in sidebar nav', status: 'pending' },
    ],
  },
  {
    id: 'data-persistence',
    name: 'Data Persistence',
    description: 'Test data saving and loading',
    tests: [
      { id: 'dp-1', name: 'Save Skit to DB', description: 'Skit saves to saved_skits table', status: 'pending' },
      { id: 'dp-2', name: 'Load Skit from DB', description: 'Skit loads with all fields', status: 'pending' },
      { id: 'dp-3', name: 'Update Skit', description: 'Status, rating updates persist', status: 'pending' },
      { id: 'dp-4', name: 'Delete Skit', description: 'Skit removed from database', status: 'pending' },
      { id: 'dp-5', name: 'Video Link Persists', description: 'video_id stored after send to queue', status: 'pending' },
      { id: 'dp-6', name: 'AI Score Persists', description: 'AI score saved to skit record', status: 'pending' },
      { id: 'dp-7', name: 'User Preferences', description: 'localStorage settings persist', status: 'pending' },
      { id: 'dp-8', name: 'Recent Products', description: 'Recent products list persists', status: 'pending' },
    ],
  },
  {
    id: 'error-handling',
    name: 'Error Handling',
    description: 'Test error states and edge cases',
    tests: [
      { id: 'eh-1', name: 'No Product Selected', description: 'Shows validation error', status: 'pending' },
      { id: 'eh-2', name: 'AI Generation Failure', description: 'Shows friendly error message', status: 'pending' },
      { id: 'eh-3', name: 'Network Error', description: 'Handles offline/timeout gracefully', status: 'pending' },
      { id: 'eh-4', name: 'Invalid Skit ID', description: '404 for non-existent skit', status: 'pending' },
      { id: 'eh-5', name: 'Unauthorized Access', description: 'Redirects or shows 401', status: 'pending' },
      { id: 'eh-6', name: 'Empty Library', description: 'Shows empty state message', status: 'pending' },
      { id: 'eh-7', name: 'Duplicate Send to Video', description: 'Prevents double-send', status: 'pending' },
    ],
  },
];

// LocalStorage key for persisting test results
const STORAGE_KEY = 'test-center-results';

export default function TestCenterPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const colors = getThemeColors(isDark);

  const [categories, setCategories] = useState<TestCategory[]>(DEFAULT_TEST_CATEGORIES);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('skit-generator');
  const [showOnlyFailing, setShowOnlyFailing] = useState(false);

  // Load saved results from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as TestCategory[];
        // Merge saved statuses with default tests (in case new tests were added)
        const merged = DEFAULT_TEST_CATEGORIES.map(defaultCat => {
          const savedCat = parsed.find(c => c.id === defaultCat.id);
          if (!savedCat) return defaultCat;
          return {
            ...defaultCat,
            tests: defaultCat.tests.map(test => {
              const savedTest = savedCat.tests.find(t => t.id === test.id);
              return savedTest ? { ...test, status: savedTest.status, notes: savedTest.notes } : test;
            }),
          };
        });
        setCategories(merged);
      } catch {
        // Invalid saved data, use defaults
      }
    }
  }, []);

  // Save results to localStorage
  const saveResults = (newCategories: TestCategory[]) => {
    setCategories(newCategories);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newCategories));
  };

  // Update test status
  const updateTestStatus = (categoryId: string, testId: string, status: TestStatus) => {
    const updated = categories.map(cat => {
      if (cat.id !== categoryId) return cat;
      return {
        ...cat,
        tests: cat.tests.map(test =>
          test.id === testId ? { ...test, status } : test
        ),
      };
    });
    saveResults(updated);
  };

  // Update test notes
  const updateTestNotes = (categoryId: string, testId: string, notes: string) => {
    const updated = categories.map(cat => {
      if (cat.id !== categoryId) return cat;
      return {
        ...cat,
        tests: cat.tests.map(test =>
          test.id === testId ? { ...test, notes } : test
        ),
      };
    });
    saveResults(updated);
  };

  // Reset all tests
  const resetAllTests = () => {
    if (confirm('Reset all test results? This cannot be undone.')) {
      localStorage.removeItem(STORAGE_KEY);
      setCategories(DEFAULT_TEST_CATEGORIES);
    }
  };

  // Calculate stats
  const stats = categories.reduce(
    (acc, cat) => {
      cat.tests.forEach(test => {
        acc.total++;
        acc[test.status]++;
      });
      return acc;
    },
    { total: 0, pending: 0, pass: 0, fail: 0, skip: 0 }
  );

  const progressPercent = stats.total > 0
    ? Math.round(((stats.pass + stats.fail + stats.skip) / stats.total) * 100)
    : 0;

  // Filter categories if showing only failing
  const displayCategories = showOnlyFailing
    ? categories.map(cat => ({
        ...cat,
        tests: cat.tests.filter(t => t.status === 'fail'),
      })).filter(cat => cat.tests.length > 0)
    : categories;

  const statusColors: Record<TestStatus, string> = {
    pending: colors.textMuted,
    pass: '#10b981',
    fail: '#ef4444',
    skip: '#f59e0b',
  };

  const statusLabels: Record<TestStatus, string> = {
    pending: 'Pending',
    pass: 'Pass',
    fail: 'Fail',
    skip: 'Skip',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }} className="pb-24 lg:pb-6">
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '12px', fontSize: '13px' }}>
        <Link href="/admin/pipeline" style={{ color: colors.textMuted, textDecoration: 'none' }}>
          Admin
        </Link>
        <span style={{ color: colors.textMuted, margin: '0 8px' }}>/</span>
        <span style={{ color: colors.text, fontWeight: 500 }}>Test Center</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, color: colors.text, fontSize: '24px', fontWeight: 600 }}>
          QA Test Center
        </h1>
        <p style={{ margin: '4px 0 0 0', color: colors.textSecondary, fontSize: '14px' }}>
          Manual QA checklist for comprehensive testing
        </p>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: colors.card,
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
      }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>{stats.total}</div>
          <div style={{ fontSize: '12px', color: colors.textMuted }}>Total Tests</div>
        </div>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981' }}>{stats.pass}</div>
          <div style={{ fontSize: '12px', color: colors.textMuted }}>Passing</div>
        </div>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444' }}>{stats.fail}</div>
          <div style={{ fontSize: '12px', color: colors.textMuted }}>Failing</div>
        </div>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f59e0b' }}>{stats.skip}</div>
          <div style={{ fontSize: '12px', color: colors.textMuted }}>Skipped</div>
        </div>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: colors.textMuted }}>{stats.pending}</div>
          <div style={{ fontSize: '12px', color: colors.textMuted }}>Pending</div>
        </div>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>{progressPercent}%</div>
          <div style={{ fontSize: '12px', color: colors.textMuted }}>Complete</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{
        height: '8px',
        backgroundColor: colors.surface2,
        borderRadius: '4px',
        marginBottom: '24px',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          height: '100%',
        }}>
          <div style={{ width: `${(stats.pass / stats.total) * 100}%`, backgroundColor: '#10b981' }} />
          <div style={{ width: `${(stats.fail / stats.total) * 100}%`, backgroundColor: '#ef4444' }} />
          <div style={{ width: `${(stats.skip / stats.total) * 100}%`, backgroundColor: '#f59e0b' }} />
        </div>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: colors.text, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOnlyFailing}
              onChange={(e) => setShowOnlyFailing(e.target.checked)}
            />
            Show only failing tests
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link
            href="/admin/skit-generator"
            style={{
              padding: '8px 14px',
              backgroundColor: '#059669',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            Open Skit Generator
          </Link>
          <Link
            href="/admin/skit-library"
            style={{
              padding: '8px 14px',
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              color: colors.text,
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '13px',
            }}
          >
            Open Script Library
          </Link>
          <button type="button"
            onClick={resetAllTests}
            style={{
              padding: '8px 14px',
              backgroundColor: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.textMuted,
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Reset All
          </button>
        </div>
      </div>

      {/* Test Categories */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {displayCategories.map(category => {
          const isExpanded = expandedCategory === category.id;
          const catStats = category.tests.reduce(
            (acc, t) => {
              acc[t.status]++;
              return acc;
            },
            { pending: 0, pass: 0, fail: 0, skip: 0 }
          );

          return (
            <div
              key={category.id}
              style={{
                backgroundColor: colors.card,
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                overflow: 'hidden',
              }}
            >
              {/* Category Header */}
              <button type="button"
                onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                style={{
                  width: '100%',
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: colors.text }}>
                    {category.name}
                  </div>
                  <div style={{ fontSize: '13px', color: colors.textMuted, marginTop: '2px' }}>
                    {category.description}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Mini stats */}
                  <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                    {catStats.pass > 0 && (
                      <span style={{ color: '#10b981' }}>{catStats.pass} pass</span>
                    )}
                    {catStats.fail > 0 && (
                      <span style={{ color: '#ef4444' }}>{catStats.fail} fail</span>
                    )}
                    {catStats.pending > 0 && (
                      <span style={{ color: colors.textMuted }}>{catStats.pending} pending</span>
                    )}
                  </div>
                  <span style={{ color: colors.textMuted, fontSize: '18px' }}>
                    {isExpanded ? '−' : '+'}
                  </span>
                </div>
              </button>

              {/* Tests List */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${colors.border}` }}>
                  {category.tests.map((test, idx) => (
                    <div
                      key={test.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: idx < category.tests.length - 1 ? `1px solid ${colors.border}` : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: colors.text }}>
                            {test.name}
                          </div>
                          <div style={{ fontSize: '12px', color: colors.textMuted, marginTop: '2px' }}>
                            {test.description}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {(['pass', 'fail', 'skip', 'pending'] as TestStatus[]).map(status => (
                            <button type="button"
                              key={status}
                              onClick={() => updateTestStatus(category.id, test.id, status)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 500,
                                borderRadius: '4px',
                                border: test.status === status ? 'none' : `1px solid ${colors.border}`,
                                backgroundColor: test.status === status ? statusColors[status] : 'transparent',
                                color: test.status === status ? 'white' : colors.textMuted,
                                cursor: 'pointer',
                              }}
                            >
                              {statusLabels[status]}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Notes input */}
                      {test.status === 'fail' && (
                        <input
                          type="text"
                          placeholder="Add failure notes..."
                          value={test.notes || ''}
                          onChange={(e) => updateTestNotes(category.id, test.id, e.target.value)}
                          style={{
                            padding: '8px 10px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            border: `1px solid ${colors.border}`,
                            backgroundColor: colors.bg,
                            color: colors.text,
                            width: '100%',
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Links */}
      <div style={{
        marginTop: '32px',
        padding: '16px',
        backgroundColor: colors.card,
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: colors.text }}>
          Quick Links for Testing
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Link href="/admin/skit-generator" style={{ padding: '6px 12px', backgroundColor: colors.surface2, borderRadius: '4px', fontSize: '12px', color: colors.text, textDecoration: 'none' }}>
            Skit Generator
          </Link>
          <Link href="/admin/skit-library" style={{ padding: '6px 12px', backgroundColor: colors.surface2, borderRadius: '4px', fontSize: '12px', color: colors.text, textDecoration: 'none' }}>
            Script Library
          </Link>
          <Link href="/admin/pipeline" style={{ padding: '6px 12px', backgroundColor: colors.surface2, borderRadius: '4px', fontSize: '12px', color: colors.text, textDecoration: 'none' }}>
            Video Pipeline
          </Link>
          <Link href="/admin/products" style={{ padding: '6px 12px', backgroundColor: colors.surface2, borderRadius: '4px', fontSize: '12px', color: colors.text, textDecoration: 'none' }}>
            Products
          </Link>
          <Link href="/admin/recorder" style={{ padding: '6px 12px', backgroundColor: colors.surface2, borderRadius: '4px', fontSize: '12px', color: colors.text, textDecoration: 'none' }}>
            Recorder
          </Link>
          <Link href="/admin/editor" style={{ padding: '6px 12px', backgroundColor: colors.surface2, borderRadius: '4px', fontSize: '12px', color: colors.text, textDecoration: 'none' }}>
            Editor
          </Link>
        </div>
      </div>
    </div>
  );
}
