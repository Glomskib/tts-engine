import { FileText, CalendarClock } from 'lucide-react';
import type { MmmMeetingNote } from '@/lib/command-center/mmm/types';
import { Card } from './Section';

export function MeetingNotes({ notes }: { notes: MmmMeetingNote[] }) {
  if (notes.length === 0) {
    return (
      <Card>
        <div className="text-sm text-zinc-500">
          No meeting notes yet. Drop a markdown file in{' '}
          <code className="text-zinc-400">web/content/meetings/mmm/</code> with the front-matter
          format documented in <code className="text-zinc-400">lib/command-center/mmm/meeting-notes.ts</code>.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <NoteCard key={note.slug} note={note} />
      ))}
    </div>
  );
}

function NoteCard({ note }: { note: MmmMeetingNote }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-zinc-300" />
          <span className="text-sm font-semibold text-zinc-100">{note.title}</span>
        </div>
        <span className="text-[11px] text-zinc-500 flex items-center gap-1">
          <CalendarClock className="w-3 h-3" />
          {note.date_iso}
        </span>
      </div>
      {note.attendees.length > 0 ? (
        <div className="text-[11px] text-zinc-500 mb-2">
          <span className="uppercase tracking-wider">Attendees:</span>{' '}
          <span className="text-zinc-400">{note.attendees.join(', ')}</span>
        </div>
      ) : null}

      {note.decisions.length > 0 ? (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Decisions</div>
          <ul className="text-xs text-zinc-300 list-disc list-inside space-y-0.5">
            {note.decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {note.action_items.length > 0 ? (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Action items</div>
          <ul className="text-xs text-zinc-300 list-disc list-inside space-y-0.5">
            {note.action_items.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="text-[10px] text-zinc-600 mt-2 truncate">
        Source: <code>{note.source_path}</code>
      </div>
    </Card>
  );
}
