-- Avatar scene library + voice-consistency settings.

-- 1. Voice settings on brand_profiles (ElevenLabs locks)
ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS voice_settings jsonb DEFAULT jsonb_build_object(
    'stability', 0.65,
    'similarity_boost', 0.85,
    'style', 0.0,
    'use_speaker_boost', true
  );

-- 2. Scene library per avatar
CREATE TABLE IF NOT EXISTS public.avatar_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand_profile_id uuid NOT NULL REFERENCES public.brand_profiles(id) ON DELETE CASCADE,
  scene_tag text NOT NULL,                  -- 'kitchen' | 'outdoors' | 'desk' | 'gym' | 'cafe' | 'car' | 'studio' | etc
  description text,
  image_url text NOT NULL,
  storage_path text,
  motion_video_url text,                    -- Phase 2: short loop / Veo-generated motion
  generator text DEFAULT 'gemini-nano-banana',
  generation_params jsonb DEFAULT '{}'::jsonb,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS avatar_scenes_brand_idx
  ON public.avatar_scenes(brand_profile_id, scene_tag);
CREATE INDEX IF NOT EXISTS avatar_scenes_user_idx
  ON public.avatar_scenes(user_id, created_at DESC);

-- 3. Scene tag on scripts (so the orchestrator knows which scene to render)
ALTER TABLE public.avatar_scripts
  ADD COLUMN IF NOT EXISTS scene_tag text,
  ADD COLUMN IF NOT EXISTS scene_id uuid REFERENCES public.avatar_scenes(id) ON DELETE SET NULL;
