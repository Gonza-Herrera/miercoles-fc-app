create or replace function public.validate_event_stage() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare previous text; following text; ids jsonb; key text;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.id::text,0));
 following := new.data->>'status';
 if jsonb_typeof(new.data->'pitchPrice') is distinct from 'number' or (new.data->>'pitchPrice')::numeric <= 0 or (new.data->>'pitchPrice')::numeric <> round((new.data->>'pitchPrice')::numeric,2) then raise exception 'El precio de cancha debe ser positivo y tener como máximo dos decimales.'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(new.data->'menuItems','[]')) item where jsonb_typeof(item->'amount') is distinct from 'number' or (item->>'amount')::numeric < 0 or (item->>'amount')::numeric <> round((item->>'amount')::numeric,2) or coalesce(length(trim(item->>'name')),0)=0) then raise exception 'Revisá los nombres e importes de los gastos.'; end if;
 if tg_op='INSERT' then
   if following <> 'open' then raise exception 'Los eventos nuevos deben abrir inscripciones.'; end if;
   return new;
 end if;
 previous := old.data->>'status';
 if previous='open' and following='playing' and not exists(select 1 from public.event_rsvps where event_id=new.id and plays_soccer) then raise exception 'Debe haber al menos un jugador confirmado para iniciar el partido.'; end if;
 if (new.data->'matchPlayedPlayerIds') is distinct from (old.data->'matchPlayedPlayerIds') and not (previous='playing' and following='dinner') then raise exception 'Confirmá los presentes al cerrar el partido.'; end if;
 if (new.data->'dinnerAttendedPlayerIds') is distinct from (old.data->'dinnerAttendedPlayerIds') and not (previous='dinner' and following='completed') then raise exception 'Confirmá los asistentes al cerrar la cena.'; end if;
 if new.id <> old.id or new.created_by <> old.created_by or new.created_at <> old.created_at then raise exception 'La identidad del evento no se modifica.'; end if;
 if following <> previous and not ((previous='open' and following='playing') or (previous='playing' and following='dinner') or (previous='dinner' and following='completed')) then
   raise exception 'Transición de etapa inválida.';
 end if;
 if previous <> 'open' and ((new.data->'teams') is distinct from (old.data->'teams') or (new.data->'playerRoles') is distinct from (old.data->'playerRoles')) then raise exception 'Los equipos ya están cerrados.'; end if;
 if previous in ('dinner','completed') and ((new.data->'pitchPrice') is distinct from (old.data->'pitchPrice') or (new.data->'matchPlayedPlayerIds') is distinct from (old.data->'matchPlayedPlayerIds')) then raise exception 'El reparto de cancha ya está cerrado.'; end if;
 if previous='completed' and new.data is distinct from old.data then raise exception 'La cena y los gastos ya están cerrados.'; end if;
 if following in ('dinner','completed') then
   ids := coalesce(new.data->'matchPlayedPlayerIds','[]');
   if jsonb_array_length(ids)=0 then raise exception 'Seleccioná al menos un jugador presente.'; end if;
 end if;
 if following='completed' and jsonb_array_length(coalesce(new.data->'dinnerAttendedPlayerIds','[]'))=0 then raise exception 'Seleccioná al menos un asistente a la cena.'; end if;
 foreach key in array array['matchPlayedPlayerIds','dinnerAttendedPlayerIds'] loop
   ids := coalesce(new.data->key,'[]');
   if (select count(*) <> count(distinct value) from jsonb_array_elements_text(ids)) then raise exception 'Hay asistentes repetidos.'; end if;
   if exists(select 1 from jsonb_array_elements_text(ids) x where not exists(select 1 from public.event_rsvps r where r.event_id=new.id and r.player_id::text=x.value)) then raise exception 'Hay asistentes que no pertenecen al evento.'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(coalesce(new.data->'menuItems','[]')) item where not (item ? 'amount') or (item->>'amount')::numeric < 0 or (item->>'amount')::numeric <> round((item->>'amount')::numeric,2) or length(trim(item->>'name'))=0) then raise exception 'Revisá los nombres e importes de los gastos.'; end if;
 new.version := old.version + 1;
 if previous='playing' and following='dinner' then new.data := new.data || jsonb_build_object('matchClosedAt',now()); end if;
 if previous='dinner' and following='completed' then new.data := new.data || jsonb_build_object('dinnerClosedAt',now()); end if;
 return new;
end $$;

create or replace function public.validate_rsvp_stage() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare state text;
begin
 if tg_op='UPDATE' and (new.event_id <> old.event_id or new.player_id <> old.player_id) then raise exception 'La identidad de una confirmación no se modifica.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.event_id::text,0));
 select data->>'status' into state from public.event_records where id=new.event_id;
 if state is distinct from 'open' then raise exception 'Las inscripciones ya están cerradas.'; end if;
 return new;
end $$;
