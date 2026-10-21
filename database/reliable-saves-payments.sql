-- Additive upgrade. Existing event/RSVP rows are preserved.
alter table public.event_records add column version bigint not null default 0;
alter table public.event_records add column last_operation uuid;

create table public.event_payments (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.event_records(id),
 kind text not null check (kind in ('pitch','dinner')),
 player_id uuid not null references auth.users(id),
 amount numeric(12,2) not null check (amount >= 0),
 recorded_at timestamptz not null default now(),
 recorded_by uuid not null default auth.uid() references auth.users(id),
 voided_at timestamptz,
 voided_by uuid references auth.users(id),
 void_operation uuid unique,
 check ((voided_at is null) = (voided_by is null))
);
create unique index one_active_payment on public.event_payments(event_id,kind,player_id) where voided_at is null;
alter table public.event_payments enable row level security;
revoke all on public.event_payments from anon, authenticated;
grant select, insert, update on public.event_payments to authenticated;
create policy payments_read on public.event_payments for select to authenticated using (true);
create policy payments_insert_admin on public.event_payments for insert to authenticated
 with check ((select auth.jwt()->>'email') = 'gon.herrera.dev@gmail.com' and recorded_by = (select auth.uid()));
create policy payments_void_admin on public.event_payments for update to authenticated
 using ((select auth.jwt()->>'email') = 'gon.herrera.dev@gmail.com')
 with check ((select auth.jwt()->>'email') = 'gon.herrera.dev@gmail.com' and voided_by = (select auth.uid()));

-- Deterministic cent distribution: sorted player IDs receive the remaining cents.
create function public.event_share(p_data jsonb, p_kind text, p_player_id uuid)
returns numeric language plpgsql immutable security invoker set search_path = '' as $$
declare ids text[]; total_cents bigint; pos integer; n integer;
begin
 select array_agg(value order by value) into ids from jsonb_array_elements_text(
   coalesce(p_data->case when p_kind='pitch' then 'matchPlayedPlayerIds' else 'dinnerAttendedPlayerIds' end,'[]'));
 n := coalesce(cardinality(ids),0); pos := array_position(ids,p_player_id::text);
 if n=0 or pos is null then raise exception 'El jugador no pertenece al reparto confirmado.'; end if;
 if p_kind='pitch' then total_cents := round((p_data->>'pitchPrice')::numeric * 100);
 else select round(coalesce(sum((item->>'amount')::numeric),0)*100) into total_cents from jsonb_array_elements(coalesce(p_data->'menuItems','[]')) item; end if;
 return (total_cents / n + case when pos <= total_cents % n then 1 else 0 end)::numeric / 100;
end $$;

create function public.validate_event_stage() returns trigger
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
create trigger event_stage_validation before insert or update on public.event_records for each row execute function public.validate_event_stage();

create function public.save_event(p_event_id uuid, p_version bigint, p_data jsonb, p_operation uuid)
returns setof public.event_records language plpgsql security invoker set search_path = '' as $$
declare row public.event_records;
begin
 if auth.uid() is null or auth.jwt()->>'email' <> 'gon.herrera.dev@gmail.com' then raise exception 'Solo el administrador puede guardar.' using errcode='42501'; end if;
 select * into row from public.event_records where id=p_event_id for update;
 if not found then raise exception 'Evento no encontrado.'; end if;
 if row.last_operation = p_operation then return next row; return; end if;
 if row.version <> p_version then raise exception 'El evento cambió en otra sesión. Actualizá antes de volver a guardar.' using errcode='40001'; end if;
 update public.event_records set data=p_data, last_operation=p_operation where id=p_event_id returning * into row;
 return next row;
end $$;

-- A shared lock serializes late confirmations against closing registrations.
create function public.validate_rsvp_stage() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare state text;
begin
 if tg_op='UPDATE' and (new.event_id <> old.event_id or new.player_id <> old.player_id) then raise exception 'La identidad de una confirmación no se modifica.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.event_id::text,0));
 select data->>'status' into state from public.event_records where id=new.event_id;
 if state is distinct from 'open' then raise exception 'Las inscripciones ya están cerradas.'; end if;
 return new;
