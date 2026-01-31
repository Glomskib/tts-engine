// Centralized persona dropdown options with descriptions
// Used in audience page, skit generator, and AI prompt construction

export interface SelectOption {
  value: string;
  label: string;
  description: string;
}

// ============================================
// TONE OPTIONS
// ============================================

export const TONE_OPTIONS: SelectOption[] = [
  { value: 'casual', label: 'Casual', description: 'Like talking to a friend' },
  { value: 'conversational', label: 'Conversational', description: 'Natural, flowing dialogue' },
  { value: 'professional', label: 'Professional', description: 'Polished and credible' },
  { value: 'empathetic', label: 'Empathetic', description: 'Understanding their struggles' },
  { value: 'enthusiastic', label: 'Enthusiastic', description: 'High energy, excited' },
  { value: 'skeptical', label: 'Skeptical', description: 'Questioning, "I was doubtful too"' },
  { value: 'educational', label: 'Educational', description: 'Informative, teaches something' },
  { value: 'urgent', label: 'Urgent', description: 'Creates FOMO, time-sensitive' },
  { value: 'calm', label: 'Calm', description: 'Reassuring, no pressure' },
  { value: 'edgy', label: 'Edgy', description: 'Bold, pushes boundaries' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'authoritative', label: 'Authoritative', description: 'Expert, credible source' },
  { value: 'playful', label: 'Playful', description: 'Fun, lighthearted energy' },
  { value: 'inspirational', label: 'Inspirational', description: 'Motivating, uplifting' },
  { value: 'relatable', label: 'Down-to-earth', description: '"I\'m just like you"' },
  { value: 'sarcastic', label: 'Sarcastic', description: 'Dry, knowing wit' },
  { value: 'vulnerable', label: 'Vulnerable', description: 'Honest, shares struggles' },
  { value: 'confident', label: 'Confident', description: 'Assertive, self-assured' },
  { value: 'frustrated', label: 'Frustrated', description: '"I was SO over it"' },
  { value: 'hopeful', label: 'Hopeful', description: 'Optimistic about solutions' },
  { value: 'desperate', label: 'Desperate', description: '"I tried EVERYTHING"' },
];

// ============================================
// HUMOR STYLE OPTIONS
// ============================================

export const HUMOR_OPTIONS: SelectOption[] = [
  { value: 'none', label: 'None / Serious', description: 'Straight, no jokes' },
  { value: 'self-deprecating', label: 'Self-deprecating', description: '"I used to be a mess too..."' },
  { value: 'sarcastic', label: 'Sarcastic', description: 'Dry wit, eye-roll humor' },
  { value: 'wholesome', label: 'Wholesome', description: 'Feel-good, heartwarming' },
  { value: 'absurdist', label: 'Absurdist', description: 'Random, unexpected turns' },
  { value: 'observational', label: 'Observational', description: '"Have you ever noticed..."' },
  { value: 'dark', label: 'Dark / Edgy', description: 'Gallows humor, taboo topics' },
  { value: 'pun-based', label: 'Pun-based', description: 'Wordplay and dad jokes' },
  { value: 'physical', label: 'Physical', description: 'Slapstick, visual gags' },
  { value: 'relatable', label: 'Relatable', description: '"So true" moments' },
  { value: 'exaggerated', label: 'Exaggerated', description: 'Over-the-top reactions' },
  { value: 'deadpan', label: 'Deadpan', description: 'Straight-faced delivery' },
  { value: 'witty', label: 'Witty', description: 'Clever, intelligent humor' },
  { value: 'situational', label: 'Situational', description: 'Comedy from circumstances' },
  { value: 'meme-style', label: 'Meme-style', description: 'Internet humor, references' },
  { value: 'awkward', label: 'Awkward', description: 'Intentional cringe comedy' },
  { value: 'dry', label: 'Dry', description: 'Understated, subtle' },
];

// ============================================
// LIFE STAGE OPTIONS
// ============================================

