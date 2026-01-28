'use client';

import { useState, useEffect, useCallback } from 'react';
import type { QueueVideo } from '../types';
import { getStatusBadgeColor, getSlaColor, getPrimaryAction, getReadinessIndicators } from '../types';
import { formatDateString, getTimeAgo, useHydrated } from '@/lib/useHydrated';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
}

interface PostingAccount {
  id: string;
  display_name: string;
  account_code: string;
  platform: string;
  is_active: boolean;
}

interface VideoDrawerProps {
  video: QueueVideo;
  simpleMode: boolean;
  activeUser: string;
  isAdmin: boolean;
  onClose: () => void;
  onClaimVideo: (videoId: string) => Promise<void>;
  onReleaseVideo: (videoId: string) => Promise<void>;
  onExecuteTransition: (videoId: string, targetStatus: string) => Promise<void>;
  onOpenAttachModal: (video: QueueVideo) => void;
  onOpenPostModal: (video: QueueVideo) => void;
  onOpenHandoffModal?: (video: QueueVideo) => void;
  onRefresh: () => void;
  /** Called after completing primary action to advance to next item */
  onAdvanceToNext?: () => void;
}

interface VideoDetails {
  video: {
    id: string;
    brand_name: string | null;
    product_name: string | null;
    product_sku: string | null;
    account_name: string | null;
    account_platform: string | null;
    google_drive_url: string | null;
    final_video_url: string | null;
    posted_url: string | null;
    created_at: string;
    last_status_changed_at: string | null;
  };
  brief: {
    concept_id: string;
    title: string | null;
    angle: string | null;
    hypothesis: string | null;
    proof_type: string | null;
    hook_options: string[] | null;
    notes: string | null;
    // Hook Package fields
    visual_hook: string | null;
    on_screen_text_hook: string | null;
    on_screen_text_mid: string[] | null;
    on_screen_text_cta: string | null;
    hook_type: string | null;
  } | null;
  script: {
    text: string;
    version: number;
    locked: boolean;
  } | null;
  assets: {
    raw_footage_url: string | null;
    final_mp4_url: string | null;
    thumbnail_url: string | null;
    google_drive_url: string | null;
    screenshots: string[];
  };
  events: {
    id: string;
    event_type: string;
    from_status: string | null;
    to_status: string | null;
    actor: string;
    details: Record<string, unknown> | null;
    created_at: string;
  }[];
}

type TabType = 'brief' | 'script' | 'assets' | 'activity' | 'chat';

