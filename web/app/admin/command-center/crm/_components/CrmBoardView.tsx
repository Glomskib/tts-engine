'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import DealCard from './DealCard';
import type { DealWithContact, PipelineStage } from './constants';

interface Props {
  deals: DealWithContact[];
  stages: PipelineStage[];
  onUpdateDeal: (dealId: string, updates: Record<string, unknown>) => Promise<void>;
  onSelectDeal: (deal: DealWithContact) => void;
}

function DroppableColumn({
  stage,
  deals,
  onSelectDeal,
}: {
  stage: PipelineStage;
  deals: DealWithContact[];
  onSelectDeal: (deal: DealWithContact) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });

  return (
    <div className="flex-1 min-w-[240px]">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
        <span className="text-sm font-semibold" style={{ color: stage.color }}>{stage.label}</span>
        <span className="ml-auto text-xs text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5">
          {deals.length}
        </span>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[200px] rounded-lg p-2 transition-colors ${
          isOver ? 'bg-zinc-800/60 ring-1 ring-zinc-600' : 'bg-zinc-900/30'
        }`}
      >
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onClick={() => onSelectDeal(deal)}
            />
          ))}
        </SortableContext>
        {deals.length === 0 && (
          <div className="py-8 text-center text-xs text-zinc-600">No deals</div>
        )}
      </div>
    </div>
  );
}

export default function CrmBoardView({ deals, stages, onUpdateDeal, onSelectDeal }: Props) {
  const [activeDeal, setActiveDeal] = useState<DealWithContact | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const dealsByStage = useCallback(
    (stageKey: string) => {
      return deals
        .filter((d) => d.stage_key === stageKey)
        .sort((a, b) => a.sort_order - b.sort_order);
    },
    [deals],
  );

  function findColumnForDeal(dealId: string): string | null {
    for (const stage of stages) {
      const stageDeals = dealsByStage(stage.key);
      if (stageDeals.some((d) => d.id === dealId)) return stage.key;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const deal = (event.active.data.current as { deal: DealWithContact })?.deal;
    if (deal) setActiveDeal(deal);
  }

  function handleDragOver(_event: DragOverEvent) {
    // Visual feedback handled by droppable isOver state
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null);

    const { active, over } = event;
    if (!over) return;

    const dealId = active.id as string;

    // Determine target stage
    let targetStage: string | null = null;
    const isColumn = stages.some((s) => s.key === over.id);
    if (isColumn) {
      targetStage = over.id as string;
    } else {
      targetStage = findColumnForDeal(over.id as string);
    }

    if (!targetStage) return;

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_key === targetStage) return;

    // Place at end of target stage
    const targetDeals = dealsByStage(targetStage);
    const newSortOrder = targetDeals.length > 0
      ? Math.max(...targetDeals.map((d) => d.sort_order)) + 1
      : 0;

    await onUpdateDeal(dealId, { stage_key: targetStage, sort_order: newSortOrder });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <DroppableColumn
            key={stage.key}
            stage={stage}
            deals={dealsByStage(stage.key)}
            onSelectDeal={onSelectDeal}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? (
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-3 shadow-2xl w-[240px] opacity-90">
            <p className="text-sm text-zinc-200 font-medium truncate">{activeDeal.title}</p>
            {activeDeal.crm_contacts && (
              <p className="text-xs text-zinc-500 mt-1">{activeDeal.crm_contacts.name}</p>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
