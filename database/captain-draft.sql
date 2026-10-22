-- DT/capitán pertenece a una fecha. Las elecciones se serializan con los RSVP y save_event.
create table if not exists app_private.captain_operations (
 event_id uuid not null references public.event_records(id) on delete cascade,
 operation_id uuid not null, actor_id uuid not null references auth.users(id),
 action text not null, payload jsonb not null, expected_version bigint not null,
 primary key(event_id,operation_id)
);
alter table app_private.captain_operations enable row level security;
revoke all on app_private.captain_operations from public,anon,authenticated;
drop policy if exists captain_operations_private on app_private.captain_operations;
create policy captain_operations_private on app_private.captain_operations as restrictive for all to authenticated using(false) with check(false);
create index if not exists captain_operations_actor_idx on app_private.captain_operations(actor_id);

create or replace function app_private.captain_teams_ready(p_event uuid,p_data jsonb)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(
 jsonb_array_length(p_data#>'{teams,teams}')=2
 and (select count(*)>=8 from public.event_rsvps where event_id=p_event and plays_soccer)
 and not exists(select 1 from jsonb_array_elements(p_data#>'{teams,teams}') t
   where jsonb_array_length(t->'playerIds')<4 or not (t->'playerIds' @> jsonb_build_array(t->>'captainPlayerId')))
 and abs(jsonb_array_length(p_data#>'{teams,teams,0,playerIds}')-jsonb_array_length(p_data#>'{teams,teams,1,playerIds}'))<=1
 and not exists(select 1 from jsonb_array_elements(p_data#>'{teams,teams}') t,
   jsonb_array_elements_text(t->'playerIds') x where not exists(select 1 from public.event_rsvps r where r.event_id=p_event and r.plays_soccer and r.player_id::text=x.value))
 and not exists(select 1 from public.event_rsvps r where r.event_id=p_event and r.plays_soccer and
   (select count(*) from jsonb_array_elements(p_data#>'{teams,teams}') t,jsonb_array_elements_text(t->'playerIds') x where x.value=r.player_id::text)<>1),false);
$$;
revoke all on function app_private.captain_teams_ready(uuid,jsonb) from public,anon;
grant execute on function app_private.captain_teams_ready(uuid,jsonb) to authenticated;

create or replace function app_private.captain_action(p_event uuid,p_version bigint,p_operation uuid,p_action text,p_payload jsonb)
returns setof public.event_records language plpgsql security definer set search_path='' as $$
declare
 e public.event_records; op app_private.captain_operations;
 actor uuid:=auth.uid(); admin boolean:=coalesce(auth.jwt()->>'email'='gon.herrera.dev@gmail.com',false);
 d jsonb; teams jsonb; draft jsonb; a text; b text; target text; outgoing text; idx int; other_idx int;
 n int; first_size int; second_size int; next_id text; candidates text[]; previous_ids text[];
 chosen text; roles jsonb; changed jsonb; new_team jsonb;
begin
 if not app_private.is_group_member() then raise exception 'Esta cuenta no tiene acceso.' using errcode='42501'; end if;
 if actor is null then raise exception 'Iniciá sesión.' using errcode='42501'; end if;
 if p_operation is null or p_version is null or p_payload is null then raise exception 'Solicitud incompleta.'; end if;
 select * into e from public.event_records where id=p_event for update;
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,0));
 if not found then raise exception 'Evento no encontrado.'; end if;
 select * into op from app_private.captain_operations where event_id=p_event and operation_id=p_operation;
 if found then
   if op.actor_id<>actor or op.action<>p_action or op.payload<>p_payload or op.expected_version<>p_version then raise exception 'Operación inválida.' using errcode='42501'; end if;
   return next e; return;
 end if;
 if e.version<>p_version then raise exception 'El evento cambió. Actualizá antes de continuar.' using errcode='40001'; end if;
 if e.data->>'status'<>'open' then raise exception 'Los equipos ya están cerrados.'; end if;
 d:=e.data; draft:=d->'captainDraft'; teams:=d#>'{teams,teams}';
 select count(*) into n from public.event_rsvps where event_id=p_event and plays_soccer;
 if p_action in ('manual','random') then
   if not admin then raise exception 'Solo el administrador asigna capitanes.' using errcode='42501'; end if;
   if draft is not null then raise exception 'Ya hay capitanes asignados. Volvé al modo clásico para reiniciar.'; end if;
   if n<8 then raise exception 'Se necesitan al menos 8 jugadores confirmados.'; end if;
   if p_action='manual' then a:=p_payload->>'captainAId'; b:=p_payload->>'captainBId';
   else
     select array_agg(x.value) into previous_ids from (
       select r.data from public.event_records r where r.id<>p_event and r.data->>'status' in ('dinner','completed') and r.data->>'date'<=d->>'date'
       order by r.data->>'date' desc,r.created_at desc limit 1
     ) prev, lateral jsonb_array_elements_text(jsonb_build_array(prev.data#>>'{captainDraft,captainAId}',prev.data#>>'{captainDraft,captainBId}')) x;
     select array_agg(r.player_id::text) into candidates from public.event_rsvps r where r.event_id=p_event and r.plays_soccer
       and not (r.player_id::text=any(coalesce(previous_ids,array[]::text[])));
     if coalesce(cardinality(candidates),0)<2 then select array_agg(player_id::text) into candidates from public.event_rsvps where event_id=p_event and plays_soccer; end if;
     select array_agg(id) into candidates from (
       select c.id from unnest(candidates) c(id) order by (
         select count(*) from public.event_records h where h.id<>p_event and h.data->>'status' in ('dinner','completed') and h.data->>'date'<=d->>'date'
         and c.id in (h.data#>>'{captainDraft,captainAId}',h.data#>>'{captainDraft,captainBId}')
       ),random() limit 2
     ) ranked;
     a:=candidates[1]; b:=candidates[2];
   end if;
   if a is null or b is null or a=b or (select count(*) from public.event_rsvps where event_id=p_event and plays_soccer and player_id::text in (a,b))<>2 then raise exception 'Elegí dos jugadores confirmados diferentes.'; end if;
   teams:='[]';
   foreach chosen in array array[a,b] loop
     select jsonb_build_object('id',case when chosen=a then 'team_1' else 'team_2' end,
       'name','Equipo de '||coalesce(nullif(player->>'name',''),'Capitán'),'captainPlayerId',chosen,'playerIds',jsonb_build_array(chosen)) into new_team
       from public.event_rsvps where event_id=p_event and player_id::text=chosen;
     teams:=teams||jsonb_build_array(new_team);
   end loop;
   draft:=jsonb_build_object('captainAId',a,'captainBId',b,'method',p_action,'assignedAt',now(),'confirmedAt',null,'nextTeamId',case when random()<0.5 then 'team_1' else 'team_2' end);
 elsif p_action='classic' then
   if not admin then raise exception 'Solo el administrador puede reiniciar los equipos.' using errcode='42501'; end if;
   d:=d-'captainDraft'; teams:='[]'; draft:=null;
 else
   if draft is null then raise exception 'Primero asigná los capitanes.'; end if;
   a:=draft->>'captainAId'; b:=draft->>'captainBId';
   first_size:=jsonb_array_length(teams#>'{0,playerIds}'); second_size:=jsonb_array_length(teams#>'{1,playerIds}');
   next_id:=case when first_size<second_size then 'team_1' when second_size<first_size then 'team_2' else draft->>'nextTeamId' end;
   target:=p_payload->>'playerId';
   if p_action='pick' then
     if n<8 then raise exception 'La elección se pausa hasta tener 8 confirmados.'; end if;
     idx:=case when next_id='team_1' then 0 else 1 end;
     if actor::text is distinct from (teams->idx->>'captainPlayerId') then raise exception 'Es el turno del otro capitán.' using errcode='42501'; end if;
     if exists(select 1 from jsonb_array_elements(teams) t,jsonb_array_elements_text(t->'playerIds') x where not exists(select 1 from public.event_rsvps r where r.event_id=p_event and r.plays_soccer and r.player_id::text=x.value)) then raise exception 'Hay una baja. El administrador debe resolver el reemplazo.'; end if;
     if target is null or not exists(select 1 from public.event_rsvps where event_id=p_event and plays_soccer and player_id::text=target) or exists(select 1 from jsonb_array_elements(teams) t where t->'playerIds' @> jsonb_build_array(target)) then raise exception 'Ese jugador ya no está disponible.'; end if;
     teams:=jsonb_set(teams,array[idx::text,'playerIds'],(teams->idx->'playerIds')||jsonb_build_array(target));
     draft:=draft||jsonb_build_object('nextTeamId',case when idx=0 then 'team_2' else 'team_1' end,'confirmedAt',null);
   elsif p_action in ('replace','remove') then
     if not admin then raise exception 'Solo el administrador puede resolver una baja.' using errcode='42501'; end if;
     outgoing:=p_payload->>'outgoingId';
     if exists(select 1 from public.event_rsvps where event_id=p_event and plays_soccer and player_id::text=outgoing) then raise exception 'El jugador todavía está confirmado.'; end if;
     select ord::int-1 into idx from jsonb_array_elements(teams) with ordinality t(value,ord) where value->'playerIds' @> jsonb_build_array(outgoing);
     if idx is null then raise exception 'La baja no pertenece a un equipo.'; end if;
     if p_action='remove' then
       if teams->idx->>'captainPlayerId'=outgoing then raise exception 'Elegí un nuevo capitán antes de quitar la baja.'; end if;
     elsif target is null or not exists(select 1 from public.event_rsvps where event_id=p_event and plays_soccer and player_id::text=target)
       or exists(select 1 from jsonb_array_elements(teams) with ordinality t(value,ord) where value->'playerIds' @> jsonb_build_array(target) and (ord::int-1<>idx or teams->idx->>'captainPlayerId'<>outgoing)) then
       raise exception 'Elegí un reemplazo disponible o un compañero para relevar al capitán.';
     end if;
     select coalesce(jsonb_agg(value),'[]') into changed from jsonb_array_elements_text(teams->idx->'playerIds') where value<>outgoing;
     if p_action='replace' and not (changed @> jsonb_build_array(target)) then changed:=changed||jsonb_build_array(target); end if;
     teams:=jsonb_set(teams,array[idx::text,'playerIds'],changed);
     if teams->idx->>'captainPlayerId'=outgoing then
       teams:=jsonb_set(teams,array[idx::text,'captainPlayerId'],to_jsonb(target));
       select jsonb_set(teams,array[idx::text,'name'],to_jsonb('Equipo de '||coalesce(player->>'name','Capitán'))) into teams from public.event_rsvps where event_id=p_event and player_id::text=target;
       draft:=jsonb_set(draft,array[case when idx=0 then 'captainAId' else 'captainBId' end],to_jsonb(target));
     end if;
     draft:=draft||jsonb_build_object('confirmedAt',null);
   elsif p_action='move' then
     if not admin then raise exception 'Solo el administrador puede reequilibrar los equipos.' using errcode='42501'; end if;
     select ord::int-1 into idx from jsonb_array_elements(teams) with ordinality t(value,ord) where value->'playerIds' @> jsonb_build_array(target);
     if idx is null or target in (a,b) or not exists(select 1 from public.event_rsvps where event_id=p_event and plays_soccer and player_id::text=target) then raise exception 'Elegí un jugador activo que no sea capitán.'; end if;
     other_idx:=1-idx;
     select coalesce(jsonb_agg(value),'[]') into changed from jsonb_array_elements_text(teams->idx->'playerIds') where value<>target;
     teams:=jsonb_set(teams,array[idx::text,'playerIds'],changed);
     teams:=jsonb_set(teams,array[other_idx::text,'playerIds'],(teams->other_idx->'playerIds')||jsonb_build_array(target));
     draft:=draft||jsonb_build_object('confirmedAt',null);
   elsif p_action='position' then
     select ord::int-1 into idx from jsonb_array_elements(teams) with ordinality t(value,ord) where value->'playerIds' @> jsonb_build_array(target);
     if idx is null or (not admin and actor::text is distinct from (teams->idx->>'captainPlayerId')) then raise exception 'Solo podés modificar posiciones de tu equipo.' using errcode='42501'; end if;
     if coalesce(p_payload->>'role','') not in ('ARQ','DEF','MED','DEL') then raise exception 'Posición inválida.'; end if;
     roles:=coalesce(d->'playerRoles','{}')||jsonb_build_object(target,p_payload->>'role'); d:=jsonb_set(d,'{playerRoles}',roles);
     draft:=draft||jsonb_build_object('confirmedAt',null);
   elsif p_action='confirm' then
     if not admin then raise exception 'Solo el administrador confirma los equipos.' using errcode='42501'; end if;
     if not app_private.captain_teams_ready(p_event,d) then raise exception 'Completá equipos equilibrados de al menos 4, sin bajas ni jugadores pendientes.'; end if;
     draft:=draft||jsonb_build_object('confirmedAt',now());
   else raise exception 'Acción desconocida.';
   end if;
 end if;
 d:=jsonb_set(d,'{teams}',jsonb_build_object('teams',teams));
 if draft is not null then d:=jsonb_set(d,'{captainDraft}',draft); end if;
 update public.event_records set data=d,last_operation=p_operation where id=p_event returning * into e;
 insert into app_private.captain_operations values(p_event,p_operation,actor,p_action,p_payload,p_version);
 return next e;
end $$;
revoke all on function app_private.captain_action(uuid,bigint,uuid,text,jsonb) from public,anon;
grant execute on function app_private.captain_action(uuid,bigint,uuid,text,jsonb) to authenticated;
grant usage on schema app_private to authenticated;
create or replace function public.captain_action(p_event uuid,p_version bigint,p_operation uuid,p_action text,p_payload jsonb)
returns setof public.event_records language sql security invoker set search_path='' as $$
 select * from app_private.captain_action(p_event,p_version,p_operation,p_action,p_payload);
$$;
revoke all on function public.captain_action(uuid,bigint,uuid,text,jsonb) from public,anon;
grant execute on function public.captain_action(uuid,bigint,uuid,text,jsonb) to authenticated;

-- A normal save_event (including a stale admin client) cannot bypass the draft RPC.
create or replace function public.validate_captain_draft() returns trigger
language plpgsql security invoker set search_path='' as $$
declare privileged boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.id::text,0));
 select current_user=pg_get_userbyid(proowner) into privileged from pg_proc where oid='app_private.captain_action(uuid,bigint,uuid,text,jsonb)'::regprocedure;
 if tg_op='INSERT' then
   if new.data ? 'captainDraft' then raise exception 'Asigná los capitanes después de crear el evento.'; end if;
   return new;
 end if;
 if (old.data ? 'captainDraft' or new.data ? 'captainDraft') then
   if not privileged and ((new.data->'captainDraft') is distinct from (old.data->'captainDraft') or (new.data->'teams') is distinct from (old.data->'teams') or (new.data->'playerRoles') is distinct from (old.data->'playerRoles')) then raise exception 'Usá la sección DT / Capitanes para modificar estos equipos.' using errcode='42501'; end if;
   if old.data->>'status'<>'open' and new.data->'captainDraft' is distinct from old.data->'captainDraft' then raise exception 'Los capitanes ya están cerrados.'; end if;
   if old.data->>'status'='open' and new.data->>'status'='playing' then
     if old.data#>>'{captainDraft,confirmedAt}' is null or not app_private.captain_teams_ready(new.id,new.data) then raise exception 'Confirmá los equipos y resolvé jugadores pendientes o bajas antes de iniciar.'; end if;
   end if;
 end if;
 return new;
end $$;
revoke all on function public.validate_captain_draft() from public,anon,authenticated;
drop trigger if exists captain_draft_validation on public.event_records;
create trigger captain_draft_validation before insert or update on public.event_records for each row execute function public.validate_captain_draft();
