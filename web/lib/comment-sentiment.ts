/**
 * Lightweight keyword-based comment sentiment classifier (MVP).
 * Classifies each comment as positive | negative | neutral | question
 * with a score (-1.0 to 1.0) and extracted topics.
 */

export type SentimentLabel = 'positive' | 'negative' | 'neutral' | 'question';

export interface SentimentResult {
  sentiment: SentimentLabel;
  score: number; // -1.0 to 1.0
  topics: string[];
}

export interface SentimentSummary {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  questions: number;
  top_topics: string[];
}

const POSITIVE_WORDS = new Set([
  'love', 'amazing', 'great', 'awesome', 'best', 'perfect', 'excellent',
  'fantastic', 'incredible', 'beautiful', 'obsessed', 'fire', 'goat',
  'slaps', 'bussin', 'slay', 'chef kiss', 'blessed', 'game changer',
  'holy grail', 'addicted', 'need', 'want', 'buying', 'bought', 'ordered',
  'recommend', 'works', 'effective', 'delicious', 'yummy', 'tasty',
  'smooth', 'clean', 'fresh', 'legit', 'real', 'genuine', 'worth it',
  'thank', 'thanks', 'helped', 'life saver', 'changed my life',
]);

const NEGATIVE_WORDS = new Set([
  'hate', 'terrible', 'awful', 'worst', 'bad', 'horrible', 'trash',
  'waste', 'scam', 'fake', 'overpriced', 'expensive', 'cheap',
  'broke', 'broken', 'didnt work', 'doesn\'t work', 'not worth',
  'disappointed', 'disappointing', 'disgusting', 'gross', 'nasty',
  'cap', 'sus', 'sketchy', 'ripoff', 'rip off', 'refund', 'return',
  'returned', 'sick', 'nausea', 'reaction', 'allergic', 'irritated',
  'bumpy', 'rash', 'burned', 'stink', 'stinks', 'smell', 'smells',
]);

const QUESTION_INDICATORS = [
  '?', 'where can', 'where do', 'how much', 'how do', 'what is',
  'what\'s', 'which one', 'does it', 'do you', 'can you', 'is this',
  'link', 'drop the', 'name of', 'what brand', 'where did',
  'anyone know', 'somebody tell', 'someone tell',
];

const TOPIC_PATTERNS: Record<string, RegExp> = {
  price: /\b(price|cost|expensive|cheap|afford|worth|money|dollar|\$|deal|sale|discount|budget)\b/i,
  quality: /\b(quality|durable|lasting|broke|broken|flimsy|sturdy|well.?made|premium|legit)\b/i,
  taste: /\b(taste|flavor|delicious|yummy|tasty|gross|disgusting|bland|sweet|bitter|sour)\b/i,
  results: /\b(result|before.?after|transform|change|difference|progress|improve|work|effective|glow)\b/i,
  packaging: /\b(packag|box|bottle|container|jar|tube|pump|dispenser|label|unbox)\b/i,
  shipping: /\b(ship|deliver|arrive|fast|slow|late|tracking|order)\b/i,
  size: /\b(size|small|big|large|tiny|huge|amount|quantity|portion|serving)\b/i,
  ingredients: /\b(ingredient|natural|organic|chemical|vegan|cruelty.?free|clean|toxic|paraben|sulfate)\b/i,
};

export function classifyComment(text: string): SentimentResult {
  const lower = text.toLowerCase();
  const topics: string[] = [];

  // Extract topics
  for (const [topic, pattern] of Object.entries(TOPIC_PATTERNS)) {
    if (pattern.test(lower)) {
      topics.push(topic);
    }
  }

  // Check for questions first
  const isQuestion = QUESTION_INDICATORS.some(q => lower.includes(q));

  // Score positive and negative signals
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) positiveCount++;
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) negativeCount++;
  }

  // Calculate raw score
  const total = positiveCount + negativeCount;
  let score: number;
  if (total === 0) {
    score = 0;
  } else {
    score = (positiveCount - negativeCount) / total;
  }

  // Clamp to [-1, 1]
  score = Math.max(-1, Math.min(1, score));

  // Determine label
  let sentiment: SentimentLabel;
  if (isQuestion && positiveCount === 0 && negativeCount === 0) {
    sentiment = 'question';
  } else if (score > 0.2) {
    sentiment = 'positive';
  } else if (score < -0.2) {
    sentiment = 'negative';
  } else if (isQuestion) {
    sentiment = 'question';
  } else {
    sentiment = 'neutral';
  }

  return { sentiment, score: parseFloat(score.toFixed(2)), topics };
}

export function summarizeSentiments(results: SentimentResult[]): SentimentSummary {
  const counts = { positive: 0, negative: 0, neutral: 0, questions: 0 };
  const topicCounts = new Map<string, number>();

  for (const r of results) {
    if (r.sentiment === 'positive') counts.positive++;
    else if (r.sentiment === 'negative') counts.negative++;
    else if (r.sentiment === 'question') counts.questions++;
    else counts.neutral++;

    for (const t of r.topics) {
      topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
    }
  }

  const top_topics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  return {
    total: results.length,
    ...counts,
    top_topics,
  };
}
