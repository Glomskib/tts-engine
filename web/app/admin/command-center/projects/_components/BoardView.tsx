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
import TaskCard from './TaskCard';
import { STATUS_COLUMNS } from './constants';
import type { TaskWithProject } from './constants';

interface Props {
  tasks: TaskWithProject[];
  onUpdateTask: (taskId: string, updates: Record<string, unknown>) => Promise<void>;
  onSelectTask: (task: TaskWithProject) => void;
}

function DroppableColumn({
  id,
  label,
  dotClass,
  textClass,
  tasks,
  onSelectTask,
}: {
  id: string;
  label: string;
  dotClass: string;
  textClass: string;
  tasks: TaskWithProject[];
  onSelectTask: (task: TaskWithProject) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex-1 min-w-[260px]">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className={`text-sm font-semibold ${textClass}`}>{label}</span>
        <span className="ml-auto text-xs text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5">
          {tasks.length}
        </span>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[200px] rounded-lg p-2 transition-colors ${
          isOver ? 'bg-zinc-800/60 ring-1 ring-zinc-600' : 'bg-zinc-900/30'
        }`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onSelectTask(task)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="py-8 text-center text-xs text-zinc-600">No tasks</div>
        )}
      </div>
    </div>
  );
}

export default function BoardView({ tasks, onUpdateTask, onSelectTask }: Props) {
  const [activeTask, setActiveTask] = useState<TaskWithProject | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Group tasks by status
  const tasksByStatus = useCallback(
    (status: string) => {
      const filtered = tasks.filter((t) => t.status === status);
      // For the Done column, also include killed tasks (greyed)
      if (status === 'done') {
        const killed = tasks.filter((t) => t.status === 'killed');
        return [...filtered, ...killed].sort((a, b) => a.sort_order - b.sort_order);
      }
      return filtered.sort((a, b) => a.sort_order - b.sort_order);
    },
    [tasks],
  );

  function findColumnForTask(taskId: string): string | null {
    for (const col of STATUS_COLUMNS) {
      const colTasks = tasksByStatus(col.dbValue);
      if (colTasks.some((t) => t.id === taskId)) return col.dbValue;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const task = (event.active.data.current as { task: TaskWithProject })?.task;
    if (task) setActiveTask(task);
  }

  function handleDragOver(_event: DragOverEvent) {
    // Visual feedback handled by droppable isOver state
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;

    // Determine target column: the over target could be a column id or another task id
    let targetStatus: string | null = null;

    // Check if dropped on a column directly
    const isColumn = STATUS_COLUMNS.some((c) => c.dbValue === over.id);
    if (isColumn) {
      targetStatus = over.id as string;
    } else {
      // Dropped on a task — find which column that task is in
      targetStatus = findColumnForTask(over.id as string);
    }

    if (!targetStatus) return;

    // Find the dragged task's current status
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // If same column and same position, no-op
    if (task.status === targetStatus) return;

    // Map 'done' column back for killed tasks that get dragged - don't change killed to done unless explicit
    const effectiveStatus = targetStatus === 'done' && task.status === 'killed' ? 'killed' : targetStatus;
    if (task.status === effectiveStatus) return;

    // Calculate sort_order: place at the end of the target column
    const targetTasks = tasksByStatus(targetStatus);
    const newSortOrder = targetTasks.length > 0
      ? Math.max(...targetTasks.map((t) => t.sort_order)) + 1
      : 0;

    await onUpdateTask(taskId, { status: effectiveStatus, sort_order: newSortOrder });
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
        {STATUS_COLUMNS.map((col) => (
          <DroppableColumn
            key={col.dbValue}
            id={col.dbValue}
            label={col.label}
            dotClass={col.dotClass}
            textClass={col.textClass}
            tasks={tasksByStatus(col.dbValue)}
            onSelectTask={onSelectTask}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-3 shadow-2xl w-[260px] opacity-90">
            <p className="text-sm text-zinc-200 font-medium truncate">{activeTask.title}</p>
            <p className="text-xs text-zinc-500 font-mono mt-1">{activeTask.assigned_agent}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
