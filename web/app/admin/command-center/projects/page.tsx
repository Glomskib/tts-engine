'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, RefreshCw, LayoutGrid, Table } from 'lucide-react';
import Link from 'next/link';
import InitiativeFilter from '../_components/InitiativeFilter';
import BoardView from './_components/BoardView';
import TableView from './_components/TableView';
import TaskDrawer from './_components/TaskDrawer';
import type { TaskWithProject } from './_components/constants';

interface Project {
  id: string;
  name: string;
  type: string;
  status: string;
  owner: string | null;
  created_at: string;
  initiative_id: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900/40 text-green-400',
  paused: 'bg-yellow-900/40 text-yellow-400',
  archived: 'bg-zinc-700/40 text-zinc-400',
};

type ViewMode = 'board' | 'table';

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'board';
  return (localStorage.getItem('cc-projects-view') as ViewMode) || 'board';
}

function saveViewMode(mode: ViewMode) {
  localStorage.setItem('cc-projects-view', mode);
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', type: 'flashflow', status: 'active' });
  const [statusFilter, setStatusFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [initiativeId, setInitiativeId] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('board');

  // Load persisted view mode on mount
  useEffect(() => {
    setViewMode(loadViewMode());
  }, []);

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    saveViewMode(mode);
  }

  const fetchProjects = useCallback(async () => {
    const params = new URLSearchParams();
    if (initiativeId) params.set('initiative_id', initiativeId);
    const res = await fetch(`/api/admin/cc-projects?${params}`);
    if (res.ok) {
      const json = await res.json();
      setProjects(json.data || []);
    }
  }, [initiativeId]);

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedProject) params.set('project_id', selectedProject);
    if (statusFilter) params.set('status', statusFilter);
    if (agentFilter) params.set('agent', agentFilter);
    const res = await fetch(`/api/admin/cc-projects/tasks?${params}`);
    if (res.ok) {
      const json = await res.json();
      setTasks(json.data || []);
    }
  }, [selectedProject, statusFilter, agentFilter]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchProjects(), fetchTasks()]).finally(() => setLoading(false));
  }, [fetchProjects, fetchTasks]);

  async function createProject() {
    const res = await fetch('/api/admin/cc-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProject),
    });
    if (res.ok) {
      setShowNewProject(false);
      setNewProject({ name: '', type: 'flashflow', status: 'active' });
      fetchProjects();
    }
  }

  async function handleUpdateTask(taskId: string, updates: Record<string, unknown>) {
    await fetch('/api/admin/cc-projects/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, ...updates }),
    });
    await fetchTasks();
    // If the drawer is open for this task, update it
    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) => prev ? { ...prev, ...updates } as TaskWithProject : null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/command-center" className="text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Projects & Tasks</h1>
          <p className="text-sm text-zinc-500">Track what the bots are working on</p>
        </div>

        {/* View switcher */}
        <div className="flex bg-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => handleViewChange('board')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === 'board'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Board
          </button>
          <button
            onClick={() => handleViewChange('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === 'table'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Table
          </button>
        </div>

        <InitiativeFilter value={initiativeId} onChange={setInitiativeId} />
        <button onClick={() => { fetchProjects(); fetchTasks(); }} className="p-2 text-zinc-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => setShowNewProject(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {/* New project form */}
      {showNewProject && (
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Project name" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm" />
            <select value={newProject.type} onChange={(e) => setNewProject({ ...newProject, type: e.target.value })} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm">
              <option value="flashflow">FlashFlow</option>
              <option value="ttshop">TTShop</option>
              <option value="zebby">Zebby</option>
              <option value="hhh">HHH</option>
              <option value="other">Other</option>
            </select>
            <div className="flex gap-2">
              <button onClick={createProject} disabled={!newProject.name} className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded disabled:opacity-50">Create</button>
              <button onClick={() => setShowNewProject(false)} className="px-4 py-2 text-sm bg-zinc-700 text-zinc-300 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout: sidebar + main */}
      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        {/* Project sidebar */}
        <div className="space-y-2">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Projects</div>
          <button
            onClick={() => setSelectedProject(null)}
            className={`w-full text-left px-3 py-2 text-sm rounded ${
              !selectedProject ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            All Tasks
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProject(p.id)}
              className={`w-full text-left px-3 py-2 text-sm rounded ${
                selectedProject === p.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <div className="font-medium truncate">{p.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[p.status] || 'text-zinc-500'}`}>
                  {p.status}
                </span>
                <span className="text-xs text-zinc-600">{p.type}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Main content area */}
        <div>
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
        </div>
      </div>

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
