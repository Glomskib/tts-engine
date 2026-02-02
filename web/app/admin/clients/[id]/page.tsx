'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Building2, Mail, Phone, Calendar, Video,
  FileText, CreditCard, Edit, Trash2, Clock, TrendingUp,
  MoreVertical, ExternalLink, Send, Globe, User, Loader2, X
} from 'lucide-react';
import Link from 'next/link';
import AppLayout from '../../../components/AppLayout';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface Client {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  website?: string;
  status: 'active' | 'paused' | 'churned';
  plan_name: string;
  videos_quota: number;
  videos_used: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface VideoRequest {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [videos, setVideos] = useState<VideoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'videos' | 'billing'>('overview');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchClient();
  }, [id]);

  const fetchClient = async () => {
    try {
      const response = await fetch(`/api/admin/clients/${id}`);
      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
        setVideos(data.videos || []);
        setEditData(data.client);
      } else {
        router.push('/admin/clients');
      }
    } catch (error) {
      console.error('Failed to fetch client:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!client) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });

      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
        setShowEditModal(false);
      }
    } catch (error) {
      console.error('Failed to update client:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/clients/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/admin/clients');
      }
    } catch (error) {
      console.error('Failed to delete client:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: 'active' | 'paused' | 'churned') => {
    try {
      const response = await fetch(`/api/admin/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <div className="px-4 py-6 text-center">
          <p className="text-zinc-400">Client not found</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-4 py-6 pb-24 lg:pb-8 max-w-5xl mx-auto">
        {/* Back button */}
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Clients
        </Link>

        {/* Client header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-purple-500 flex items-center justify-center text-white font-bold text-2xl">
                {client.company_name[0]}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{client.company_name}</h1>
                <p className="text-zinc-400">{client.contact_name}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {client.email}
                  </span>
                  {client.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {client.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={client.status}
                onChange={(e) => handleStatusChange(e.target.value as 'active' | 'paused' | 'churned')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  client.status === 'active' ? 'bg-green-500/20 text-green-400' :
                  client.status === 'paused' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400'
                }`}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="churned">Churned</option>
              </select>
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
              >
                <Edit className="w-4 h-4 text-zinc-400" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 bg-zinc-800 hover:bg-red-500/20 rounded-lg"
              >
                <Trash2 className="w-4 h-4 text-zinc-400 hover:text-red-400" />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-zinc-800">
            <div>
              <p className="text-sm text-zinc-500">Plan</p>
              <p className="text-lg font-semibold text-white capitalize">{client.plan_name}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Videos This Month</p>
              <p className="text-lg font-semibold text-white">{client.videos_used} / {client.videos_quota}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Member Since</p>
              <p className="text-lg font-semibold text-white">
                {new Date(client.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['overview', 'videos', 'billing'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-teal-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Contact Info */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Contact Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-zinc-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Contact Name</p>
                    <p className="text-white">{client.contact_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-zinc-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Email</p>
                    <a href={`mailto:${client.email}`} className="text-teal-400 hover:text-teal-300">
                      {client.email}
                    </a>
                  </div>
                </div>
                {client.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-zinc-500" />
                    <div>
                      <p className="text-sm text-zinc-500">Phone</p>
                      <p className="text-white">{client.phone}</p>
                    </div>
                  </div>
                )}
                {client.website && (
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-zinc-500" />
                    <div>
                      <p className="text-sm text-zinc-500">Website</p>
                      <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 flex items-center gap-1">
                        {client.website.replace(/^https?:\/\//, '')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
              {client.notes && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <p className="text-sm text-zinc-500 mb-1">Notes</p>
                  <p className="text-zinc-300">{client.notes}</p>
                </div>
              )}
            </div>

            {/* Recent Videos */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Recent Videos</h2>
                <button
                  onClick={() => setActiveTab('videos')}
                  className="text-sm text-teal-400 hover:text-teal-300"
                >
                  View all
                </button>
              </div>
              {videos.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No videos yet</p>
              ) : (
                <div className="space-y-3">
                  {videos.slice(0, 5).map((video) => (
                    <div key={video.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Video className="w-5 h-5 text-zinc-500" />
                        <div>
                          <p className="text-white">{video.title}</p>
                          <p className="text-xs text-zinc-500">
                            {new Date(video.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        video.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        video.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-zinc-700 text-zinc-400'
                      }`}>
                        {video.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'videos' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">All Videos</h2>
            {videos.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">No videos yet</p>
            ) : (
              <div className="space-y-3">
                {videos.map((video) => (
                  <div key={video.id} className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Video className="w-5 h-5 text-zinc-500" />
                      <div>
                        <p className="text-white font-medium">{video.title}</p>
                        <p className="text-sm text-zinc-500">
                          Created {new Date(video.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      video.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      video.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-zinc-700 text-zinc-400'
                    }`}>
                      {video.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Billing Information</h2>
            <p className="text-zinc-500 text-center py-8">Billing details coming soon</p>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowEditModal(false)} />
            <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <h2 className="text-lg font-semibold text-white">Edit Client</h2>
                <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-zinc-800 rounded">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={editData.company_name || ''}
                    onChange={(e) => setEditData({ ...editData, company_name: e.target.value })}
                    className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Contact Name</label>
                    <input
                      type="text"
                      value={editData.contact_name || ''}
                      onChange={(e) => setEditData({ ...editData, contact_name: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={editData.email || ''}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={editData.phone || ''}
                      onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Website</label>
                    <input
                      type="url"
                      value={editData.website || ''}
                      onChange={(e) => setEditData({ ...editData, website: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Plan</label>
                    <select
                      value={editData.plan_name || 'starter'}
                      onChange={(e) => setEditData({ ...editData, plan_name: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    >
                      <option value="starter">Starter</option>
                      <option value="growth">Growth</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Video Quota</label>
                    <input
                      type="number"
                      value={editData.videos_quota || 30}
                      onChange={(e) => setEditData({ ...editData, videos_quota: parseInt(e.target.value) || 30 })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                      min="1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Notes</label>
                  <textarea
                    value={editData.notes || ''}
                    onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={saving}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Client"
          message={`Are you sure you want to delete ${client.company_name}? This action cannot be undone.`}
          confirmText="Delete"
          variant="danger"
          isLoading={deleting}
        />
      </div>
    </AppLayout>
  );
}
