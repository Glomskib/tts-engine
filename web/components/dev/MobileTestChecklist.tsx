'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react';

const TESTS = [
  { id: 'bottom-nav', label: 'Bottom nav visible and working' },
  { id: 'nav-queue', label: 'Queue nav item navigates correctly' },
  { id: 'nav-studio', label: 'Studio nav item navigates correctly' },
  { id: 'nav-winners', label: 'Winners nav item navigates correctly' },
  { id: 'nav-activity', label: 'Activity nav item navigates correctly' },
  { id: 'nav-more', label: 'More opens sidebar drawer' },
  { id: 'pipeline-cards', label: 'Pipeline shows cards on mobile' },
  { id: 'pipeline-pull', label: 'Pull-to-refresh works on pipeline' },
  { id: 'pipeline-filter', label: 'Filter button opens filter sheet' },
  { id: 'video-tap', label: 'Tapping video card opens detail sheet' },
  { id: 'sheet-swipe', label: 'Bottom sheet swipes to dismiss' },
  { id: 'approve-loading', label: 'Approve shows loading state' },
  { id: 'approve-toast', label: 'Approve shows toast with undo' },
  { id: 'empty-state', label: 'Empty state shows when no items' },
  { id: 'skeleton', label: 'Skeletons show during loading' },
  { id: 'tap-feedback', label: 'Tap feedback on buttons/cards' },
  { id: 'offline', label: 'Offline indicator shows when offline' },
  { id: 'no-overflow', label: 'No horizontal scroll on any page' },
  { id: 'content-visible', label: 'All content visible (not under nav)' },
];

/**
 * Development-only test checklist for mobile QA.
 * Only renders in development mode.
 */
export function MobileTestChecklist() {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<Record<string, boolean>>({});

  const toggleResult = (id: string) => {
    setResults(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const passCount = Object.values(results).filter(Boolean).length;

  // Only show in development
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-24 right-4 z-[200]">
      <button type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-teal-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2 btn-press"
      >
        <ClipboardCheck className="w-4 h-4" />
        Test {passCount}/{TESTS.length}
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="absolute bottom-12 right-0 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-h-80 overflow-y-auto">
          <div className="p-3 border-b border-zinc-800 sticky top-0 bg-zinc-900">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-teal-400" />
              Mobile Test Checklist
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Tap items to mark as tested
            </p>
          </div>
          <div className="p-2">
            {TESTS.map(test => (
              <button type="button"
                key={test.id}
                onClick={() => toggleResult(test.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 text-left transition-colors"
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  results[test.id] ? 'bg-green-500' : 'bg-zinc-700'
                }`}>
                  {results[test.id] && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className={`text-sm transition-colors ${results[test.id] ? 'text-green-400 line-through' : 'text-zinc-300'}`}>
                  {test.label}
                </span>
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-zinc-800 sticky bottom-0 bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                {passCount === TESTS.length ? 'All tests passed!' : `${TESTS.length - passCount} remaining`}
              </span>
              <button type="button"
                onClick={() => setResults({})}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Reset
              </button>
            </div>
            {passCount === TESTS.length && (
              <div className="mt-2 text-center">
                <span className="text-green-400 text-sm font-medium">
                  Mobile QA Complete
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileTestChecklist;
