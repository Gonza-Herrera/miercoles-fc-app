-- Additive sports results storage. Closed attendance, expenses and payments stay immutable.
create table public.event_sports (
 event_id uuid primary key references public.event_records(id),
 data jsonb not null,
 version bigint not null default 0,
 last_operation uuid not null,
 updated_at timestamptz not null default now(),
 updated_by uuid not null default auth.uid() references auth.users(id)
);
create index event_sports_updated_by_idx on public.event_sports(updated_by);
alter table public.event_sports enable row level security;
revoke all on public.event_sports from public, anon, authenticated;
grant select, insert, update on public.event_sports to authenticated;
create policy sports_read on public.event_sports for select to authenticated using (true);
create policy sports_create_admin on public.event_sports for insert to authenticated
 with check ((select auth.uid()) is not null and (select auth.jwt())->>'email' = 'gon.herrera.dev@gmail.com' and updated_by=(select auth.uid()));
create policy sports_update_admin on public.event_sports for update to authenticated
 using ((select auth.jwt())->>'email' = 'gon.herrera.dev@gmail.com')
 with check ((select auth.uid()) is not null and (select auth.jwt())->>'email' = 'gon.herrera.dev@gmail.com' and updated_by=(select auth.uid()));

create function public.validate_event_sports() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare event jsonb; fixture jsonb; item jsonb; team jsonb; home jsonb; away jsonb;
 eligible text[]; home_ids text[]; away_ids text[]; score integer; goals integer; assists integer; side integer;
