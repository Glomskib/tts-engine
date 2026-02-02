/**
 * Character Personas for Script Generation
 * These are the default character archetypes available to all users.
 */

export interface Persona {
  id: string;
  name: string;
  age: number;
  description: string;
  fullDescription: string;
  tone: string;
  style: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'sarah',
    name: 'Sarah',
    age: 28,
    description: 'Energetic lifestyle content creator',
    fullDescription: 'Young professional who loves trying new products and sharing authentic experiences. High energy, relatable, trend-aware.',
    tone: 'enthusiastic',
    style: 'casual',
  },
  {
    id: 'mike',
    name: 'Mike',
    age: 35,
    description: 'Skeptical product reviewer',
    fullDescription: 'No-nonsense reviewer who cuts through the hype. Direct, honest, values quality over trends.',
    tone: 'straightforward',
    style: 'analytical',
  },
  {
    id: 'jessica',
    name: 'Jessica',
    age: 24,
    description: 'Gen-Z trend expert',
    fullDescription: 'Always on top of the latest trends. Uses current slang, references pop culture, speaks to younger audiences.',
    tone: 'playful',
    style: 'trendy',
  },
  {
    id: 'david',
    name: 'David',
    age: 42,
    description: 'Dad humor specialist',
    fullDescription: 'Relatable parent figure. Uses dad jokes, everyday situations, appeals to family audiences.',
    tone: 'warm',
    style: 'humorous',
  },
  {
    id: 'emma',
    name: 'Emma',
    age: 31,
    description: 'Luxury lifestyle curator',
    fullDescription: 'Sophisticated taste-maker. Focuses on premium quality, aesthetics, and elevated experiences.',
    tone: 'refined',
    style: 'aspirational',
  },
  {
    id: 'marcus',
    name: 'Marcus',
    age: 29,
    description: 'High-energy hype creator',
    fullDescription: 'Gets people excited! Fast-paced delivery, uses urgency, great for limited offers and launches.',
    tone: 'energetic',
    style: 'urgent',
  },
  {
    id: 'lisa',
    name: 'Lisa',
    age: 38,
    description: 'Trusted expert advisor',
    fullDescription: 'Knowledgeable and trustworthy. Explains benefits clearly, builds credibility, great for complex products.',
    tone: 'authoritative',
    style: 'educational',
  },
  {
    id: 'tyler',
    name: 'Tyler',
    age: 22,
    description: 'Chaotic comedy creator',
    fullDescription: 'Unpredictable and hilarious. Uses absurd humor, unexpected twists, very shareable content.',
    tone: 'chaotic',
    style: 'comedic',
  },
];

export function getPersonaById(id: string): Persona | undefined {
  return PERSONAS.find(p => p.id === id);
}

export function getPersonaLabel(persona: Persona): string {
  return `${persona.name} (${persona.age}) - ${persona.description}`;
}
