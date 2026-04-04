'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminPageLayout, { AdminCard, AdminButton } from '@/app/admin/components/AdminPageLayout';
import { SectionLoader } from '@/components/ui/BrandedLoader';

type ConnectorStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'NEEDS_APPROVAL' | 'DEFERRED';

interface Connector {
  id: string;
  status: ConnectorStatus;
  google_email: string | null;
  folder_id: string | null;
  folder_name: string | null;
  polling_interval_minutes: number;
  create_pipeline_item: boolean;
  create_transcript: boolean;
  create_edit_notes: boolean;
  assign_to_user_id: string | null;
  last_poll_at: string | null;
  last_poll_error: string | null;
}

interface IntakeJob {
  id: string;
  drive_file_name: string | null;
  status: JobStatus;
  attempts: number;
  last_error: string | null;
  result: Record<string, unknown> | null;
  estimated_cost_usd: number | null;
  created_at: string;
  finished_at: string | null;
}

interface Folder {
  id: string;
  name: string;
}

interface Usage {
  files: number;
  minutes: number;
  maxFiles: number;
  maxMinutes: number;
  maxFileSizeBytes: number;
  maxDurationMinutes: number;
  month: string;
}

interface GuardrailSettings {
  maxFileMb: number;
  maxVideoMinutes: number;
  allowedMimePrefixes: string[];
  monthlyFileCap: number;
  monthlyMinutesCap: number;
  dailyFileCap: number;
  dailyMinutesCap: number;
  monthlyCostCapUsd: number;
  requireApprovalAboveMb: number | null;
  requireApprovalAboveMin: number | null;
  isActive: boolean;
  isCustom: boolean;
}

interface UsageRollup {
  month: string;
  total_files: number;
  total_minutes: number;
  total_bytes: number;
  estimated_cost_usd: number;
  jobs_succeeded: number;
  jobs_failed: number;
  jobs_approved: number;
  jobs_deferred: number;
}

interface ApprovalJob {
  id: string;
  drive_file_name: string | null;
  status: string;
  last_error: string | null;
  estimated_cost_usd: number | null;
  created_at: string;
  result: Record<string, unknown> | null;
}

type Tab = 'status' | 'activity' | 'tutorial' | 'settings' | 'usage' | 'approvals';

const TAB_LABELS: Record<Tab, string> = {
  status: 'Connector',
  activity: 'Activity Log',
  tutorial: 'Tutorial',
  settings: 'Settings',
  usage: 'Usage',
  approvals: 'Approvals',
};

const JOB_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-300',
  RUNNING: 'bg-blue-500/20 text-blue-300',
  SUCCEEDED: 'bg-green-500/20 text-green-300',
  FAILED: 'bg-red-500/20 text-red-300',
  NEEDS_APPROVAL: 'bg-orange-500/20 text-orange-300',
  DEFERRED: 'bg-purple-500/20 text-purple-300',
};

