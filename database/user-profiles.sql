-- App-owned display identity; Google metadata remains a login fallback.
create table if not exists public.user_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(btrim(display_name)) between 2 and 60 and display_name !~ '[[:cntrl:]]'),
 avatar_path text,
 use_google_avatar boolean not null default true,
 constraint profile_avatar_own_path check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$'))
);
alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from public,anon,authenticated;
grant select,insert,update on public.user_profiles to authenticated;
create policy profiles_read_members on public.user_profiles for select to authenticated using(true);
create policy profiles_insert_own on public.user_profiles for insert to authenticated with check(id=(select auth.uid()));
create policy profiles_update_own on public.user_profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',true,524288,array['image/jpeg']) on conflict(id) do nothing;
-- Immutable object paths avoid stale image caches and another user's overwrites.
create policy profile_photos_insert_own on storage.objects for insert to authenticated
with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and lower(storage.extension(name))='jpg');
create policy profile_photos_delete_own on storage.objects for delete to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy profile_photos_select_own on storage.objects for select to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
