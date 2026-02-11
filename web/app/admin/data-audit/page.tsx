"use client";

import { useState, useEffect } from "react";
import { fetchJson, postJson, isApiError } from "@/lib/http/fetchJson";
import {
  Database,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Package,
  Users,
  FileText,
} from "lucide-react";

interface AuditData {
  counts: Record<string, number>;
  needs: { products: boolean; personas: boolean; scripts: boolean };
  errors: string[];
}

interface SeedResult {
  seeded: Record<string, number>;
  counts: Record<string, number>;
}

export default function DataAuditPage() {
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);

  const runAudit = async () => {
    setLoading(true);
    const resp = await fetchJson<AuditData>("/api/onboarding/seed");
    if (!isApiError(resp)) {
      setAudit(resp.data);
    }
    setLoading(false);
  };

  const runSeed = async () => {
    setSeeding(true);
    const resp = await postJson<SeedResult>("/api/onboarding/seed", {});
    if (!isApiError(resp)) {
      setSeedResult(resp.data);
      setAudit((prev) =>
        prev ? { ...prev, counts: resp.data.counts, needs: { products: false, personas: false, scripts: false } } : prev,
      );
    }
    setSeeding(false);
  };

  useEffect(() => {
    runAudit();
  }, []);

  const counts = seedResult?.counts || audit?.counts || {};
  const needs = audit?.needs;

  const getStatusIcon = (count: number) => {
    if (count < 0) return <XCircle className="w-4 h-4 text-red-400" />;
    if (count === 0) return <AlertCircle className="w-4 h-4 text-amber-400" />;
    return <CheckCircle2 className="w-4 h-4 text-green-400" />;
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Database className="w-7 h-7 text-teal-400" />
            Data Audit &amp; Seed
          </h1>
          <p className="text-zinc-400 mt-1">
            Database row counts and auto-seed missing data
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Needs seeding banner */}
      {needs && (needs.products || needs.personas || needs.scripts) && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-amber-300 mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Missing Data Detected
          </h3>
          <ul className="text-sm text-amber-200/80 space-y-1 mb-4">
            {needs.products && (
              <li className="flex items-center gap-2">
                <Package className="w-4 h-4" /> Products: fewer than 5 — will seed 10 wellness/health products
              </li>
            )}
            {needs.personas && (
              <li className="flex items-center gap-2">
                <Users className="w-4 h-4" /> Personas: fewer than 3 — will seed 5 audience personas
              </li>
            )}
            {needs.scripts && (
              <li className="flex items-center gap-2">
                <FileText className="w-4 h-4" /> Scripts: none — will generate 5 sample scripts
              </li>
            )}
          </ul>
          <button
            onClick={runSeed}
            disabled={seeding}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-5 py-2.5 rounded-lg font-medium text-sm inline-flex items-center gap-2 transition-colors"
          >
            {seeding ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Seeding...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" /> Auto-Seed Missing Data
              </>
            )}
          </button>
        </div>
      )}

      {/* Seed result */}
      {seedResult && (
        <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-green-300 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Seeding Complete
          </h3>
          <div className="text-sm text-green-200/80 mt-2 space-y-1">
            {Object.entries(seedResult.seeded).map(([key, count]) => (
              <p key={key}>
                {key}: {count} records added
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Table counts */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <h3 className="font-semibold">Database Contents</h3>
          <p className="text-xs text-zinc-500 mt-1">Row counts for your user across all tables</p>
        </div>
        {loading && !audit ? (
          <div className="p-8 text-center text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            Auditing...
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {Object.entries(counts)
              .sort(([, a], [, b]) => b - a)
              .map(([table, count]) => (
                <div
                  key={table}
                  className="flex items-center justify-between px-5 py-3 hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(count)}
                    <span className="font-mono text-sm">{table}</span>
                  </div>
                  <span
                    className={`font-mono text-sm font-medium ${
                      count < 0
                        ? "text-red-400"
                        : count === 0
                          ? "text-zinc-500"
                          : "text-white"
                    }`}
                  >
                    {count < 0 ? "error" : count.toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Errors */}
      {audit?.errors && audit.errors.length > 0 && (
        <div className="mt-4 bg-red-900/20 border border-red-700/40 rounded-xl p-4">
          <h3 className="font-semibold text-red-300 text-sm mb-2">Table Errors</h3>
          <ul className="text-xs text-red-200/70 space-y-1 font-mono">
            {audit.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
