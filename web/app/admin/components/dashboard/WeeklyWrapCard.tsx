"use client";

import { useEffect, useState } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface WeeklySnapshot {
  user_id: string;
  week_start: string;
  scripts_generated: number;
  top_script_score: number | null;
  top_script_title: string | null;
  credits_used: number;
  videos_posted: number;
  retainer_videos_posted: number | null;
  retainer_videos_goal: number | null;
  content_idea_persona: string | null;
  content_idea_product: string | null;
  content_idea_angle_lift: number | null;
}

interface UserSnapshot extends WeeklySnapshot {
  email: string;
  plan_id: string;
}

export default function WeeklyWrapCard() {
  const [snapshots, setSnapshots] = useState<UserSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserSnapshot | null>(null);

  useEffect(() => {
    const fetchWeeklyData = async () => {
      try {
        setLoading(true);

        // Get this week's start date
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekStartStr = weekStart.toISOString().split("T")[0];

        // Fetch weekly snapshots for this week
        const { data: snapshots, error: snapError } = await supabaseAdmin
          .from("weekly_snapshots")
          .select("*")
          .eq("week_start", weekStartStr);

        if (snapError) throw snapError;

        if (snapshots && snapshots.length > 0) {
          // Get user emails for context
          const userIds = snapshots.map((s) => s.user_id);
          const { data: subscriptions, error: subError } = await supabaseAdmin
            .from("user_subscriptions")
            .select("user_id, plan_id")
            .in("user_id", userIds);

          if (subError) throw subError;

          const subMap = new Map(subscriptions?.map((s) => [s.user_id, s.plan_id]) || []);

          // Enhance snapshots with email/plan data
          const enhanced = snapshots.map((snap) => ({
            ...snap,
            email: snap.user_id.substring(0, 8),
            plan_id: subMap.get(snap.user_id) || "unknown",
          }));

          setSnapshots(enhanced);
          if (enhanced.length > 0) {
            setSelectedUser(enhanced[0]);
          }
        }

        setError(null);
      } catch (err) {
        setError(`Failed to load weekly data: ${err}`);
        console.error("[WeeklyWrapCard] Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchWeeklyData();
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">📊 Weekly Wrap</h2>
        <p className="text-slate-500 dark:text-slate-400">Loading weekly data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">📊 Weekly Wrap</h2>
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">📊 Weekly Wrap</h2>
        <p className="text-slate-500 dark:text-slate-400">No data yet. Weekly digest runs Monday at 8 AM.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">📊 Weekly Wrap</h2>

      {/* User List / Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Subscriber ({snapshots.length})
        </label>
        <select
          value={selectedUser?.user_id || ""}
          onChange={(e) => {
            const snap = snapshots.find((s) => s.user_id === e.target.value);
            setSelectedUser(snap || null);
          }}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
        >
          {snapshots.map((snap) => (
            <option key={snap.user_id} value={snap.user_id}>
              {snap.plan_id.toUpperCase()} · {snap.email} ({snap.scripts_generated} scripts)
            </option>
          ))}
        </select>
      </div>

      {/* Selected User's Data */}
      {selectedUser && (
        <div className="space-y-4">
          {/* Scripts Generated */}
          <div className="flex justify-between items-center p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Scripts Generated</p>
              <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{selectedUser.scripts_generated}</p>
            </div>
            <div className="text-3xl">🎬</div>
          </div>

          {/* Top Script */}
          {selectedUser.top_script_score && (
            <div className="flex justify-between items-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Top Scoring Script</p>
                <p className="font-mono text-sm text-slate-700 dark:text-slate-300">{selectedUser.top_script_title}</p>
                <p className="text-lg font-bold text-purple-600 dark:text-teal-400">
                  {selectedUser.top_script_score}/10
                </p>
              </div>
              <div className="text-3xl">⭐</div>
            </div>
          )}

          {/* Credits */}
          <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Credits</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {selectedUser.credits_used} used
              </p>
            </div>
            <div className="text-3xl">💳</div>
          </div>

          {/* Videos Posted */}
          <div className="flex justify-between items-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Videos Posted</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{selectedUser.videos_posted}</p>
            </div>
            <div className="text-3xl">📱</div>
          </div>

          {/* Retainer Progress */}
          {selectedUser.retainer_videos_goal && (
            <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Retainer Progress</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="w-full bg-teal-200 dark:bg-teal-800 rounded-full h-3">
                    <div
                      className="bg-teal-600 dark:bg-teal-400 h-3 rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          (((selectedUser.retainer_videos_posted || 0) / selectedUser.retainer_videos_goal) * 100),
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm font-mono text-teal-600 dark:text-teal-400">
                  {selectedUser.retainer_videos_posted || 0}/{selectedUser.retainer_videos_goal}
                </span>
              </div>
            </div>
          )}

          {/* Content Idea */}
          {selectedUser.content_idea_persona && (
            <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-200 dark:border-pink-800">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Content Idea</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Try <span className="font-bold text-pink-600 dark:text-pink-400">{selectedUser.content_idea_persona}</span> for{" "}
                <span className="font-bold text-pink-600 dark:text-pink-400">{selectedUser.content_idea_product}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                This angle scored {selectedUser.content_idea_angle_lift?.toFixed(1)}% higher
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
