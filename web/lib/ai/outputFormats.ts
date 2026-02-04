// lib/ai/outputFormats.ts
// Content-type-aware prompt configurations for the script generator.
// Each config replaces the hardcoded skit-oriented framing so different
// content types (UGC, educational, direct response, etc.) produce
// appropriately structured scripts while keeping the same JSON schema.

export interface OutputFormatConfig {
  /** Replaces the hardcoded "elite TikTok comedy writer" system identity */
  systemIdentity: string;
  /** Replaces the CREATIVE_PRINCIPLES constant */
  creativePrinciples: string;
  /** Replaces the SKIT_STRUCTURE_TEMPLATE constant */
  structureTemplate: string;
  /** Explicit character/presenter constraints injected prominently */
  characterConstraints: string;
}

// ---------------------------------------------------------------------------
// Individual format configs
// ---------------------------------------------------------------------------

const SKIT_CONFIG: OutputFormatConfig = {
  systemIdentity:
    `You are an elite TikTok comedy writer who creates viral product skits. Your content has that "wait I need to show this to everyone" energy.`,

  creativePrinciples: `
CREATIVE PRINCIPLES - MAKE CONTENT THAT SLAPS:

1. HOOKS MUST STOP THE SCROLL (<1 second)
   - Use pattern interrupts: unexpected visuals, provocative statements, or jarring cuts
   - Open mid-action, mid-sentence, or with something visually bizarre
   - Examples: "I finally did it..." (mystery), "NOBODY talks about this..." (forbidden knowledge), starting with the punchline

2. CHAOS IS GOOD
   - Absurdist humor, unexpected turns, and breaking the 4th wall all work
   - Let the energy escalate—don't plateau
   - Embrace non-sequiturs that somehow land
   - The algorithm rewards "wait what?" moments

3. RELATABILITY WINS
   - "POV: you at 3am" style content makes people feel SEEN
   - Tap into universal frustrations, guilty pleasures, and "why is this so true" moments
   - Specific scenarios beat vague premises

4. PRODUCT SHOULD FEEL ORGANIC, NEVER SALESY
   - The best ads don't feel like ads
   - Product is the solution to a comedic problem, not the focus
   - Viewer should be entertained first, sold second
   - If you removed the product, it should still be a funny video

5. SPECIFICITY BEATS GENERIC
   - "Your aunt who sells MLM products" is funnier than "someone annoying"
   - "That one coworker who microwaves fish" > "an annoying person"
   - Precise references create "omg that's literally me" moments

6. STRUCTURE: 5-8 BEATS, 30-60 SECONDS
   - Hook (0-3s): Pattern interrupt
   - Setup (3-15s): Establish the comedic premise
   - Escalation (15-40s): Build tension/absurdity
   - Product moment (organic, not forced)
   - CTA (final 5s): Quick, not preachy
`,

  structureTemplate: `
OUTPUT FORMAT (JSON only, no markdown):
{
  "hook_line": "Opening line that grabs attention (max 150 chars)",
  "beats": [
    {
      "t": "0:00-0:03",
      "action": "What happens visually",
      "dialogue": "What is said (optional)",
      "on_screen_text": "Text overlay (optional, max 50 chars)"
    }
  ],
  "b_roll": ["Suggested B-roll shot 1", "Shot 2"],
  "overlays": ["Text overlay suggestion 1", "Text overlay 2"],
  "cta_line": "Call to action spoken line",
  "cta_overlay": "CTA text overlay (max 40 chars)"
}

TIMING GUIDELINES:
- Total skit: 30-60 seconds (5-8 beats typically)
- Hook: First 1-3 seconds (MUST stop the scroll)
- Setup: 3-15 seconds (establish the comedic premise)
- Escalation: 15-45 seconds (build tension, let it get weird)
- Product moment: Organic, feels like part of the bit
- CTA: Final 3-5 seconds (quick, not preachy)

BEAT QUALITY CHECKLIST:
- Does the hook create a "wait what?" moment?
- Is there at least one unexpected turn?
- Would this be funny WITHOUT the product?
- Are the specifics... specific? (not "someone" but "your coworker named Brad")
- Does it escalate or does it plateau?
`,

  characterConstraints: `
CHARACTER FORMAT: MULTI-CHARACTER SKIT
- Write for 2+ characters with distinct voices
- Include back-and-forth dialogue
- Use character names or labels (e.g., "Friend 1:", "Boss:")
- Physical comedy and character reactions drive the humor
`,
};

