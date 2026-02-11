"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Ticket,
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  Sparkles,
  X,
} from "lucide-react";

interface PromoCode {
  id: string;
  code: string;
  type: string;
  value: number;
  plan_restriction: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

const TYPE_LABELS: Record<string, string> = {
  free_trial_extension: "Trial Ext.",
  discount_percent: "% Discount",
  discount_fixed: "$ Discount",
  free_months: "Free Months",
  creator_seed: "Creator Seed",
};

export default function PromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    code: "",
    type: "creator_seed",
    value: "1",
    plan_restriction: "",
    max_uses: "1",
    expires_at: "",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/promo-codes");
      const data = await res.json();
      if (data.ok) setCodes(data.data || []);
    } catch (err) {
      console.error("Failed to load promo codes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const handleCreate = async () => {
    if (!form.code.trim()) {
      setError("Code is required");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          type: form.type,
          value: parseFloat(form.value),
          plan_restriction: form.plan_restriction || null,
          max_uses: form.max_uses ? parseInt(form.max_uses) : null,
          expires_at: form.expires_at || null,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "Failed to create code");
        return;
      }

      setShowCreate(false);
      setForm({ code: "", type: "creator_seed", value: "1", plan_restriction: "", max_uses: "1", expires_at: "" });
      loadCodes();
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleBatchGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch_generate",
          count: 30,
          prefix: "FLASH",
          type: "creator_seed",
          value: 1,
          plan_restriction: "creator",
        }),
      });

      const data = await res.json();
      if (data.ok) {
        loadCodes();
      }
    } catch (err) {
      console.error("Batch generate failed:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    // Use admin API to deactivate
    await fetch("/api/admin/promo-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deactivate", id }),
    });
    loadCodes();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Promo Codes</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manage promo codes for creators, affiliates, and campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadCodes}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-zinc-400" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Code
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
        <button
          onClick={handleBatchGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Generate 30 Creator Seed Codes
        </button>
        <p className="text-xs text-zinc-500 mt-2">
          Creates FLASH-001 through FLASH-030. Each gives 1 month free Creator access, single use.
        </p>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-100">Create Promo Code</h2>
              <button onClick={() => setShowCreate(false)}>
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Code</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g., FLASH-031 or JANESCRIPT"
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-sm text-zinc-100 focus:border-teal-500 focus:outline-none"
                >
                  <option value="creator_seed">Creator Seed (free months)</option>
                  <option value="free_months">Free Months</option>
                  <option value="discount_percent">Percentage Discount</option>
                  <option value="discount_fixed">Fixed Dollar Discount</option>
                  <option value="free_trial_extension">Trial Extension (days)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Value</label>
                <input
                  type="number"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-sm text-zinc-100 focus:border-teal-500 focus:outline-none"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  {form.type === "discount_percent" && "Percentage (e.g., 20 = 20% off)"}
                  {form.type === "discount_fixed" && "Dollar amount off"}
                  {(form.type === "free_months" || form.type === "creator_seed") && "Number of months"}
                  {form.type === "free_trial_extension" && "Extra days of trial"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Plan Restriction (optional)
                </label>
                <select
                  value={form.plan_restriction}
                  onChange={(e) => setForm({ ...form, plan_restriction: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-sm text-zinc-100 focus:border-teal-500 focus:outline-none"
                >
                  <option value="">Any plan</option>
                  <option value="starter">Starter</option>
                  <option value="creator">Creator</option>
                  <option value="business">Business</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Max Uses (optional)
                </label>
                <input
                  type="number"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  placeholder="Leave empty for unlimited"
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:border-teal-500 focus:outline-none"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Codes Table */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : codes.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Ticket className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No promo codes yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Uses
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {codes.map((code) => {
                  const isUsed =
                    code.max_uses !== null &&
                    code.current_uses >= code.max_uses;
                  return (
                    <tr key={code.id} className="hover:bg-zinc-800/30">
                      <td className="px-5 py-3 font-mono text-zinc-200">
                        {code.code}
                      </td>
                      <td className="px-5 py-3 text-zinc-400">
                        {TYPE_LABELS[code.type] || code.type}
                      </td>
                      <td className="px-5 py-3 text-zinc-300">
                        {code.type === "discount_percent"
                          ? `${code.value}%`
                          : code.type === "discount_fixed"
                            ? `$${code.value}`
                            : `${code.value} mo`}
                      </td>
                      <td className="px-5 py-3 text-zinc-400">
                        {code.current_uses}/{code.max_uses ?? "\u221e"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            !code.is_active
                              ? "bg-zinc-500/10 text-zinc-500"
                              : isUsed
                                ? "bg-amber-500/10 text-amber-400"
                                : "bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          {!code.is_active
                            ? "Inactive"
                            : isUsed
                              ? "Fully Used"
                              : "Active"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {code.is_active && (
                          <button
                            onClick={() => handleDeactivate(code.id)}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Deactivate"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