begin
 if auth.uid() is null or (auth.jwt()->>'email') is distinct from 'gon.herrera.dev@gmail.com' then raise exception 'Solo el administrador puede cargar resultados.' using errcode='42501'; end if;
 if tg_op='UPDATE' and new.event_id<>old.event_id then raise exception 'El evento no se modifica.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.event_id::text,0));
 select data into event from public.event_records where id=new.event_id;
 if event->>'status' not in ('dinner','completed') or event is null then raise exception 'Confirmá los presentes del partido antes de cargar resultados.'; end if;
 if jsonb_typeof(new.data) is distinct from 'object' or jsonb_typeof(new.data->'fixtures') is distinct from 'array' then raise exception 'Formato de resultados inválido.'; end if;
 if jsonb_array_length(new.data->'fixtures')>50 then raise exception 'Se permiten hasta 50 cruces por fecha.'; end if;
 if exists(select 1 from jsonb_array_elements(new.data->'fixtures') f group by f->>'id' having count(*)>1) then raise exception 'Hay cruces repetidos.'; end if;
 for fixture in select value from jsonb_array_elements(new.data->'fixtures') loop
   if jsonb_typeof(fixture) is distinct from 'object' or coalesce(fixture->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Identidad de cruce inválida.'; end if;
   home:=null; away:=null;
   for team in select value from jsonb_array_elements(coalesce(event->'teams'->'teams','[]')) loop
     if team->>'id'=fixture->>'homeTeamId' then home:=team; end if;
     if team->>'id'=fixture->>'awayTeamId' then away:=team; end if;
   end loop;
   if home is null or away is null or home->>'id'=away->>'id' then raise exception 'Seleccioná dos equipos distintos de la fecha.'; end if;
   select coalesce(array_agg(distinct value),'{}') into home_ids from jsonb_array_elements_text(home->'playerIds')
     where event->'matchPlayedPlayerIds' ? value;
   select coalesce(array_agg(distinct value),'{}') into away_ids from jsonb_array_elements_text(away->'playerIds')
     where event->'matchPlayedPlayerIds' ? value;
   if cardinality(home_ids)=0 or cardinality(away_ids)=0 or home_ids && away_ids then raise exception 'Cada equipo debe tener presentes y ningún jugador puede integrar ambos.'; end if;
   eligible:=home_ids||away_ids;
   if jsonb_typeof(fixture->'players') is distinct from 'array' then raise exception 'Detalle de jugadores inválido.'; end if;
   if exists(select 1 from jsonb_array_elements(fixture->'players') p group by p->>'playerId' having count(*)>1) then raise exception 'Hay jugadores repetidos en el cruce.'; end if;
   if fixture->>'mvpPlayerId' is not null and not (fixture->>'mvpPlayerId'=any(eligible)) then raise exception 'El jugador del partido debe haber participado del cruce.'; end if;
   for item in select value from jsonb_array_elements(fixture->'players') loop
     if item->>'playerId' is null or not (item->>'playerId'=any(eligible)) then raise exception 'Solo pueden cargarse estadísticas de los presentes de esos equipos.'; end if;
     if jsonb_typeof(item->'goals') is distinct from 'number' or jsonb_typeof(item->'assists') is distinct from 'number' then raise exception 'Los goles y asistencias deben ser números enteros.'; end if;
     if (item->>'goals')::numeric not between 0 and 999 or (item->>'goals')::numeric<>trunc((item->>'goals')::numeric)
       or (item->>'assists')::numeric not between 0 and 999 or (item->>'assists')::numeric<>trunc((item->>'assists')::numeric) then raise exception 'Los goles y asistencias deben ser enteros entre 0 y 999.'; end if;
   end loop;
   for side in 0..1 loop
     if jsonb_typeof(fixture->case when side=0 then 'homeScore' else 'awayScore' end) is distinct from 'number' then raise exception 'Completá ambos marcadores.'; end if;
     if (fixture->>case when side=0 then 'homeScore' else 'awayScore' end)::numeric not between 0 and 999
       or (fixture->>case when side=0 then 'homeScore' else 'awayScore' end)::numeric<>trunc((fixture->>case when side=0 then 'homeScore' else 'awayScore' end)::numeric) then raise exception 'El marcador debe ser un entero entre 0 y 999.'; end if;
     score:=(fixture->>case when side=0 then 'homeScore' else 'awayScore' end)::integer;
     select coalesce(sum((p->>'goals')::integer),0),coalesce(sum((p->>'assists')::integer),0) into goals,assists
       from jsonb_array_elements(fixture->'players') p where p->>'playerId'=any(case when side=0 then home_ids else away_ids end);
     if goals>score or assists>score then raise exception 'Los goles y asistencias de un equipo no pueden superar su marcador.'; end if;
     if exists(select 1 from jsonb_array_elements(fixture->'players') p where p->>'playerId'=any(case when side=0 then home_ids else away_ids end)
       and (p->>'goals')::integer+(p->>'assists')::integer>score) then raise exception 'Un jugador no puede asistir sus propios goles.'; end if;
   end loop;
 end loop;
 new.version:=case when tg_op='INSERT' then 0 else old.version+1 end;
 new.updated_at:=now(); new.updated_by:=auth.uid();
 return new;
end $$;
revoke all on function public.validate_event_sports() from public, anon;
create trigger validate_event_sports before insert or update on public.event_sports
 for each row execute function public.validate_event_sports();

create function public.save_event_sports(p_event_id uuid,p_version bigint,p_data jsonb,p_operation uuid)
returns setof public.event_sports language plpgsql security invoker set search_path='' as $$
declare saved public.event_sports;
begin
 if auth.uid() is null or (auth.jwt()->>'email') is distinct from 'gon.herrera.dev@gmail.com' then raise exception 'Solo el administrador puede guardar resultados.' using errcode='42501'; end if;
 if p_operation is null then raise exception 'Falta la identidad de la operación.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into saved from public.event_sports where event_id=p_event_id for update;
 if found then
   if saved.last_operation=p_operation then
     if saved.data is distinct from p_data then raise exception 'La operación ya fue utilizada con otros datos.'; end if;
     return next saved; return;
   end if;
   if saved.version is distinct from p_version then raise exception 'Los resultados cambiaron en otra sesión. Actualizá antes de guardar.' using errcode='40001'; end if;
   update public.event_sports set data=p_data,last_operation=p_operation where event_id=p_event_id returning * into saved;
 else
   if p_version is distinct from -1::bigint then raise exception 'Actualizá los resultados antes de guardar.' using errcode='40001'; end if;
   insert into public.event_sports(event_id,data,last_operation) values(p_event_id,p_data,p_operation) returning * into saved;
 end if;
 return next saved;
end $$;
revoke all on function public.save_event_sports(uuid,bigint,jsonb,uuid) from public, anon;
grant execute on function public.save_event_sports(uuid,bigint,jsonb,uuid) to authenticated;
