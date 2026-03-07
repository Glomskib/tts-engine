'use client';

import { useMemo } from 'react';
import { FileText, Mic, Scissors, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getStatusConfig } from '@/lib/status';

interface PipelineVideo {
  recording_status: string | null;
  sla_status: string;
}

interface PipelineSummaryBarProps {
  videos: PipelineVideo[];
}

interface MetricCard {
  label: string;
  count: number;
  textClass: string;
  dotClass: string;
  icon: React.ReactNode;
}

export function PipelineSummaryBar({ videos }: PipelineSummaryBarProps) {
  const metrics = useMemo<MetricCard[]>(() => {
    const needsScript = videos.filter(v => v.recording_status === 'NEEDS_SCRIPT' || v.recording_status === 'GENERATING_SCRIPT').length;
    const readyToRecord = videos.filter(v => v.recording_status === 'NOT_RECORDED').length;
    const recorded = videos.filter(v => v.recording_status === 'RECORDED' || v.recording_status === 'AI_RENDERING' || v.recording_status === 'READY_FOR_REVIEW').length;
    const editing = videos.filter(v => v.recording_status === 'EDITED' || v.recording_status === 'APPROVED_NEEDS_EDITS').length;
    const readyToPost = videos.filter(v => v.recording_status === 'READY_TO_POST').length;
    const posted = videos.filter(v => v.recording_status === 'POSTED').length;
    const overdue = videos.filter(v => v.sla_status === 'overdue').length;

    const cfg = {
      script: getStatusConfig('NEEDS_SCRIPT'),
      record: getStatusConfig('NOT_RECORDED'),
      recorded: getStatusConfig('RECORDED'),
      editing: getStatusConfig('EDITED'),
      readyToPost: getStatusConfig('READY_TO_POST'),
      posted: getStatusConfig('POSTED'),
    };

    return [
      { label: 'Scripts Needed', count: needsScript, textClass: cfg.script.text, dotClass: cfg.script.dot, icon: <FileText className="w-3.5 h-3.5" /> },
      { label: 'Ready to Record', count: readyToRecord, textClass: cfg.record.text, dotClass: cfg.record.dot, icon: <Mic className="w-3.5 h-3.5" /> },
      { label: 'Recorded', count: recorded, textClass: cfg.recorded.text, dotClass: cfg.recorded.dot, icon: <Mic className="w-3.5 h-3.5" /> },
      { label: 'Editing', count: editing, textClass: cfg.editing.text, dotClass: cfg.editing.dot, icon: <Scissors className="w-3.5 h-3.5" /> },
      { label: 'Ready to Post', count: readyToPost, textClass: cfg.readyToPost.text, dotClass: cfg.readyToPost.dot, icon: <Send className="w-3.5 h-3.5" /> },
      { label: 'Posted', count: posted, textClass: cfg.posted.text, dotClass: cfg.posted.dot, icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
      { label: 'Overdue', count: overdue, textClass: 'text-red-400', dotClass: 'bg-red-400', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    ];
  }, [videos]);

  if (videos.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 mb-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-3"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`${m.textClass} opacity-60`}>{m.icon}</span>
            <span className="text-[11px] text-zinc-400 leading-tight">{m.label}</span>
          </div>
          <div className={`text-xl font-semibold ${m.count > 0 ? m.textClass : 'text-zinc-600'}`}>
            {m.count}
          </div>
        </div>
      ))}
    </div>
  );
}
