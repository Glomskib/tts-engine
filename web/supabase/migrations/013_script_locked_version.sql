-- 013: Add script_locked_version to videos table
-- Stores the script version at the time it was locked to the video

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='videos'
  ) then
    alter table public.videos
      add column if not exists script_locked_version int null;
  end if;
end $$;

comment on column public.videos.script_locked_version is 'Version of the script at the time it was locked to this video';
