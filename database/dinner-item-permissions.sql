-- Narrow write endpoint: editing expenses never grants UPDATE on the event to a shopper.
create table app_private.dinner_item_operations (
 event_id uuid not null references public.event_records(id) on delete cascade,
 operation_id uuid not null, actor_id uuid not null references auth.users(id),
 action text not null, payload jsonb not null, expected_version bigint not null,
 created_at timestamptz not null default now(), primary key(event_id,operation_id)
);
alter table app_private.dinner_item_operations enable row level security;
revoke all on app_private.dinner_item_operations from public,anon,authenticated;
create policy dinner_item_operations_private on app_private.dinner_item_operations as restrictive for all to authenticated using(false) with check(false);
create index dinner_item_operations_actor_idx on app_private.dinner_item_operations(actor_id);

create function app_private.dinner_item_action(p_event_id uuid,p_version bigint,p_operation uuid,p_action text,p_payload jsonb)
returns setof public.event_records language plpgsql security definer set search_path='' as $$
declare
 e public.event_records; op app_private.dinner_item_operations;
 actor uuid:=auth.uid(); items jsonb; item jsonb; target text; buyer text; amount numeric;
begin
 if actor is null or not app_private.is_group_member() then raise exception 'Esta cuenta no tiene acceso.' using errcode='42501'; end if;
 if p_version is null or p_operation is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Solicitud incompleta.'; end if;
 -- Match save_event lock order; the advisory lock also serializes stage transitions/RSVP.
 select * into e from public.event_records where id=p_event_id for update;
 if not found then raise exception 'Evento no encontrado.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 if not app_private.is_group_admin() and (e.data->>'dinnerShopperPlayerId') is distinct from actor::text then
   raise exception 'Solo el administrador o el encargado de compras puede modificar los ítems.' using errcode='42501';
 end if;
 select * into op from app_private.dinner_item_operations where event_id=p_event_id and operation_id=p_operation;
 if found then
   if op.actor_id<>actor or op.action is distinct from p_action or op.payload<>p_payload or op.expected_version<>p_version then raise exception 'Operación inválida.' using errcode='42501'; end if;
   return next e; return;
 end if;
 if e.version<>p_version then raise exception 'El evento cambió en otra sesión. Actualizá antes de guardar.' using errcode='40001'; end if;
 if (e.data->>'status') not in ('open','playing','dinner') then raise exception 'La cena ya está cerrada. Los gastos no se modifican.'; end if;
 items:=coalesce(e.data->'menuItems','[]');
 if p_action='add' then
   if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('id','name','amount','icon','buyerPlayerId')) then raise exception 'La solicitud solo puede incluir datos del ítem.'; end if;
   if jsonb_typeof(p_payload->'id') is distinct from 'string' or (p_payload->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Identidad de ítem inválida.'; end if;
   if jsonb_typeof(p_payload->'name') is distinct from 'string' or length(btrim(p_payload->>'name')) not between 1 and 160 then raise exception 'Ingresá un nombre válido para el gasto.'; end if;
   if jsonb_typeof(p_payload->'amount') is distinct from 'number' then raise exception 'Ingresá un importe válido.'; end if;
   amount:=(p_payload->>'amount')::numeric;
   if amount<0 or amount>9999999999.99 or amount<>round(amount,2) then raise exception 'El importe debe ser positivo o cero y tener como máximo dos decimales.'; end if;
   if jsonb_typeof(p_payload->'icon') is distinct from 'string' or length(p_payload->>'icon') not between 1 and 32 then raise exception 'Ícono inválido.'; end if;
   target:=p_payload->>'id'; buyer:=p_payload->>'buyerPlayerId';
   if buyer is not null and not exists(select 1 from public.event_rsvps where event_id=p_event_id and player_id::text=buyer) then raise exception 'El comprador no pertenece al evento.'; end if;
   if exists(select 1 from jsonb_array_elements(items) x where x->>'id'=target) then raise exception 'Ese ítem ya existe. Actualizá el evento.' using errcode='23505'; end if;
   item:=jsonb_build_object('id',target,'name',btrim(p_payload->>'name'),'amount',amount,'icon',p_payload->>'icon');
   if buyer is not null then item:=item||jsonb_build_object('buyerPlayerId',buyer); end if;
   items:=items||jsonb_build_array(item);
 elsif p_action='remove' then
   if exists(select 1 from jsonb_object_keys(p_payload) k where k<>'itemId') then raise exception 'La solicitud solo puede incluir la identidad del ítem.'; end if;
   target:=p_payload->>'itemId';
   if target is null or not exists(select 1 from jsonb_array_elements(items) x where x->>'id'=target) then raise exception 'El ítem ya no existe. Actualizá el evento.' using errcode='40001'; end if;
   select coalesce(jsonb_agg(value order by ord),'[]') into items from jsonb_array_elements(items) with ordinality x(value,ord) where value->>'id' is distinct from target;
 else raise exception 'Acción inválida.';
 end if;
 -- Only this JSON property changes; existing stage/team/payment protections still run.
 update public.event_records set data=jsonb_set(e.data,'{menuItems}',items),last_operation=p_operation where id=p_event_id returning * into e;
 insert into app_private.dinner_item_operations(event_id,operation_id,actor_id,action,payload,expected_version)
 values(p_event_id,p_operation,actor,p_action,p_payload,p_version);
 return next e;
end $$;
revoke all on function app_private.dinner_item_action(uuid,bigint,uuid,text,jsonb) from public,anon;
grant execute on function app_private.dinner_item_action(uuid,bigint,uuid,text,jsonb) to authenticated;
create function public.dinner_item_action(p_event_id uuid,p_version bigint,p_operation uuid,p_action text,p_payload jsonb)
returns setof public.event_records language sql security invoker set search_path='' as $$
 select * from app_private.dinner_item_action(p_event_id,p_version,p_operation,p_action,p_payload);
$$;
revoke all on function public.dinner_item_action(uuid,bigint,uuid,text,jsonb) from public,anon;
grant execute on function public.dinner_item_action(uuid,bigint,uuid,text,jsonb) to authenticated;
