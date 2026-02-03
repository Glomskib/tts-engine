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
  'Trend-Aware Lifestyle Creator': 'lifestyle',
  'Gen-Z Trendsetter': 'lifestyle',
  'Overwhelmed Supermom': 'lifestyle',
  'Mindful Wellness Seeker': 'lifestyle',

  // Tech
  'Skeptical Veteran Reviewer': 'tech',
  'Spec-Comparing Researcher': 'tech',
  'Tech-Hyped Early Adopter': 'tech',

  // Beauty
  'Ingredient-Obsessed Researcher': 'beauty',
  'Trend-Forward Fashionista': 'beauty',

  // Business
  'ROI-Focused Entrepreneur': 'business',

  // Fitness
  'Transformation Chaser': 'fitness',

  // Comedy
  'Chaotic Comedy King': 'comedy',
  'High-Energy Hype Machine': 'comedy',
  'Relatable Dad Jokester': 'comedy',

  // Food
  'Culinary Enthusiast': 'food',

  // Travel
  'Adventure-Seeking Explorer': 'travel',

  // DIY
  'DIY Problem Solver': 'diy',

  // Budget
  'Budget-Conscious Deal Hunter': 'budget',

  // Luxury
  'Aspirational Taste-Maker': 'luxury',

  // Educational
  'Trusted Expert Advisor': 'educational',
};

export function getCategoryById(id: string) {
  return PERSONA_CATEGORIES.find(c => c.id === id);
}

export function getCategoryForPersona(personaName: string): PersonaCategoryId {
  return PERSONA_CATEGORY_MAP[personaName] || 'lifestyle';
}
