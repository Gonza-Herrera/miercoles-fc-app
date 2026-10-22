-- Private ballots, public closed results. Existing admin choices remain historical.
create schema if not exists app_private;
revoke all on schema app_private from public,anon;
grant usage on schema app_private to authenticated;
create table public.fixture_polls (
 event_id uuid not null references public.event_records(id),
 fixture_id uuid not null,
 eligible_player_ids uuid[] not null,
 created_at timestamptz not null default now(),
 closed_at timestamptz,
 closed_by uuid references auth.users(id),
 winner_player_ids uuid[] not null default '{}',
 vote_count integer,
 primary key(event_id,fixture_id),
 check ((closed_at is null and closed_by is null and vote_count is null and cardinality(winner_player_ids)=0)
   or (closed_at is not null and closed_by is not null and vote_count>=0))
);
create index fixture_polls_closed_by_idx on public.fixture_polls(closed_by);
create table public.fixture_votes (
 event_id uuid not null,
 fixture_id uuid not null,
 voter_id uuid not null references auth.users(id),
 candidate_id uuid not null references auth.users(id),
 version bigint not null default 0,
 last_operation uuid not null,
 updated_at timestamptz not null default now(),
 primary key(event_id,fixture_id,voter_id),
 foreign key(event_id,fixture_id) references public.fixture_polls(event_id,fixture_id) on delete cascade,
 check(voter_id<>candidate_id)
);
create index fixture_votes_voter_idx on public.fixture_votes(voter_id);
create index fixture_votes_candidate_idx on public.fixture_votes(candidate_id);
alter table public.fixture_polls enable row level security;
alter table public.fixture_votes enable row level security;
revoke all on public.fixture_polls,public.fixture_votes from public,anon,authenticated;
grant select on public.fixture_polls,public.fixture_votes to authenticated;
create policy polls_read on public.fixture_polls for select to authenticated using (true);
create policy votes_read_own on public.fixture_votes for select to authenticated using(voter_id=(select auth.uid()));

-- Runs with owner privileges only to maintain polls; no client can write poll state directly.
create function public.sync_fixture_polls() returns trigger
language plpgsql security definer set search_path='' as $$
declare fixture jsonb; previous jsonb; old_fixtures jsonb; event jsonb; eligible uuid[]; poll public.fixture_polls;
begin
 if auth.uid() is null or (auth.jwt()->>'email') is distinct from 'gon.herrera.dev@gmail.com' then raise exception 'Solo el admin puede modificar resultados.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.event_id::text,0));
 old_fixtures:=case when tg_op='UPDATE' then old.data->'fixtures' else '[]'::jsonb end;
 select data into event from public.event_records where id=new.event_id;
 for fixture in select value from jsonb_array_elements(new.data->'fixtures') loop
   select value into previous from jsonb_array_elements(old_fixtures) where value->>'id'=fixture->>'id';
   if previous is null then
     if fixture->>'mvpPlayerId' is not null then raise exception 'La figura de los nuevos cruces se elige por votación.'; end if;
     select array_agg(distinct p.value::uuid) into eligible
       from jsonb_array_elements(event->'teams'->'teams') t
       cross join lateral jsonb_array_elements_text(t->'playerIds') p
       where t->>'id' in (fixture->>'homeTeamId',fixture->>'awayTeamId') and event->'matchPlayedPlayerIds' ? p.value;
     insert into public.fixture_polls(event_id,fixture_id,eligible_player_ids) values(new.event_id,(fixture->>'id')::uuid,eligible);
   else
     if (fixture->>'mvpPlayerId') is distinct from (previous->>'mvpPlayerId') then raise exception 'La elección histórica del admin no se modifica; los nuevos cruces usan votos.'; end if;
     select * into poll from public.fixture_polls where event_id=new.event_id and fixture_id=(fixture->>'id')::uuid;
     if found and ((fixture->>'homeTeamId') is distinct from (previous->>'homeTeamId') or (fixture->>'awayTeamId') is distinct from (previous->>'awayTeamId')) then
       raise exception 'Los equipos del cruce quedan fijos al abrir su votación.';
     end if;
   end if;
 end loop;
 for previous in select value from jsonb_array_elements(old_fixtures) loop
   if not exists(select 1 from jsonb_array_elements(new.data->'fixtures') f where f->>'id'=previous->>'id') then
     if exists(select 1 from public.fixture_polls p where p.event_id=new.event_id and p.fixture_id=(previous->>'id')::uuid and
       (p.closed_at is not null or exists(select 1 from public.fixture_votes v where v.event_id=p.event_id and v.fixture_id=p.fixture_id))) then
       raise exception 'No se puede quitar un cruce que tiene votos o una votación cerrada.';
     end if;
     delete from public.fixture_polls where event_id=new.event_id and fixture_id=(previous->>'id')::uuid;
   end if;
 end loop;
 return new;