export const LIFE_STAGE_OPTIONS: SelectOption[] = [
  { value: 'student', label: 'Student', description: 'In school, tight budget' },
  { value: 'young-professional', label: 'Young Professional', description: 'Starting career, 20s' },
  { value: 'single', label: 'Single', description: 'Focused on self, dating' },
  { value: 'new-relationship', label: 'New Relationship', description: 'Coupled up, building life' },
  { value: 'engaged', label: 'Engaged', description: 'Planning wedding/future' },
  { value: 'newlywed', label: 'Newlywed', description: 'Recently married' },
  { value: 'expecting', label: 'Expecting', description: 'Pregnant, preparing' },
  { value: 'new-parent', label: 'New Parent', description: 'Baby/toddler stage' },
  { value: 'established-parent', label: 'Established Parent', description: 'Kids in school' },
  { value: 'teen-parent', label: 'Teen Parent', description: 'Teenagers at home' },
  { value: 'empty-nester', label: 'Empty Nester', description: 'Kids have left' },
  { value: 'sandwich-generation', label: 'Sandwich Generation', description: 'Caring for kids and parents' },
  { value: 'pre-retirement', label: 'Pre-retirement', description: 'Planning for retirement' },
  { value: 'retired', label: 'Retired', description: 'No longer working' },
  { value: 'divorced', label: 'Divorced', description: 'Starting over' },
  { value: 'caregiver', label: 'Caregiver', description: 'Caring for family member' },
];

// ============================================
// INCOME LEVEL OPTIONS
// ============================================

export const INCOME_OPTIONS: SelectOption[] = [
  { value: 'budget-conscious', label: 'Budget-conscious', description: 'Price is primary factor' },
  { value: 'value-seeker', label: 'Value-seeker', description: 'Wants quality at fair price' },
  { value: 'middle-income', label: 'Middle Income', description: 'Comfortable, some flexibility' },
  { value: 'upper-middle', label: 'Upper Middle', description: 'Can splurge occasionally' },
  { value: 'affluent', label: 'Affluent', description: 'Quality over price' },
  { value: 'luxury', label: 'Luxury', description: 'Premium everything' },
];

// ============================================
// LOCATION TYPE OPTIONS
// ============================================

export const LOCATION_OPTIONS: SelectOption[] = [
  { value: 'urban', label: 'Urban', description: 'City dweller' },
  { value: 'suburban', label: 'Suburban', description: 'Suburbs, family-oriented' },
  { value: 'rural', label: 'Rural', description: 'Country, small town' },
  { value: 'coastal', label: 'Coastal', description: 'Beach communities' },
  { value: 'midwest', label: 'Midwest', description: 'Heartland values' },
];

// ============================================
// ATTENTION SPAN OPTIONS
// ============================================

export const ATTENTION_SPAN_OPTIONS: SelectOption[] = [
  { value: 'quick-hooks', label: 'Quick hooks needed', description: 'Scroll fast, need instant grab' },
  { value: 'moderate', label: 'Moderate attention', description: 'Will watch if interested' },
  { value: 'long-form', label: 'Long-form viewer', description: 'Will watch extended content' },
  { value: 'deep-diver', label: 'Deep diver', description: 'Researches thoroughly' },
  { value: 'skimmer', label: 'Skimmer', description: 'Scans, reads headlines only' },
  { value: 'multi-tasker', label: 'Multi-tasker', description: 'Half-attention, needs repetition' },
];

// ============================================
// VALUES OPTIONS
// ============================================

export const VALUES_OPTIONS: SelectOption[] = [
  { value: 'health', label: 'Health', description: 'Prioritizes wellness' },
  { value: 'family', label: 'Family', description: 'Family-first decisions' },
  { value: 'convenience', label: 'Convenience', description: 'Time-saving is key' },
  { value: 'value', label: 'Value', description: 'Getting worth for money' },
  { value: 'quality', label: 'Quality', description: 'Best over cheapest' },
  { value: 'sustainability', label: 'Sustainability', description: 'Eco-conscious choices' },
  { value: 'status', label: 'Status', description: 'Image-conscious' },
  { value: 'authenticity', label: 'Authenticity', description: 'Wants genuine brands' },
  { value: 'adventure', label: 'Adventure', description: 'Loves new experiences' },
  { value: 'security', label: 'Security', description: 'Risk-averse, careful' },
  { value: 'independence', label: 'Independence', description: 'Self-reliant mindset' },
  { value: 'community', label: 'Community', description: 'Connection matters' },
  { value: 'simplicity', label: 'Simplicity', description: 'Less is more' },
  { value: 'innovation', label: 'Innovation', description: 'Loves new tech/ideas' },
];

