'use client';

interface ScriptSection {
  label: string;
  content: string;
  type?: 'hook' | 'beat' | 'cta' | 'overlay' | 'note';
}

interface RecordingScriptCardProps {
  title: string;
  brand?: string | null;
  scriptText: string | null;
  sections: ScriptSection[];
  largeMode: boolean;
  teleprompterMode: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  hook: 'border-amber-500/30 bg-amber-500/5',
  beat: 'border-zinc-700 bg-zinc-900/50',
  cta: 'border-teal-500/30 bg-teal-500/5',
  overlay: 'border-violet-500/30 bg-violet-500/5',
  note: 'border-zinc-700 bg-zinc-800/30',
};

const TYPE_LABEL_COLORS: Record<string, string> = {
  hook: 'text-amber-400',
  beat: 'text-zinc-400',
  cta: 'text-teal-400',
  overlay: 'text-violet-400',
  note: 'text-zinc-500',
};

export function RecordingScriptCard({
  title,
  brand,
  scriptText,
  sections,
  largeMode,
  teleprompterMode,
}: RecordingScriptCardProps) {
  const baseFontSize = largeMode ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg';
  const sectionFontSize = largeMode ? 'text-lg sm:text-xl' : 'text-sm sm:text-base';
  const labelSize = largeMode ? 'text-sm' : 'text-xs';

  if (teleprompterMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 sm:px-12">
        {scriptText ? (
          <div className={`${baseFontSize} leading-relaxed text-zinc-100 text-center max-w-2xl whitespace-pre-wrap font-light`}>
            {scriptText}
          </div>
        ) : (
          <div className="text-zinc-500 text-lg">No script attached</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg sm:text-xl font-semibold text-white leading-tight">{title}</h2>
        {brand && <p className="text-xs text-zinc-500 mt-0.5">{brand}</p>}
      </div>

      {/* Full Script */}
      {scriptText && (
        <div className="border border-zinc-700/60 rounded-xl p-4 sm:p-6 bg-zinc-900/40">
          <div className={`${labelSize} font-semibold text-zinc-400 uppercase tracking-wider mb-2`}>
            Script
          </div>
          <div className={`${baseFontSize} leading-relaxed text-zinc-100 whitespace-pre-wrap`}>
            {scriptText}
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.length > 0 && (
        <div className="space-y-2.5">
          {sections.map((section, i) => {
            const borderColor = TYPE_COLORS[section.type || 'beat'] || TYPE_COLORS.beat;
            const labelColor = TYPE_LABEL_COLORS[section.type || 'beat'] || TYPE_LABEL_COLORS.beat;
            return (
              <div
                key={i}
                className={`border rounded-lg p-3 sm:p-4 ${borderColor}`}
              >
                <div className={`${labelSize} font-semibold uppercase tracking-wider mb-1 ${labelColor}`}>
                  {section.label}
                </div>
                <div className={`${sectionFontSize} leading-relaxed text-zinc-200 whitespace-pre-wrap`}>
                  {section.content}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No content fallback */}
      {!scriptText && sections.length === 0 && (
        <div className="text-center py-12 text-zinc-500 text-sm">
          No script or recording notes available for this video
        </div>
      )}
    </div>
  );
}
