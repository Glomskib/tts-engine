import { callAnthropicJSON } from '@/lib/ai/anthropic';

export type InputMode = 'product' | 'tiktok_url' | 'niche';

// Creator-native content intents — how a creator actually thinks about the
// video they're about to film. Replaces the old abstract "tone" selector.
export type Intent =
  | 'bought_because'
  | 'unexpected'
  | 'doing_wrong'
  | 'replaced'
  | 'tested'
  | 'if_youre'
  | 'pov'
  | 'dont_buy'
  | 'why_switching'
  | 'skeptical';

/** Back-compat alias — some routes still import Tone by name. */
export type Tone = Intent;

export interface ClipInput {
  mode: InputMode;
  value: string;
  niche?: string | null;
  /** Stored in the existing v1_clip_sets.tone column; no migration required. */
  tone?: Intent;
  count: number;
  seedClipId?: string | null;
}

export interface Hook {
  verbal: string;   // spoken opening line (first 1–3s)
  visual: string;   // what the creator does on-camera in the first 1–3s
  text: string;     // on-screen text overlay at opening
}

export interface Clip {
  id: string;
  hook: Hook;
  script: string;
  description: string;
  cta: string;
  angle: string;
  tone: Tone;
  /** Filming guidance — all optional so old clip sets stay compatible. */
  shotType?: string;        // e.g. "selfie close-up", "waist-up kitchen demo"
  framing?: string;         // where the creator is in frame + where product sits
  textLayout?: string;      // where on-screen text should be placed
  thumbnailIdea?: string;   // single-line cover frame concept
  brollHint?: string;       // supporting shot suggestion
}

const DEFAULT_INTENT: Intent = 'bought_because';
// DEFAULT_TONE is kept as a re-export for any external importer.
const DEFAULT_TONE: Intent = DEFAULT_INTENT;

interface IntentSpec {
  label: string;
  direction: string;
}

export const INTENT_SPECS: Record<Intent, IntentSpec> = {
  bought_because: {
    label: 'I bought this because…',
    direction:
      'Purchase justification. Every clip surfaces the exact reason the creator decided to buy — the pain, the cost comparison, the moment they gave in. Scripts explain what finally tipped them over.',
  },
  unexpected: {
    label: "I didn't expect this to work",
    direction:
      'Reversal / surprise-it-worked. Opens skeptical, lands convinced. The twist is the hook. Evidence comes from the creator\'s own test, not marketing copy.',
  },
  doing_wrong: {
    label: 'I was doing this wrong',
    direction:
      'Mistake reveal. Each clip names a specific wrong habit the creator was doing, then how this product / approach fixed it. Concrete routine-change beats.',
  },
  replaced: {
    label: 'This replaced my old setup',
    direction:
      'Comparison / swap. Name the old thing explicitly (brand, price, or category). Show why the new one is the keeper. Works as a direct side-by-side.',
  },
  tested: {
    label: 'I tested this for a week',
    direction:
      'Proof / time-bound test. Each clip is a day-N reveal (day 1 / day 3 / week later). Results are specific and observable, never hype.',
  },
  if_youre: {
    label: "If you're ___, this is for you",
    direction:
      'Identity-targeted. Every clip opens by naming the exact target person or situation ("if you live in a high-rise", "if your skin hates retinol"). The targeting IS the hook.',
  },
  pov: {
    label: 'POV / scenario',
    direction:
      'POV scene-drop. Each clip lands the viewer inside a vivid, specific scenario (gym bathroom, 3AM kitchen, post-gym car). Product shows up through the scene, never announced.',
  },
  dont_buy: {
    label: "Don't buy this unless…",
    direction:
      'Reverse psychology / gatekeeper. Each clip lists the one exact condition where this product is worth it. Specific, honest, never gimmicky.',
  },
  why_switching: {
    label: 'Why people are switching to this',
    direction:
      'Trend / social proof. Frame as observed behavior — what the creator is seeing people do. Reference specific comment volume, creator takes, category shift.',
  },
  skeptical: {
    label: 'I was skeptical until…',
    direction:
      'Skeptic-to-believer arc. Opens with the specific objection the creator had (price, category, brand). The turn is a concrete moment where skepticism broke.',
  },
};

