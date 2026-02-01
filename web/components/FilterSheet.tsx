'use client';

import { BottomSheet } from './BottomSheet';
import { MobileSelect } from './ui/MobileInput';

interface FilterState {
  status?: string;
  brand?: string;
  assignedTo?: string;
}

interface FilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: FilterState) => void;
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  brands?: { value: string; label: string }[];
}

const STATUS_OPTIONS = [
  'All',
  'Ready to Record',
  'Needs Review',
  'In Progress',
  'Approved',
  'Rejected',
];

export function FilterSheet({
  isOpen,
  onClose,
  onApply,
  filters,
  setFilters,
  brands = [],
}: FilterSheetProps) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filter Videos"
      size="medium"
      stickyFooter={
        <div className="flex gap-3">
          <button
            onClick={() => {
              setFilters({});
              onClose();
            }}
            className="flex-1 h-12 rounded-xl font-medium border border-zinc-700 text-zinc-300 active:bg-zinc-800"
          >
            Clear All
          </button>
          <button
            onClick={() => {
              onApply(filters);
              onClose();
            }}
            className="flex-1 h-12 rounded-xl font-medium bg-teal-600 text-white active:bg-teal-700"
          >
            Apply Filters
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Status filter */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-3">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                onClick={() => setFilters({ ...filters, status: status === 'All' ? undefined : status })}
                className={`
                  h-10 px-4 rounded-full text-sm font-medium transition-colors
                  ${(status === 'All' && !filters.status) || filters.status === status
                    ? 'bg-teal-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700 active:bg-zinc-700'}
                `}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Brand filter */}
        <MobileSelect
          label="Brand"
          value={filters.brand || ''}
          onChange={(e) => setFilters({ ...filters, brand: e.target.value || undefined })}
          options={[
            { value: '', label: 'All Brands' },
            ...brands,
          ]}
        />

        {/* Assigned filter */}
        <MobileSelect
          label="Assigned To"
          value={filters.assignedTo || ''}
          onChange={(e) => setFilters({ ...filters, assignedTo: e.target.value || undefined })}
          options={[
            { value: '', label: 'Anyone' },
            { value: 'me', label: 'Assigned to Me' },
            { value: 'unassigned', label: 'Unassigned' },
          ]}
        />
      </div>
    </BottomSheet>
  );
}