export default function IntakePage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('status');
  const [connector, setConnector] = useState<Connector | null>(null);
  const [jobs, setJobs] = useState<IntakeJob[]>([]);
  const [stats, setStats] = useState({ pending: 0, totalProcessed: 0, approvalCount: 0, deferredCount: 0 });
  const [usage, setUsage] = useState<Usage | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Folder picker state
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderSearch, setFolderSearch] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Handle OAuth callback params
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected === 'true') {
      setBanner({ type: 'success', message: 'Google Drive connected successfully. Select a folder to start ingesting videos.' });
      router.replace('/admin/intake', { scroll: false });
    } else if (error) {
      const messages: Record<string, string> = {
        missing_code: 'OAuth flow was cancelled or returned no authorization code.',
        state_expired: 'OAuth session expired. Please try connecting again.',
        invalid_state: 'Invalid OAuth state. Please try connecting again.',
      };
      setBanner({ type: 'error', message: messages[error] || `Connection failed: ${decodeURIComponent(error)}` });
      router.replace('/admin/intake', { scroll: false });
    }
  }, [searchParams, router]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/intake/status');
      const data = await res.json();
      setConnector(data.connector);
      setJobs(data.jobs || []);
      setStats(data.stats || { pending: 0, totalProcessed: 0, approvalCount: 0, deferredCount: 0 });
      setUsage(data.usage || null);
      setConfigured(data.configured);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const searchFolders = async (query?: string) => {
    setLoadingFolders(true);
    try {
      const params = query ? `?query=${encodeURIComponent(query)}` : '';
      const res = await fetch(`/api/intake/google/folders${params}`);
      const data = await res.json();
      setFolders(data.folders || []);
    } catch {
      // ignore
    }
    setLoadingFolders(false);
  };

  const selectFolder = async (folder: Folder) => {
    setActing(true);
    await fetch('/api/intake/google/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folder.id, folder_name: folder.name }),
    });
    setShowFolderPicker(false);
    await fetchStatus();
    setActing(false);
  };

  const createRecommended = async () => {
    setActing(true);
    try {
      const res = await fetch('/api/intake/google/folders/createRecommended', { method: 'POST' });
      const data = await res.json();
      if (data.needsReconnect) {
        setBanner({ type: 'error', message: 'Permission needed: please reconnect Google Drive to allow folder creation.' });
      } else if (data.error) {
        setBanner({ type: 'error', message: data.error });
      } else {
        setBanner({ type: 'success', message: 'Intake folder created in your Google Drive. Ready to receive videos.' });
      }
    } catch {
      setBanner({ type: 'error', message: 'Failed to create folder.' });
    }
    await fetchStatus();
    setActing(false);
  };

  const triggerPoll = async () => {
    setActing(true);
    try {
      const res = await fetch('/api/intake/trigger-poll', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setBanner({ type: 'error', message: data.error });
      } else {
        setBanner({ type: 'success', message: data.message || 'Folder checked for new videos.' });
      }
    } catch {
      setBanner({ type: 'error', message: 'Failed to check for videos.' });
    }
    await fetchStatus();
    setActing(false);
  };

  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const disconnect = async () => {
    setActing(true);
    await fetch('/api/intake/google/disconnect', { method: 'POST' });
    setBanner({ type: 'success', message: 'Google Drive disconnected.' });
    setShowDisconnectConfirm(false);
    await fetchStatus();
    setActing(false);
  };

  const updateSetting = async (key: string, value: unknown) => {
    await fetch('/api/intake/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    await fetchStatus();
  };

  if (authLoading || loading) {
    return <AdminPageLayout title="Drive Intake"><div className="text-zinc-400">Loading...</div></AdminPageLayout>;
  }

  if (!isAdmin) {
    return <AdminPageLayout title="Drive Intake"><div className="text-red-400">Access denied</div></AdminPageLayout>;
  }

  return (
    <AdminPageLayout
      title="Drive Intake"
      subtitle="Automatically ingest videos from Google Drive into your pipeline"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Drive Intake' },
      ]}
    >
      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['status', 'activity', 'settings', 'usage', 'approvals', 'tutorial'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {TAB_LABELS[t]}
            {t === 'approvals' && stats.approvalCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-orange-500/20 text-orange-300">
                {stats.approvalCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Connection feedback banner */}
      {banner && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between ${
          banner.type === 'success'
            ? 'bg-green-500/10 border-green-500/30 text-green-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <span>{banner.message}</span>
          <button onClick={() => setBanner(null)} className="text-xs opacity-60 hover:opacity-100 ml-4">Dismiss</button>
        </div>
      )}

      {!configured && (
        <AdminCard>
          <div className="space-y-3">
            <div className="text-yellow-400 text-sm font-medium">
              Google Drive is not configured yet.
            </div>
            <div className="text-zinc-400 text-sm">
              Set the following environment variables in Vercel (or <code>.env.local</code>):
            </div>
            <div className="bg-zinc-800/60 rounded-lg p-3 font-mono text-xs text-zinc-300 space-y-1">
              <div><span className="text-zinc-500"># From Google Cloud Console &gt; APIs &amp; Services &gt; Credentials</span></div>
              <div>GOOGLE_DRIVE_CLIENT_ID=<span className="text-zinc-500">your-client-id.apps.googleusercontent.com</span></div>
              <div>GOOGLE_DRIVE_CLIENT_SECRET=<span className="text-zinc-500">GOCSPX-your-secret</span></div>
              <div>GOOGLE_DRIVE_REDIRECT_URI=<span className="text-zinc-500">https://your-app.vercel.app/api/intake/google/callback</span></div>
              <div><span className="text-zinc-500"># Generate with: node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;</span></div>
              <div>DRIVE_TOKEN_ENCRYPTION_KEY=<span className="text-zinc-500">your-32-byte-base64-key</span></div>
            </div>
          </div>
        </AdminCard>
      )}

      {tab === 'status' && <ConnectorTab
        connector={connector}
        stats={stats}
        usage={usage}
        acting={acting}
        showFolderPicker={showFolderPicker}
        setShowFolderPicker={setShowFolderPicker}
        folderSearch={folderSearch}
        setFolderSearch={setFolderSearch}
        folders={folders}
        loadingFolders={loadingFolders}
        searchFolders={searchFolders}
        selectFolder={selectFolder}
        createRecommended={createRecommended}
        triggerPoll={triggerPoll}
        disconnect={disconnect}
        showDisconnectConfirm={showDisconnectConfirm}
        setShowDisconnectConfirm={setShowDisconnectConfirm}
        updateSetting={updateSetting}
        configured={configured}
      />}

      {tab === 'activity' && <ActivityTab jobs={jobs} />}
      {tab === 'tutorial' && <TutorialTab />}
      {tab === 'settings' && <GuardrailSettingsTab />}
      {tab === 'usage' && <UsageHistoryTab />}
      {tab === 'approvals' && <ApprovalsTab onAction={fetchStatus} />}
    </AdminPageLayout>
  );
}

