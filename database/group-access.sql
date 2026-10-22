-- Membership is checked from current server data, never editable metadata or stale JWT claims.
create table public.group_invites (
 id uuid primary key default gen_random_uuid(),
 email text not null unique check(email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email)<=254),
 display_name text not null check(char_length(btrim(display_name)) between 2 and 60),
 active boolean not null default false,
 user_id uuid unique references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 first_access_at timestamptz,
 version bigint not null default 0
);
alter table public.group_invites enable row level security;
revoke all on public.group_invites from public,anon,authenticated;
grant select on public.group_invites to authenticated;
create table app_private.invite_operations (
 operation_id uuid primary key, actor_id uuid not null references auth.users(id),
 invite_id uuid not null references public.group_invites(id), request jsonb not null
);
alter table app_private.invite_operations enable row level security;
revoke all on app_private.invite_operations from public,anon,authenticated;
create index invite_operations_actor_idx on app_private.invite_operations(actor_id);
create index invite_operations_invite_idx on app_private.invite_operations(invite_id);
create policy invite_operations_private on app_private.invite_operations as restrictive for all to authenticated using(false) with check(false);

create function app_private.group_member_for_user(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=p_user and u.email_confirmed_at is not null and
 (lower(u.email)='gon.herrera.dev@gmail.com' or exists(select 1 from public.group_invites i where i.active and i.email=lower(u.email) and (i.user_id is null or i.user_id=u.id))));
$$;
revoke all on function app_private.group_member_for_user(uuid) from public,anon,authenticated;
create function app_private.is_group_member() returns boolean
language sql stable security definer set search_path='' as $$ select app_private.group_member_for_user(auth.uid()); $$;
create function app_private.is_group_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and lower(email)='gon.herrera.dev@gmail.com');
$$;
revoke all on function app_private.is_group_member(),app_private.is_group_admin() from public,anon;
grant execute on function app_private.is_group_member(),app_private.is_group_admin() to authenticated;
create function public.is_group_member() returns boolean language sql stable security invoker set search_path='' as $$ select app_private.is_group_member(); $$;
create function public.is_group_admin() returns boolean language sql stable security invoker set search_path='' as $$ select app_private.is_group_admin(); $$;
revoke all on function public.is_group_member(),public.is_group_admin() from public,anon;
grant execute on function public.is_group_member(),public.is_group_admin() to authenticated;
create function public.group_member_for_user(p_user uuid) returns boolean language sql stable security invoker set search_path='' as $$ select app_private.group_member_for_user(p_user); $$;
revoke all on function public.group_member_for_user(uuid) from public,anon,authenticated;
grant execute on function public.group_member_for_user(uuid),app_private.group_member_for_user(uuid) to service_role;
create policy invites_admin_read on public.group_invites for select to authenticated using((select public.is_group_admin()));

