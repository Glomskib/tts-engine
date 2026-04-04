'use client';

interface ShortcutEntry {
  key: string;
  description: string;
}

interface KeyboardShortcutHelpProps {
  shortcuts: ShortcutEntry[];
  onClose: () => void;
}

export function KeyboardShortcutHelp({ shortcuts, onClose }: KeyboardShortcutHelpProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-xs"
          >
            ESC
          </button>
        </div>
        <div className="space-y-2">
          {shortcuts.map(s => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{s.description}</span>
              <kbd className="text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 min-w-[24px] text-center">
                {s.key === 'Escape' ? 'Esc' : s.key === '/' ? '/' : s.key.toUpperCase()}
              </kbd>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <span className="text-xs text-zinc-500">Toggle this help</span>
            <kbd className="text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300">?</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