// ============================================
// INTERESTS OPTIONS
// ============================================

export const INTERESTS_OPTIONS: SelectOption[] = [
  { value: 'fitness', label: 'Fitness', description: 'Exercise, gym, sports' },
  { value: 'cooking', label: 'Cooking', description: 'Home cooking, recipes' },
  { value: 'technology', label: 'Technology', description: 'Gadgets, apps, tech' },
  { value: 'travel', label: 'Travel', description: 'Exploring, vacations' },
  { value: 'parenting', label: 'Parenting', description: 'Kids, family life' },
  { value: 'career', label: 'Career', description: 'Professional growth' },
  { value: 'fashion', label: 'Fashion', description: 'Style, clothing' },
  { value: 'gaming', label: 'Gaming', description: 'Video games, esports' },
  { value: 'wellness', label: 'Wellness', description: 'Mental health, self-care' },
  { value: 'finance', label: 'Finance', description: 'Investing, budgeting' },
  { value: 'home-improvement', label: 'Home Improvement', description: 'DIY, decorating' },
  { value: 'beauty', label: 'Beauty', description: 'Skincare, makeup' },
  { value: 'pets', label: 'Pets', description: 'Pet ownership' },
  { value: 'entertainment', label: 'Entertainment', description: 'Movies, TV, music' },
  { value: 'outdoors', label: 'Outdoors', description: 'Nature, hiking' },
  { value: 'reading', label: 'Reading', description: 'Books, learning' },
];

// ============================================
// PERSONALITY TRAIT OPTIONS
// ============================================

export const PERSONALITY_OPTIONS: SelectOption[] = [
  { value: 'skeptical', label: 'Skeptical', description: 'Needs proof, doubts claims' },
  { value: 'impulsive', label: 'Impulsive', description: 'Buys on emotion' },
  { value: 'research-driven', label: 'Research-driven', description: 'Compares everything' },
  { value: 'trend-follower', label: 'Trend-follower', description: 'Wants what\'s popular' },
  { value: 'early-adopter', label: 'Early Adopter', description: 'First to try new things' },
  { value: 'cautious', label: 'Cautious', description: 'Takes time to decide' },
  { value: 'deal-seeker', label: 'Deal-seeker', description: 'Loves discounts' },
  { value: 'loyal', label: 'Loyal', description: 'Sticks with brands' },
  { value: 'perfectionist', label: 'Perfectionist', description: 'High standards' },
  { value: 'spontaneous', label: 'Spontaneous', description: 'Open to trying' },
  { value: 'practical', label: 'Practical', description: 'Function over form' },
  { value: 'aspirational', label: 'Aspirational', description: 'Wants to level up' },
  { value: 'nostalgic', label: 'Nostalgic', description: 'Loves throwbacks' },
  { value: 'minimalist', label: 'Minimalist', description: 'Less stuff, more intentional' },
];

// ============================================
// TRUST BUILDER OPTIONS
// ============================================

export const TRUST_BUILDERS_OPTIONS: SelectOption[] = [
  { value: 'testimonials', label: 'Testimonials', description: 'Real customer stories' },
  { value: 'data-stats', label: 'Data & Stats', description: 'Numbers and proof' },
  { value: 'expert-endorsements', label: 'Expert Endorsements', description: 'Doctor/pro approved' },
  { value: 'relatable-stories', label: 'Relatable Stories', description: '"I was just like you"' },
  { value: 'before-after', label: 'Before/After', description: 'Visual transformation' },
  { value: 'money-back', label: 'Money-back Guarantee', description: 'Risk-free purchase' },
  { value: 'free-trial', label: 'Free Trial', description: 'Try before you buy' },
  { value: 'social-proof', label: 'Social Proof', description: '"Everyone\'s using it"' },
  { value: 'transparency', label: 'Transparency', description: 'Honest about ingredients/process' },
  { value: 'certifications', label: 'Certifications', description: 'Third-party verified' },
  { value: 'longevity', label: 'Longevity', description: 'Been around for years' },
  { value: 'user-generated', label: 'User-generated Content', description: 'Real people, unfiltered' },
];