-- Existing accounts are pending approval. Only the administrator starts active.
insert into public.group_invites(email,display_name,active,user_id)
select lower(u.email),left(coalesce(nullif(btrim(p.display_name),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),nullif(btrim(u.raw_user_meta_data->>'name'),''),split_part(u.email,'@',1))||case when length(coalesce(p.display_name,u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',split_part(u.email,'@',1)))<2 then ' '||'·' else '' end,60),
 lower(u.email)='gon.herrera.dev@gmail.com',u.id from auth.users u left join public.user_profiles p on p.id=u.id where u.email is not null;

create function app_private.my_group_access() returns jsonb language plpgsql security definer set search_path='' as $$
declare u auth.users;
begin
 if auth.uid() is null then raise exception 'Iniciá sesión.' using errcode='42501'; end if;
 select * into u from auth.users where id=auth.uid();
 perform 1 from public.group_invites where email=lower(u.email) for update;
 if not app_private.group_member_for_user(u.id) then return '{"allowed":false}'::jsonb; end if;
 update public.group_invites set user_id=u.id,first_access_at=coalesce(first_access_at,now()) where email=lower(u.email) and active and (user_id is null or user_id=u.id) and (user_id is null or first_access_at is null);
 return jsonb_build_object('allowed',true,'admin',lower(u.email)='gon.herrera.dev@gmail.com');
end $$;
revoke all on function app_private.my_group_access() from public,anon;
grant execute on function app_private.my_group_access() to authenticated;
create function public.my_group_access() returns jsonb language sql security invoker set search_path='' as $$ select app_private.my_group_access(); $$;
revoke all on function public.my_group_access() from public,anon;
grant execute on function public.my_group_access() to authenticated;

create function app_private.save_group_invite(p_id uuid,p_version bigint,p_name text,p_email text,p_active boolean,p_operation uuid)
returns setof public.group_invites language plpgsql security definer set search_path='' as $$
declare r public.group_invites; op app_private.invite_operations; request jsonb; target_user uuid; normalized text:=lower(btrim(p_email));
begin
 if not app_private.is_group_admin() then raise exception 'Solo el administrador puede administrar el acceso.' using errcode='42501'; end if;
 if p_id is null or p_operation is null or p_version is null or p_active is null or p_name is null or p_email is null then raise exception 'Completá los datos del invitado.'; end if;
 request:=jsonb_build_object('id',p_id,'version',p_version,'name',btrim(p_name),'email',normalized,'active',p_active);
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,7));
 select * into op from app_private.invite_operations where operation_id=p_operation;
 if found then
   if op.actor_id<>auth.uid() or op.request<>request then raise exception 'Operación inválida.' using errcode='42501'; end if;
   return query select * from public.group_invites where id=op.invite_id; return;
 end if;
 select * into r from public.group_invites where id=p_id for update;
 if found then
   if r.version<>p_version then raise exception 'El acceso cambió en otra sesión. Actualizá antes de continuar.' using errcode='40001'; end if;
   if r.email<>normalized then raise exception 'El correo de una invitación existente no se modifica. Agregá una nueva invitación.'; end if;
   if r.email='gon.herrera.dev@gmail.com' and not p_active then raise exception 'No podés desactivar al administrador.'; end if;
   update public.group_invites set display_name=btrim(p_name),active=p_active,updated_at=now(),version=version+1 where id=p_id returning * into r;
 else
   if p_version<>-1 then raise exception 'Invitación no encontrada.' using errcode='40001'; end if;
   select id into target_user from auth.users where lower(email)=normalized limit 1;
   insert into public.group_invites(id,email,display_name,active,user_id) values(p_id,normalized,btrim(p_name),p_active,target_user) returning * into r;
 end if;
 insert into app_private.invite_operations values(p_operation,auth.uid(),r.id,request);
 return next r;
end $$;
revoke all on function app_private.save_group_invite(uuid,bigint,text,text,boolean,uuid) from public,anon;
grant execute on function app_private.save_group_invite(uuid,bigint,text,text,boolean,uuid) to authenticated;
create function public.save_group_invite(p_id uuid,p_version bigint,p_name text,p_email text,p_active boolean,p_operation uuid)
returns setof public.group_invites language sql security invoker set search_path='' as $$ select * from app_private.save_group_invite(p_id,p_version,p_name,p_email,p_active,p_operation); $$;
revoke all on function public.save_group_invite(uuid,bigint,text,text,boolean,uuid) from public,anon;
grant execute on function public.save_group_invite(uuid,bigint,text,text,boolean,uuid) to authenticated;

-- Enforce new-account allowlisting without an external dashboard toggle.
-- Supabase may report a generic signup error; the login UI explains invitation-only access.
create function app_private.validate_invited_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lower(new.email)='gon.herrera.dev@gmail.com' or exists(select 1 from public.group_invites where email=lower(new.email) and active) then return new; end if;
 raise exception 'Esta cuenta no tiene acceso. Contactá al administrador.' using errcode='42501';
end $$;
revoke all on function app_private.validate_invited_signup() from public,anon,authenticated;
create trigger require_group_invitation before insert on auth.users for each row execute function app_private.validate_invited_signup();

-- Restrictive policies AND with every existing policy, including own-row rules.
do $$ declare t text; begin
 foreach t in array array['event_records','event_rsvps','event_payments','event_sports','fixture_polls','fixture_votes','user_profiles','push_subscriptions','push_jobs','push_deliveries'] loop
   execute format('create policy group_members_only on public.%I as restrictive for all to authenticated using((select public.is_group_member())) with check((select public.is_group_member()))',t);
 end loop;
end $$;
create policy profile_photos_group_only on storage.objects as restrictive for all to authenticated
using(bucket_id<>'profile-photos' or (select public.is_group_member())) with check(bucket_id<>'profile-photos' or (select public.is_group_member()));

-- SECURITY DEFINER game actions bypass table RLS, so check membership explicitly.
do $$ declare f record; body text; begin
 for f in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in ('captain_action','cast_fixture_vote','close_fixture_poll') loop
   body:=regexp_replace(f.prosrc,'\mbegin\M', E'begin\n if not app_private.is_group_member() then raise exception ''Esta cuenta no tiene acceso.'' using errcode=''42501''; end if;','i');
   execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
 end loop;
end $$;

-- Service-role push jobs must also exclude revoked recipients.
do $$ declare f record; body text; begin
 select p.oid,p.prosrc into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname='create_push_job';
 body:=replace(f.prosrc,'select p_id,id,user_id from public.push_subscriptions;', 'select p_id,s.id,s.user_id from public.push_subscriptions s where app_private.group_member_for_user(s.user_id);');
 if body=f.prosrc and position('app_private.group_member_for_user' in body)=0 then raise exception 'Push recipient guard could not be installed'; end if;
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
end $$;