const INTENT_IDS: Intent[] = Object.keys(INTENT_SPECS) as Intent[];

// 10 hook archetypes — batch generation rotates through these for built-in variety.
const HOOK_ARCHETYPES: Array<{ name: string; guide: string }> = [
  { name: 'confession', guide: 'Start mid-confession. Opener uses "Okay so" / "I wasn\'t going to post this" / "Don\'t tell anyone". Feels like gossip.' },
  { name: 'contrarian', guide: 'Start with a direct, slightly unpopular take. Opener uses "Hot take:" / "Unpopular opinion:" / "Everyone is wrong about".' },
  { name: 'question', guide: 'Open with a direct question that makes the viewer answer in their head. No "did you know" — be specific.' },
  { name: 'number_list', guide: 'Open with a specific number: "3 things I stopped doing after…" / "5 reasons I replaced…". Visual cue implied.' },
  { name: 'pov', guide: 'Start with "POV:" and drop the viewer into a very specific scene.' },
  { name: 'before_after', guide: 'Open with a before/after pivot. "A week ago I…" or "Before I found this I…". The contrast is the hook.' },
  { name: 'curiosity_gap', guide: 'Tease a specific outcome without naming the product. "I just figured out why my [X] has been…"' },
  { name: 'mistake', guide: 'Lead with the mistake you were making. "I was doing [X] wrong for 2 years until…"' },
  { name: 'insider', guide: 'Speak as if letting viewer in on industry / expert knowledge. Specific, not vague.' },
  { name: 'reaction', guide: 'Open with an immediate, physical reaction. "Wait no way — " or "I\'m literally —". Energy forward.' },
];

function safeId(): string {
  return 'clip_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function pickArchetypes(count: number, seeded: boolean): string[] {
  if (seeded) return [];
  const pool = [...HOOK_ARCHETYPES];
  // Shuffle deterministically enough for this request (not cryptographic)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(pool[i % pool.length].name);
  return out;
}

const MODE_FRAMING: Record<InputMode, (value: string) => string> = {
  product: (value) =>
    `SUBJECT — a specific product/idea the viewer can BUY.
Product / idea: "${value}"

CREATIVE DIRECTION FOR PRODUCT MODE
- Every clip centers on THIS exact product. Not a category — the thing itself.
- Ground each hook in a concrete, sensory detail of the product (texture, smell, packaging, the moment it starts working, the first-use surprise).
- The script should surface proof: a before-moment, a receipt, a skeptic-to-believer turn, a physical reaction.
- CTA sends viewers to buy THIS product via orange basket.`,

  tiktok_url: (value) =>
    `SUBJECT — a viral TikTok the creator wants to REMIX.
Reference URL: ${value}

CREATIVE DIRECTION FOR TIKTOK URL MODE
- Assume the creator will stitch, duet, or green-screen on top of the referenced video. You do NOT have access to the video content itself.
- Every clip should be a FORMAT-FORWARD remix setup: "stitch this with…", "duet POV where you…", "green-screen pointing at the comment that…". The hook's power comes from the remix framing, not a product description.
- If a product emerges, treat it as a replacement/alternative to whatever the original was pushing. Lean into contrast with the source video.
- Variety across clips should be in the REMIX FORMAT (stitch vs duet vs green-screen vs reaction vs counter-take), not just the topic.`,

  niche: (value) =>
    `SUBJECT — an audience / category, NOT a single product.
Niche: "${value}"

CREATIVE DIRECTION FOR NICHE MODE
- Each clip picks a DIFFERENT representative product or pain within this niche — never re-use the same product twice in the batch.
- Each hook should name the specific-in-category item or micro-pain (e.g. in "busy-mom skincare under $30": one clip about a 3-step routine oil, another about fridge-stored eye gels, another about a kids-safe SPF). Specificity is the differentiator.
- Tone the script toward the AUDIENCE first, product second — the hook earns trust by naming their exact situation.
- CTA adapts: tap the basket, follow for more picks, or comment what they'd want covered next.`,
};