end $$;
create trigger rsvp_stage_validation before insert or update on public.event_rsvps for each row execute function public.validate_rsvp_stage();

create function public.validate_payment() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare event_data jsonb;
begin
 if auth.uid() is null or auth.jwt()->>'email' <> 'gon.herrera.dev@gmail.com' then raise exception 'Solo el administrador puede registrar cobros.' using errcode='42501'; end if;
 select data into event_data from public.event_records where id=new.event_id for update;
 if tg_op='INSERT' then
   if (new.kind='pitch' and event_data->>'status' not in ('dinner','completed')) or (new.kind='dinner' and event_data->>'status' <> 'completed') then raise exception 'Confirmá primero los asistentes y cerrá el reparto.'; end if;
   new.amount := public.event_share(event_data,new.kind,new.player_id);
   new.recorded_by := auth.uid(); new.recorded_at := now();
   if new.voided_at is not null or new.voided_by is not null or new.void_operation is not null then raise exception 'Un cobro nuevo no puede estar anulado.'; end if;
 else
   if (to_jsonb(new)-array['voided_at','voided_by','void_operation']) is distinct from (to_jsonb(old)-array['voided_at','voided_by','void_operation']) or old.voided_at is not null or new.voided_at is null or new.void_operation is null then raise exception 'Los cobros son inmutables; solo se permite anularlos.'; end if;
   new.voided_by := auth.uid(); new.voided_at := now();
 end if;
 return new;
end $$;
create trigger payment_validation before insert or update on public.event_payments for each row execute function public.validate_payment();

create function public.set_event_payment(p_event_id uuid, p_kind text, p_player_id uuid, p_paid boolean, p_operation uuid, p_payment_id uuid default null)
returns setof public.event_payments language plpgsql security invoker set search_path = '' as $$
declare active public.event_payments;
begin
 if auth.uid() is null or auth.jwt()->>'email' <> 'gon.herrera.dev@gmail.com' then raise exception 'Solo el administrador puede registrar cobros.' using errcode='42501'; end if;
 perform 1 from public.event_records where id=p_event_id for update;
 if not found then raise exception 'Evento no encontrado.'; end if;
 if p_kind not in ('pitch','dinner') then raise exception 'Concepto inválido.'; end if;
 if exists(select 1 from public.event_payments where id=p_operation or void_operation=p_operation) then
   if not exists(select 1 from public.event_payments where (id=p_operation or void_operation=p_operation) and event_id=p_event_id and kind=p_kind and player_id=p_player_id) then raise exception 'Operación inválida.'; end if;
   return query select * from public.event_payments where event_id=p_event_id; return;
 end if;
 select * into active from public.event_payments where event_id=p_event_id and kind=p_kind and player_id=p_player_id and voided_at is null;
 if p_paid and active.id is null then
   insert into public.event_payments(id,event_id,kind,player_id,amount) values(p_operation,p_event_id,p_kind,p_player_id,0);
 elsif not p_paid and active.id is not null then
   if p_payment_id is distinct from active.id then raise exception 'El cobro cambió en otra sesión. Actualizá antes de anularlo.' using errcode='40001'; end if;
   update public.event_payments set voided_at=now(),voided_by=auth.uid(),void_operation=p_operation where id=active.id;
 end if;
 return query select * from public.event_payments where event_id=p_event_id;
end $$;

revoke all on function public.event_share(jsonb,text,uuid), public.validate_event_stage(), public.validate_rsvp_stage(), public.validate_payment(), public.save_event(uuid,bigint,jsonb,uuid), public.set_event_payment(uuid,text,uuid,boolean,uuid,uuid) from public, anon;
grant execute on function public.event_share(jsonb,text,uuid), public.save_event(uuid,bigint,jsonb,uuid), public.set_event_payment(uuid,text,uuid,boolean,uuid,uuid) to authenticated;