// ============================================
// EMOTIONAL TRIGGER OPTIONS
// ============================================

export const EMOTIONAL_TRIGGERS_OPTIONS: SelectOption[] = [
  { value: 'fomo', label: 'FOMO', description: 'Fear of missing out' },
  { value: 'simplicity', label: 'Desire for Simplicity', description: 'Make life easier' },
  { value: 'belonging', label: 'Wanting to Belong', description: 'Part of a group' },
  { value: 'fear-judgment', label: 'Fear of Judgment', description: 'What others think' },
  { value: 'control', label: 'Need for Control', description: 'Take charge of life' },
  { value: 'aspiration', label: 'Aspiration', description: 'Becoming better self' },
  { value: 'nostalgia', label: 'Nostalgia', description: 'Good old days' },
  { value: 'guilt', label: 'Guilt', description: '"I should be doing more"' },
  { value: 'relief', label: 'Relief', description: 'End the struggle' },
  { value: 'pride', label: 'Pride', description: 'Show off achievement' },
  { value: 'curiosity', label: 'Curiosity', description: 'Need to know more' },
  { value: 'validation', label: 'Validation', description: 'Feeling seen/heard' },
  { value: 'security', label: 'Security', description: 'Protection from harm' },
  { value: 'excitement', label: 'Excitement', description: 'Something new!' },
];

// ============================================
// PURCHASE MOTIVATOR OPTIONS
// ============================================

export const PURCHASE_MOTIVATORS_OPTIONS: SelectOption[] = [
  { value: 'discounts', label: 'Discounts', description: 'Sales and deals' },
  { value: 'urgency', label: 'Urgency/Scarcity', description: 'Limited time/stock' },
  { value: 'social-proof', label: 'Social Proof', description: 'Others bought it' },
  { value: 'quality', label: 'Quality', description: 'Best available' },
  { value: 'convenience', label: 'Convenience', description: 'Easy to get/use' },
  { value: 'exclusivity', label: 'Exclusivity', description: 'Not everyone can get it' },
  { value: 'free-shipping', label: 'Free Shipping', description: 'No extra costs' },
  { value: 'bundle', label: 'Bundle Deals', description: 'More for less' },
  { value: 'referral', label: 'Friend Referral', description: 'Someone they trust recommended' },
  { value: 'comparison', label: 'Comparison Win', description: 'Better than alternatives' },
  { value: 'newness', label: 'Newness', description: 'Latest version/product' },
  { value: 'results', label: 'Proven Results', description: 'Evidence it works' },
];

// ============================================
// CONTENT TYPE OPTIONS
// ============================================

export const CONTENT_OPTIONS: SelectOption[] = [
  { value: 'relatable-fails', label: 'Relatable Fails', description: '"This is so me" moments' },
  { value: 'before-after', label: 'Before/After', description: 'Transformation content' },
  { value: 'day-in-life', label: 'Day in the Life', description: 'Routine content' },
  { value: 'pov', label: 'POV', description: 'Point of view scenarios' },
  { value: 'storytime', label: 'Storytime', description: 'Personal narratives' },
  { value: 'tutorial', label: 'Tutorial', description: 'How-to content' },
  { value: 'review', label: 'Review', description: 'Product reviews' },
  { value: 'unboxing', label: 'Unboxing', description: 'First look content' },
  { value: 'trend', label: 'Trend', description: 'Following viral trends' },
  { value: 'educational', label: 'Educational', description: 'Learn something new' },
  { value: 'testimonials', label: 'Testimonials', description: 'Real experiences' },
  { value: 'challenge', label: 'Challenge', description: 'Try this challenge' },
  { value: 'comparison', label: 'Comparison', description: 'A vs B content' },
  { value: 'behind-scenes', label: 'Behind the Scenes', description: 'How it\'s made' },
  { value: 'duet-stitch', label: 'Duet/Stitch', description: 'Reaction content' },
];

// ============================================
// PLATFORM OPTIONS
// ============================================

