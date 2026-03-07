'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { useToast } from '@/contexts/ToastContext';
import Link from 'next/link';
import {
  Loader2, ExternalLink, Video, FileText, FolderOpen, ChevronDown,
  Mic, Scissors, CheckCircle2, Send, Archive,
} from 'lucide-react';
import type { ContentItem, ContentItemStatus } from '@/lib/content-items/types';
import { getNextAction, getActionButtonClasses } from '@/lib/content-items/nextAction';
import DriveFolderButton from '@/components/DriveFolderButton';

// ── Status config (Monday.com-style) ─────────────────────────────

const STATUS_ORDER: ContentItemStatus[] = [
  'briefing',
  'scripted',
  'ready_to_record',
  'recorded',
  'editing',
  'scheduled',
  'ready_to_post',
  'posted',
];

const STATUS_CONFIG: Record<ContentItemStatus, { label: string; emoji: string; color: string; bg: string; icon: typeof FileText }> = {
  briefing:         { label: 'Briefing',         emoji: '📝', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', icon: FileText },
  scripted:         { label: 'Scripted',         emoji: '📄', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', icon: FileText },
  ready_to_record:  { label: 'Ready to Record',  emoji: '🎙️', color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',   icon: Mic },
  recorded:         { label: 'Recorded',          emoji: '✅', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  editing:          { label: 'Editing',           emoji: '✂️', color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20', icon: Scissors },
  scheduled:        { label: 'Scheduled',         emoji: '📅', color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/20',   icon: Send },
  ready_to_post:    { label: 'Ready to Post',     emoji: '🚀', color: 'text-teal-400',   bg: 'bg-teal-500/10 border-teal-500/20',   icon: Send },
  posted:           { label: 'Posted',            emoji: '🟢', color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20', icon: Archive },
};

// ── Extended content item with joined names ───────────────────────

interface ContentItemRow extends ContentItem {
  brands?: { name: string } | null;
  products?: { name: string } | null;
}

// ── Component props ───────────────────────────────────────────────

interface ContentBoardProps {
  onOpenPanel: (id: string) => void;
  onOpenRecordingKit: (id: string) => void;
}

// ── Filters ───────────────────────────────────────────────────────

export default function ContentBoard({ onOpenPanel, onOpenRecordingKit }: ContentBoardProps) {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { showToast } = useToast();

  const [items, setItems] = useState<ContentItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandFilter, setBrandFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    posted: true,
  });

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams({ view: 'board', limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      if (brandFilter) params.set('brand_id', brandFilter);
      if (productFilter) params.set('product_id', productFilter);

      const res = await fetch(`/api/content-items?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [statusFilter, brandFilter, productFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Extract unique brands and products from loaded data
  const uniqueBrands = Array.from(new Set(items.filter(i => i.brands?.name).map(i => JSON.stringify({ id: i.brand_id, name: i.brands!.name }))));
  const uniqueProducts = Array.from(new Set(items.filter(i => i.products?.name).map(i => JSON.stringify({ id: i.product_id, name: i.products!.name }))));

  // Group items by status
  const grouped: Record<string, ContentItemRow[]> = {};
  for (const status of STATUS_ORDER) {
    grouped[status] = [];
  }
  for (const item of items) {
    if (grouped[item.status]) {
      grouped[item.status].push(item);
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleAdvance = async (item: ContentItemRow) => {
    const nextStatus: Record<string, string> = {
      briefing: 'ready_to_record',
      ready_to_record: 'recorded',
      recorded: 'editing',
      editing: 'ready_to_post',
      ready_to_post: 'posted',
    };
    const target = nextStatus[item.status];
    if (!target) return;

    try {
      const res = await fetch(`/api/content-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target }),
      });
      const json = await res.json();
      if (json.ok) {
        showToast({ message: `Moved to ${STATUS_CONFIG[target as ContentItemStatus]?.label || target}`, type: 'success' });
        fetchItems();
      } else {
        showToast({ message: json.error || 'Failed to update', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
        <p className="text-zinc-400 text-sm">No content items yet.</p>
        <p className="text-zinc-500 text-xs mt-1">Create content items to track them through the pipeline.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border transition-colors"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }}
        >
          <option value="">All Statuses</option>
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border transition-colors"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }}
        >
          <option value="">All Brands</option>
          {uniqueBrands.map(b => {
            const parsed = JSON.parse(b) as { id: string; name: string };
            return <option key={parsed.id} value={parsed.id}>{parsed.name}</option>;
          })}
        </select>
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border transition-colors"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }}
        >
          <option value="">All Products</option>
          {uniqueProducts.map(p => {
            const parsed = JSON.parse(p) as { id: string; name: string };
            return <option key={parsed.id} value={parsed.id}>{parsed.name}</option>;
          })}
        </select>
        <span className="text-xs self-center ml-auto" style={{ color: colors.textMuted }}>
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Status groups */}
      {STATUS_ORDER.map(status => {
        const group = grouped[status];
        const config = STATUS_CONFIG[status];
        const isCollapsed = collapsedGroups[status];

        if (group.length === 0 && status === 'posted') return null;

        return (
          <div key={status} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
            {/* Group header */}
            <button
              onClick={() => setCollapsedGroups(prev => ({ ...prev, [status]: !prev[status] }))}
              className={`w-full flex items-center gap-2 px-4 py-2.5 ${config.bg} hover:brightness-110 transition-all border-none cursor-pointer text-left`}
            >
              <span className="text-base">{config.emoji}</span>
              <span className={`font-semibold text-sm ${config.color}`}>{config.label}</span>
              <span className="text-xs text-zinc-500 bg-zinc-800/50 rounded-full px-2 py-0.5">
                {group.length}
              </span>
              <ChevronDown className={`w-4 h-4 ml-auto text-zinc-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
            </button>

            {/* Mobile Cards */}
            {!isCollapsed && group.length > 0 && (
              <div className="lg:hidden p-3 space-y-3">
                {group.map(item => {
                  const due = item.due_at ? new Date(item.due_at) : null;
                  const isOverdue = due && due < new Date();
                  const dueLabel = due
                    ? (() => {
                        const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
                        if (diffDays === 0) return 'Today';
                        if (diffDays === 1) return 'Tomorrow';
                        if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
                        if (diffDays <= 7) return `${diffDays}d`;
                        return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      })()
                    : null;

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl p-4 space-y-3"
                      style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
                      onClick={() => onOpenPanel(item.id)}
                    >
                      {/* Title */}
                      <p className="text-base font-medium line-clamp-1" style={{ color: colors.text }}>
                        {item.title}
                      </p>

                      {/* Meta row: product, due */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.products?.name && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.color} border`}>
                            {item.products.name}
                          </span>
                        )}
                        {dueLabel && (
                          <span className={`text-xs font-medium ${isOverdue ? 'text-red-400' : ''}`} style={isOverdue ? {} : { color: colors.textMuted }}>
                            Due {dueLabel}
                          </span>
                        )}
                        <span className="text-[10px] font-mono ml-auto" style={{ color: colors.textMuted }}>{item.short_id}</span>
                      </div>

                      {/* Primary CTA via getNextAction */}
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const action = getNextAction(item);
                          return (
                            <>
                              {action.href ? (
                                <a
                                  href={action.href}
                                  className={`flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-base font-semibold active:brightness-90 ${getActionButtonClasses(action.variant)}`}
                                >
                                  {action.label}
                                </a>
                              ) : action.onClickType === 'generate_brief' || action.onClickType === 'generate_editor_notes' || action.onClickType === 'mark_ready_to_post' ? (
                                <button
                                  onClick={() => handleAdvance(item)}
                                  className={`flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-base font-semibold active:brightness-90 ${getActionButtonClasses(action.variant)}`}
                                >
                                  {action.label}
                                </button>
                              ) : (
                                <button
                                  onClick={() => onOpenPanel(item.id)}
                                  className={`flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-base font-semibold active:brightness-90 ${getActionButtonClasses(action.variant)}`}
                                >
                                  {action.label}
                                </button>
                              )}
                              <DriveFolderButton
                                contentItemId={item.id}
                                driveFolderUrl={item.drive_folder_url}
                                compact
                                className="h-12 w-12 rounded-xl border border-zinc-700"
                              />
                            </>
                          );
                        })()}
                      </div>
                      <Link
                        href={`/admin/content-items/${item.id}`}
                        className="block text-center text-xs text-zinc-500 hover:text-zinc-300 transition py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Details
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Desktop Table */}
            {!isCollapsed && group.length > 0 && (
              <div className="overflow-x-auto hidden lg:block">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: colors.textMuted }}>Title</th>
                      <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: colors.textMuted }}>Brand</th>
                      <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: colors.textMuted }}>Product</th>
                      <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: colors.textMuted }}>Due</th>
                      <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: colors.textMuted }}>Next Step</th>
                      <th className="text-left px-4 py-2 font-medium text-xs" style={{ color: colors.textMuted }}>Links</th>
                      <th className="text-right px-4 py-2 font-medium text-xs" style={{ color: colors.textMuted }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map(item => (
                      <tr
                        key={item.id}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: `1px solid ${colors.border}` }}
                        onClick={() => onOpenPanel(item.id)}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.surface2; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/content-items/${item.id}`}
                            className="font-medium truncate max-w-[240px] block hover:underline"
                            style={{ color: colors.text }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.title}
                          </Link>
                          <div className="text-[10px] font-mono" style={{ color: colors.textMuted }}>{item.short_id}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: colors.textSecondary }}>
                          {item.brands?.name || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs truncate max-w-[150px]" style={{ color: colors.textSecondary }}>
                          {item.products?.name || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: item.due_at ? colors.textSecondary : colors.textMuted }}>
                          {formatDate(item.due_at)}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: colors.textSecondary }}>
                          {getNextAction(item).label}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <DriveFolderButton
                              contentItemId={item.id}
                              driveFolderUrl={item.drive_folder_url}
                              compact
                            />
                            {item.final_video_url && (
                              <a href={item.final_video_url} target="_blank" rel="noopener noreferrer"
                                className="text-green-400 hover:text-green-300"
                                title="Final video"
                              >
                                <Video size={14} />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const action = getNextAction(item);
                              if (action.href) {
                                return (
                                  <a
                                    href={action.href}
                                    className={`text-xs rounded px-2.5 py-1.5 font-medium transition-colors ${getActionButtonClasses(action.variant)}`}
                                  >
                                    {action.label}
                                  </a>
                                );
                              }
                              if (action.onClickType) {
                                return (
                                  <button
                                    onClick={() => handleAdvance(item)}
                                    className={`text-xs rounded px-2.5 py-1.5 font-medium transition-colors ${getActionButtonClasses(action.variant)}`}
                                  >
                                    {action.label}
                                  </button>
                                );
                              }
                              return null;
                            })()}
                            <button
                              onClick={() => onOpenPanel(item.id)}
                              className="text-xs rounded px-2 py-1.5 transition-colors"
                              style={{ backgroundColor: colors.surface2, border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = colors.text; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = colors.textSecondary; }}
                            >
                              Open
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Empty state for group */}
            {!isCollapsed && group.length === 0 && (
              <div className="px-4 py-4 text-xs text-center" style={{ color: colors.textMuted }}>
                No items in this stage
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
