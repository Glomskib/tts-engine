'use client';

import { useState, useEffect, useCallback } from 'react';
import PlanGate from '@/components/PlanGate';
import {
  Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle,
  Clock, Server, Bot, Zap, Globe, Monitor, Wifi, WifiOff,
  Play, Pause, BarChart3, TrendingUp, Calendar, Rocket, Terminal, FileText
} from 'lucide-react';

// --- Types ---

interface MachineStatus {
  name: string;
  host: string;
  role: 'primary' | 'worker';
  status: 'online' | 'offline' | 'unknown';
  lastSeen?: string;
  cpu?: number;
  memory?: number;
  capabilities: string[];
}

interface CronTask {
  name: string;
  description: string;
  schedule: string;
  machine: string;
  lastRun?: string;
  lastResult?: 'success' | 'error';
  runCount: number;
  errorCount: number;
  nextDue?: string;
  status: 'active' | 'paused' | 'error';
}

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  status: 'active' | 'idle' | 'error';
  lastActivity?: string;
  skills: string[];
}

interface AutomationScript {
  name: string;
  description: string;
  language: string;
  machine: string;
  hasConfig: boolean;
  lastRun?: string;
  status: 'configured' | 'needs_config' | 'running' | 'error';
}

interface PipelineMetric {
  label: string;
  value: number;
  change?: number;
  changeLabel?: string;
}

// --- Static data (would come from API in production) ---

const MACHINES: MachineStatus[] = [
  {
    name: 'Mac Mini',
    host: '192.168.1.210',
    role: 'primary',
    status: 'online',
    capabilities: ['API', 'AI Generation', 'Orchestration', 'Cron'],
  },
  {
    name: 'HP Worker',
    host: 'Not configured',
    role: 'worker',
    status: 'unknown',
    capabilities: ['Scraping', 'Research', 'Video Processing'],
  },
];

const CRON_TASKS: CronTask[] = [
  { name: 'drive-watcher', description: 'Scan Google Drive for uploads', schedule: 'Every 30m', machine: 'Mac Mini', runCount: 0, errorCount: 0, status: 'active' },
  { name: 'health-check', description: 'Check all systems health', schedule: 'Every 5m', machine: 'Mac Mini', runCount: 0, errorCount: 0, status: 'active' },
  { name: 'tiktok-scraper', description: 'Scrape TikTok video stats', schedule: 'Every 6h', machine: 'HP Worker', runCount: 0, errorCount: 0, status: 'active' },
  { name: 'research-scanner', description: 'Scan Reddit for trends', schedule: 'Every 4h', machine: 'HP Worker', runCount: 0, errorCount: 0, status: 'active' },
  { name: 'winner-detection', description: 'Auto-detect winning videos', schedule: '10 PM ET daily', machine: 'Mac Mini', runCount: 0, errorCount: 0, status: 'active' },
  { name: 'pipeline-check-am', description: 'Morning pipeline check', schedule: '9 AM ET weekdays', machine: 'Mac Mini', runCount: 0, errorCount: 0, status: 'active' },
  { name: 'pipeline-check-pm', description: 'Afternoon pipeline check', schedule: '2 PM ET weekdays', machine: 'Mac Mini', runCount: 0, errorCount: 0, status: 'active' },
  { name: 'pipeline-check-eve', description: 'Evening pipeline summary', schedule: '6 PM ET weekdays', machine: 'Mac Mini', runCount: 0, errorCount: 0, status: 'active' },
];

const AGENTS: AgentInfo[] = [
  { id: 'main', name: 'Bolt', emoji: '⚡', status: 'active', skills: ['General', 'Telegram'] },
  { id: 'flashflow-work', name: 'FlashFlow', emoji: '🎬', status: 'active', skills: ['API', 'Content Strategy', 'VA Management', 'Daily Reports', 'Pipeline', 'Scripts', 'Winners', 'Products', 'System'] },
  { id: 'research-bot', name: 'ResearchBot', emoji: '🔬', status: 'idle', skills: ['Research', 'Trend Analysis'] },
  { id: 'scraper-bot', name: 'ScraperBot', emoji: '🤖', status: 'idle', skills: ['Scraping', 'Stats Collection'] },
];