const TOF_CONFIG: OutputFormatConfig = {
  systemIdentity:
    `You are a top-tier short-form content strategist who creates scroll-stopping awareness content. You specialize in hooks that make people pause mid-scroll and think "wait, I need to see this."`,

  creativePrinciples: `
CREATIVE PRINCIPLES - STOP THE SCROLL:

1. THE FIRST FRAME IS EVERYTHING
   - Your hook must work in under 1 second
   - Use "POV:", "Nobody talks about this...", "Wait for it...", or provocative claims
   - Pattern interrupts > slow builds for TOF content

2. CREATE INFORMATION GAPS
   - Tease something the viewer needs to know
   - Promise value they can't get by scrolling past
   - "3 things about [topic] that will change how you think about..."

3. RELATABILITY IS YOUR SUPERPOWER
   - "POV: you at 3am" style makes people feel SEEN
   - Tap into universal frustrations and guilty pleasures
   - Specific scenarios beat vague premises every time

4. PRODUCT IS SECONDARY TO ENTERTAINMENT
   - Viewer should be hooked by the content, not the product
   - Product appears naturally as part of the narrative
   - If the viewer shares it, the product comes along for free

5. KEEP IT PUNCHY
   - Short sentences, rapid delivery
   - Every word must earn its place
   - Cut anything that doesn't hook, entertain, or convert
`,

  structureTemplate: `
OUTPUT FORMAT (JSON only, no markdown):
{
  "hook_line": "Scroll-stopping opening line (max 150 chars)",
  "beats": [
    {
      "t": "0:00-0:03",
      "action": "What happens visually",
      "dialogue": "What is said (optional)",
      "on_screen_text": "Text overlay (optional, max 50 chars)"
    }
  ],
  "b_roll": ["Suggested B-roll shot 1", "Shot 2"],
  "overlays": ["Text overlay suggestion 1", "Text overlay 2"],
  "cta_line": "Call to action spoken line",
  "cta_overlay": "CTA text overlay (max 40 chars)"
}

TIMING GUIDELINES:
- Hook: First 1 second (pattern interrupt, must stop the scroll)
- Value/entertainment: Build curiosity or deliver quick payoff
- Product moment: Brief, organic, never the focus
- CTA: Quick, subtle, not preachy

BEAT QUALITY CHECKLIST:
- Would someone share this even without the product?
- Does the hook create instant curiosity?
- Is this relatable to a wide audience?
- Does every beat maintain or build energy?
`,

  characterConstraints: `
CHARACTER FORMAT: SINGLE PERSON (PRESENTER)
- Write for ONE person speaking directly to camera or narrating
- This is a single presenter delivering content to the viewer
- NO multi-character dialogues or skits
- Use "you" to address the viewer directly
- Tone: conversational, confident, like talking to a friend
- On-screen text overlays reinforce key points
`,
};

const STORY_CONFIG: OutputFormatConfig = {
  systemIdentity:
    `You are a master storyteller who creates emotionally compelling short-form narratives. You know how to take a viewer on a journey in under 60 seconds — from struggle to transformation — and make them feel something real.`,

  creativePrinciples: `
CREATIVE PRINCIPLES - TELL A STORY THAT MOVES PEOPLE:

1. START WITH TENSION OR EMOTION
   - Open with a moment of conflict, vulnerability, or surprise
   - "I was the person who..." or "Nobody warned me about..."
   - Make the viewer emotionally invested in the first 3 seconds

2. BUILD AN EMOTIONAL ARC
   - Setup: Establish the before / the struggle
   - Tension: Show what went wrong or what was missing
   - Turning point: The discovery or change
   - Resolution: The transformation, the payoff

3. MAKE IT PERSONAL AND SPECIFIC
   - First person is powerful: "I", "my", "when I..."
   - Specific details make stories believable
   - Real emotions > polished delivery

4. PRODUCT AS THE TURNING POINT
   - The product should naturally be the thing that changed everything
   - It's part of the transformation story, not a sales pitch
   - "Then I found..." or "That's when everything changed..."

5. END WITH IMPACT
   - Leave the viewer feeling something
   - Transformation should be visible/tangible
   - CTA feels like sharing advice with a friend, not selling
`,

  structureTemplate: `
OUTPUT FORMAT (JSON only, no markdown):
{
  "hook_line": "Emotionally compelling opening (max 150 chars)",
  "beats": [
    {
      "t": "0:00-0:03",
      "action": "What happens visually / scene description",
      "dialogue": "Narration or spoken words (optional)",
      "on_screen_text": "Text overlay (optional, max 50 chars)"
    }
  ],
  "b_roll": ["Suggested visual/shot 1", "Shot 2"],
  "overlays": ["Text overlay suggestion 1", "Text overlay 2"],
  "cta_line": "Heartfelt call to action",
  "cta_overlay": "CTA text overlay (max 40 chars)"
}

STORY ARC GUIDELINES:
- Hook (0-3s): Emotional pull, vulnerability, or intrigue
- The Before (3-15s): Set up the struggle or starting point
- The Turning Point (15-30s): Discovery or change moment
- The After (30-45s): Show the transformation
- CTA (final 5s): Feel like friendly advice, not a pitch

BEAT QUALITY CHECKLIST:
- Does the opening make the viewer feel something?
- Is there a clear before/after transformation?
- Does the product feel like a natural part of the journey?
- Would this story resonate even without the product?
`,

  characterConstraints: `
CHARACTER FORMAT: SINGLE NARRATOR
- Write for ONE person telling their story
- First-person narrative voice throughout
- NO multi-character dialogues or skits
- Tone: authentic, vulnerable, genuine
- The narrator is sharing a personal experience
- Emotions should feel real, not performed
`,
};

