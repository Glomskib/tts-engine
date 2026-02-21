'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Clock, DollarSign } from 'lucide-react';
import { formatDealValue, daysInStage, timeAgo } from './constants';
import type { DealWithContact } from './constants';

interface Props {
  deal: DealWithContact;
  onClick: () => void;
}

export default function DealCard({ deal, onClick }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id, data: { deal } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const days = daysInStage(deal.stage_entered_at);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group bg-zinc-800 border border-zinc-700/50 rounded-lg p-3 hover:border-zinc-600 cursor-pointer transition-colors"
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 p-0.5 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0" onClick={onClick}>
          <p className="text-sm text-zinc-200 font-medium truncate">{deal.title}</p>

          {deal.crm_contacts && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">
              {deal.crm_contacts.name}
              {deal.crm_contacts.company && ` · ${deal.crm_contacts.company}`}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2">
            {deal.value_cents > 0 && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <DollarSign className="w-3 h-3" />
                {formatDealValue(deal.value_cents)}
              </span>
            )}
            {deal.probability < 100 && (
              <span className="text-xs text-zinc-500">{deal.probability}%</span>
            )}
            <span className="flex items-center gap-1 text-xs text-zinc-600 ml-auto">
              <Clock className="w-3 h-3" />
              {days}d
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