export const PLATFORM_OPTIONS: SelectOption[] = [
  { value: 'tiktok', label: 'TikTok', description: 'Short-form video' },
  { value: 'instagram', label: 'Instagram', description: 'Reels, Stories, Feed' },
  { value: 'youtube', label: 'YouTube', description: 'Long and short-form' },
  { value: 'youtube-shorts', label: 'YouTube Shorts', description: 'Short-form vertical' },
  { value: 'facebook', label: 'Facebook', description: 'Broad audience' },
  { value: 'twitter', label: 'X/Twitter', description: 'Quick takes' },
  { value: 'linkedin', label: 'LinkedIn', description: 'Professional content' },
  { value: 'pinterest', label: 'Pinterest', description: 'Visual discovery' },
  { value: 'snapchat', label: 'Snapchat', description: 'Young audience' },
];

// ============================================
// HELPER: Get label from value
// ============================================

export function getOptionLabel(options: SelectOption[], value: string): string {
  const option = options.find(o => o.value === value);
  return option?.label || value;
}

export function getOptionDescription(options: SelectOption[], value: string): string {
  const option = options.find(o => o.value === value);
  return option?.description || '';
}

// ============================================
// AI PROMPT TONE GUIDES
// ============================================

export const TONE_PROMPT_GUIDES: Record<string, string> = {
  'casual': 'Write like you\'re texting a friend - relaxed, natural, no corporate speak',
  'conversational': 'Natural flowing dialogue, like a real conversation would go',
  'professional': 'Polished and credible, but not stiff - still human',
  'empathetic': 'Acknowledge their struggle first, show you understand before presenting solutions',
  'enthusiastic': 'High energy! Excited! Use exclamation points! But stay authentic',
  'skeptical': 'Start doubtful, "I didn\'t believe it either" energy, then convert',
  'educational': 'Teach something valuable, position as helpful information',
  'urgent': 'Create FOMO, time-sensitive language, "don\'t miss out" energy',
  'calm': 'Reassuring, no pressure, peaceful vibes - great for wellness products',
  'edgy': 'Push boundaries, be provocative, bold statements that make people stop',
  'friendly': 'Warm, approachable, like a helpful neighbor',
  'authoritative': 'Expert positioning, "as a [expert], I can tell you..."',
  'playful': 'Fun, lighthearted, don\'t take yourself too seriously',
  'inspirational': 'Uplifting, motivating, "you can do this" energy',
  'relatable': '"I\'m just like you" - down-to-earth, no pretense',
  'sarcastic': 'Dry wit, knowing eye-roll humor, self-aware about advertising',
  'vulnerable': 'Share real struggles, be honest about imperfections',
  'confident': 'Assertive, self-assured, know your worth',
  'frustrated': '"I was SO over it" - share the annoyance before the solution',
  'hopeful': 'Optimistic about possibilities, light at end of tunnel',
  'desperate': '"I tried EVERYTHING" - extreme frustration before discovery',
};

export const HUMOR_PROMPT_GUIDES: Record<string, string> = {
  'none': 'Straight delivery, no jokes - let the content speak for itself',
  'self-deprecating': '"I used to be such a mess" - laugh at your own expense',
  'sarcastic': 'Dry wit, deadpan delivery, eye-roll humor, knowing looks',
  'wholesome': 'Feel-good humor, heartwarming, makes you smile',
  'absurdist': 'Random, unexpected turns, surreal logic, "wait what?"',
  'observational': '"Have you ever noticed..." - point out funny truths',
  'dark': 'Gallows humor, taboo topics, edgy - use carefully',
  'pun-based': 'Wordplay, dad jokes, clever double meanings',
  'physical': 'Slapstick, visual gags, exaggerated reactions',
  'relatable': '"This is SO true" moments that make people tag friends',
  'exaggerated': 'Over-the-top reactions, dramatic for comedic effect',
  'deadpan': 'Straight-faced delivery of absurd statements',
  'witty': 'Clever, intelligent humor, subtle references',
  'situational': 'Comedy comes from the circumstances, not jokes',
  'meme-style': 'Internet humor, trending formats, cultural references',
  'awkward': 'Intentional cringe, uncomfortable pauses, "oh no" moments',
  'dry': 'Understated, subtle, almost missable if you\'re not paying attention',
};
