-- 015_claim_roles.sql
-- Multi-user workflow: role-aware claims + handoffs

-- Add claim_role column to videos table
alter table public.videos
  add column if not exists claim_role text null;

-- Add check constraint for valid claim roles
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'videos_claim_role_check'
  ) then
    alter table public.videos
      add constraint videos_claim_role_check
      check (claim_role is null or claim_role in ('recorder', 'editor', 'uploader', 'admin'));
  end if;
end $$;

-- Index for role-based queue filtering
create index if not exists idx_videos_claim_role on public.videos(claim_role);

comment on column public.videos.claim_role is 'Role of the user who claimed this video (recorder, editor, uploader, admin)';