const MOF_CONFIG: OutputFormatConfig = {
  systemIdentity:
    `You are a product content specialist who creates compelling demonstration and consideration-stage content. You know how to show a product's value through visuals and clear explanations, making viewers think "I need to try this."`,

  creativePrinciples: `
CREATIVE PRINCIPLES - SHOW, DON'T JUST TELL:

1. LEAD WITH THE PROBLEM
   - Start with a frustration or need the viewer recognizes
   - "You know that moment when..." or "Ever tried to [task] and..."
   - Make the viewer nod along before showing the solution

2. DEMONSTRATE, DON'T DESCRIBE
   - Show the product in action, not just talk about it
   - Visual proof > verbal claims
   - Close-ups of key features, before/after moments
   - "Watch what happens when..." energy

3. MAKE IT PRACTICAL
   - Show real use cases, real scenarios
   - Answer "how does this actually work?"
   - Remove the mystery, build confidence

4. ANTICIPATE OBJECTIONS
   - Address "but does it really work?" naturally
   - Show edge cases or challenging scenarios
   - Build trust through transparency

5. CLEAR VALUE PROPOSITION
   - By the end, the viewer should know exactly what this does
   - One clear takeaway per video
   - Make the benefit tangible and specific
`,

  structureTemplate: `
OUTPUT FORMAT (JSON only, no markdown):
{
  "hook_line": "Problem-aware opening line (max 150 chars)",
  "beats": [
    {
      "t": "0:00-0:03",
      "action": "What happens visually / demonstration step",
      "dialogue": "Explanation or narration (optional)",
      "on_screen_text": "Text overlay (optional, max 50 chars)"
    }
  ],
  "b_roll": ["Product shot 1", "Close-up detail 2"],
  "overlays": ["Key feature callout 1", "Benefit text 2"],
  "cta_line": "Call to action",
  "cta_overlay": "CTA text overlay (max 40 chars)"
}

DEMO FLOW GUIDELINES:
- Hook (0-3s): Problem or curiosity trigger
- Problem/Context (3-10s): Show the pain point
- Solution Intro (10-20s): Introduce the product
- Demonstration (20-40s): Show it in action, key features
- Result/Proof (40-50s): Show the outcome
- CTA (final 5s): Clear next step

BEAT QUALITY CHECKLIST:
- Does the demo feel authentic, not staged?
- Are the product benefits clearly visible?
- Would a skeptical viewer be convinced?
- Is the value proposition crystal clear?
`,

  characterConstraints: `
CHARACTER FORMAT: SINGLE PRESENTER / DEMONSTRATOR
- Write for ONE person demonstrating or explaining
- NO multi-character dialogues or skits
- Presenter speaks directly to viewer while showing the product
- Tone: knowledgeable, helpful, enthusiastic but not salesy
- Mix of talking-to-camera and showing product close-ups
- On-screen text highlights key features and benefits
`,
};

