# FlashFlow AI API Documentation

> API access is available on Pro and Team plans.

## Overview

The FlashFlow AI API allows you to programmatically generate scripts, manage personas, and access your content library.

**Base URL:** `https://app.flashflow.ai/api`

## Authentication

All API requests require authentication via session cookie or API key.

### Session Authentication

When using the API from a browser, authentication is handled automatically via Supabase session cookies.

### API Key Authentication (Coming Soon)

For programmatic access, use an API key in the header:

```bash
curl -X GET "https://app.flashflow.ai/api/credits" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Rate Limits

| Plan | Requests/Minute | Requests/Day |
|------|-----------------|--------------|
| Free | 10 | 100 |
| Starter | 30 | 500 |
| Pro | 60 | 2,000 |
| Team | 120 | 10,000 |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Max requests per window
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Endpoints

### Credits

#### Get Credit Balance

```http
GET /api/credits
```

**Response:**
```json
{
  "ok": true,
  "credits": {
    "remaining": 45,
    "usedThisPeriod": 5,
    "lifetimeUsed": 127,
    "periodStart": "2024-01-01T00:00:00Z",
    "periodEnd": "2024-02-01T00:00:00Z"
  },
  "subscription": {
    "planId": "starter",
    "planName": "Starter",
    "status": "active",
    "creditsPerMonth": 50
  }
}
```

---

### Skit Generation

#### Generate a Skit

```http
POST /api/ai/generate-skit
```

**Request Body:**
```json
{
  "product_id": "uuid-here",
  "intensity": 5,
  "template_id": "optional-template-uuid",
  "persona_id": "optional-persona-uuid",
  "additional_context": "Optional extra instructions"
}
```

Or with manual product info:
```json
{
  "product_name": "Sleep Gummies",
  "product_brand": "DreamWell",
  "product_benefits": ["Better sleep", "No grogginess", "Natural ingredients"],
  "intensity": 7
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "skit_data": {
      "hook_line": "POV: You finally found something that actually works",
      "beats": [
        {
          "t": "0:00-0:03",
          "action": "Looking exhausted, staring at phone at 3am",
          "dialogue": "It's 3am and I'm still wide awake... again",
          "on_screen_text": "3:47 AM"
        }
      ],
      "b_roll": ["Close-up of product bottle", "Peaceful sleeping face"],
      "overlays": ["Product name", "Key benefit"],
      "cta_line": "Link in bio to try it yourself",
      "cta_overlay": "Use code SLEEP20"
    },
    "risk_tier": "BALANCED",
    "risk_score": 5,
    "intensity_applied": 5
  },
  "creditsRemaining": 44
}
```

**Credits Used:** 1

---

#### Refine a Skit

```http
POST /api/ai/refine-skit
```

**Request Body:**
```json
{
  "skit_data": { /* existing skit object */ },
  "product_name": "Sleep Gummies",
  "feedback": "Make the hook more attention-grabbing",
  "refine_type": "hook"
}
```

**Refine Types:**
- `hook` - Improve the opening
- `humor` - Add more comedy
- `cta` - Strengthen call-to-action
- `flow` - Improve pacing
- `general` - Overall improvement

**Response:** Same format as generate

**Credits Used:** 1

---

#### Score a Skit

```http
POST /api/ai/score-skit
```

**Request Body:**
```json
{
  "skit_data": { /* skit object */ },
  "product_name": "Sleep Gummies",
  "product_brand": "DreamWell"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "hook_strength": 8,
    "humor_level": 6,
    "product_integration": 7,
    "virality_potential": 8,
    "clarity": 9,
    "production_feasibility": 8,
    "audience_language": 7,
    "overall_score": 7.5,
    "strengths": [
      "Strong hook with relatable POV opening",
      "Natural product integration"
    ],
    "improvements": [
      "Add more specific pain point reference",
      "Include social proof element"
    ]
  }
}
```

**Credits Used:** 0 (free!)

---

### Script Library

#### List Saved Skits

```http
GET /api/saved-skits?limit=20&offset=0&status=draft
```

**Query Parameters:**
- `limit` (optional): Number of results (default: 20, max: 100)
- `offset` (optional): Pagination offset
- `status` (optional): Filter by status (draft, ready, archived)
- `product_id` (optional): Filter by product

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "title": "Sleep Gummies - Night Owl Hook",
      "skit_data": { /* skit object */ },
      "status": "draft",
      "user_rating": 4,
      "ai_score": { /* score object */ },
      "product_id": "uuid",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 45
}
```