const SCRIPTS: AutomationScript[] = [
  { name: 'content-pipeline.py', description: 'Full content creation pipeline (research → generate → score → queue)', language: 'Python', machine: 'Mac Mini', hasConfig: true, status: 'configured' },
  { name: 'hook-factory.py', description: 'Bulk hook generation with local LLM', language: 'Python', machine: 'Mac Mini', hasConfig: true, status: 'configured' },
  { name: 'winner-remixer.py', description: '5 angle variations per winner', language: 'Python', machine: 'Mac Mini', hasConfig: true, status: 'configured' },
  { name: 'va-brief-generator.py', description: 'Auto-generate VA editing briefs', language: 'Python', machine: 'Mac Mini', hasConfig: true, status: 'configured' },
  { name: 'va-sla-tracker.py', description: 'Monitor VA turnaround and SLA', language: 'Python', machine: 'Mac Mini', hasConfig: true, status: 'configured' },
  { name: 'posting-scheduler.py', description: 'Distribute videos across accounts', language: 'Python', machine: 'Mac Mini', hasConfig: true, status: 'configured' },
  { name: 'test-full-system.py', description: 'End-to-end integration tests', language: 'Python', machine: 'Mac Mini', hasConfig: true, status: 'configured' },
  { name: 'drive-watcher.py', description: 'Google Drive folder monitor', language: 'Python', machine: 'Mac Mini', hasConfig: false, status: 'needs_config' },
  { name: 'discord-monitor.py', description: 'Discord channel monitor', language: 'Python', machine: 'Mac Mini', hasConfig: false, status: 'needs_config' },
  { name: 'tiktok-scraper.py', description: 'TikTok stats scraper', language: 'Python', machine: 'HP Worker', hasConfig: false, status: 'needs_config' },
  { name: 'research-scanner.py', description: 'Reddit research scanner', language: 'Python', machine: 'HP Worker', hasConfig: false, status: 'needs_config' },
  { name: 'orchestrator.py', description: 'Multi-machine orchestrator', language: 'Python', machine: 'Mac Mini', hasConfig: false, status: 'needs_config' },
  { name: 'cron-manager.py', description: 'Centralized scheduler', language: 'Python', machine: 'Mac Mini', hasConfig: false, status: 'needs_config' },
];

