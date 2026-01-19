# TTS Engine - Next Phase Implementation Roadmap

## Current Status ✅
- Products API: Fully functional (GET/POST with proper validation)
- Concepts API: Fully functional (GET/POST with proper validation)
- Database schema: Validated and aligned with API expectations
- Test pipeline: Products → Concepts flow working end-to-end

## Phase 2: Hook Generation Pipeline 🎯

### 2.1 Hook Generation API
- **Endpoint**: `POST /api/hooks/generate`
- **Input**: `concept_id`, `hook_count` (default 5)
- **AI Integration**: Use Anthropic API to generate viral hooks based on concept
- **Database**: Insert generated hooks into `hooks` table
- **Output**: Array of generated hook objects

### 2.2 Hook Management API
- **Endpoints**: 
  - `GET /api/hooks` (list all hooks)
  - `GET /api/hooks?concept_id=...` (filter by concept)
  - `PUT /api/hooks/{id}` (update hook status/content)
  - `DELETE /api/hooks/{id}` (soft delete)

## Phase 3: Script Generation Pipeline 📝

### 3.1 Script v1 Generation
- **Endpoint**: `POST /api/scripts/generate`
- **Input**: `hook_id`, `script_style` (enum: casual, professional, storytelling)
- **AI Integration**: Use OpenAI/Anthropic to expand hooks into full scripts
- **Database**: Insert into `scripts` table with version tracking
- **Output**: Generated script object with metadata

### 3.2 Script Management
- **Endpoints**:
  - `GET /api/scripts` (list scripts)
  - `GET /api/scripts?hook_id=...` (filter by hook)
  - `PUT /api/scripts/{id}` (update script content)
  - `POST /api/scripts/{id}/versions` (create new version)

## Phase 4: Variant Logic & A/B Testing 🧪

### 4.1 Variant Creation
- **Endpoint**: `POST /api/variants/create`
- **Logic**: Create hook-only A/B test variants
- **Input**: `concept_id`, `variant_count`, `test_parameters`
- **Database**: Insert into `variants` table with test configuration
- **Output**: Variant test setup with tracking IDs

### 4.2 Variant Performance Tracking
- **Endpoints**:
  - `GET /api/variants/{id}/performance`
  - `POST /api/variants/{id}/metrics` (record performance data)
  - `PUT /api/variants/{id}/status` (activate/pause/complete tests)

## Phase 5: Compliance & Risk Management ⚖️

### 5.1 Compliance Runs
- **Endpoint**: `POST /api/compliance/scan`
- **Input**: `content_id`, `content_type` (hook/script/video)
- **Integration**: Content moderation APIs (OpenAI Moderation, custom rules)
- **Database**: Log results in `compliance_runs` table
- **Output**: Compliance score and flagged issues

### 5.2 Risk Assessment
- **Auto-trigger**: Run compliance on all generated content
- **Manual trigger**: `POST /api/compliance/manual-review`
- **Escalation**: Flag high-risk content for human review
- **Reporting**: Compliance dashboard and audit trails

## Phase 6: Analytics & TikTok Integration 📊

### 6.1 Events Logging
- **Current**: `events_log` table exists
- **Implementation**: Log all user actions, API calls, generation events
- **Endpoints**: 
  - `POST /api/events/log` (internal logging)
  - `GET /api/analytics/dashboard` (aggregated metrics)

### 6.2 TikTok API Integration (Future)
- **Video Upload**: `POST /api/tiktok/upload`
- **Performance Tracking**: Sync TikTok metrics back to system
- **Account Management**: Multi-account TikTok posting
- **Content Scheduling**: Automated posting pipeline

## Phase 7: Video Generation Pipeline 🎬

### 7.1 Video Assembly
- **Endpoint**: `POST /api/videos/generate`
- **Input**: `script_id`, `video_style`, `assets`
- **Integration**: Video generation APIs (RunwayML, Pika, etc.)
- **Database**: Track in `videos` table with render status
- **Output**: Generated video with metadata

### 7.2 Video Management
- **Endpoints**:
  - `GET /api/videos` (list videos)
  - `GET /api/videos/{id}/status` (render progress)
  - `POST /api/videos/{id}/regenerate` (retry failed renders)

## Implementation Priority Order 🚀

1. **Hook Generation** (Phase 2) - Core AI functionality
2. **Script Generation** (Phase 3) - Content expansion
3. **Compliance Runs** (Phase 5.1) - Risk management
4. **Variant Logic** (Phase 4) - A/B testing foundation
5. **Analytics Logging** (Phase 6.1) - Data collection
6. **Video Generation** (Phase 7) - Final output
7. **TikTok Integration** (Phase 6.2) - Distribution

## Technical Notes 📋

### AI Integration Requirements
- Anthropic API key (already in env)
- OpenAI API key (already in env)
- Content moderation service setup
- Rate limiting and error handling

### Database Considerations
- All tables already exist in Supabase
- Need to validate schema for hooks, scripts, variants tables
- Implement proper foreign key relationships
- Add indexes for performance queries

### API Design Patterns
- Consistent error handling (ok: boolean, error: string)
- Proper HTTP status codes (400, 500)
- Request validation and sanitization
- Async processing for long-running tasks (video generation)

### Security & Performance
- Rate limiting on AI API calls
- Content validation and sanitization
- Proper authentication for sensitive operations
- Caching for frequently accessed data