function buildPrompt(input: ClipInput, seedAngle?: string | null): string {
  const intent = input.tone ?? DEFAULT_INTENT;
  const intentSpec = INTENT_SPECS[intent] ?? INTENT_SPECS[DEFAULT_INTENT];
  const subject = MODE_FRAMING[input.mode](input.value);

  const nicheLine = input.niche && input.mode !== 'niche' ? `Niche lens: ${input.niche}` : '';

  const assignments = pickArchetypes(input.count, !!seedAngle);
  const archetypeBlock = seedAngle
    ? ''
    : `REQUIRED HOOK VARIETY — one clip per archetype in order:\n${assignments
        .map((name, i) => {
          const a = HOOK_ARCHETYPES.find((h) => h.name === name)!;
          return `  ${i + 1}. ${a.name} — ${a.guide}`;
        })
        .join('\n')}\n`;

  const seedBlock = seedAngle
    ? `ANGLE LOCK: all ${input.count} clips stay in this angle: "${seedAngle}".\nKeep the angle consistent, but change:\n  - the opening word of every hook (no two hooks share a first word)\n  - the script beat (proof / confession / number list / reaction)\n  - the on-screen tension line\nThe result should feel like 5 distinct takes on the same angle, not 5 copies.\n`
    : '';

  return `You are a senior TikTok Shop affiliate scriptwriter who has shipped ${'$'}10M+ in GMV. Generate ${input.count} ready-to-record short-form clips.

${subject}
${nicheLine ? nicheLine + '\n' : ''}CONTENT INTENT — "${intentSpec.label}"
${intentSpec.direction}
Every clip in this batch MUST sit cleanly inside this intent. A viewer should be able to tell, from the first 2 seconds, that this is that kind of video.

${archetypeBlock}${seedBlock}
PER-CLIP CONSTRAINTS — every clip has THREE distinct hooks (verbal, visual, on-screen) and a script body after them:
- hook.verbal — the FIRST spoken line. One sentence, ≤14 words. Sounds like a real person talking, not marketing copy. Every verbal hook in this batch MUST start with a different first word.
- hook.visual — what the creator physically does on camera in the first 1–3 seconds. Concrete action the viewer SEES. Examples: "Close-up of dry scalp, then tilt up as you hold the dropper bottle to camera", "Walk into frame mid-sentence holding two serums, tap the left one", "POV: dump your old version in the trash, then reveal the replacement". 10–20 words. NO vague directions like "show product" — direct the creator.
- hook.text — the text overlay burned in during the first 2 seconds. ≤10 words. Creates tension INDEPENDENT of what is being said or shown. Feels like a caption you'd stop scrolling for.
- script — the voiceover AFTER the verbal hook (not including it). 30–55 words, SPOKEN cadence: contractions ("I'm", "didn't", "wasn't"), sentence fragments allowed, natural self-interrupts ("— and honestly…", "okay so"), one visceral detail. Must anchor a real setting/moment (gym, car, kitchen counter, bathroom sink, hotel lobby, commute). No corporate tone, no listicle voice, no "in conclusion" wrap-ups.
- description — the TikTok post description (below the video). 1–2 sentences + 3–5 relevant hashtags (include #tiktokshop or #tiktokmademebuyit where natural). Keep it casual.
- cta — closing line spoken at the end, ≤12 words. MUST include a REASON to act now (e.g., "I linked the exact one because the colors sell out", "read the top review before you buy", "comment what size you are — I'll tell you which to grab"). A bare "tap the basket" with no reason is rejected.
- angle — 2–5 word label for the creative angle. No two clips share an angle in this batch.

FILMING GUIDANCE — practical advice for how the creator should physically shoot this clip. Short, concrete, creator-friendly (no film-school jargon). Always include:
- shot_type — the camera setup. 2–6 words. Pick from the creator's world: "selfie close-up", "waist-up kitchen demo", "car front-seat talking", "hand-held product demo", "over-the-shoulder pour", "mirror full-body", "bathroom counter demo", "desk talking-head", "walk-and-talk". Never generic like "medium shot".
- framing — where the creator is in frame + where the product sits. 1 sentence, ≤20 words. e.g. "You centered, product in right hand at chin height, clean counter behind you." / "Phone propped at eye level, you leaning in from the left, bottle between you and camera."
- text_layout — exactly where the on-screen text belongs during the hook. 1 sentence, ≤15 words. e.g. "Top-center, bold yellow, two short lines, above your head." / "Lower third, white on dark bar, one line, don't cover the product."
- thumbnail_idea — the ONE cover frame (what a viewer sees before pressing play). ≤12 words. Must include a face expression OR a visual tension beat + product placement. e.g. "Shocked face, bottle held up to one eye, text: 6 WEEKS LATER" / "Side-by-side: old setup vs new, arrow pointing right."
- broll_hint — one supporting shot you'd cut to mid-script. ≤12 words. Concrete action. e.g. "Close-up pouring into clear glass, slow-mo." / "POV opening the freshly delivered box on your counter." Omit ONLY if the shot is truly self-contained.

POSTABILITY TEST — HARD (per-clip, per-batch)
Every SINGLE clip's verbal hook MUST contain at least ONE of these signals, clearly and literally:
  A) a real scenario — a specific place/setting (car, gym, kitchen, bathroom, desk, hotel, airplane, commute)
  B) a time reference — late night, before work, day 4, Tuesday morning, 11pm, after my shower
  C) a mistake — "I was doing this wrong", "I'd been using this backwards", "I kept buying the wrong one"
  D) a comparison — "this vs my old Dyson", "instead of the Ulta one", "replaced my $300 setup"
If a hook does not meet at least ONE of A/B/C/D, rewrite it before returning it. Do NOT emit vague hooks.
Across a batch of ${input.count}, aim to rotate through all four categories — don't let every clip be type A.

SPOKEN-NOT-WRITTEN CHECK (scripts):
  · Must contain at least one contraction (I'm, didn't, won't, can't).
  · Must read aloud in under 20 seconds naturally — if it feels like a paragraph, cut it.
  · No sentence should begin with "Additionally", "Furthermore", "Moreover", "In conclusion", "Ultimately", "At the end of the day".
  · No "Imagine if…", "Picture this…", "Let me tell you…", "In a world where…".
  · If the first-draft script has zero natural pause markers ("—", "...", "okay,"), insert one.

HOOK INTEGRATION
- The three hooks should RE-INFORCE each other, not duplicate. If verbal says "I was bald at 26", the text might say "6 MONTHS LATER" and the visual should show the before/after pivot — three different information channels landing the same beat.
- Never put the exact same sentence in two hook fields.

HARD BANS — do not use these phrases ANYWHERE in hook/script/cta/description:
  Hype filler: "game changer", "life hack", "wait for it", "you won't believe", "trust me", "thank me later", "run don't walk", "hidden gem", "hear me out", "this changed everything", "mind blown", "stop scrolling", "say goodbye to", "next level", "must have", "I'm obsessed", "holy grail", "literally obsessed".
  AI tells: "in a world where", "let me tell you", "picture this", "imagine if", "look no further", "the perfect", "elevate your", "unleash", "revolutionary", "cutting-edge", "seamlessly", "effortlessly", "the ultimate", "unlock the secret", "one-stop shop", "delve into", "a game-changing".
  Dead openers: "this tiny thing", "this little thing", "the way this", "did you know", "have you ever".

VAGUENESS BAN — reject outputs that use "this thing", "this stuff", "this product", "this item" as the MAIN reference. Name the product or at minimum its category ("the dropper", "the heel liner", "the creamer").

COMPLIANCE — HARD REJECTS (rewrite or drop before returning):
- No weight-loss claims: never "melted X pounds", "drop X lbs", "lost X inches", "ice hack", "metabolism secret", before/after body transformations tied to the product.
- No medical claims: never "cures", "treats", "heals", "eliminates", "reverses" a condition. Do not name diseases or prescription drugs as things this product fixes.
- No dermatology/MD appeals: never "dermatologists hate this", "what doctors won't tell you", "plastic surgeon approved".
- No income claims: never "make ${'$'}X passive", "side hustle that pays X", "quit your job".
- No guaranteed outcomes: never "you WILL", "guaranteed", "100%", "every time".
- No fear-mongering about competitors: don't name other brands as unsafe, toxic, harmful, etc.
If the product category naturally touches health/skincare/supplements, ground every benefit in the creator's personal experience ("my scalp felt less tight", not "clinically proven to regrow hair").

RULES OF THUMB
- Specific > general. Replace "amazing" with a concrete detail.
- Show the human, not the product. The product shows up through the story.
- Each hook must create an open loop the viewer has to finish the clip to close.
- CTA should feel like a friend recommending, not an ad. Always give a REASON to act.

FINAL SELF-CHECK — before returning, re-read each clip. If you (a reader who films TikToks) cannot instantly picture HOW to shoot this in your kitchen/car/bathroom right now, rewrite it. Vague = rejected.

OUTPUT — return ONLY a JSON array of exactly ${input.count} objects, no prose, no code fence labels other than json:
[
  {
    "hook": {
      "verbal": "...",
      "visual": "...",
      "text": "..."
    },
    "script": "...",
    "description": "...",
    "cta": "...",
    "angle": "...",
    "shot_type": "...",
    "framing": "...",
    "text_layout": "...",
    "thumbnail_idea": "...",
    "broll_hint": "..."
  }
]`;
}

