import { User, Crown, Wrench, HandHelping } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MmmTeamMember } from '@/lib/command-center/mmm/types';
import { Card, StatusPill } from './Section';

const ROLE_ICON: Record<MmmTeamMember['role'], LucideIcon> = {
  director: Crown,
  logistics: Wrench,
  helper: HandHelping,
  'volunteer-lead': User,
  finance: User,
  ops: User,
};

export function TeamPanel({ team }: { team: MmmTeamMember[] }) {
  if (team.length === 0) {
    return (
      <Card>
        <div className="text-sm text-zinc-500">No team members configured.</div>
      </Card>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {team.map((m) => (
        <MemberCard key={m.id} member={m} />
      ))}
    </div>
  );
}

function MemberCard({ member }: { member: MmmTeamMember }) {
  const Icon = ROLE_ICON[member.role] || User;
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-zinc-300" />
          <span className="text-sm font-semibold text-zinc-100">{member.name}</span>
        </div>
        <StatusPill label={member.role.replace('-', ' ')} tone={member.is_owner ? 'amber' : 'zinc'} />
      </div>
      {member.email ? (
        <div className="text-[11px] text-zinc-500 mb-1">{member.email}</div>
      ) : null}
      {member.notes ? (
        <p className="text-xs text-zinc-400 leading-relaxed">{member.notes}</p>
      ) : null}
    </Card>
  );
}