end $$;
revoke all on function public.sync_fixture_polls() from public,anon,authenticated;
create trigger sync_fixture_polls after insert or update on public.event_sports for each row execute function public.sync_fixture_polls();

create function app_private.cast_fixture_vote(p_event_id uuid,p_fixture_id uuid,p_candidate_id uuid,p_version bigint,p_operation uuid)
returns setof public.fixture_votes language plpgsql security definer set search_path='' as $$
declare poll public.fixture_polls; ballot public.fixture_votes; voter uuid:=auth.uid();
begin
 if voter is null then raise exception 'Iniciá sesión para votar.' using errcode='42501'; end if;
 if p_operation is null then raise exception 'Falta la identidad del voto.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into poll from public.fixture_polls where event_id=p_event_id and fixture_id=p_fixture_id for update;
 if not found then raise exception 'No existe una votación para este cruce.'; end if;
 if not(voter=any(poll.eligible_player_ids)) then raise exception 'Solo pueden votar quienes jugaron este cruce.' using errcode='42501'; end if;
 if p_candidate_id is null or p_candidate_id=voter or not(p_candidate_id=any(poll.eligible_player_ids)) then raise exception 'Elegí otro jugador que haya participado del cruce.'; end if;
 select * into ballot from public.fixture_votes where event_id=p_event_id and fixture_id=p_fixture_id and voter_id=voter;
 if found and ballot.last_operation=p_operation then
   if ballot.candidate_id<>p_candidate_id then raise exception 'La operación ya fue utilizada con otra elección.'; end if;
   return next ballot; return;
 end if;
 if poll.closed_at is not null then raise exception 'La votación ya está cerrada.'; end if;
 if coalesce(ballot.version,-1) is distinct from p_version then raise exception 'Tu voto cambió en otra sesión. Actualizá antes de votar.' using errcode='40001'; end if;
 insert into public.fixture_votes(event_id,fixture_id,voter_id,candidate_id,last_operation)
   values(p_event_id,p_fixture_id,voter,p_candidate_id,p_operation)
   on conflict(event_id,fixture_id,voter_id) do update set candidate_id=excluded.candidate_id,last_operation=excluded.last_operation,
     version=public.fixture_votes.version+1,updated_at=now() returning * into ballot;
 return next ballot;
end $$;
revoke all on function app_private.cast_fixture_vote(uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function app_private.cast_fixture_vote(uuid,uuid,uuid,bigint,uuid) to authenticated;

create function app_private.close_fixture_poll(p_event_id uuid,p_fixture_id uuid)
returns setof public.fixture_polls language plpgsql security definer set search_path='' as $$
declare poll public.fixture_polls; winners uuid[]; votes integer;
begin
 if auth.uid() is null or (auth.jwt()->>'email') is distinct from 'gon.herrera.dev@gmail.com' then raise exception 'Solo el admin puede cerrar la votación.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into poll from public.fixture_polls where event_id=p_event_id and fixture_id=p_fixture_id for update;
 if not found then raise exception 'No existe una votación para este cruce.'; end if;
 if poll.closed_at is not null then return next poll; return; end if;
 select count(*) into votes from public.fixture_votes where event_id=p_event_id and fixture_id=p_fixture_id;
 with counts as (select candidate_id,count(*) as n from public.fixture_votes where event_id=p_event_id and fixture_id=p_fixture_id group by candidate_id)
   select coalesce(array_agg(candidate_id order by candidate_id),'{}'::uuid[]) into winners from counts where n=(select max(n) from counts);
 update public.fixture_polls set closed_at=now(),closed_by=auth.uid(),winner_player_ids=winners,vote_count=votes
   where event_id=p_event_id and fixture_id=p_fixture_id returning * into poll;
 return next poll;
end $$;
revoke all on function app_private.close_fixture_poll(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.close_fixture_poll(uuid,uuid) to authenticated;

-- Public RPC wrappers use caller privileges; privileged implementations live outside the API schemas.
create function public.cast_fixture_vote(p_event_id uuid,p_fixture_id uuid,p_candidate_id uuid,p_version bigint,p_operation uuid)
returns setof public.fixture_votes language sql security invoker set search_path='' as $$
 select * from app_private.cast_fixture_vote(p_event_id,p_fixture_id,p_candidate_id,p_version,p_operation);
$$;
revoke all on function public.cast_fixture_vote(uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.cast_fixture_vote(uuid,uuid,uuid,bigint,uuid) to authenticated;
create function public.close_fixture_poll(p_event_id uuid,p_fixture_id uuid)
returns setof public.fixture_polls language sql security invoker set search_path='' as $$
 select * from app_private.close_fixture_poll(p_event_id,p_fixture_id);
$$;
revoke all on function public.close_fixture_poll(uuid,uuid) from public,anon,authenticated;
grant execute on function public.close_fixture_poll(uuid,uuid) to authenticated;