function fallbackAngles(): string[] {
  return [
    'skeptic-to-believer',
    'morning-routine reveal',
    'before-vs-after',
    'problem moment',
    'confession',
    'day-in-the-life',
    'POV scene',
    'green-screen reaction',
    'storytime reveal',
    'rapid-fire review',
    'side-by-side proof',
    'first-time user',
    'expert debunk',
    'late-night spiral',
    'friend tells friend',
    'contrarian take',
    'budget comparison',
    'unboxing moment',
    'quick tip',
    'three reasons',
  ];
}

function fallbackOpeners(): string[] {
  return [
    `Okay so I wasn't going to post this but`,
    `Hot take — nobody talks about`,
    `Why is every creator I follow suddenly using`,
    `Three reasons I stopped using every other version of`,
    `POV: your For You page finally shows you`,
    `I was doing my whole routine wrong until I tried`,
    `Don't tell the group chat I showed you`,
    `Before you scroll — quick truth about`,
    `If you've been on the fence about`,
    `Watch me use this on camera for the first time with`,
    `Rating every single way people use`,
    `Be honest — have you actually tried`,
    `My friend swore I'd regret switching to`,
    `Late-night me ordering this, explained:`,
    `Let me show you what a full week looks like with`,
    `I bought this to prove a point and ended up loving`,
    `Unpopular take incoming about`,
    `Green-screen me real quick to talk about`,
    `The thing everyone gets wrong about`,
    `Quick confession from someone who lives on TikTok Shop:`,
  ];
}