#### Save a Skit

```http
POST /api/saved-skits
```

**Request Body:**
```json
{
  "title": "My Awesome Skit",
  "skit_data": { /* skit object */ },
  "status": "draft",
  "product_id": "optional-uuid",
  "user_rating": 4,
  "notes": "Great hook, needs better CTA"
}
```

---

### Audience Personas

#### List Personas

```http
GET /api/audience/personas?limit=50
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "name": "Stressed Mom",
      "description": "Overwhelmed parent seeking solutions",
      "age_range": "28-42",
      "tone": "casual",
      "phrases_they_use": ["I'm so tired", "There's never enough time"],
      "pain_points": [
        { "point": "No time for self-care", "intensity": "high" }
      ],
      "times_used": 15,
      "created_at": "2024-01-10T08:00:00Z"
    }
  ]
}
```

#### Create Persona

```http
POST /api/audience/personas
```

**Request Body:**
```json
{
  "name": "Skeptical Buyer",
  "description": "Has been burned before, needs proof",
  "age_range": "25-45",
  "tone": "skeptical",
  "humor_style": "dry",
  "phrases_they_use": ["I've tried everything", "Does this actually work?"],
  "common_objections": ["It's too expensive", "Sounds too good to be true"]
}
```

---

### Pain Points

#### List Pain Points

```http
GET /api/audience/pain-points?category=sleep
```

**Query Parameters:**
- `category` (optional): Filter by category

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "pain_point": "Can't fall asleep at night",
      "category": "sleep",
      "intensity": "high",
      "emotional_state": "frustrated",
      "how_they_describe_it": [
        "I'm exhausted but wired",
        "My brain won't shut off"
      ],
      "times_used": 8
    }
  ]
}
```

#### Extract Pain Points from Text

```http
POST /api/audience/extract-from-reviews
```

**Request Body:**
```json
{
  "text": "I've tried every sleep supplement and nothing works. I'm so tired of waking up at 3am...",
  "source_url": "https://amazon.com/product/reviews",
  "source_type": "amazon"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "extraction": {
      "pain_points": [
        {
          "pain_point": "Waking up in the middle of the night",
          "how_they_describe_it": ["waking up at 3am"],
          "emotional_state": "frustrated",
          "intensity": "high",
          "frequency": 3
        }
      ],
      "language_patterns": {
        "complaints": ["nothing works", "so tired"],
        "desires": ["want to sleep through the night"],
        "phrases": ["tried everything"]
      },
      "objections": ["supplements don't work for me"],
      "review_count_detected": 5
    }
  },
  "creditsRemaining": 44
}
```

**Credits Used:** 1

---

### Products

#### List Products

```http
GET /api/products?limit=50
```

#### Get Product

```http
GET /api/products/:id
```

#### Create Product

```http
POST /api/products
```

**Request Body:**
```json
{
  "name": "Sleep Gummies",
  "brand": "DreamWell",
  "description": "Natural sleep support gummies",
  "benefits": ["Better sleep", "No grogginess", "Great taste"],
  "category": "supplements"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "ok": false,
  "error_code": "ERROR_CODE",
  "message": "Human-readable error message",
  "correlation_id": "vid_1234567890_abc123"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not allowed |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `RATE_LIMITED` | 429 | Too many requests |
| `NO_CREDITS` | 402 | Credits exhausted |
| `AI_ERROR` | 500 | AI generation failed |
| `INTERNAL` | 500 | Server error |

### Handling Errors

```javascript
const response = await fetch('/api/ai/generate-skit', {
  method: 'POST',
  body: JSON.stringify(payload),
});

const data = await response.json();

if (!data.ok) {
  console.error(`Error: ${data.message} (${data.error_code})`);
  console.error(`Correlation ID: ${data.correlation_id}`);
  // Handle specific error codes
  if (data.error_code === 'NO_CREDITS') {
    // Redirect to upgrade page
  }
}
```

---

## Webhooks (Coming Soon)

Webhooks will notify your application when:
- Skit generation completes
- Credits are low
- Subscription changes

---

## SDKs (Coming Soon)

Official SDKs will be available for:
- JavaScript/TypeScript
- Python
- PHP

---

## Support

For API support:
- Email: api-support@flashflow.ai
- Documentation: /docs/API.md
- Status page: status.flashflow.ai

Include your `correlation_id` when reporting issues.
