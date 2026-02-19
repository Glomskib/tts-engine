/**
 * Shared hook: initiative filter for Command Center pages.
 * Persists last choice in localStorage for the owner.
 */

const STORAGE_KEY = 'cc_initiative_filter';

export interface InitiativeOption {
  id: string;
  title: string;
}

export function loadSavedInitiative(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveInitiativeChoice(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export async function fetchInitiatives(): Promise<InitiativeOption[]> {
  try {
    const res = await fetch('/api/admin/command-center/initiatives');
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []) as InitiativeOption[];
  } catch {
    return [];
  }
}
