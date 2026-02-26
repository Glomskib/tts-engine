'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, RefreshCw, LayoutGrid, Table } from 'lucide-react';
import CCSubnav from '../../_components/CCSubnav';
import BoardView from '../_components/BoardView';
import TableView from '../_components/TableView';
import TaskDrawer from '../_components/TaskDrawer';
import { AGENTS } from '../_components/constants';
import type { TaskWithProject } from '../_components/constants';
import type { CcProject } from '@/lib/command-center/types';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  paused: 'bg-amber-500/20 text-amber-400',
  archived: 'bg-zinc-500/20 text-zinc-400',
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<CcProject | null>(null);
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskWithProject | null>(null);
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');

  // Inline task creation
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', assigned_agent: 'unassigned', priority: 3 });

  // Restore view preference
  useEffect(() => {
    const saved = localStorage.getItem('cc-projects-view');
    if (saved === 'board' || saved === 'table') setViewMode(saved);
  }, []);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/admin/cc-projects/${id}`);
    if (res.ok) {
      const json = await res.json();
      setProject(json.data);
    }
  }, [id]);

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams({ project_id: id });
    if (statusFilter) params.set('status', statusFilter);
    if (agentFilter) params.set('agent', agentFilter);
    const res = await fetch(`/api/admin/cc-projects/tasks?${params}`);
    if (res.ok) {
      const json = await res.json();
      setTasks(json.data || []);
    }
  }, [id, statusFilter, agentFilter]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchProject(), fetchTasks()]).finally(() => setLoading(false));
  }, [fetchProject, fetchTasks]);

  function handleViewChange(mode: 'board' | 'table') {
    setViewMode(mode);
    localStorage.setItem('cc-projects-view', mode);
  }

  async function handleUpdateTask(taskId: string, updates: Record<string, unknown>) {
    await fetch('/api/admin/cc-projects/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, ...updates }),
    });
    await fetchTasks();
    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) => prev ? { ...prev, ...updates } as TaskWithProject : null);
    }
  }

  async function createTask() {
    if (!newTask.title.trim()) return;
    await fetch('/api/admin/cc-projects/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: id,
        title: newTask.title,
        assigned_agent: newTask.assigned_agent,
        priority: newTask.priority,
      }),
    });
    setNewTask({ title: '', assigned_agent: 'unassigned', priority: 3 });
    setShowNewTask(false);
    await fetchTasks();
  }

  return (
    <div className="space-y-6">
      <CCSubnav />

      {/* Breadcrumb + controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/command-center/projects" className="text-sm text-zinc-500 hover:text-zinc-300">
            Campaigns
          </Link>
          <span className="text-zinc-600">/</span>
          <h2 className="text-lg font-semibold text-white">
            {project?.name || 'Loading...'}
          </h2>
          {project && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[project.status] || 'text-zinc-500'}`}>
              {project.status}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="flex bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => handleViewChange('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'board' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Board
            </button>
            <button
              onClick={() => handleViewChange('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              Table
            </button>
          </div>

          <button
            onClick={() => { fetchProject(); fetchTasks(); }}
            className="p-2 text-zinc-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowNewTask(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
          >
            <Plus className="w-4 h-4" /> Add Task
          </button>
        </div>
      </div>

      {/* Project info */}
      {project && (
        <div className="flex items-center gap-4 text-sm text-zinc-500">
          <span>Type: <span className="text-zinc-300">{project.type}</span></span>
          {project.owner && <span>Owner: <span className="text-zinc-300">{project.owner}</span></span>}
        </div>
      )}

      {/* Inline task creation form */}
      {showNewTask && (
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
          <div className="flex items-center gap-3">
            <input
              placeholder="Task title"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') createTask(); }}
              autoFocus
              className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm"
            />
            <select
              value={newTask.assigned_agent}
              onChange={(e) => setNewTask({ ...newTask, assigned_agent: e.target.value })}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm"
            >
              <option value="unassigned">Unassigned</option>
              {AGENTS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={newTask.priority}
              onChange={(e) => setNewTask({ ...newTask, priority: Number(e.target.value) })}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm"
            >
              <option value={1}>P1 Critical</option>
              <option value={2}>P2 High</option>
              <option value={3}>P3 Medium</option>
              <option value={4}>P4 Low</option>
              <option value={5}>P5 Nice-to-have</option>
            </select>
            <button onClick={createTask} disabled={!newTask.title.trim()} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded disabled:opacity-50">
              Create
            </button>
            <button onClick={() => setShowNewTask(false)} className="px-4 py-2 text-sm bg-zinc-700 text-zinc-300 rounded">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Board / Table view */}
      {viewMode === 'board' ? (
        <BoardView
          tasks={tasks}
          onUpdateTask={handleUpdateTask}
          onSelectTask={setSelectedTask}
        />
      ) : (
        <TableView
          tasks={tasks}
          onUpdateTask={handleUpdateTask}
          onSelectTask={setSelectedTask}
          statusFilter={statusFilter}
          agentFilter={agentFilter}
          onStatusFilterChange={setStatusFilter}
          onAgentFilterChange={setAgentFilter}
        />
      )}

      {/* Task Drawer */}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdateTask}
        />
      )}
    </div>
  );
}