export default function AutomationDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiHealth, setApiHealth] = useState<'healthy' | 'degraded' | 'unhealthy' | 'unknown'>('unknown');
  const [pipelineMetrics, setPipelineMetrics] = useState<PipelineMetric[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [deploying, setDeploying] = useState(false);
  const [deployMessage, setDeployMessage] = useState<string>('');
  const [activityLog, setActivityLog] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'error' }>>([]);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      // Fetch API health
      const healthRes = await fetch('/api/observability/health');
      if (healthRes.ok) {
        setApiHealth('healthy');
      } else {
        setApiHealth('degraded');
      }

      // Fetch queue summary for pipeline metrics
      const queueRes = await fetch('/api/observability/queue-summary');
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        if (queueData.ok && queueData.data) {
          const d = queueData.data;
          const metrics: PipelineMetric[] = [];

          // Build metrics from queue summary
          const statusMap: Record<string, string> = {
            needs_script: 'Needs Script',
            scripted: 'Scripted',
            assigned: 'Assigned',
            editing: 'Editing',
            review: 'Review',
            approved: 'Approved',
            posted: 'Posted',
          };

          if (typeof d === 'object') {
            for (const [key, label] of Object.entries(statusMap)) {
              const val = d[key] ?? d[key.toUpperCase()] ?? 0;
              if (typeof val === 'number') {
                metrics.push({ label: label, value: val });
              }
            }
          }
          setPipelineMetrics(metrics);
        }
      }

      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Dashboard refresh error:', err);
      setApiHealth('unhealthy');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const addLog = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setActivityLog(prev => [{ time: new Date().toLocaleTimeString(), message, type }, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [fetchData]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      online: 'bg-green-500/20 text-green-400 border-green-500/30',
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      healthy: 'bg-green-500/20 text-green-400 border-green-500/30',
      configured: 'bg-green-500/20 text-green-400 border-green-500/30',
      success: 'bg-green-500/20 text-green-400 border-green-500/30',
      idle: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
      unknown: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
      paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      needs_config: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      degraded: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      offline: 'bg-red-500/20 text-red-400 border-red-500/30',
      error: 'bg-red-500/20 text-red-400 border-red-500/30',
      unhealthy: 'bg-red-500/20 text-red-400 border-red-500/30',
      running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    return styles[status] || styles.unknown;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
      case 'active':
      case 'healthy':
      case 'configured':
        return <CheckCircle className="w-4 h-4" />;
      case 'offline':
      case 'error':
      case 'unhealthy':
        return <XCircle className="w-4 h-4" />;
      case 'paused':
      case 'needs_config':
      case 'degraded':
        return <AlertTriangle className="w-4 h-4" />;
      case 'running':
        return <Play className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading automation dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <PlanGate minPlan="agency" feature="Automation Dashboard" adminOnly>
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-teal-400" />
          <h1 className="text-xl sm:text-2xl font-bold">Automation Dashboard</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastRefresh && (
            <span className="text-xs sm:text-sm text-zinc-500">Last refresh: {lastRefresh}</span>
          )}
          <button
            onClick={async () => {
              setDeploying(true);
              setDeployMessage('');
              addLog('Starting Vercel deploy...', 'info');
              try {
                const res = await fetch('/api/admin/deploy', { method: 'POST', credentials: 'include' });
                const data = await res.json();
                if (data.ok) {
                  setDeployMessage('Deploy triggered!');
                  addLog('Vercel deploy triggered successfully', 'success');
                } else {
                  setDeployMessage(data.error || 'Deploy failed');
                  addLog(`Deploy failed: ${data.error || 'unknown'}`, 'error');
                }
              } catch {
                setDeployMessage('Deploy request failed');
                addLog('Deploy request failed (network error)', 'error');
              } finally {
                setDeploying(false);
              }
            }}
            disabled={deploying}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Rocket className={`w-4 h-4 ${deploying ? 'animate-bounce' : ''}`} />
            {deploying ? 'Deploying...' : 'Deploy'}
          </button>
          {deployMessage && (
            <span className={`text-xs ${deployMessage.includes('failed') ? 'text-red-400' : 'text-green-400'}`}>
              {deployMessage}
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Top-level status */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`p-4 rounded-xl border ${getStatusBadge(apiHealth)}`}>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4" />
            <span className="text-sm font-medium">FlashFlow API</span>
          </div>
          <span className="text-lg font-bold capitalize">{apiHealth}</span>
        </div>
        <div className="p-4 rounded-xl border bg-zinc-800/50 border-zinc-700">
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-400">Agents</span>
          </div>
          <span className="text-lg font-bold">{AGENTS.filter(a => a.status === 'active').length} / {AGENTS.length} active</span>
        </div>
        <div className="p-4 rounded-xl border bg-zinc-800/50 border-zinc-700">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-400">Cron Tasks</span>
          </div>
          <span className="text-lg font-bold">{CRON_TASKS.filter(t => t.status === 'active').length} / {CRON_TASKS.length} active</span>
        </div>
        <div className="p-4 rounded-xl border bg-zinc-800/50 border-zinc-700">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-400">Machines</span>
          </div>
          <span className="text-lg font-bold">{MACHINES.filter(m => m.status === 'online').length} / {MACHINES.length} online</span>
        </div>
      </div>

      {/* Pipeline Quick View */}
      {pipelineMetrics.length > 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-semibold">Pipeline Snapshot</h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {pipelineMetrics.map((m) => (
              <div key={m.label} className="text-center">
                <div className="text-2xl font-bold text-teal-400">{m.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Machines */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-semibold">Machines</h2>
          </div>
          <div className="space-y-3">
            {MACHINES.map((machine) => (
              <div key={machine.name} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  {machine.status === 'online' ? (
                    <Wifi className="w-5 h-5 text-green-400" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-zinc-500" />
                  )}
                  <div>
                    <div className="font-medium">{machine.name}</div>
                    <div className="text-xs text-zinc-500">{machine.host} &middot; {machine.role}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap gap-1">
                    {machine.capabilities.map((cap) => (
                      <span key={cap} className="px-1.5 py-0.5 text-[10px] bg-zinc-700 rounded text-zinc-400">{cap}</span>
                    ))}
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusBadge(machine.status)}`}>
                    {machine.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agents */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-semibold">OpenClaw Agents</h2>
          </div>
          <div className="space-y-3">
            {AGENTS.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{agent.emoji}</span>
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-xs text-zinc-500">{agent.skills.join(', ')}</div>
                  </div>
                </div>
                <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${getStatusBadge(agent.status)}`}>
                  {getStatusIcon(agent.status)}
                  {agent.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cron Schedule */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-teal-400" />
          <h2 className="text-lg font-semibold">Cron Schedule</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                <th className="pb-2 pr-4">Task</th>
                <th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">Schedule</th>
                <th className="pb-2 pr-4">Machine</th>
                <th className="pb-2 pr-4">Runs</th>
                <th className="pb-2 pr-4">Errors</th>
                <th className="pb-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {CRON_TASKS.map((task) => (
                <tr key={task.name} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 font-mono text-xs text-teal-400">{task.name}</td>
                  <td className="py-2 pr-4 text-zinc-300">{task.description}</td>
                  <td className="py-2 pr-4 text-zinc-400">{task.schedule}</td>
                  <td className="py-2 pr-4 text-zinc-400">{task.machine}</td>
                  <td className="py-2 pr-4 text-zinc-400">{task.runCount}</td>
                  <td className="py-2 pr-4">
                    <span className={task.errorCount > 0 ? 'text-red-400' : 'text-zinc-500'}>
                      {task.errorCount}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`flex items-center gap-1 w-fit px-2 py-0.5 text-xs rounded-full border ${getStatusBadge(task.status)}`}>
                      {getStatusIcon(task.status)}
                      {task.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Automation Scripts */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-teal-400" />
          <h2 className="text-lg font-semibold">Automation Scripts</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {SCRIPTS.map((script) => (
            <div key={script.name} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <div>
                <div className="font-mono text-sm text-teal-400">{script.name}</div>
                <div className="text-xs text-zinc-500">{script.description}</div>
                <div className="text-[10px] text-zinc-600 mt-1">{script.language} &middot; {script.machine}</div>
              </div>
              <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${getStatusBadge(script.status)}`}>
                {getStatusIcon(script.status)}
                {script.status === 'needs_config' ? 'needs config' : script.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="w-5 h-5 text-teal-400" />
          <h2 className="text-lg font-semibold">Activity Log</h2>
          {activityLog.length > 0 && (
            <button
              onClick={() => setActivityLog([])}
              className="ml-auto text-xs text-zinc-500 hover:text-zinc-400"
            >
              Clear
            </button>
          )}
        </div>
        {activityLog.length === 0 ? (
          <div className="text-center py-6 text-zinc-600 text-sm">
            No activity yet. Actions will be logged here.
          </div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
            {activityLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <span className="text-zinc-600 flex-shrink-0">{entry.time}</span>
                <span className={
                  entry.type === 'success' ? 'text-green-400' :
                  entry.type === 'error' ? 'text-red-400' :
                  'text-zinc-400'
                }>
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Setup Checklist */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5 text-teal-400" />
          <h2 className="text-lg font-semibold">Setup Checklist</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            { label: 'FlashFlow API deployed', done: true },
            { label: 'API key created', done: true },
            { label: 'OpenClaw gateway running', done: true },
            { label: 'Telegram bot connected', done: true },
            { label: 'FlashFlow agent configured', done: true },
            { label: '6 cron jobs active', done: true },
            { label: '9 OpenClaw skills deployed', done: true },
            { label: 'Content pipeline scripts ready', done: true },
            { label: 'VA workflow automation live', done: true },
            { label: 'Analytics engine deployed', done: true },
            { label: 'Multi-account posting ready', done: true },
            { label: 'Integration tests passing (94%)', done: true },
            { label: 'Google Drive credentials', done: false },
            { label: 'Discord bot token', done: false },
            { label: 'HP worker set up', done: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              {item.done ? (
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-zinc-600 flex-shrink-0" />
              )}
              <span className={item.done ? 'text-zinc-300' : 'text-zinc-500'}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    </PlanGate>
  );
}
