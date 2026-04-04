/**
 * Role-aware defaults for FlashFlow users.
 * Maps user roles to recommended work modes, default filters, and emphasis.
 */

import type { WorkMode } from '@/components/PipelineWorkModeSwitcher';

export type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | 'writer' | 'creator' | 'client' | null;

interface RoleDefaults {
  /** Recommended work mode for pipeline */
  defaultWorkMode: WorkMode;
  /** Suggested filter intent */
  defaultFilterIntent: string;
  /** Label shown in UI */
  roleLabel: string;
  /** Short description of what this role should focus on */
  focusHint: string;
  /** Whether to show the full production console */
  showProductionConsole: boolean;
}

const ROLE_DEFAULTS: Record<string, RoleDefaults> = {
  admin: {
    defaultWorkMode: 'all',
    defaultFilterIntent: 'all',
    roleLabel: 'Operator',
    focusHint: 'Full pipeline visibility',
    showProductionConsole: true,
  },
  writer: {
    defaultWorkMode: 'scripts',
    defaultFilterIntent: 'needs_action',
    roleLabel: 'Writer',
    focusHint: 'Videos needing scripts',
    showProductionConsole: false,
  },
  recorder: {
    defaultWorkMode: 'record',
    defaultFilterIntent: 'my_work',
    roleLabel: 'Creator',
    focusHint: 'Videos ready to record',
    showProductionConsole: false,
  },
  creator: {
    defaultWorkMode: 'record',
    defaultFilterIntent: 'my_work',
    roleLabel: 'Creator',
    focusHint: 'Videos ready to record',
    showProductionConsole: false,
  },
  editor: {
    defaultWorkMode: 'edit',
    defaultFilterIntent: 'my_work',
    roleLabel: 'Editor',
    focusHint: 'Videos ready for editing',
    showProductionConsole: false,
  },
  uploader: {
    defaultWorkMode: 'publish',
    defaultFilterIntent: 'ready_to_post',
    roleLabel: 'Publisher',
    focusHint: 'Videos ready to publish',
    showProductionConsole: false,
  },
  client: {
    defaultWorkMode: 'all',
    defaultFilterIntent: 'all',
    roleLabel: 'Reviewer',
    focusHint: 'Review and approve content',
    showProductionConsole: false,
  },
};

const DEFAULT: RoleDefaults = {
  defaultWorkMode: 'all',
  defaultFilterIntent: 'all',
  roleLabel: 'User',
  focusHint: '',
  showProductionConsole: false,
};

export function getRoleDefaults(role: UserRole): RoleDefaults {
  if (!role) return DEFAULT;
  return ROLE_DEFAULTS[role] || DEFAULT;
}