// ── Connector Tab ────────────────────────────────────────────────
function ConnectorTab({ connector, stats, usage, acting, showFolderPicker, setShowFolderPicker, folderSearch, setFolderSearch, folders, loadingFolders, searchFolders, selectFolder, createRecommended, triggerPoll, disconnect, showDisconnectConfirm, setShowDisconnectConfirm, updateSetting, configured }: {
  connector: Connector | null;
  stats: { pending: number; totalProcessed: number; approvalCount: number; deferredCount: number };
  usage: Usage | null;
  acting: boolean;
  showFolderPicker: boolean;
  setShowFolderPicker: (v: boolean) => void;
  folderSearch: string;
  setFolderSearch: (v: string) => void;
  folders: Folder[];
  loadingFolders: boolean;
  searchFolders: (q?: string) => void;
  selectFolder: (f: Folder) => void;
  createRecommended: () => void;
  triggerPoll: () => void;
  disconnect: () => void;
  showDisconnectConfirm: boolean;
  setShowDisconnectConfirm: (v: boolean) => void;
  updateSetting: (key: string, value: unknown) => void;
  configured: boolean;
}) {
  // Determine setup step
  const isConnected = connector && connector.status !== 'DISCONNECTED';
  const hasFolder = isConnected && !!connector.folder_id;
  const isReady = hasFolder;
  const step = !isConnected ? 1 : !hasFolder ? 2 : 3;

  return (
    <div className="space-y-6">
      {/* Setup Progress — shown when not fully ready */}
      {(!isReady || stats.totalProcessed === 0) && (
        <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-5">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">Setup Progress</h3>
          <div className="flex items-center gap-3">
            <StepIndicator num={1} label="Connect Drive" active={step === 1} done={step > 1} />
            <div className={`flex-1 h-px ${step > 1 ? 'bg-green-500/40' : 'bg-zinc-700'}`} />
            <StepIndicator num={2} label="Select Folder" active={step === 2} done={step > 2} />
            <div className={`flex-1 h-px ${step > 2 ? 'bg-green-500/40' : 'bg-zinc-700'}`} />
            <StepIndicator num={3} label="Ready" active={step === 3} done={stats.totalProcessed > 0} />
          </div>
          {step === 2 && (
            <p className="text-xs text-zinc-500 mt-3">
              Choose a folder where you'll upload videos for processing. We recommend creating a dedicated intake folder.
            </p>
          )}
          {step === 3 && stats.totalProcessed === 0 && (
            <p className="text-xs text-zinc-500 mt-3">
              All set. Upload a video to your intake folder and FlashFlow will automatically process it. You can also click &ldquo;Check for New Videos&rdquo; to manually scan now.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Connection Card */}
        <AdminCard title="Connection">
          {!isConnected ? (
            <div className="space-y-4">
              <p className="text-zinc-400 text-sm">
                Connect your Google Drive to automatically import new videos into your content pipeline.
              </p>
              <div className="bg-zinc-800/40 rounded-lg p-3 text-xs text-zinc-500 space-y-1">
                <p className="font-medium text-zinc-400">How it works:</p>
                <p>1. Connect your Google Drive account</p>
                <p>2. Choose or create an intake folder</p>
                <p>3. FlashFlow checks for new videos automatically</p>
                <p>4. Imported videos appear in your pipeline for processing</p>
              </div>
              {configured ? (
                <AdminButton
                  variant="primary"
                  onClick={() => window.location.href = '/api/intake/google/connect'}
                  disabled={acting}
                >
                  {acting ? 'Connecting...' : 'Connect Google Drive'}
                </AdminButton>
              ) : (
                <div className="text-xs text-zinc-500">
                  Google Drive integration needs to be configured first. See the setup instructions above.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Status</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  connector.status === 'CONNECTED' ? 'bg-green-500/20 text-green-300' :
                  connector.status === 'ERROR' ? 'bg-red-500/20 text-red-300' :
                  'bg-zinc-500/20 text-zinc-300'
                }`}>{connector.status === 'CONNECTED' ? 'Connected' : connector.status === 'ERROR' ? 'Error' : connector.status}</span>
              </div>
              {connector.google_email && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Google Account</span>
                  <span className="text-zinc-200">{connector.google_email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-400">Intake Folder</span>
                <span className={connector.folder_name ? 'text-zinc-200' : 'text-zinc-500 italic'}>
                  {connector.folder_name || 'Not selected yet'}
                </span>
              </div>
              {connector.last_poll_at && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Last Check</span>
                  <span className="text-zinc-200">{new Date(connector.last_poll_at).toLocaleString()}</span>
                </div>
              )}
              {connector.last_poll_error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-2">
                  <span className="text-red-400 text-xs">Last error: {connector.last_poll_error}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-400">Videos Processed</span>
                <span className="text-zinc-200">{stats.totalProcessed}</span>
              </div>
              {stats.pending > 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">In Queue</span>
                  <span className="text-yellow-300">{stats.pending} pending</span>
                </div>
              )}
              {stats.approvalCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Needs Approval</span>
                  <span className="text-orange-300">{stats.approvalCount} jobs</span>
                </div>
              )}

              {/* Actions */}
              <div className="border-t border-white/[0.06] pt-3 mt-3">
                {!connector.folder_id ? (
                  <div className="space-y-2">
                    <p className="text-zinc-500 text-xs mb-2">Next: select a folder for video intake.</p>
                    <div className="flex gap-2 flex-wrap">
                      <AdminButton variant="primary" size="sm" onClick={createRecommended} disabled={acting}>
                        {acting ? 'Creating...' : 'Create Recommended Folder'}
                      </AdminButton>
                      <AdminButton variant="secondary" size="sm" onClick={() => { setShowFolderPicker(true); searchFolders(); }} disabled={acting}>
                        Choose Existing Folder
                      </AdminButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <AdminButton variant="primary" size="sm" onClick={triggerPoll} disabled={acting}>
                      {acting ? 'Checking...' : 'Check for New Videos'}
                    </AdminButton>
                    <AdminButton variant="secondary" size="sm" onClick={() => { setShowFolderPicker(true); searchFolders(); }} disabled={acting}>
                      Change Folder
                    </AdminButton>
                    <AdminButton variant="secondary" size="sm" onClick={() => window.location.href = '/api/intake/google/connect'} disabled={acting}>
                      Reconnect
                    </AdminButton>
                    <AdminButton variant="secondary" size="sm" onClick={() => setShowDisconnectConfirm(true)} disabled={acting}>
                      Disconnect
                    </AdminButton>
                  </div>
                )}
              </div>
            </div>
          )}
        </AdminCard>

        {/* Settings Card */}
        {isConnected && (
          <AdminCard title="Processing Settings">
            <div className="space-y-4 text-sm">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={connector.create_pipeline_item}
                  onChange={(e) => updateSetting('create_pipeline_item', e.target.checked)} className="rounded" />
                <div>
                  <span className="text-zinc-200">Create pipeline item</span>
                  <p className="text-zinc-500 text-xs">Adds each video to the production board as a content item.</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={connector.create_transcript}
                  onChange={(e) => updateSetting('create_transcript', e.target.checked)} className="rounded" />
                <div>
                  <span className="text-zinc-200">Auto-transcribe</span>
                  <p className="text-zinc-500 text-xs">Transcribes audio via OpenAI Whisper.</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={connector.create_edit_notes}
                  onChange={(e) => updateSetting('create_edit_notes', e.target.checked)} className="rounded" />
                <div>
                  <span className="text-zinc-200">Generate edit notes</span>
                  <p className="text-zinc-500 text-xs">AI generates chapters, hooks, and B-roll suggestions.</p>
                </div>
              </label>
              <div>
                <label className="text-zinc-400 block mb-1">Check interval</label>
                <select value={connector.polling_interval_minutes}
                  onChange={(e) => updateSetting('polling_interval_minutes', parseInt(e.target.value))}
                  className="bg-zinc-800 border border-white/10 text-zinc-200 rounded px-3 py-1.5 text-sm"
                >
                  {[1, 2, 5, 10, 15, 30, 60].map(v => (
                    <option key={v} value={v}>Every {v} min</option>
                  ))}
                </select>
              </div>
            </div>
          </AdminCard>
        )}

        {/* Usage Card */}
        {isConnected && usage && (
          <UsageCard usage={usage} />
        )}
      </div>

      {/* Folder Picker Modal */}
      {showFolderPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-zinc-100 mb-4">Select Drive Folder</h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text" value={folderSearch}
                onChange={(e) => setFolderSearch(e.target.value)}
                placeholder="Search folders..."
                className="flex-1 bg-zinc-800 border border-white/10 text-zinc-200 rounded px-3 py-2 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && searchFolders(folderSearch)}
              />
              <AdminButton variant="secondary" size="sm" onClick={() => searchFolders(folderSearch)} disabled={loadingFolders}>
                Search
              </AdminButton>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {loadingFolders ? (
                <div className="text-zinc-400 text-sm p-4 text-center">Loading...</div>
              ) : folders.length === 0 ? (
                <div className="text-zinc-500 text-sm p-4 text-center">No folders found. Try a different search or create a new folder.</div>
              ) : (
                folders.map(f => (
                  <button key={f.id} onClick={() => selectFolder(f)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-sm text-zinc-200 flex items-center gap-2"
                  >
                    <span className="text-yellow-400">&#128193;</span> {f.name}
                  </button>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <AdminButton variant="secondary" size="sm" onClick={() => setShowFolderPicker(false)}>
                Cancel
              </AdminButton>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-medium text-zinc-100 mb-2">Disconnect Google Drive?</h3>
            <p className="text-zinc-400 text-sm mb-4">
              Pending jobs will not be processed. You can reconnect at any time.
            </p>
            <div className="flex gap-2 justify-end">
              <AdminButton variant="secondary" size="sm" onClick={() => setShowDisconnectConfirm(false)}>
                Cancel
              </AdminButton>
              <AdminButton variant="danger" size="sm" onClick={disconnect} disabled={acting}>
                {acting ? 'Disconnecting...' : 'Disconnect'}
              </AdminButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step Indicator ──────────────────────────────────────────────
function StepIndicator({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
        done ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
        active ? 'bg-white/10 text-zinc-200 border border-white/20' :
        'bg-zinc-800 text-zinc-500 border border-white/[0.06]'
      }`}>
        {done ? '\u2713' : num}
      </div>
      <span className={`text-[10px] ${active ? 'text-zinc-300' : done ? 'text-green-400/70' : 'text-zinc-600'}`}>
        {label}
      </span>
    </div>
  );
}

// ── Usage Card ──────────────────────────────────────────────────
function UsageCard({ usage }: { usage: Usage }) {
  const filesPct = usage.maxFiles > 0 ? (usage.files / usage.maxFiles) * 100 : 0;
  const minPct = usage.maxMinutes > 0 ? (usage.minutes / usage.maxMinutes) * 100 : 0;
  const maxPct = Math.max(filesPct, minPct);
  const isWarning = maxPct >= 80 && maxPct < 100;
  const isLimit = maxPct >= 100;

  return (
    <AdminCard title={`Usage — ${usage.month}`}>
      {isLimit && (
        <div className="bg-red-500/15 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm mb-4">
          Monthly intake limit reached. New videos will be rejected until next month.
        </div>
      )}
      {isWarning && !isLimit && (
        <div className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 rounded-lg px-4 py-3 text-sm mb-4">
          Approaching monthly limit ({Math.round(maxPct)}% used). Consider spacing out uploads.
        </div>
      )}
      <div className="space-y-4">
        <UsageBar label="Files" current={usage.files} max={usage.maxFiles} unit="" />
        <UsageBar label="Minutes" current={Math.round(usage.minutes)} max={usage.maxMinutes} unit="min" />
      </div>
      <div className="mt-4 text-xs text-zinc-500 space-y-1">
        <div>Max file size: {(usage.maxFileSizeBytes / 1024 / 1024 / 1024).toFixed(1)} GB</div>
        <div>Max video duration: {usage.maxDurationMinutes} min</div>
      </div>
    </AdminCard>
  );
}

function UsageBar({ label, current, max, unit }: { label: string; current: number; max: number; unit: string }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-200">{current}{unit ? ` ${unit}` : ''} / {max}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Activity Tab ─────────────────────────────────────────────────
function ActivityTab({ jobs }: { jobs: IntakeJob[] }) {
  return (
    <AdminCard title="Recent Activity" noPadding>
      {jobs.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-zinc-400 mb-1">No videos processed yet.</p>
          <p className="text-zinc-500 text-xs">Once you connect Google Drive and select a folder, videos will appear here as they are processed.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400 text-left">
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
                <th className="px-4 py-3 font-medium">Pipeline Item</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-zinc-200 max-w-[200px] truncate" title={job.drive_file_name || ''}>
                    {job.drive_file_name || 'Unknown'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${JOB_STATUS_COLORS[job.status] || 'bg-zinc-500/20 text-zinc-300'}`}>
                      {job.status}
                    </span>
                    {job.last_error && (job.status === 'FAILED' || job.status === 'NEEDS_APPROVAL' || job.status === 'DEFERRED') && (
                      <span className="block text-[10px] text-red-400 mt-0.5 max-w-[150px] truncate" title={job.last_error}>
                        {job.last_error}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{job.attempts}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {job.result && typeof job.result === 'object' && 'video_code' in job.result ? (
                      <a href={`/admin/pipeline`} className="text-blue-400 hover:underline text-xs">
                        {String(job.result.video_code)}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

// ── Guardrail Settings Tab ──────────────────────────────────────
function GuardrailSettingsTab() {
  const [settings, setSettings] = useState<GuardrailSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch('/api/intake/guardrails/settings')
      .then(r => r.json())
      .then(d => { setSettings(d.settings); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const update = (key: keyof GuardrailSettings, value: unknown) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    await fetch('/api/intake/guardrails/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_file_mb: settings.maxFileMb,
        max_video_minutes: settings.maxVideoMinutes,
        allowed_mime_prefixes: settings.allowedMimePrefixes,
        monthly_file_cap: settings.monthlyFileCap,
        monthly_minutes_cap: settings.monthlyMinutesCap,
        daily_file_cap: settings.dailyFileCap,
        daily_minutes_cap: settings.dailyMinutesCap,
        monthly_cost_cap_usd: settings.monthlyCostCapUsd,
        require_approval_above_mb: settings.requireApprovalAboveMb,
        require_approval_above_min: settings.requireApprovalAboveMin,
        is_active: settings.isActive,
      }),
    });
    setDirty(false);
    setSaving(false);
  };

  if (loading) return <SectionLoader message="Loading settings..." />;
  if (!settings) return <div className="text-red-400">Failed to load settings</div>;

  const inputCls = 'bg-zinc-800 border border-white/10 text-zinc-200 rounded px-3 py-1.5 text-sm w-full';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AdminCard title="Limits">
        <div className="space-y-4 text-sm">
          <div>
            <label className="text-zinc-400 block mb-1">Max file size (MB)</label>
            <input type="number" value={settings.maxFileMb}
              onChange={e => update('maxFileMb', parseInt(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Max video duration (minutes)</label>
            <input type="number" value={settings.maxVideoMinutes}
              onChange={e => update('maxVideoMinutes', parseInt(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Allowed MIME prefixes</label>
            <input type="text" value={settings.allowedMimePrefixes.join(', ')}
              onChange={e => update('allowedMimePrefixes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className={inputCls} placeholder="video/, audio/" />
            <p className="text-zinc-500 text-xs mt-1">Comma-separated prefixes (e.g. video/, audio/)</p>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Monthly Caps">
        <div className="space-y-4 text-sm">
          <div>
            <label className="text-zinc-400 block mb-1">Monthly file cap</label>
            <input type="number" value={settings.monthlyFileCap}
              onChange={e => update('monthlyFileCap', parseInt(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Monthly minutes cap</label>
            <input type="number" value={settings.monthlyMinutesCap}
              onChange={e => update('monthlyMinutesCap', parseInt(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Monthly cost cap (USD)</label>
            <input type="number" step="0.01" value={settings.monthlyCostCapUsd}
              onChange={e => update('monthlyCostCapUsd', parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Daily Caps (Soft)">
        <div className="space-y-4 text-sm">
          <p className="text-zinc-500 text-xs">Daily caps trigger DEFERRED status (retried next day), not hard rejection.</p>
          <div>
            <label className="text-zinc-400 block mb-1">Daily file cap</label>
            <input type="number" value={settings.dailyFileCap}
              onChange={e => update('dailyFileCap', parseInt(e.target.value) || 0)} className={inputCls} />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Daily minutes cap</label>
            <input type="number" value={settings.dailyMinutesCap}
              onChange={e => update('dailyMinutesCap', parseInt(e.target.value) || 0)} className={inputCls} />
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Approval Thresholds">
        <div className="space-y-4 text-sm">
          <p className="text-zinc-500 text-xs">Files/durations above these thresholds require manual approval. Leave empty to disable.</p>
          <div>
            <label className="text-zinc-400 block mb-1">Require approval above (MB)</label>
            <input type="number" value={settings.requireApprovalAboveMb ?? ''}
              onChange={e => update('requireApprovalAboveMb', e.target.value ? parseInt(e.target.value) : null)} className={inputCls}
              placeholder="No threshold" />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Require approval above (min)</label>
            <input type="number" value={settings.requireApprovalAboveMin ?? ''}
              onChange={e => update('requireApprovalAboveMin', e.target.value ? parseInt(e.target.value) : null)} className={inputCls}
              placeholder="No threshold" />
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Kill Switch">
        <div className="space-y-4 text-sm">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={settings.isActive}
              onChange={e => update('isActive', e.target.checked)} className="rounded" />
            <span className="text-zinc-200">Intake active</span>
          </label>
          <p className="text-zinc-500 text-xs">When disabled, all new jobs are deferred until re-enabled.</p>
        </div>
      </AdminCard>

      <div className="lg:col-span-2">
        <AdminButton variant="primary" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </AdminButton>
        {!settings.isCustom && (
          <span className="ml-3 text-xs text-zinc-500">Using global defaults. Save to create per-user settings.</span>
        )}
      </div>
    </div>
  );
}

// ── Usage History Tab ───────────────────────────────────────────
function UsageHistoryTab() {
  const [rollups, setRollups] = useState<UsageRollup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/intake/guardrails/usage?months=6')
      .then(r => r.json())
      .then(d => { setRollups(d.rollups || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <SectionLoader message="Loading usage history..." />;

  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <AdminCard title="Usage History" noPadding>
      {rollups.length === 0 ? (
        <div className="p-8 text-center text-zinc-500">No usage data yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400 text-left">
                <th className="px-4 py-3 font-medium">Month</th>
                <th className="px-4 py-3 font-medium">Files</th>
                <th className="px-4 py-3 font-medium">Minutes</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Est. Cost</th>
                <th className="px-4 py-3 font-medium">OK</th>
                <th className="px-4 py-3 font-medium">Failed</th>
                <th className="px-4 py-3 font-medium">Approved</th>
                <th className="px-4 py-3 font-medium">Deferred</th>
              </tr>
            </thead>
            <tbody>
              {rollups.map(r => (
                <tr key={r.month} className={`border-b border-white/5 hover:bg-white/[0.02] ${r.month === currentMonth ? 'bg-violet-500/5' : ''}`}>
                  <td className="px-4 py-3 text-zinc-200 font-medium">
                    {r.month}
                    {r.month === currentMonth && <span className="ml-1 text-[10px] text-violet-400">(current)</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{r.total_files}</td>
                  <td className="px-4 py-3 text-zinc-300">{parseFloat(String(r.total_minutes)).toFixed(1)}</td>
                  <td className="px-4 py-3 text-zinc-300">{formatBytes(r.total_bytes)}</td>
                  <td className="px-4 py-3 text-zinc-300">${parseFloat(String(r.estimated_cost_usd)).toFixed(2)}</td>
                  <td className="px-4 py-3 text-green-400">{r.jobs_succeeded}</td>
                  <td className="px-4 py-3 text-red-400">{r.jobs_failed}</td>
                  <td className="px-4 py-3 text-orange-400">{r.jobs_approved}</td>
                  <td className="px-4 py-3 text-purple-400">{r.jobs_deferred}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ── Approvals Tab ───────────────────────────────────────────────
function ApprovalsTab({ onAction }: { onAction: () => void }) {
  const [jobs, setJobs] = useState<ApprovalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/intake/guardrails/approvals');
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const handleAction = async (jobId: string, action: 'approve' | 'reject') => {
    setActing(jobId);
    await fetch('/api/intake/guardrails/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, action }),
    });
    await fetchApprovals();
    onAction();
    setActing(null);
  };

  if (loading) return <SectionLoader message="Loading approvals..." />;

  return (
    <AdminCard title="Pending Approvals" noPadding>
      {jobs.length === 0 ? (
        <div className="p-8 text-center text-zinc-500">No jobs awaiting approval.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400 text-left">
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Est. Cost</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-zinc-200 max-w-[200px] truncate" title={job.drive_file_name || ''}>
                    {job.drive_file_name || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs max-w-[200px] truncate" title={job.last_error || ''}>
                    {job.last_error || '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {job.estimated_cost_usd != null ? `$${parseFloat(String(job.estimated_cost_usd)).toFixed(4)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <AdminButton variant="primary" size="sm"
                        onClick={() => handleAction(job.id, 'approve')}
                        disabled={acting === job.id}>
                        Approve
                      </AdminButton>
                      <AdminButton variant="danger" size="sm"
                        onClick={() => handleAction(job.id, 'reject')}
                        disabled={acting === job.id}>
                        Reject
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

// ── Tutorial Tab ─────────────────────────────────────────────────
function TutorialTab() {
  return (
    <AdminCard title="Getting Started with Drive Intake">
      <div className="prose prose-invert prose-sm max-w-none space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Step 1: Connect Google Drive</h3>
          <p className="text-zinc-300">
            Click <strong>Connect Google Drive</strong> to link your Google account. This works with both personal Gmail and Google Workspace accounts.
            FlashFlow only requests <em>read access</em> to your Drive files — we never modify or delete your originals.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Step 2: Create or Select a Folder</h3>
          <p className="text-zinc-300">
            We recommend using the <strong>Create Recommended Folder</strong> button, which creates:
          </p>
          <div className="bg-zinc-800/50 rounded-lg p-3 font-mono text-sm text-zinc-300 my-2">
            FlashFlow Intake/<br />
            &nbsp;&nbsp;Raw Footage/  &larr; <span className="text-green-400">Drop videos here</span>
          </div>
          <p className="text-zinc-300">
            You can also select any existing folder. Only video files (MP4, MOV, WebM, AVI, etc.) larger than 500KB are picked up.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Step 3: Upload Your Videos</h3>
          <p className="text-zinc-300">
            Record your video, then upload it to the selected folder in Google Drive. You can:
          </p>
          <ul className="text-zinc-300 list-disc ml-5 space-y-1">
            <li>Upload from your computer via <a href="https://drive.google.com" target="_blank" rel="noopener" className="text-blue-400 hover:underline">drive.google.com</a></li>
            <li>Upload from your phone via the Google Drive app</li>
            <li>Use &quot;Save to Drive&quot; from other apps</li>
            <li>Sync from Google Drive Desktop app</li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Step 4: Automatic Processing</h3>
          <p className="text-zinc-300">
            FlashFlow automatically checks your folder every few minutes (configurable). When a new video is found:
          </p>
          <ol className="text-zinc-300 list-decimal ml-5 space-y-1">
            <li>Video is securely copied to FlashFlow storage</li>
            <li>Audio is extracted and transcribed (OpenAI Whisper)</li>
            <li>AI generates editing notes: chapters, hooks, cut list, B-roll suggestions, captions</li>
            <li>A new pipeline item is created with status <strong>RECORDED</strong> (ready for editing)</li>
          </ol>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Step 5: Review in Pipeline</h3>
          <p className="text-zinc-300">
            Find your ingested videos in the <a href="/admin/pipeline" className="text-blue-400 hover:underline">Production Board</a> with code prefix <code>INT-</code>.
            Each item includes the transcript and edit notes attached to the video record.
          </p>
        </div>

        <div className="border-t border-white/10 pt-4">
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Troubleshooting</h3>
          <div className="space-y-2 text-zinc-300">
            <p><strong>Status shows ERROR:</strong> Your Google account may need to be reconnected. Click Reconnect.</p>
            <p><strong>Videos not appearing:</strong> Check that files are in the correct folder and are video format (MP4, MOV, etc.). Files under 500KB are skipped.</p>
            <p><strong>Transcription failed:</strong> Very large files (&gt;25MB audio) or non-English content may have issues. The video is still ingested without transcript.</p>
            <p><strong>Folder creation permission denied:</strong> Reconnect and ensure you grant Drive folder creation permission.</p>
          </div>
        </div>
      </div>
    </AdminCard>
  );
}
