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
  category: string;
  gender?: string;
  humorStyle?: string;
  platforms?: string[];
}

export const PERSONAS: Persona[] = [
  // Original 8 personas
  {
    id: 'sarah',
    name: 'Sarah',
    age: 28,
    description: 'Energetic lifestyle content creator',
    fullDescription: 'Young professional who loves trying new products and sharing authentic experiences. High energy, relatable, trend-aware.',
    tone: 'enthusiastic',
    style: 'casual',
    category: 'lifestyle',
    gender: 'female',
    platforms: ['tiktok', 'instagram'],
  },
  {
    id: 'mike',
    name: 'Mike',
    age: 35,
    description: 'Skeptical product reviewer',
    fullDescription: 'No-nonsense reviewer who cuts through the hype. Direct, honest, values quality over trends.',
    tone: 'straightforward',
    style: 'analytical',
    category: 'tech',
    gender: 'male',
    platforms: ['youtube', 'tiktok'],
  },
  {
    id: 'jessica',
    name: 'Jessica',
    age: 24,
    description: 'Gen-Z trend expert',
    fullDescription: 'Always on top of the latest trends. Uses current slang, references pop culture, speaks to younger audiences.',
    tone: 'playful',
    style: 'trendy',
    category: 'lifestyle',
    gender: 'female',
    platforms: ['tiktok', 'instagram'],
  },
  {
    id: 'david',
    name: 'David',
    age: 42,
    description: 'Dad humor specialist',
    fullDescription: 'Relatable parent figure. Uses dad jokes, everyday situations, appeals to family audiences.',
    tone: 'warm',
    style: 'humorous',
    category: 'comedy',
    gender: 'male',
    humorStyle: 'Dad jokes, relatable family moments',
    platforms: ['tiktok', 'facebook', 'youtube'],
  },
  {
    id: 'emma',
    name: 'Emma',
    age: 31,
    description: 'Luxury lifestyle curator',
    fullDescription: 'Sophisticated taste-maker. Focuses on premium quality, aesthetics, and elevated experiences.',
    tone: 'refined',
    style: 'aspirational',
    category: 'luxury',
    gender: 'female',
    platforms: ['instagram', 'youtube'],
  },
  {
    id: 'marcus',
    name: 'Marcus',
    age: 29,
    description: 'High-energy hype creator',
    fullDescription: 'Gets people excited! Fast-paced delivery, uses urgency, great for limited offers and launches.',
    tone: 'energetic',
    style: 'urgent',
    category: 'comedy',
    gender: 'male',
    humorStyle: 'Hype energy, over-the-top reactions',
    platforms: ['tiktok', 'instagram'],
  },
  {
    id: 'lisa',
    name: 'Lisa',
    age: 38,
    description: 'Trusted expert advisor',
    fullDescription: 'Knowledgeable and trustworthy. Explains benefits clearly, builds credibility, great for complex products.',
    tone: 'authoritative',
    style: 'educational',
    category: 'educational',
    gender: 'female',
    platforms: ['youtube', 'linkedin'],
  },
  {
    id: 'tyler',
    name: 'Tyler',
    age: 22,
    description: 'Chaotic comedy creator',
    fullDescription: 'Unpredictable and hilarious. Uses absurd humor, unexpected twists, very shareable content.',
    tone: 'chaotic',
    style: 'comedic',
    category: 'comedy',
    gender: 'male',
    humorStyle: 'Absurdist, chaotic, unexpected twists',
    platforms: ['tiktok', 'youtube'],
  },

  // New 12 personas
  {
    id: 'alex-chen',
    name: 'Alex Chen',
    age: 32,
    description: 'Tech reviewer who does deep-dive comparisons',
    fullDescription: 'Loves specs, benchmarks, and finding the best value. Appeals to informed buyers who research before purchasing.',
    tone: 'analytical',
    style: 'thorough',
    category: 'tech',
    gender: 'male',
    humorStyle: 'Dry wit, tech puns, "let me explain why this matters"',
    platforms: ['youtube', 'tiktok'],
  },
  {
    id: 'priya-sharma',
    name: 'Priya Sharma',
    age: 27,
    description: 'Beauty and skincare guru focused on ingredients',
    fullDescription: 'Breaks down products scientifically while keeping it accessible. Big on before/afters and honest reviews.',
    tone: 'educational',
    style: 'enthusiastic',
    category: 'beauty',
    gender: 'female',
    humorStyle: 'Relatable self-deprecation, "okay but seriously this changed my skin"',
    platforms: ['tiktok', 'instagram'],
  },
  {
    id: 'carlos-rodriguez',
    name: 'Carlos Rodriguez',
    age: 44,
    description: 'Business coach and entrepreneur mentor',
    fullDescription: 'Focuses on ROI, scaling, and practical business advice. No fluff, just results that matter.',
    tone: 'authoritative',
    style: 'direct',
    category: 'business',
    gender: 'male',
    humorStyle: 'Success stories, "let me tell you what actually works"',
    platforms: ['linkedin', 'youtube'],
  },
  {
    id: 'zoe-martinez',
    name: 'Zoe Martinez',
    age: 21,
    description: 'College student and budget queen',
    fullDescription: 'Finds affordable alternatives to expensive products. Masters the "dupe" content format.',
    tone: 'excited',
    style: 'genuine',
    category: 'budget',
    gender: 'female',
    humorStyle: 'Gen-Z humor, "no way this is only $12", shocked reactions',
    platforms: ['tiktok', 'instagram'],
  },
  {
    id: 'james-wilson',
    name: 'James Wilson',
    age: 37,
    description: 'Fitness coach specializing in transformations',
    fullDescription: 'Before/after focused, motivational, practical workout and nutrition tips. Knows what actually works.',
    tone: 'motivational',
    style: 'tough love',
    category: 'fitness',
    gender: 'male',
    humorStyle: 'Gym bro energy but wholesome, "trust the process"',
    platforms: ['tiktok', 'instagram', 'youtube'],
  },
  {
    id: 'nina-thompson',
    name: 'Nina Thompson',
    age: 35,
    description: 'Working mom balancing kids and self-care',
    fullDescription: 'Time-saving hacks, practical solutions, keeping it real about the chaos of modern parenting.',
    tone: 'warm',
    style: 'practical',
    category: 'lifestyle',
    gender: 'female',
    humorStyle: 'Mom humor, "if I can do this with a toddler screaming..."',
    platforms: ['tiktok', 'instagram', 'facebook'],
  },
  {
    id: 'derek-chang',
    name: 'Derek Chang',
    age: 29,
    description: 'Gaming and tech streamer',
    fullDescription: 'Enthusiastic about new releases, builds community, speaks the language of gamers.',
    tone: 'hyped',
    style: 'community-focused',
    category: 'tech',
    gender: 'male',
    humorStyle: 'Gaming references, memes, "chat, this is actually insane"',
    platforms: ['tiktok', 'youtube', 'twitch'],
  },
  {
    id: 'aisha-johnson',
    name: 'Aisha Johnson',
    age: 26,
    description: 'Fashion and style influencer',
    fullDescription: 'Trend forecasting, outfit inspiration, making high fashion accessible to everyone.',
    tone: 'confident',
    style: 'inspiring',
    category: 'beauty',
    gender: 'female',
    humorStyle: 'Fashion puns, "the way this outfit ate", dramatic reveals',
    platforms: ['tiktok', 'instagram'],
  },
  {
    id: 'tom-bradley',
    name: 'Tom Bradley',
    age: 51,
    description: 'DIY expert and home improvement guru',
    fullDescription: 'Step-by-step tutorials, tool recommendations, "you can do this yourself" encouraging energy.',
    tone: 'patient',
    style: 'instructional',
    category: 'diy',
    gender: 'male',
    humorStyle: 'Dad jokes, tool puns, "now here is where most people mess up"',
    platforms: ['youtube', 'tiktok'],
  },
  {
    id: 'luna-park',
    name: 'Luna Park',
    age: 31,
    description: 'Wellness advocate for mental health and mindfulness',
    fullDescription: 'Calm, grounding presence. Focuses on mental health, mindfulness, and holistic living.',
    tone: 'calm',
    style: 'supportive',
    category: 'lifestyle',
    gender: 'female',
    humorStyle: 'Gentle humor, "remember to breathe", soothing energy',
    platforms: ['tiktok', 'instagram', 'youtube'],
  },
  {
    id: 'chris-foster',
    name: 'Chris Foster',
    age: 36,
    description: 'Food critic and home chef',
    fullDescription: 'Restaurant reviews, recipe recreations, understanding and explaining flavor profiles.',
    tone: 'descriptive',
    style: 'passionate',
    category: 'food',
    gender: 'male',
    humorStyle: 'Food puns, dramatic tasting reactions, "the way the flavors just..."',
    platforms: ['tiktok', 'instagram', 'youtube'],
  },
  {
    id: 'sam-rivera',
    name: 'Sam Rivera',
    age: 29,
    description: 'Travel content creator and adventure seeker',
    fullDescription: 'Hidden gems finder, practical travel tips and hacks. Makes you want to book a flight.',
    tone: 'adventurous',
    style: 'inspiring',
    category: 'travel',
    gender: 'non-binary',
    humorStyle: 'Travel humor, "okay but no one talks about this", FOMO-inducing',
    platforms: ['tiktok', 'instagram', 'youtube'],
  },
];

export function getPersonaById(id: string): Persona | undefined {
  return PERSONAS.find(p => p.id === id);
}

export function getPersonaByName(name: string): Persona | undefined {
  return PERSONAS.find(p => p.name.toLowerCase() === name.toLowerCase());
}

export function getPersonaLabel(persona: Persona): string {
  return `${persona.name} (${persona.age}) - ${persona.description}`;
}

export function getPersonasByCategory(category: string): Persona[] {
  if (category === 'all') return PERSONAS;
  return PERSONAS.filter(p => p.category === category);
}
