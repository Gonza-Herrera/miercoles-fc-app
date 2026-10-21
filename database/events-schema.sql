create table public.event_records (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id),
 data jsonb not null,
 constraint valid_event check (
 jsonb_typeof(data) = 'object' and
 length(trim(data->>'title')) > 0 and length(trim(data->>'location')) > 0 and
 (data->>'date') ~ '^\d{4}-\d{2}-\d{2}$' and
 (data->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and
 (data->>'pitchPrice')::numeric > 0 and data->>'status' in ('open','playing','dinner','completed')
 and data ?& array['title','location','date','time','pitchPrice','status'])
);
alter table public.event_records enable row level security;
revoke all on public.event_records from anon, authenticated;
grant select, insert, update on public.event_records to authenticated;
create policy events_read on public.event_records for select to authenticated using (true);
create policy events_create_admin on public.event_records for insert to authenticated
 with check (auth.uid() = created_by and (select auth.jwt()->>'email') = 'gon.herrera.dev@gmail.com');
create policy events_update_admin on public.event_records for update to authenticated
 using ((select auth.jwt()->>'email') = 'gon.herrera.dev@gmail.com')
 with check ((select auth.jwt()->>'email') = 'gon.herrera.dev@gmail.com');

create table public.event_rsvps (
 event_id uuid not null references public.event_records(id) on delete cascade,
 player_id uuid not null default auth.uid() references auth.users(id),
 plays_soccer boolean not null,
 attends_dinner boolean not null,
 player jsonb not null,
 confirmed_at timestamptz not null default now(),
 primary key(event_id, player_id),
 constraint player_identity check (player->>'id' = player_id::text and player ? 'id' and length(trim(player->>'name')) > 0)
);
alter table public.event_rsvps enable row level security;
revoke all on public.event_rsvps from anon, authenticated;
grant select, insert, update on public.event_rsvps to authenticated;
create policy rsvps_read on public.event_rsvps for select to authenticated using (true);
create policy rsvps_create_own on public.event_rsvps for insert to authenticated
 with check (auth.uid() = player_id and exists (select 1 from public.event_records e where e.id = event_id and e.data->>'status' = 'open'));
create policy rsvps_update_own on public.event_rsvps for update to authenticated
 using (auth.uid() = player_id)
 with check (auth.uid() = player_id and exists (select 1 from public.event_records e where e.id = event_id and e.data->>'status' = 'open'));