function fallbackVisuals(): string[] {
  return [
    `Handheld selfie, mid-reach for the product on the bathroom counter, then turn to camera`,
    `POV shot: dump your old version in the trash, then hold the replacement up to the light`,
    `Walk into frame mid-sentence with the product in one hand, phone in the other`,
    `Sit cross-legged on the floor, open the package on camera, pull the product out without cutting`,
    `Green-screen yourself pointing at a fake comment, then cut to the product reveal`,
    `Close-up on your hand applying or using it, then tilt up to your face reacting`,
    `Side-by-side split: yesterday's routine on the left, today's on the right`,
    `Mirror shot: turn to camera holding the product, deadpan expression, then smile`,
    `B-roll of pouring / opening / using the product while you voice over`,
    `Point at the empty shelf where yours used to be, pan over to the replacement`,
    `Show three things you stopped buying in one shot, land on the new one`,
    `Hold the product up to your face and talk directly into camera — no cuts`,
    `Screen-record a text thread, then cut to you reacting on camera`,
    `Zoom in on the label while you narrate, pull out to your reaction`,
    `Before-and-after photos on screen, then a live on-camera reveal`,
  ];
}

function fallbackBatch(input: ClipInput, seedAngle?: string | null): Clip[] {
  const tone = input.tone ?? DEFAULT_TONE;
  const subject = input.value.trim() || 'your product';
  const angles = seedAngle ? Array(input.count).fill(seedAngle) : fallbackAngles();
  const openers = fallbackOpeners();
  const visuals = fallbackVisuals();
  const hookTexts = [
    `I did not expect this to actually work`,
    `not the group chat finding out`,
    `3 things I stopped buying after this`,
    `genuinely stop scrolling for this one thing`,
    `no one warned me about this part`,
    `a week later and I'm telling everyone`,
    `okay but hear the whole story`,
    `this wasn't in the reviews`,
    `why is nobody posting about this`,
    `I owe this a full review`,
  ];
  const ctas = [
    `Tap the basket before it sells out again.`,
    `Comment if you've tried this — I'm keeping receipts.`,
    `Save this so future you remembers to grab one.`,
    `Follow for part two if this hits.`,
    `Link's in the orange basket — don't sleep on it.`,
  ];
  const shotTypes = [
    'selfie close-up',
    'waist-up kitchen demo',
    'car front-seat talking',
    'hand-held product demo',
    'bathroom counter demo',
    'mirror full-body',
    'desk talking-head',
    'walk-and-talk',
  ];
  const framings = [
    'You centered, product in right hand at chin height, plain wall behind you.',
    'Phone propped eye level, you leaning in from the left, product between you and camera.',
    'Over-the-shoulder: product on counter in foreground, your face reacting in soft focus.',
    'Handheld selfie, product held up to your cheek, natural window light behind camera.',
  ];
  const textLayouts = [
    'Top-center, bold white, two short lines, above your head.',
    'Lower third, yellow on dark bar, one line, don\'t cover the product.',
    'Dead center for 1s then shrinks to top-left — keeps focus on your face.',
  ];
  const thumbnailIdeas = [
    `Shocked face, product held to your cheek, text: "WAIT what"`,
    `Side-by-side: old vs new, arrow pointing right at ${subject}`,
    `Pointing at ${subject} on counter, deadpan face, one-word overlay`,
    `Before/after split, your reaction on the right panel`,
  ];
  const brollHints = [
    `Close-up pouring / opening / using it, slow-mo.`,
    `POV opening the box on the counter.`,
    `Shelf pan from your old version to the new one.`,
    `Text-thread screen-record, tap to open the link in basket.`,
  ];

  return Array.from({ length: input.count }).map((_, i) => {
    const angle = angles[i % angles.length];
    const verbal = `${openers[i % openers.length]} ${subject}.`;
    return {
      id: safeId(),
      hook: {
        verbal,
        visual: visuals[i % visuals.length],
        text: hookTexts[i % hookTexts.length],
      },
      script: `I kept seeing it everywhere and finally gave in — and honestly, I get the hype now. Whole routine is easier, and it's the kind of thing you try once and tell your group chat about.`,
      description: `why is nobody talking about ${subject}? 🧺 #tiktokshop #tiktokmademebuyit #affiliate #fyp`,
      cta: ctas[i % ctas.length],
      angle,
      tone,
      shotType: shotTypes[i % shotTypes.length],
      framing: framings[i % framings.length],
      textLayout: textLayouts[i % textLayouts.length],
      thumbnailIdea: thumbnailIdeas[i % thumbnailIdeas.length],
      brollHint: brollHints[i % brollHints.length],
    };
  });
}

