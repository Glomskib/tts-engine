import { z } from 'zod';

export const ContentCreationTenureEnum = z.enum([
  '0_3m', '3_12m', '1_2y', '2_3y', '3y_plus',
]);

export const TtsAffiliateTenureEnum = z.enum([
  'not_started', '0_1m', '1_6m', '6_12m', '1_2y', '2_3y', '3y_plus',
]);

export const CurrentVideosPerDayEnum = z.enum([
  'not_posting', '1', '2_3', '4_10', '11_20', '21_30', '31_50', '50_plus',
]);

export const TargetVideosPerDayEnum = z.enum([
  '1', '2_3', '4_10', '11_20', '21_30', '31_50', '50_plus',
]);

export const RoleTypeEnum = z.enum([
  'affiliate_creator', 'seller_brand', 'both', 'unsure',
]);

export const TiktokShopStatusEnum = z.enum([
  'approved', 'pending', 'no',
]);

export const TeamModeEnum = z.enum([
  'solo', 'solo_plus_editor', 'team_2_5', 'team_6_plus',
]);

export const PrimaryGoal30dEnum = z.enum([
  'increase_output', 'find_winners', 'improve_conversion',
  'build_system', 'automate_posting', 'track_and_scale',
]);

export const MonthlyGmvBucketEnum = z.enum([
  '0', 'lt_1k', '1_5k', '5_20k', '20_100k', '100k_plus',
]);

/** Full profile schema — all fields optional for partial saves */
export const CreatorProfileSchema = z.object({
  content_creation_tenure: ContentCreationTenureEnum.optional().nullable(),
  tts_affiliate_tenure: TtsAffiliateTenureEnum.optional().nullable(),
  current_videos_per_day: CurrentVideosPerDayEnum.optional().nullable(),
  target_videos_per_day: TargetVideosPerDayEnum.optional().nullable(),
  role_type: RoleTypeEnum.optional().nullable(),
  tiktok_shop_status: TiktokShopStatusEnum.optional().nullable(),
  team_mode: TeamModeEnum.optional().nullable(),
  primary_goal_30d: PrimaryGoal30dEnum.optional().nullable(),
  monthly_gmv_bucket: MonthlyGmvBucketEnum.optional().nullable(),
});

export type CreatorProfile = z.infer<typeof CreatorProfileSchema> & {
  id?: string;
  user_id?: string;
  completed_onboarding_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

// ── Human-readable labels ──────────────────────────────────────────────────────

export const CONTENT_TENURE_LABELS: Record<string, string> = {
  '0_3m':    'Under 3 months',
  '3_12m':   '3–12 months',
  '1_2y':    '1–2 years',
  '2_3y':    '2–3 years',
  '3y_plus': '3+ years',
};

export const TTS_TENURE_LABELS: Record<string, string> = {
  'not_started': 'Haven\'t started yet',
  '0_1m':        'Under 1 month',
  '1_6m':        '1–6 months',
  '6_12m':       '6–12 months',
  '1_2y':        '1–2 years',
  '2_3y':        '2–3 years',
  '3y_plus':     '3+ years',
};

export const VPD_LABELS: Record<string, string> = {
  'not_posting': 'Not posting yet',
  '1':           '1 video/day',
  '2_3':         '2–3 videos/day',
  '4_10':        '4–10 videos/day',
  '11_20':       '11–20 videos/day',
  '21_30':       '21–30 videos/day',
  '31_50':       '31–50 videos/day',
  '50_plus':     '50+ videos/day',
};

export const TARGET_VPD_LABELS: Record<string, string> = {
  '1':      '1 video/day',
  '2_3':    '2–3 videos/day',
  '4_10':   '4–10 videos/day',
  '11_20':  '11–20 videos/day',
  '21_30':  '21–30 videos/day',
  '31_50':  '31–50 videos/day',
  '50_plus':'50+ videos/day',
};

export const ROLE_LABELS: Record<string, string> = {
  'affiliate_creator': 'Affiliate Creator (promote others\' products)',
  'seller_brand':      'Seller / Brand (promote my own products)',
  'both':              'Both — I sell my own and promote others',
  'unsure':            'Not sure yet',
};

export const TIKTOK_SHOP_STATUS_LABELS: Record<string, string> = {
  'approved': 'Yes, approved',
  'pending':  'Applied, waiting for approval',
  'no':       'No, not yet',
};

export const TEAM_MODE_LABELS: Record<string, string> = {
  'solo':            'Solo (just me)',
  'solo_plus_editor':'Solo + 1 editor',
  'team_2_5':        'Small team (2–5 people)',
  'team_6_plus':     'Larger team (6+ people)',
};

export const GOAL_LABELS: Record<string, string> = {
  'increase_output':   'Post more videos, consistently',
  'find_winners':      'Find hooks and angles that convert',
  'improve_conversion':'Improve my click-through and sales rate',
  'build_system':      'Build a repeatable content system',
  'automate_posting':  'Automate scheduling and posting',
  'track_and_scale':   'Track performance and scale what works',
};

export const GMV_LABELS: Record<string, string> = {
  '0':       '$0 (just getting started)',
  'lt_1k':   'Under $1,000/month',
  '1_5k':    '$1,000–$5,000/month',
  '5_20k':   '$5,000–$20,000/month',
  '20_100k': '$20,000–$100,000/month',
  '100k_plus':'$100,000+/month',
};
