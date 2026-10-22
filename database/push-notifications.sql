create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 endpoint text not null unique,
 keys jsonb not null,
 updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy push_read_own on public.push_subscriptions for select to authenticated using(user_id=(select auth.uid()));

create table public.push_jobs (
 id uuid primary key,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 title text not null check(length(title) between 1 and 100),
 body text not null check(length(body) between 1 and 500),
 path text not null check(path in ('/','/cena/menu','/partido/equipos','/partido/confirmados')),
 total integer not null default 0,
 accepted integer not null default 0,
 failed integer not null default 0,
 expired integer not null default 0,
 uncertain integer not null default 0,
 remaining integer not null default 0,
 status text not null default 'queued' check(status in ('queued','sending','finished'))
);
create index push_jobs_created_by_idx on public.push_jobs(created_by);
create index push_jobs_created_at_idx on public.push_jobs(created_at desc);
alter table public.push_jobs enable row level security;
revoke all on public.push_jobs from public,anon,authenticated;
grant select on public.push_jobs to authenticated;
grant all on public.push_jobs to service_role;
create policy push_jobs_admin_read on public.push_jobs for select to authenticated using((select auth.jwt())->>'email'='gon.herrera.dev@gmail.com');

create table public.push_deliveries (
 job_id uuid not null references public.push_jobs(id),
 subscription_id uuid not null,
 user_id uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed','expired','uncertain')),
 updated_at timestamptz not null default now(),
 primary key(job_id,subscription_id)
);
create index push_deliveries_user_idx on public.push_deliveries(user_id);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from public,anon,authenticated;
grant all on public.push_deliveries to service_role;
create policy push_deliveries_deny_clients on public.push_deliveries for all to authenticated using(false) with check(false);

create schema if not exists app_private;
grant usage on schema app_private to service_role;
create table app_private.push_settings (
 singleton boolean primary key default true check(singleton),
 public_key text not null,
 secret_id uuid not null
);
revoke all on app_private.push_settings from public,anon,authenticated;

create function app_private.push_vapid_initialize(p_public text,p_private text) returns text
language plpgsql security definer set search_path='' as $$
declare key text; secret uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('miercoles_push_vapid',0));
 select public_key into key from app_private.push_settings where singleton;
 if key is not null then return key; end if;
 if length(p_public)<>87 or length(p_private)<>43 then raise exception 'Claves VAPID inválidas.'; end if;
 select vault.create_secret(p_private,'miercoles_push_vapid_private','Private Web Push signing key') into secret;
 insert into app_private.push_settings(public_key,secret_id) values(p_public,secret);
 return p_public;
end $$;
revoke all on function app_private.push_vapid_initialize(text,text) from public,anon,authenticated;
grant execute on function app_private.push_vapid_initialize(text,text) to service_role;
create function app_private.push_vapid_read() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('publicKey',p.public_key,'privateKey',v.decrypted_secret)
 from app_private.push_settings p join vault.decrypted_secrets v on v.id=p.secret_id where singleton;
$$;
revoke all on function app_private.push_vapid_read() from public,anon,authenticated;
grant execute on function app_private.push_vapid_read() to service_role;
create function public.push_vapid_initialize(p_public text,p_private text) returns text
language sql security invoker set search_path='' as $$ select app_private.push_vapid_initialize(p_public,p_private); $$;
create function public.push_vapid_read() returns jsonb
language sql security invoker set search_path='' as $$ select app_private.push_vapid_read(); $$;
revoke all on function public.push_vapid_initialize(text,text),public.push_vapid_read() from public,anon,authenticated;
grant execute on function public.push_vapid_initialize(text,text),public.push_vapid_read() to service_role;

create function app_private.create_push_job(p_id uuid,p_actor uuid,p_title text,p_body text,p_path text)
returns setof public.push_jobs language plpgsql security definer set search_path='' as $$
declare job public.push_jobs;
begin
 if not exists(select 1 from auth.users where id=p_actor and email='gon.herrera.dev@gmail.com') then raise exception 'Solo el admin puede enviar notificaciones.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into job from public.push_jobs where id=p_id;
 if found then
   if job.created_by<>p_actor or job.title<>p_title or job.body<>p_body or job.path<>p_path then raise exception 'Este envío ya existe con otro contenido.' using errcode='40001'; end if;
   return next job; return;
 end if;
 insert into public.push_jobs(id,created_by,title,body,path) values(p_id,p_actor,p_title,p_body,p_path);
 insert into public.push_deliveries(job_id,subscription_id,user_id) select p_id,s.id,s.user_id from public.push_subscriptions s where app_private.group_member_for_user(s.user_id);
 update public.push_jobs set total=(select count(*) from public.push_deliveries where job_id=p_id),remaining=(select count(*) from public.push_deliveries where job_id=p_id) where id=p_id returning * into job;
 return next job;
end $$;
revoke all on function app_private.create_push_job(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function app_private.create_push_job(uuid,uuid,text,text,text) to service_role;
create function public.create_push_job(p_id uuid,p_actor uuid,p_title text,p_body text,p_path text)
returns setof public.push_jobs language sql security invoker set search_path='' as $$
 select * from app_private.create_push_job(p_id,p_actor,p_title,p_body,p_path);
$$;

create function public.claim_push_deliveries(p_job uuid) returns setof public.push_deliveries
language plpgsql security invoker set search_path='' as $$
begin
 -- A crashed sender is uncertain: do not resend automatically and risk duplicate notifications.
 update public.push_deliveries set status='uncertain',updated_at=now() where job_id=p_job and status='sending' and updated_at<now()-interval '90 seconds';
 return query with selected as (
   select job_id,subscription_id from public.push_deliveries where job_id=p_job and status='pending'
   order by subscription_id limit 15 for update skip locked
 ) update public.push_deliveries d set status='sending',updated_at=now() from selected s
   where d.job_id=s.job_id and d.subscription_id=s.subscription_id returning d.*;
end $$;

create function public.summarize_push_job(p_job uuid) returns setof public.push_jobs
language plpgsql security invoker set search_path='' as $$
begin
 return query with counts as (
   select count(*) filter(where status='accepted')::integer accepted,
   count(*) filter(where status='failed')::integer failed,
   count(*) filter(where status='expired')::integer expired,
   count(*) filter(where status='uncertain')::integer uncertain,
   count(*) filter(where status in ('pending','sending'))::integer remaining
   from public.push_deliveries where job_id=p_job
 ) update public.push_jobs j set accepted=c.accepted,failed=c.failed,expired=c.expired,uncertain=c.uncertain,remaining=c.remaining,
   status=case when c.remaining=0 then 'finished' else 'sending' end from counts c where j.id=p_job returning j.*;
end $$;
revoke all on function public.create_push_job(uuid,uuid,text,text,text),public.claim_push_deliveries(uuid),public.summarize_push_job(uuid) from public,anon,authenticated;
grant execute on function public.create_push_job(uuid,uuid,text,text,text),public.claim_push_deliveries(uuid),public.summarize_push_job(uuid) to service_role;