// Ensure each verbal hook starts with a different first word. If dupes, rewrite minimally.
function enforceFirstWordDiversity(clips: Clip[]): Clip[] {
  const seen = new Set<string>();
  return clips.map((c) => {
    const verbal = c.hook?.verbal ?? '';
    const firstWord = verbal.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    if (!firstWord || !seen.has(firstWord)) {
      if (firstWord) seen.add(firstWord);
      return c;
    }
    const altPrefixes = ['Okay', 'Real', 'Honestly', 'Listen', 'So', 'Wait', 'Quick', 'Hot', 'Random', 'POV'];
    for (const p of altPrefixes) {
      if (!seen.has(p.toLowerCase())) {
        seen.add(p.toLowerCase());
        const rewritten = `${p} — ${verbal.charAt(0).toLowerCase()}${verbal.slice(1)}`;
        return { ...c, hook: { ...c.hook, verbal: rewritten } };
      }
    }
    return c;
  });
}

type ParsedClip = {
  hook?: Partial<Hook> | string;
  script?: string;
  description?: string;
  caption?: string; // legacy LLM key, remap
  on_screen?: string; // legacy LLM key, remap into hook.text
  onScreen?: string;
  cta?: string;
  angle?: string;
  shot_type?: string;
  shotType?: string;
  framing?: string;
  text_layout?: string;
  textLayout?: string;
  thumbnail_idea?: string;
  thumbnailIdea?: string;
  broll_hint?: string;
  brollHint?: string;
};