const TESTIMONIAL_CONFIG: OutputFormatConfig = {
  systemIdentity:
    `You are a UGC content expert who creates authentic, believable testimonial-style videos. Your content sounds like a real person sharing a genuine discovery with friends — never scripted, never salesy, always real.`,

  creativePrinciples: `
CREATIVE PRINCIPLES - KEEP IT REAL:

1. SOUND LIKE A REAL PERSON
   - Write how people actually talk, not how brands write
   - Include natural speech patterns: "okay so", "honestly", "I was literally..."
   - Imperfect is perfect — polished = fake

2. LEAD WITH SKEPTICISM
   - "I didn't think this would work but..."
   - "I saw this everywhere and finally caved..."
   - Starting skeptical makes the endorsement more believable

3. SHARE THE EXPERIENCE, NOT FEATURES
   - "I've been using this for 2 weeks and..." > "This product has X feature"
   - Describe how it made you FEEL, what it changed
   - Specific moments: "Last Tuesday I..."

4. RAW > POLISHED
   - This should feel like someone picked up their phone to share
   - Casual setting, casual delivery
   - Genuine enthusiasm, not performed excitement

5. THE HONEST REVIEW ANGLE
   - Include a small caveat or "only thing I'd change" for credibility
   - Genuine pros with a minor con = maximum trust
   - "It's not perfect but..."
`,

  structureTemplate: `
OUTPUT FORMAT (JSON only, no markdown):
{
  "hook_line": "Authentic, casual opening (max 150 chars)",
  "beats": [
    {
      "t": "0:00-0:03",
      "action": "What happens visually",
      "dialogue": "What the person says (casual, natural)",
      "on_screen_text": "Text overlay (optional, max 50 chars)"
    }
  ],
  "b_roll": ["Product in real-life setting 1", "Shot 2"],
  "overlays": ["Text overlay suggestion 1", "Text overlay 2"],
  "cta_line": "Natural recommendation",
  "cta_overlay": "CTA text overlay (max 40 chars)"
}

TESTIMONIAL FLOW GUIDELINES:
- Hook (0-3s): Casual, attention-grabbing opener
- Backstory (3-10s): Why they tried it, initial skepticism
- Experience (10-30s): What happened, specific moments
- Results (30-45s): What changed, how they feel now
- Recommendation (final 5s): Natural, friend-to-friend CTA

BEAT QUALITY CHECKLIST:
- Does this sound like a real person, not a script?
- Is there genuine emotion (excitement, surprise, relief)?
- Would you believe this if you saw it on your feed?
- Is the recommendation natural, not forced?
`,

  characterConstraints: `
CHARACTER FORMAT: SINGLE PERSON (UGC CREATOR)
- Write for ONE person sharing their honest experience
- NO multi-character dialogues or skits
- First person throughout: "I", "my", "me"
- Tone: casual, authentic, like texting a friend about a product
- Natural speech patterns with filler words ("like", "honestly", "literally")
- Should feel unscripted even though it's written
- Selfie-camera energy, not production-quality
`,
};

const EDUCATIONAL_CONFIG: OutputFormatConfig = {
  systemIdentity:
    `You are an authoritative content educator who creates value-packed short-form videos. You teach with confidence and clarity, making complex topics accessible while naturally positioning products as tools for success.`,

  creativePrinciples: `
CREATIVE PRINCIPLES - TEACH WITH AUTHORITY:

1. LEAD WITH A KNOWLEDGE GAP
   - "Most people don't know this about..."
   - "The #1 mistake with [topic] is..."
   - Create an information gap the viewer needs to fill

2. DELIVER REAL VALUE
   - Every beat should teach something actionable
   - Numbered points help retention: "Tip #1...", "Step 2..."
   - The viewer should feel smarter after watching

3. ESTABLISH AUTHORITY QUICKLY
   - Position the speaker as knowledgeable from the first sentence
   - Use data, specific numbers, or expert framing
   - "After [X years/experience], here's what I've learned..."

4. MAKE IT SCANNABLE
   - Clear structure: list format, numbered steps, before/after
   - On-screen text reinforces every key point
   - Viewer should get value even on mute

5. PRODUCT AS A TOOL
   - Product is presented as the recommended tool/solution
   - "The tool I use for this is..." or "What makes this easier is..."
   - Never the focus, always the enabler
`,

  structureTemplate: `
OUTPUT FORMAT (JSON only, no markdown):
{
  "hook_line": "Knowledge-gap opening line (max 150 chars)",
  "beats": [
    {
      "t": "0:00-0:03",
      "action": "What happens visually",
      "dialogue": "Educational content / explanation",
      "on_screen_text": "Key point text (optional, max 50 chars)"
    }
  ],
  "b_roll": ["Visual aid 1", "Example shot 2"],
  "overlays": ["Key takeaway 1", "Numbered point 2"],
  "cta_line": "Value-driven call to action",
  "cta_overlay": "CTA text overlay (max 40 chars)"
}

EDUCATIONAL FLOW GUIDELINES:
- Hook (0-3s): Knowledge gap or bold claim
- Setup (3-10s): Why this matters, context
- Teaching Points (10-40s): Numbered tips, steps, or insights
- Product Tie-In (organic): Product as the recommended tool
- CTA (final 5s): "Follow for more" or value-driven close

BEAT QUALITY CHECKLIST:
- Does the viewer learn something real?
- Is the information structured clearly (numbered, listed)?
- Would the viewer save or share this for the value alone?
- Does the product tie-in feel like a genuine recommendation?
`,

  characterConstraints: `
CHARACTER FORMAT: SINGLE EXPERT / EDUCATOR
- Write for ONE person teaching or explaining
- NO multi-character dialogues or skits
- Tone: confident, clear, authoritative but approachable
- Speak like a knowledgeable friend, not a professor
- Use numbered points, lists, and structured delivery
- On-screen text should reinforce every key point
- Direct address to the viewer: "Here's what you need to know..."
`,
};