export default function VideoDrawer({
  video,
  simpleMode,
  activeUser,
  isAdmin,
  onClose,
  onClaimVideo,
  onReleaseVideo,
  onExecuteTransition,
  onOpenAttachModal,
  onOpenPostModal,
  onOpenHandoffModal,
  onRefresh,
  onAdvanceToNext,
}: VideoDrawerProps) {
  const hydrated = useHydrated();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('brief');
  const [details, setDetails] = useState<VideoDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  // Brand/Product mapping state
  const [products, setProducts] = useState<Product[]>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [mappingSaving, setMappingSaving] = useState(false);

  // Admin Edit Mode state
  const [editMode, setEditMode] = useState(false);
  const [editDriveUrl, setEditDriveUrl] = useState('');
  const [editRawFootageUrl, setEditRawFootageUrl] = useState('');
  const [editAssetsUrl, setEditAssetsUrl] = useState('');
  const [editFinalUrl, setEditFinalUrl] = useState('');
  const [editSpokenHook, setEditSpokenHook] = useState('');
  const [editVisualHook, setEditVisualHook] = useState('');
  const [editTextHook, setEditTextHook] = useState('');
  const [editAngle, setEditAngle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editScript, setEditScript] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Posting accounts state (for admin edit)
  const [postingAccounts, setPostingAccounts] = useState<PostingAccount[]>([]);
  const [editPostingAccountId, setEditPostingAccountId] = useState<string>('');

  const statusColors = getStatusBadgeColor(video.recording_status);
  const slaColors = getSlaColor(video.sla_status);
  const primaryAction = getPrimaryAction(video);
  const readiness = getReadinessIndicators(video);

  const isClaimedByMe = video.claimed_by === activeUser;
  const isClaimedByOther = !!(video.claimed_by && video.claimed_by !== activeUser &&
    (!video.claim_expires_at || new Date(video.claim_expires_at) > new Date()));
  const isUnclaimed = !video.claimed_by || !!(video.claim_expires_at && new Date(video.claim_expires_at) <= new Date());

  // Fetch detailed info
  const fetchDetails = useCallback(async () => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/videos/${video.id}/details`);
      const data = await res.json();
      if (data.ok) {
        setDetails(data);
      }
    } catch (err) {
      console.error('Failed to fetch video details:', err);
    } finally {
      setDetailsLoading(false);
    }
  }, [video.id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Fetch posting accounts for admin edit
  useEffect(() => {
    if (isAdmin) {
      fetch('/api/posting-accounts')
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            setPostingAccounts(data.data || []);
          }
        })
        .catch(err => console.error('Failed to fetch posting accounts:', err));
    }
  }, [isAdmin]);

  // Initialize posting account when video loads
  useEffect(() => {
    if (video.posting_account_id) {
      setEditPostingAccountId(video.posting_account_id);
    }
  }, [video.posting_account_id]);

  // Initialize edit fields when details load
  useEffect(() => {
    if (details) {
      setEditDriveUrl(details.assets?.google_drive_url || video.google_drive_url || '');
      setEditRawFootageUrl(details.assets?.raw_footage_url || '');
      setEditFinalUrl(details.assets?.final_mp4_url || video.final_video_url || '');
      setEditSpokenHook(details.brief?.hook_options?.[0] || '');
      setEditVisualHook(details.brief?.visual_hook || '');
      setEditTextHook(details.brief?.on_screen_text_hook || '');
      setEditAngle(details.brief?.angle || '');
      setEditNotes(details.brief?.notes || '');
      setEditScript(details.script?.text || video.script_locked_text || '');
    }
  }, [details, video]);

  // Save edits function
  const saveEdits = async (field: string, value: string | string[]) => {
    setEditSaving(true);
    try {
      // Determine which endpoint to call based on field
      if (['google_drive_url', 'raw_footage_url', 'assets_url', 'final_video_url', 'script_locked_text', 'posting_account_id'].includes(field)) {
        // Video fields
        const res = await fetch(`/api/videos/${video.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });
        if (res.ok) {
          setSavedToast(`Saved ${field.replace(/_/g, ' ')}`);
          setTimeout(() => setSavedToast(null), 2000);
          onRefresh();
          fetchDetails();
        }
      } else if (details?.brief?.concept_id) {
        // Concept/brief fields
        const res = await fetch(`/api/concepts/${details.brief.concept_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });
        if (res.ok) {
          setSavedToast(`Saved ${field.replace(/_/g, ' ')}`);
          setTimeout(() => setSavedToast(null), 2000);
          fetchDetails();
        }
      }
    } catch (err) {
      console.error('Failed to save edit:', err);
    } finally {
      setEditSaving(false);
    }
  };

  // AI Chat function
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const context = {
        brand: video.brand_name || details?.video.brand_name || '',
        product: video.product_name || details?.video.product_name || '',
        current_script: video.script_locked_text || details?.script?.text || '',
        spoken_hook: details?.brief?.hook_options?.[0] || '',
        visual_hook: details?.brief?.visual_hook || '',
        angle: details?.brief?.angle || '',
      };

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context,
          video_id: video.id,
        }),
      });

      const data = await res.json();
      if (data.ok && data.response) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I could not process that request.' }]);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to AI service.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Fetch products for mapping (only when mapping is shown)
  useEffect(() => {
    if (!showMapping) return;
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.ok) {
          setProducts(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch products:', err);
      }
    };
    fetchProducts();
  }, [showMapping]);

  // Check if brand/product mapping is missing
  const isMappingMissing = !video.brand_name && !video.product_sku && !details?.video.brand_name && !details?.video.product_sku;

  // Get unique brands from products
  const brands = Array.from(new Set(products.map(p => p.brand))).sort();

  // Filter products by selected brand
  const filteredProducts = selectedBrand
    ? products.filter(p => p.brand === selectedBrand)
    : [];

  // Save mapping
  const saveMapping = async () => {
    if (!selectedProductId) return;
    setMappingSaving(true);
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: selectedProductId }),
      });
      if (res.ok) {
        setShowMapping(false);
        onRefresh();
        fetchDetails();
      }
    } catch (err) {
      console.error('Failed to save mapping:', err);
    } finally {
      setMappingSaving(false);
    }
  };

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Save script and hooks to library when approving
  const saveToLibrary = async () => {
    const brandName = video.brand_name || details?.video.brand_name;
    if (!brandName) return;

    const scriptText = video.script_locked_text || details?.script?.text;
    const spokenHook = details?.brief?.hook_options?.[0];
    const visualHook = details?.brief?.visual_hook;
    const textHook = details?.brief?.on_screen_text_hook;
    const hookFamily = details?.brief?.hook_type;

    let savedItems: string[] = [];

    // Save script to library
    if (scriptText) {
      try {
        const res = await fetch('/api/scripts/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_id: video.id,
            product_id: video.product_id,
            brand_name: brandName,
            concept_id: details?.brief?.concept_id,
            script_text: scriptText,
            hook_spoken: spokenHook,
            hook_visual: visualHook,
            hook_text: textHook,
            hook_family: hookFamily,
            approved_by: activeUser,
          }),
        });
        if (res.ok) {
          savedItems.push('script');
        }
      } catch (err) {
        console.error('Failed to save script to library:', err);
      }
    }

    // Save hooks as proven
    const hooksToSave: { type: 'spoken' | 'visual' | 'text'; text: string }[] = [];
    if (spokenHook) hooksToSave.push({ type: 'spoken', text: spokenHook });
    if (visualHook) hooksToSave.push({ type: 'visual', text: visualHook });
    if (textHook) hooksToSave.push({ type: 'text', text: textHook });

    for (const hook of hooksToSave) {
      try {
        const res = await fetch('/api/hooks/proven', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand_name: brandName,
            product_id: video.product_id,
            hook_type: hook.type,
            hook_text: hook.text,
            hook_family: hookFamily,
            source_video_id: video.id,
            increment_field: 'approved_count',
            approved_by: activeUser,
          }),
        });
        if (res.ok) {
          savedItems.push(`${hook.type} hook`);
        }
      } catch (err) {
        console.error(`Failed to save ${hook.type} hook:`, err);
      }
    }

    // Show toast with what was saved
    if (savedItems.length > 0) {
      setSavedToast(`Saved to library: ${savedItems.join(', ')}`);
      setTimeout(() => setSavedToast(null), 3000);
    }
  };

  const handlePrimaryAction = async () => {
    setLoading(true);
    try {
      // Auto-assign if video is available (not assigned to anyone)
      if (isUnclaimed && primaryAction.type !== 'done') {
        await onClaimVideo(video.id);
      }

      let shouldAdvance = false;

      switch (primaryAction.type) {
        case 'add_script':
          onOpenAttachModal(video);
          break;
        case 'record':
          await onExecuteTransition(video.id, 'RECORDED');
          onRefresh();
          shouldAdvance = true;
          break;
        case 'upload_edit':
          await onExecuteTransition(video.id, 'EDITED');
          onRefresh();
          shouldAdvance = true;
          break;
        case 'approve':
          // Auto-save script and hooks to library before transitioning
          await saveToLibrary();
          await onExecuteTransition(video.id, 'READY_TO_POST');
          onRefresh();
          shouldAdvance = true;
          break;
        case 'post':
          onOpenPostModal(video);
          break;
        default:
          break;
      }

      // Auto-advance to next task after completing an action
      if (shouldAdvance && onAdvanceToNext) {
        // Small delay so user sees the action complete
        setTimeout(() => {
          onAdvanceToNext();
        }, 500);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    setLoading(true);
    try {
      await onClaimVideo(video.id);
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async () => {
    setLoading(true);
    try {
      await onReleaseVideo(video.id);
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await onExecuteTransition(video.id, 'REJECTED');
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  // Extract hook from script (first line or first sentence)
  const extractHook = (scriptText: string) => {
    const lines = scriptText.split('\n');
    const firstLine = lines[0]?.trim() || '';
    if (firstLine.length > 100) {
      return firstLine.slice(0, 100) + '...';
    }
    return firstLine;
  };

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'brief', label: 'Brief', icon: '📋' },
    { key: 'script', label: 'Script', icon: '📝' },
    { key: 'assets', label: 'Assets', icon: '📁' },
    { key: 'chat', label: 'AI Chat', icon: '💬' },
    { key: 'activity', label: 'Activity', icon: '📊' },
  ];

  return (
    <>
      {/* Success Toast */}
      {savedToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            backgroundColor: '#2b8a3e',
            color: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <span>✓</span>
          {savedToast}
        </div>
      )}

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: simpleMode ? '380px' : '480px',
          backgroundColor: 'white',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#f8f9fa',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              {/* Video Code with copy + Copy Pack */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: video.video_code ? '14px' : '13px',
                  fontWeight: video.video_code ? 'bold' : 'normal',
                  color: '#212529',
                }}>
                  {video.video_code || video.id.slice(0, 12) + '...'}
                </span>
                <button
                  onClick={() => copyToClipboard(video.video_code || video.id, 'videoCode')}
                  style={{
                    padding: '2px 6px',
                    fontSize: '10px',
                    backgroundColor: copiedField === 'videoCode' ? '#d3f9d8' : '#e9ecef',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    color: copiedField === 'videoCode' ? '#2b8a3e' : '#495057',
                  }}
                >
                  {copiedField === 'videoCode' ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => {
                    const brand = video.brand_name || details?.video.brand_name || '';
                    const product = video.product_name || details?.video.product_name || '';
                    const spokenHook = details?.brief?.hook_options?.[0] || '';
                    const visualHook = details?.brief?.visual_hook || '';
                    const textHook = details?.brief?.on_screen_text_hook || '';
                    const script = details?.script?.text || video.script_locked_text || '';
                    const driveUrl = details?.assets?.google_drive_url || video.google_drive_url || '';

                    const pack = [
                      `Video Code: ${video.video_code || video.id.slice(0, 12)}`,
                      `Brand: ${brand}`,
                      `Product: ${product}`,
                      spokenHook ? `Spoken Hook: ${spokenHook}` : null,
                      visualHook ? `Visual Hook: ${visualHook}` : null,
                      textHook ? `Text Hook: ${textHook}` : null,
                      script ? `\nScript:\n${script}` : null,
                      driveUrl ? `\nDrive: ${driveUrl}` : null,
                    ].filter(Boolean).join('\n');

                    navigator.clipboard.writeText(pack);
                    setCopiedField('copyPack');
                    setTimeout(() => setCopiedField(null), 2000);
                  }}
                  style={{
                    padding: '2px 8px',
                    fontSize: '10px',
                    backgroundColor: copiedField === 'copyPack' ? '#d3f9d8' : '#e7f5ff',
                    border: '1px solid #74c0fc',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    color: copiedField === 'copyPack' ? '#2b8a3e' : '#1971c2',
                    fontWeight: 'bold',
                  }}
                  title="Copy all essentials: code, brand, hooks, script, drive link"
                >
                  {copiedField === 'copyPack' ? 'Copied!' : '📋 Copy Pack'}
                </button>
                {video.video_code && (
                  <span style={{ fontSize: '10px', color: '#868e96' }} title={video.id}>
                    ID: {video.id.slice(0, 8)}
                  </span>
                )}
              </div>

              {/* Badges row */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Brand badge */}
                {(video.brand_name || details?.video.brand_name) && (
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#e7f5ff',
                    color: '#1971c2',
                    fontSize: '11px',
                    fontWeight: 'bold',
                  }}>
                    {video.brand_name || details?.video.brand_name}
                  </span>
                )}
                {/* SKU badge */}
                {(video.product_sku || details?.video.product_sku) && (
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#f8f9fa',
                    color: '#495057',
                    fontSize: '11px',
                    border: '1px solid #dee2e6',
                  }}>
                    {video.product_sku || details?.video.product_sku}
                  </span>
                )}
                {/* Posting Account badge/select */}
                {editMode && isAdmin ? (
                  <select
                    value={editPostingAccountId}
                    onChange={(e) => {
                      setEditPostingAccountId(e.target.value);
                      saveEdits('posting_account_id', e.target.value || '');
                    }}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      backgroundColor: '#fff3bf',
                      border: '1px solid #ffd43b',
                      borderRadius: '4px',
                      color: '#e67700',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">No Account</option>
                    {postingAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.display_name}</option>
                    ))}
                  </select>
                ) : (video.posting_account_name || video.posting_account_code) ? (
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#fff3bf',
                    color: '#e67700',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    border: '1px solid #ffd43b',
                  }}>
                    {video.posting_account_name || video.posting_account_code}
                  </span>
                ) : null}
                {/* Status badge */}
                <span style={{
                  padding: '3px 8px',
                  borderRadius: '12px',
                  backgroundColor: statusColors.badge,
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 'bold',
                }}>
                  {(video.recording_status || 'NOT_RECORDED').replace(/_/g, ' ')}
                </span>
                {/* SLA badge */}
                <span style={{
                  padding: '3px 6px',
                  borderRadius: '4px',
                  backgroundColor: slaColors.bg,
                  color: slaColors.text,
                  border: `1px solid ${slaColors.border}`,
                  fontSize: '9px',
                  fontWeight: 'bold',
                }}>
                  {video.sla_status === 'overdue' ? 'OVERDUE' : video.sla_status === 'due_soon' ? 'DUE SOON' : 'ON TRACK'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Admin Edit Mode Toggle */}
              {isAdmin && (
                <button
                  onClick={() => setEditMode(!editMode)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    backgroundColor: editMode ? '#228be6' : '#e9ecef',
                    color: editMode ? 'white' : '#495057',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {editMode ? '✓ Edit Mode' : 'Edit'}
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '0',
                  lineHeight: 1,
                }}
              >
                x
              </button>
            </div>
          </div>

          {/* Next Action Section */}
          <div style={{
            padding: '12px',
            backgroundColor: '#e7f5ff',
            borderRadius: '8px',
            border: '1px solid #74c0fc',
          }}>
            <div style={{ fontSize: '10px', color: '#1971c2', marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              Next Step
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#212529' }}>
                {primaryAction.icon} {primaryAction.label}
              </span>
              <button
                onClick={handlePrimaryAction}
                disabled={loading || primaryAction.type === 'done' || isClaimedByOther}
                style={{
                  padding: '8px 16px',
                  backgroundColor: loading || primaryAction.type === 'done' || isClaimedByOther ? '#ccc' : primaryAction.color,
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading || primaryAction.type === 'done' || isClaimedByOther ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                }}
              >
                {loading ? '...' : isClaimedByOther ? `🔒 Locked` : primaryAction.label}
              </button>
            </div>
            {video.blocked_reason && (
              <div style={{
                marginTop: '8px',
                padding: '6px 8px',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#856404',
              }}>
                {video.blocked_reason}
              </div>
            )}
          </div>
        </div>

        {/* Quick Info Section - Always visible above tabs */}
        {!detailsLoading && (
          <div style={{
            padding: '12px 20px',
            backgroundColor: isDark ? colors.bgSecondary : '#fafbfc',
            borderBottom: `1px solid ${colors.border}`,
          }}>
            {/* Brand/Product Mapping - Show warning if missing */}
            {isMappingMissing && !showMapping && (
              <div
                onClick={() => setShowMapping(true)}
                style={{
                  marginBottom: '12px',
                  padding: '10px 12px',
                  backgroundColor: isDark ? '#4a3000' : '#fff3cd',
                  border: `1px solid ${isDark ? '#6b4400' : '#ffc107'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>⚠️</span>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: isDark ? '#ffc107' : '#856404' }}>
                    Add Brand / Product
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: isDark ? '#ffc107' : '#856404' }}>Click to map →</span>
              </div>
            )}

            {/* Mapping Editor */}
            {showMapping && (
              <div style={{
                marginBottom: '12px',
                padding: '12px',
                backgroundColor: isDark ? colors.bgTertiary : '#e7f5ff',
                border: `1px solid ${isDark ? '#2d5a87' : '#74c0fc'}`,
                borderRadius: '6px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: isDark ? '#74c0fc' : '#1971c2', marginBottom: '10px', textTransform: 'uppercase' }}>
                  Map Brand & Product
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <select
                    value={selectedBrand}
                    onChange={(e) => {
                      setSelectedBrand(e.target.value);
                      setSelectedProductId('');
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: `1px solid ${colors.inputBorder}`,
                      backgroundColor: colors.input,
                      color: colors.text,
                      fontSize: '13px',
                    }}
                  >
                    <option value="">Select Brand...</option>
                    {brands.map(brand => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    disabled={!selectedBrand}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: `1px solid ${colors.inputBorder}`,
                      backgroundColor: colors.input,
                      color: colors.text,
                      fontSize: '13px',
                      opacity: selectedBrand ? 1 : 0.5,
                    }}
                  >
                    <option value="">{selectedBrand ? 'Select Product...' : 'Select brand first'}</option>
                    {filteredProducts.map(product => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setShowMapping(false)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: colors.bgSecondary,
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveMapping}
                    disabled={!selectedProductId || mappingSaving}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: selectedProductId && !mappingSaving ? '#228be6' : colors.bgTertiary,
                      color: selectedProductId && !mappingSaving ? 'white' : colors.textMuted,
                      border: 'none',
                      borderRadius: '4px',
                      cursor: selectedProductId && !mappingSaving ? 'pointer' : 'not-allowed',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {mappingSaving ? 'Saving...' : 'Save Mapping'}
                  </button>
                </div>
              </div>
            )}

            {/* Hook Package - key info for recorders/editors */}
            {details?.brief && ((details.brief.hook_options && details.brief.hook_options.length > 0) || details.brief.visual_hook || details.brief.on_screen_text_hook) && (
              <div style={{
                marginBottom: '12px',
                padding: '10px',
                backgroundColor: isDark ? '#1a3a2f' : '#d3f9d8',
                borderRadius: '6px',
                border: `1px solid ${isDark ? '#2d5a47' : '#69db7c'}`,
              }}>
                <div style={{ fontSize: '10px', color: isDark ? '#69db7c' : '#2b8a3e', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold' }}>
                  Hook Package {details.brief.hook_type && <span style={{ fontWeight: 'normal', textTransform: 'none' }}>({details.brief.hook_type.replace(/_/g, ' ')})</span>}
                </div>

                {/* Spoken Hook */}
                {details.brief.hook_options && details.brief.hook_options.length > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '9px', color: isDark ? '#adb5bd' : '#868e96', marginBottom: '2px' }}>SPOKEN HOOK</div>
                    <div style={{
                      padding: '6px 8px',
                      backgroundColor: isDark ? '#2d5a47' : '#fff3bf',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: isDark ? '#fff' : '#495057',
                      fontWeight: '500',
                    }}>
                      {details.brief.hook_options[0]}
                    </div>
                  </div>
                )}

                {/* Visual Hook */}
                {details.brief.visual_hook && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '9px', color: isDark ? '#adb5bd' : '#868e96', marginBottom: '2px' }}>VISUAL HOOK</div>
                    <div style={{
                      padding: '6px 8px',
                      backgroundColor: isDark ? '#2d3a4f' : '#e7f5ff',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: isDark ? '#74c0fc' : '#1971c2',
                    }}>
                      {details.brief.visual_hook}
                    </div>
                  </div>
                )}

                {/* On-Screen Text Hook */}
                {details.brief.on_screen_text_hook && (
                  <div>
                    <div style={{ fontSize: '9px', color: isDark ? '#adb5bd' : '#868e96', marginBottom: '2px' }}>ON-SCREEN TEXT</div>
                    <div style={{
                      padding: '6px 8px',
                      backgroundColor: isDark ? '#3d2a4f' : '#f3f0ff',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: isDark ? '#b197fc' : '#7048e8',
                    }}>
                      {details.brief.on_screen_text_hook}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick info row: Angle + Proof Type + Drive link */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {details?.brief?.angle && (
                <span style={{
                  padding: '4px 8px',
                  backgroundColor: '#e7f5ff',
                  color: '#1971c2',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}>
                  {details.brief.angle.length > 30 ? details.brief.angle.slice(0, 30) + '...' : details.brief.angle}
                </span>
              )}
              {details?.brief?.proof_type && (
                <span style={{
                  padding: '4px 8px',
                  backgroundColor: '#f3f0ff',
                  color: '#7048e8',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}>
                  {details.brief.proof_type}
                </span>
              )}
              {(video.google_drive_url || details?.assets.google_drive_url) && (
                <a
                  href={video.google_drive_url || details?.assets.google_drive_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    backgroundColor: '#fff9db',
                    color: '#e67700',
                    borderRadius: '4px',
                    fontSize: '11px',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                  }}
                >
                  📁 Drive Folder
                </a>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e0e0e0',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 'none',
                borderBottom: activeTab === tab.key ? '3px solid #228be6' : '3px solid transparent',
                backgroundColor: activeTab === tab.key ? '#f8f9fa' : 'transparent',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: activeTab === tab.key ? 'bold' : 'normal',
                color: activeTab === tab.key ? '#228be6' : '#495057',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <span>{tab.icon}</span>
              {!simpleMode && <span>{tab.label}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {detailsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#868e96' }}>
              Loading details...
            </div>
          ) : (
            <>
              {/* Brief Tab */}
              {activeTab === 'brief' && (
                <div>
                  {details?.brief ? (
                    <>
                      {/* Hook Package Section */}
                      {((details.brief.hook_options && details.brief.hook_options.length > 0) || details.brief.visual_hook || details.brief.on_screen_text_hook) && (
                        <div style={{
                          marginBottom: '16px',
                          padding: '12px',
                          backgroundColor: isDark ? '#1a3a2f' : '#d3f9d8',
                          borderRadius: '8px',
                          border: `1px solid ${isDark ? '#2d5a47' : '#69db7c'}`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, fontSize: '12px', color: isDark ? '#69db7c' : '#2b8a3e', textTransform: 'uppercase' }}>
                              Hook Package {details.brief.hook_type && <span style={{ fontWeight: 'normal', textTransform: 'none' }}>({details.brief.hook_type.replace(/_/g, ' ')})</span>}
                            </h4>
                            <button
                              onClick={() => {
                                const hookText = [
                                  details.brief?.hook_options?.[0] ? `Spoken: ${details.brief.hook_options[0]}` : '',
                                  details.brief?.visual_hook ? `Visual: ${details.brief.visual_hook}` : '',
                                  details.brief?.on_screen_text_hook ? `Text Hook: ${details.brief.on_screen_text_hook}` : '',
                                  details.brief?.on_screen_text_cta ? `CTA: ${details.brief.on_screen_text_cta}` : '',
                                ].filter(Boolean).join('\n');
                                copyToClipboard(hookText, 'hookPackage');
                              }}
                              style={{
                                padding: '2px 8px',
                                fontSize: '10px',
                                backgroundColor: copiedField === 'hookPackage' ? '#d3f9d8' : '#e9ecef',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                              }}
                            >
                              {copiedField === 'hookPackage' ? 'Copied!' : 'Copy All'}
                            </button>
                          </div>

                          {/* Spoken Hook */}
                          {(details.brief.hook_options && details.brief.hook_options.length > 0) || editMode ? (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '10px', color: isDark ? '#adb5bd' : '#868e96', marginBottom: '4px', fontWeight: 'bold' }}>SPOKEN HOOK</div>
                              {editMode ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input
                                    type="text"
                                    value={editSpokenHook}
                                    onChange={(e) => setEditSpokenHook(e.target.value)}
                                    style={{
                                      flex: 1,
                                      padding: '8px 10px',
                                      backgroundColor: colors.input,
                                      border: `1px solid ${colors.inputBorder}`,
                                      borderRadius: '4px',
                                      fontSize: '13px',
                                      color: colors.text,
                                    }}
                                    placeholder="Enter spoken hook..."
                                  />
                                  <button
                                    onClick={() => saveEdits('hook_options', [editSpokenHook])}
                                    disabled={editSaving}
                                    style={{
                                      padding: '8px 12px',
                                      backgroundColor: '#228be6',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: editSaving ? 'not-allowed' : 'pointer',
                                      fontSize: '11px',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <div style={{
                                  padding: '8px 10px',
                                  backgroundColor: isDark ? '#2d5a47' : '#fff3bf',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  color: isDark ? '#fff' : '#495057',
                                }}>
                                  {details.brief.hook_options?.[0] || 'No hook set'}
                                </div>
                              )}
                            </div>
                          ) : null}

                          {/* Visual Hook */}
                          {details.brief.visual_hook || editMode ? (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '10px', color: isDark ? '#adb5bd' : '#868e96', marginBottom: '4px', fontWeight: 'bold' }}>VISUAL HOOK (Opening Shot)</div>
                              {editMode ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input
                                    type="text"
                                    value={editVisualHook}
                                    onChange={(e) => setEditVisualHook(e.target.value)}
                                    style={{
                                      flex: 1,
                                      padding: '8px 10px',
                                      backgroundColor: colors.input,
                                      border: `1px solid ${colors.inputBorder}`,
                                      borderRadius: '4px',
                                      fontSize: '13px',
                                      color: colors.text,
                                    }}
                                    placeholder="Enter visual hook..."
                                  />
                                  <button
                                    onClick={() => saveEdits('visual_hook', editVisualHook)}
                                    disabled={editSaving}
                                    style={{
                                      padding: '8px 12px',
                                      backgroundColor: '#228be6',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: editSaving ? 'not-allowed' : 'pointer',
                                      fontSize: '11px',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <div style={{
                                  padding: '8px 10px',
                                  backgroundColor: isDark ? '#2d3a4f' : '#e7f5ff',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  color: isDark ? '#74c0fc' : '#1971c2',
                                }}>
                                  {details.brief.visual_hook}
                                </div>
                              )}
                            </div>
                          ) : null}

                          {/* On-Screen Text Hook */}
                          {details.brief.on_screen_text_hook || editMode ? (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '10px', color: isDark ? '#adb5bd' : '#868e96', marginBottom: '4px', fontWeight: 'bold' }}>ON-SCREEN TEXT HOOK</div>
                              {editMode ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input
                                    type="text"
                                    value={editTextHook}
                                    onChange={(e) => setEditTextHook(e.target.value)}
                                    style={{
                                      flex: 1,
                                      padding: '8px 10px',
                                      backgroundColor: colors.input,
                                      border: `1px solid ${colors.inputBorder}`,
                                      borderRadius: '4px',
                                      fontSize: '13px',
                                      color: colors.text,
                                    }}
                                    placeholder="Enter on-screen text hook..."
                                  />
                                  <button
                                    onClick={() => saveEdits('on_screen_text_hook', editTextHook)}
                                    disabled={editSaving}
                                    style={{
                                      padding: '8px 12px',
                                      backgroundColor: '#228be6',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: editSaving ? 'not-allowed' : 'pointer',
                                      fontSize: '11px',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <div style={{
                                  padding: '8px 10px',
                                  backgroundColor: isDark ? '#3d2a4f' : '#f3f0ff',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  color: isDark ? '#b197fc' : '#7048e8',
                                }}>
                                  {details.brief.on_screen_text_hook}
                                </div>
                              )}
                            </div>
                          ) : null}

                          {/* Mid-Video Overlays */}
                          {details.brief.on_screen_text_mid && details.brief.on_screen_text_mid.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '10px', color: isDark ? '#adb5bd' : '#868e96', marginBottom: '4px', fontWeight: 'bold' }}>MID-VIDEO OVERLAYS</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {details.brief.on_screen_text_mid.map((text, idx) => (
                                  <div key={idx} style={{
                                    padding: '6px 10px',
                                    backgroundColor: isDark ? colors.bgTertiary : '#f8f9fa',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    color: colors.text,
                                  }}>
                                    {idx + 1}. {text}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* CTA Overlay */}
                          {details.brief.on_screen_text_cta && (
                            <div>
                              <div style={{ fontSize: '10px', color: isDark ? '#adb5bd' : '#868e96', marginBottom: '4px', fontWeight: 'bold' }}>CTA OVERLAY</div>
                              <div style={{
                                padding: '8px 10px',
                                backgroundColor: isDark ? '#4a3000' : '#fff9db',
                                borderRadius: '4px',
                                fontSize: '13px',
                                fontWeight: 'bold',
                                color: isDark ? '#ffd43b' : '#e67700',
                              }}>
                                {details.brief.on_screen_text_cta}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Legacy Hook Options - show if multiple hooks and no hook package */}
                      {details.brief.hook_options && details.brief.hook_options.length > 1 && !details.brief.visual_hook && !details.brief.on_screen_text_hook && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <h4 style={{ margin: 0, fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Hook Options</h4>
                            <button
                              onClick={() => copyToClipboard(details.brief?.hook_options?.join('\n') || '', 'hooks')}
                              style={{
                                padding: '2px 8px',
                                fontSize: '10px',
                                backgroundColor: copiedField === 'hooks' ? '#d3f9d8' : '#e9ecef',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                              }}
                            >
                              {copiedField === 'hooks' ? 'Copied!' : 'Copy All'}
                            </button>
                          </div>
                          <div style={{ backgroundColor: '#f8f9fa', borderRadius: '6px', padding: '10px' }}>
                            {details.brief.hook_options.map((hook, idx) => (
                              <div key={idx} style={{
                                padding: '6px 0',
                                borderBottom: idx < details.brief!.hook_options!.length - 1 ? '1px solid #e9ecef' : 'none',
                                fontSize: '13px',
                              }}>
                                {idx + 1}. {hook}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Angle */}
                      {details.brief.angle || editMode ? (
                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Angle</h4>
                          {editMode ? (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input
                                type="text"
                                value={editAngle}
                                onChange={(e) => setEditAngle(e.target.value)}
                                style={{
                                  flex: 1,
                                  padding: '10px',
                                  backgroundColor: colors.input,
                                  border: `1px solid ${colors.inputBorder}`,
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  color: colors.text,
                                }}
                                placeholder="Enter angle..."
                              />
                              <button
                                onClick={() => saveEdits('angle', editAngle)}
                                disabled={editSaving}
                                style={{
                                  padding: '10px 14px',
                                  backgroundColor: '#228be6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: editSaving ? 'not-allowed' : 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                }}
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <div style={{ backgroundColor: '#f8f9fa', borderRadius: '6px', padding: '10px', fontSize: '13px' }}>
                              {details.brief.angle}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Notes/B-roll checklist */}
                      {details.brief.notes || editMode ? (
                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Notes / B-Roll Checklist</h4>
                          {editMode ? (
                            <div>
                              <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                style={{
                                  width: '100%',
                                  minHeight: '80px',
                                  padding: '10px',
                                  backgroundColor: colors.input,
                                  border: `1px solid ${colors.inputBorder}`,
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  color: colors.text,
                                  resize: 'vertical',
                                }}
                                placeholder="Enter notes..."
                              />
                              <button
                                onClick={() => saveEdits('notes', editNotes)}
                                disabled={editSaving}
                                style={{
                                  marginTop: '6px',
                                  padding: '8px 14px',
                                  backgroundColor: '#228be6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: editSaving ? 'not-allowed' : 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                }}
                              >
                                Save Notes
                              </button>
                            </div>
                          ) : (
                            <div style={{
                              backgroundColor: '#f8f9fa',
                              borderRadius: '6px',
                              padding: '10px',
                              fontSize: '13px',
                              whiteSpace: 'pre-wrap',
                            }}>
                              {details.brief.notes}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Proof Type */}
                      {details.brief.proof_type && (
                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Proof Type</h4>
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: '#e7f5ff',
                            borderRadius: '4px',
                            fontSize: '12px',
                            color: '#1971c2',
                          }}>
                            {details.brief.proof_type}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      color: '#868e96',
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                      <div>No concept/brief linked to this video</div>
                    </div>
                  )}

                  {/* Editor Checklist */}
                  <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f1f3f5', borderRadius: '8px', border: '1px solid #dee2e6' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '12px', color: '#495057', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      Editor Checklist
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: video.script_locked_text ? '#40c057' : '#868e96' }}>
                          {video.script_locked_text ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: '13px', color: video.script_locked_text ? '#212529' : '#868e96' }}>
                          Script locked
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: video.google_drive_url ? '#40c057' : '#868e96' }}>
                          {video.google_drive_url ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: '13px', color: video.google_drive_url ? '#212529' : '#868e96' }}>
                          Drive folder linked
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: video.final_video_url ? '#40c057' : '#868e96' }}>
                          {video.final_video_url ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: '13px', color: video.final_video_url ? '#212529' : '#868e96' }}>
                          Final MP4 uploaded
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: video.recording_status === 'EDITED' || video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED' ? '#40c057' : '#868e96' }}>
                          {video.recording_status === 'EDITED' || video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED' ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: '13px', color: video.recording_status === 'EDITED' || video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED' ? '#212529' : '#868e96' }}>
                          Edit completed
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Script Tab */}
              {activeTab === 'script' && (
                <div>
                  {video.script_locked_text ? (
                    <>
                      {/* Script version info */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '3px 8px',
                            backgroundColor: '#d3f9d8',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#2b8a3e',
                            fontWeight: 'bold',
                          }}>
                            Locked v{video.script_locked_version || 1}
                          </span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(video.script_locked_text || '', 'fullScript')}
                          style={{
                            padding: '4px 12px',
                            fontSize: '11px',
                            backgroundColor: copiedField === 'fullScript' ? '#d3f9d8' : '#228be6',
                            color: copiedField === 'fullScript' ? '#2b8a3e' : 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                          }}
                        >
                          {copiedField === 'fullScript' ? 'Copied!' : 'Copy Full Script'}
                        </button>
                      </div>

                      {/* Hook extract with copy */}
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <h4 style={{ margin: 0, fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Hook (First Line)</h4>
                          <button
                            onClick={() => copyToClipboard(extractHook(video.script_locked_text || ''), 'hook')}
                            style={{
                              padding: '2px 8px',
                              fontSize: '10px',
                              backgroundColor: copiedField === 'hook' ? '#d3f9d8' : '#e9ecef',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer',
                            }}
                          >
                            {copiedField === 'hook' ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <div style={{
                          backgroundColor: '#fff3bf',
                          borderRadius: '6px',
                          padding: '10px',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#495057',
                        }}>
                          {extractHook(video.script_locked_text || '')}
                        </div>
                      </div>

                      {/* Full script */}
                      <div>
                        <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Full Script</h4>
                        {editMode ? (
                          <div>
                            <textarea
                              value={editScript}
                              onChange={(e) => setEditScript(e.target.value)}
                              style={{
                                width: '100%',
                                minHeight: '250px',
                                padding: '12px',
                                backgroundColor: colors.input,
                                border: `1px solid ${colors.inputBorder}`,
                                borderRadius: '6px',
                                fontSize: '13px',
                                lineHeight: 1.6,
                                color: colors.text,
                                resize: 'vertical',
                                fontFamily: 'inherit',
                              }}
                              placeholder="Enter script text..."
                            />
                            <button
                              onClick={() => saveEdits('script_locked_text', editScript)}
                              disabled={editSaving}
                              style={{
                                marginTop: '8px',
                                padding: '10px 16px',
                                backgroundColor: '#228be6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: editSaving ? 'not-allowed' : 'pointer',
                                fontSize: '13px',
                                fontWeight: 'bold',
                              }}
                            >
                              Save Script
                            </button>
                          </div>
                        ) : (
                          <div style={{
                            backgroundColor: '#f8f9fa',
                            borderRadius: '6px',
                            padding: '12px',
                            fontSize: '13px',
                            lineHeight: 1.6,
                            maxHeight: '300px',
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            border: '1px solid #e9ecef',
                          }}>
                            {video.script_locked_text}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      backgroundColor: '#fff3cd',
                      borderRadius: '8px',
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
                      <div style={{ color: '#856404', marginBottom: '16px' }}>No script attached yet</div>
                      <button
                        onClick={() => onOpenAttachModal(video)}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#17a2b8',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                        }}
                      >
                        Attach Script
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Assets Tab */}
              {activeTab === 'assets' && (
                <div>
                  {/* Editable Drive Links (Admin Edit Mode) */}
                  {editMode && (
                    <div style={{
                      marginBottom: '16px',
                      padding: '12px',
                      backgroundColor: isDark ? colors.bgTertiary : '#e7f5ff',
                      borderRadius: '8px',
                      border: `1px solid ${isDark ? '#2d5a87' : '#74c0fc'}`,
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', color: isDark ? '#74c0fc' : '#1971c2', marginBottom: '12px', textTransform: 'uppercase' }}>
                        Edit Drive Links
                      </div>

                      {/* Main Drive Folder */}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: '4px' }}>
                          Main Drive Folder
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            value={editDriveUrl}
                            onChange={(e) => setEditDriveUrl(e.target.value)}
                            placeholder="https://drive.google.com/..."
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: colors.input,
                              border: `1px solid ${colors.inputBorder}`,
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: colors.text,
                            }}
                          />
                          <button
                            onClick={() => saveEdits('google_drive_url', editDriveUrl)}
                            disabled={editSaving}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#228be6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: editSaving ? 'not-allowed' : 'pointer',
                              fontSize: '11px',
                              fontWeight: 'bold',
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      {/* Raw Footage URL */}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: '4px' }}>
                          Raw Footage URL
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            value={editRawFootageUrl}
                            onChange={(e) => setEditRawFootageUrl(e.target.value)}
                            placeholder="https://..."
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: colors.input,
                              border: `1px solid ${colors.inputBorder}`,
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: colors.text,
                            }}
                          />
                          <button
                            onClick={() => saveEdits('raw_footage_url', editRawFootageUrl)}
                            disabled={editSaving}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#228be6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: editSaving ? 'not-allowed' : 'pointer',
                              fontSize: '11px',
                              fontWeight: 'bold',
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      {/* Final Video URL */}
                      <div>
                        <label style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: '4px' }}>
                          Final Video URL
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            value={editFinalUrl}
                            onChange={(e) => setEditFinalUrl(e.target.value)}
                            placeholder="https://..."
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: colors.input,
                              border: `1px solid ${colors.inputBorder}`,
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: colors.text,
                            }}
                          />
                          <button
                            onClick={() => saveEdits('final_video_url', editFinalUrl)}
                            disabled={editSaving}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#228be6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: editSaving ? 'not-allowed' : 'pointer',
                              fontSize: '11px',
                              fontWeight: 'bold',
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Google Drive */}
                  {(video.google_drive_url || details?.assets.google_drive_url) && (
                    <a
                      href={video.google_drive_url || details?.assets.google_drive_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px',
                        backgroundColor: '#fff3bf',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        marginBottom: '12px',
                        border: '1px solid #ffd43b',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>📁</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#e67700', fontSize: '13px' }}>Google Drive Folder</div>
                        <div style={{ fontSize: '11px', color: '#856404' }}>Raw footage & assets</div>
                      </div>
                    </a>
                  )}

                  {/* Final MP4 */}
                  {(video.final_video_url || details?.assets.final_mp4_url) && (
                    <a
                      href={video.final_video_url || details?.assets.final_mp4_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px',
                        backgroundColor: '#d3f9d8',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        marginBottom: '12px',
                        border: '1px solid #69db7c',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>🎬</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#2b8a3e', fontSize: '13px' }}>Final MP4</div>
                        <div style={{ fontSize: '11px', color: '#40c057' }}>Ready for posting</div>
                      </div>
                    </a>
                  )}

                  {/* Posted URL */}
                  {video.posted_url && (
                    <a
                      href={video.posted_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px',
                        backgroundColor: '#e7f5ff',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        marginBottom: '12px',
                        border: '1px solid #74c0fc',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>🔗</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#1971c2', fontSize: '13px' }}>Posted Video</div>
                        <div style={{ fontSize: '11px', color: '#339af0' }}>{video.posted_platform || 'View on platform'}</div>
                      </div>
                    </a>
                  )}

                  {/* Screenshots */}
                  {details?.assets.screenshots && details.assets.screenshots.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>
                        Screenshots ({details.assets.screenshots.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {details.assets.screenshots.map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'block',
                              padding: '8px 12px',
                              backgroundColor: '#f8f9fa',
                              borderRadius: '4px',
                              textDecoration: 'none',
                              color: '#228be6',
                              fontSize: '12px',
                              border: '1px solid #e9ecef',
                            }}
                          >
                            Screenshot {idx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No assets message */}
                  {!video.google_drive_url && !details?.assets.google_drive_url &&
                   !video.final_video_url && !details?.assets.final_mp4_url &&
                   !video.posted_url &&
                   (!details?.assets.screenshots || details.assets.screenshots.length === 0) && (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      color: '#868e96',
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                      <div>No assets linked yet</div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Chat Tab */}
              {activeTab === 'chat' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px' }}>
                  {/* Chat messages */}
                  <div style={{
                    flex: 1,
                    overflow: 'auto',
                    marginBottom: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}>
                    {chatMessages.length === 0 && (
                      <div style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: colors.textMuted,
                      }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
                        <div style={{ marginBottom: '8px' }}>Ask AI for script tweaks, hook ideas, or creative feedback</div>
                        <div style={{ fontSize: '12px', color: colors.textMuted }}>
                          Examples: "Make the hook punchier" or "Suggest 3 alternative CTAs"
                        </div>
                      </div>
                    )}
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          backgroundColor: msg.role === 'user'
                            ? (isDark ? '#2d5a87' : '#e7f5ff')
                            : (isDark ? colors.bgTertiary : '#f8f9fa'),
                          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          fontSize: '13px',
                          lineHeight: 1.5,
                          color: colors.text,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {msg.content}
                      </div>
                    ))}
                    {chatLoading && (
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        backgroundColor: isDark ? colors.bgTertiary : '#f8f9fa',
                        alignSelf: 'flex-start',
                        fontSize: '13px',
                        color: colors.textMuted,
                      }}>
                        Thinking...
                      </div>
                    )}
                  </div>

                  {/* Chat input */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      placeholder="Ask AI for help..."
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        backgroundColor: colors.input,
                        border: `1px solid ${colors.inputBorder}`,
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: colors.text,
                      }}
                      disabled={chatLoading}
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={chatLoading || !chatInput.trim()}
                      style={{
                        padding: '10px 16px',
                        backgroundColor: chatLoading || !chatInput.trim() ? '#ccc' : '#228be6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                      }}
                    >
                      Send
                    </button>
                  </div>

                  {/* Quick actions */}
                  <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      'Make hook punchier',
                      'Suggest alt CTA',
                      'Shorten script',
                      'Add urgency',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => {
                          setChatInput(prompt);
                        }}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: isDark ? colors.bgTertiary : '#f1f3f5',
                          border: `1px solid ${colors.border}`,
                          borderRadius: '12px',
                          fontSize: '11px',
                          color: colors.textMuted,
                          cursor: 'pointer',
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <div>
                  {details?.events && details.events.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {details.events.map((event) => (
                        <div
                          key={event.id}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '6px',
                            borderLeft: `3px solid ${
                              event.event_type === 'status_change' ? '#228be6' :
                              event.event_type === 'claimed' ? '#40c057' :
                              event.event_type === 'released' ? '#fab005' :
                              '#868e96'
                            }`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#212529', marginBottom: '2px' }}>
                                {event.event_type.replace(/_/g, ' ')}
                              </div>
                              {event.from_status && event.to_status && (
                                <div style={{ fontSize: '11px', color: '#495057' }}>
                                  {event.from_status} → {event.to_status}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '10px', color: '#868e96' }}>
                                {displayTime(event.created_at)}
                              </div>
                              <div style={{ fontSize: '10px', color: '#adb5bd', fontFamily: 'monospace' }}>
                                {event.actor.slice(0, 8)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      color: '#868e96',
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                      <div>No activity yet</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #e0e0e0',
          backgroundColor: '#f8f9fa',
        }}>
          {/* Primary Action Row */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: isAdmin ? '12px' : '0' }}>
            {/* Main action button - context-aware */}
            {isClaimedByOther ? (
              <div style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#fff3e0',
                borderRadius: '6px',
                textAlign: 'center',
                fontSize: '13px',
                color: '#e67700',
              }}>
                🔒 Assigned to {video.claimed_by?.slice(0, 8)}...
              </div>
            ) : isClaimedByMe ? (
              <>
                {/* Primary: Do the next action OR Put Back */}
                {primaryAction.type !== 'done' && (
                  <button
                    onClick={handlePrimaryAction}
                    disabled={loading}
                    style={{
                      flex: 2,
                      padding: '12px',
                      backgroundColor: loading ? '#ccc' : primaryAction.color,
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                    }}
                  >
                    {loading ? '...' : `${primaryAction.icon} ${primaryAction.label}`}
                  </button>
                )}
                <button
                  onClick={handleRelease}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: colors.bgSecondary,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Put Back
                </button>
              </>
            ) : (
              /* Unclaimed - show Start button */
              <button
                onClick={handleClaim}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                {loading ? '...' : '▶️ Start Working'}
              </button>
            )}
          </div>

          {/* Non-admin: Need Help button */}
          {!isAdmin && isClaimedByMe && (
            <div style={{ marginTop: '8px' }}>
              <button
                onClick={() => onOpenHandoffModal && onOpenHandoffModal(video)}
                disabled={!onOpenHandoffModal}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'transparent',
                  color: '#6f42c1',
                  border: '1px solid #6f42c1',
                  borderRadius: '6px',
                  cursor: onOpenHandoffModal ? 'pointer' : 'not-allowed',
                  fontSize: '13px',
                }}
              >
                🙋 Need Help / Handoff
              </button>
            </div>
          )}

          {/* Admin actions row */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {onOpenHandoffModal && (
                <button
                  onClick={() => onOpenHandoffModal(video)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#6f42c1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Handoff
                </button>
              )}
              {video.recording_status !== 'REJECTED' && video.recording_status !== 'POSTED' && (
                <button
                  onClick={handleReject}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#e03131',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Reject
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