function normalizeHook(raw: ParsedClip): Hook {
  if (raw.hook && typeof raw.hook === 'object') {
    const h = raw.hook as Partial<Hook> & { spoken?: string; text_overlay?: string };
    return {
      verbal: String(h.verbal ?? h.spoken ?? '').trim(),
      visual: String(h.visual ?? '').trim(),
      text: String(h.text ?? h.text_overlay ?? raw.on_screen ?? raw.onScreen ?? '').trim(),
    };
  }
  // LLM drifted: flat string hook. Put it in verbal, pull on_screen into text.
  return {
    verbal: String(raw.hook ?? '').trim(),
    visual: '',
    text: String(raw.on_screen ?? raw.onScreen ?? '').trim(),
  };
}

async function generateWithLLM(input: ClipInput, seedAngle?: string | null): Promise<Clip[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const { parsed } = await callAnthropicJSON<ParsedClip[]>(
      buildPrompt(input, seedAngle),
      {
        // /create LLM uses Haiku 4.5 — ~75% cheaper than Sonnet for template-fill
        // tasks like this. Editor stays on Sonnet (DEFAULT_MODEL in anthropic.ts).
        model: 'claude-haiku-4-5-20251001',
        maxTokens: Math.min(1800 + input.count * 480, 8000),
        temperature: 0.95,
        requestType: 'generation',
        agentId: 'v1-clip-generate',
      },
    );

    if (!Array.isArray(parsed)) return null;

    const tone = input.tone ?? DEFAULT_TONE;
    const mapped: Clip[] = parsed.slice(0, input.count).map((c) => {
      const shotType = String(c.shot_type ?? c.shotType ?? '').trim();
      const framing = String(c.framing ?? '').trim();
      const textLayout = String(c.text_layout ?? c.textLayout ?? '').trim();
      const thumbnailIdea = String(c.thumbnail_idea ?? c.thumbnailIdea ?? '').trim();
      const brollHint = String(c.broll_hint ?? c.brollHint ?? '').trim();
      return {
        id: safeId(),
        hook: normalizeHook(c),
        script: String(c.script ?? '').trim(),
        description: String(c.description ?? c.caption ?? '').trim(),
        cta: String(c.cta ?? '').trim(),
        angle: String(c.angle ?? '').trim(),
        tone,
        shotType: shotType || undefined,
        framing: framing || undefined,
        textLayout: textLayout || undefined,
        thumbnailIdea: thumbnailIdea || undefined,
        brollHint: brollHint || undefined,
      };
    });

    return enforceFirstWordDiversity(mapped);
  } catch (err) {
    console.error('[v1-clip-generate] LLM failed, falling back:', err);
    return null;
  }
}

export async function generateClips(
  input: ClipInput,
  seedAngle?: string | null,
): Promise<{ clips: Clip[]; source: 'llm' | 'fallback' }> {
  const count = Math.max(1, Math.min(input.count, 20));
  const normalized: ClipInput = { ...input, count, tone: input.tone ?? DEFAULT_TONE };

  const llm = await generateWithLLM(normalized, seedAngle);
  if (llm && llm.length > 0 && llm.every((c) => c.hook?.verbal && c.script)) {
    return { clips: llm, source: 'llm' };
  }
  return {
    clips: enforceFirstWordDiversity(fallbackBatch(normalized, seedAngle)),
    source: 'fallback',
  };
}

export function isValidTone(x: unknown): x is Tone {
  return typeof x === 'string' && (INTENT_IDS as string[]).includes(x);
}

export function isValidMode(x: unknown): x is InputMode {
  return x === 'product' || x === 'tiktok_url' || x === 'niche';
}