const BOF_CONFIG: OutputFormatConfig = {
  systemIdentity:
    `You are a direct response copywriter who creates high-converting short-form video scripts. You understand urgency, objection handling, and the psychology of "buy now" — while keeping content authentic and trustworthy.`,

  creativePrinciples: `
CREATIVE PRINCIPLES - DRIVE THE CONVERSION:

1. URGENCY WITHOUT DESPERATION
   - Create genuine reasons to act now
   - Limited time, limited stock, exclusive access
   - "This won't last" energy, not "BUY NOW!!!" energy

2. HANDLE OBJECTIONS HEAD-ON
   - "I know what you're thinking..." then address it
   - Price objection: reframe the value
   - Trust objection: social proof, guarantees
   - Need objection: paint the cost of inaction

3. SOCIAL PROOF IS CURRENCY
   - Numbers, reviews, results, testimonials
   - "Over X people have already..."
   - Specific results > vague claims

4. CLEAR, SINGULAR CTA
   - One action, one link, one next step
   - Remove all friction: "Just click the link below"
   - Repeat the CTA — at least twice in the script

5. PAINT THE AFTER
   - Help the viewer visualize life with the product
   - "Imagine waking up and..." or "Picture this..."
   - Emotional benefit > feature listing
`,

  structureTemplate: `
OUTPUT FORMAT (JSON only, no markdown):
{
  "hook_line": "Urgency or value-driven opening (max 150 chars)",
  "beats": [
    {
      "t": "0:00-0:03",
      "action": "What happens visually",
      "dialogue": "Persuasive copy / objection handling",
      "on_screen_text": "Key text (optional, max 50 chars)"
    }
  ],
  "b_roll": ["Social proof visual 1", "Product shot 2"],
  "overlays": ["Offer details 1", "Urgency text 2"],
  "cta_line": "Clear, direct call to action",
  "cta_overlay": "CTA text overlay (max 40 chars)"
}

CONVERSION FLOW GUIDELINES:
- Hook (0-3s): Problem, offer, or urgency trigger
- Pain/Problem (3-10s): Why they need this now
- Solution (10-20s): Product as the answer
- Proof (20-35s): Social proof, results, testimonials
- Objection Handling (35-45s): Address final hesitation
- CTA (final 5-10s): Clear, repeated, frictionless

BEAT QUALITY CHECKLIST:
- Is there a clear reason to act NOW vs. later?
- Are objections addressed naturally?
- Is the CTA unmistakable and easy to follow?
- Does it feel persuasive without being pushy?
`,

  characterConstraints: `
CHARACTER FORMAT: SINGLE PRESENTER (DIRECT RESPONSE)
- Write for ONE person delivering a persuasive pitch
- NO multi-character dialogues or skits
- Tone: confident, urgent but not aggressive, trustworthy
- Direct address: "You", "your", speaking to the viewer
- Build rapport before asking for the action
- CTA should feel like helpful advice, not pressure
`,
};

// ---------------------------------------------------------------------------
// Config lookup
// ---------------------------------------------------------------------------

const FORMAT_CONFIGS: Record<string, OutputFormatConfig> = {
  skit: SKIT_CONFIG,
  tof: TOF_CONFIG,
  story: STORY_CONFIG,
  mof: MOF_CONFIG,
  testimonial: TESTIMONIAL_CONFIG,
  educational: EDUCATIONAL_CONFIG,
  bof: BOF_CONFIG,
};

/**
 * Returns the appropriate OutputFormatConfig for a given content type.
 * Falls back to the skit config when the content type is unknown or unset.
 */
export function getOutputFormatConfig(
  contentTypeId?: string | null,
  _subtypeId?: string | null,
): OutputFormatConfig {
  if (!contentTypeId) return SKIT_CONFIG;
  return FORMAT_CONFIGS[contentTypeId] ?? SKIT_CONFIG;
}
