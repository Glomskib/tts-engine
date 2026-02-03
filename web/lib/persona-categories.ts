/**
 * Persona Categories for filtering in the script generator
 */

export const PERSONA_CATEGORIES = [
  { id: 'all', name: 'All', icon: 'Grid' },
  { id: 'lifestyle', name: 'Lifestyle', icon: 'Heart' },
  { id: 'tech', name: 'Tech', icon: 'Cpu' },
  { id: 'beauty', name: 'Beauty', icon: 'Sparkles' },
  { id: 'business', name: 'Business', icon: 'Briefcase' },
  { id: 'fitness', name: 'Fitness', icon: 'Dumbbell' },
  { id: 'comedy', name: 'Comedy', icon: 'Laugh' },
  { id: 'food', name: 'Food', icon: 'ChefHat' },
  { id: 'travel', name: 'Travel', icon: 'Plane' },
  { id: 'diy', name: 'DIY', icon: 'Hammer' },
  { id: 'budget', name: 'Budget', icon: 'PiggyBank' },
  { id: 'luxury', name: 'Luxury', icon: 'Crown' },
  { id: 'educational', name: 'Educational', icon: 'GraduationCap' },
] as const;

export type PersonaCategoryId = typeof PERSONA_CATEGORIES[number]['id'];

// Map persona names to categories for quick lookup
export const PERSONA_CATEGORY_MAP: Record<string, PersonaCategoryId> = {
  // Lifestyle
  'Sarah': 'lifestyle',
  'Jessica': 'lifestyle',
  'Nina Thompson': 'lifestyle',
  'Luna Park': 'lifestyle',

  // Tech
  'Mike': 'tech',
  'Alex Chen': 'tech',
  'Derek Chang': 'tech',

  // Beauty
  'Priya Sharma': 'beauty',
  'Aisha Johnson': 'beauty',

  // Business
  'Carlos Rodriguez': 'business',

  // Fitness
  'James Wilson': 'fitness',

  // Comedy
  'Tyler': 'comedy',
  'Marcus': 'comedy',
  'David': 'comedy',

  // Food
  'Chris Foster': 'food',

  // Travel
  'Sam Rivera': 'travel',

  // DIY
  'Tom Bradley': 'diy',

  // Budget
  'Zoe Martinez': 'budget',

  // Luxury
  'Emma': 'luxury',

  // Educational
  'Lisa': 'educational',
};

export function getCategoryById(id: string) {
  return PERSONA_CATEGORIES.find(c => c.id === id);
}

export function getCategoryForPersona(personaName: string): PersonaCategoryId {
  return PERSONA_CATEGORY_MAP[personaName] || 'lifestyle';
}
