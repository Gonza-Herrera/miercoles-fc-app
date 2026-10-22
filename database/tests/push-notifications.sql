-- No network sends. Every temporary subscription, job and Vault key rolls back.
begin;
select set_config('test.admin_id',id::text,true),set_config('test.admin_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true)
 from auth.users where email='gon.herrera.dev@gmail.com';
select set_config('test.player_id',id::text,true),set_config('test.player_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true)
 from auth.users where email<>'gon.herrera.dev@gmail.com' order by created_at limit 1;
select set_config('test.push_job',gen_random_uuid()::text,true);
set local role service_role;
do $$
declare key text; pair jsonb; job public.push_jobs; n integer;
begin
 key:=public.push_vapid_initialize(repeat('a',87),repeat('b',43));
 pair:=public.push_vapid_read();
 if pair->>'publicKey' is distinct from key or pair->>'privateKey' is null then raise exception 'TEST: Vault key missing'; end if;
 if public.push_vapid_initialize(repeat('c',87),repeat('d',43)) is distinct from key then raise exception 'TEST: VAPID key rotated on retry'; end if;
 insert into public.push_subscriptions(user_id,endpoint,keys) values
   (current_setting('test.admin_id')::uuid,'https://fcm.googleapis.com/fcm/send/rollback-test-a',jsonb_build_object('p256dh',repeat('a',87),'auth',repeat('b',22))),
   (current_setting('test.player_id')::uuid,'https://web.push.apple.com/rollback-test-b',jsonb_build_object('p256dh',repeat('c',87),'auth',repeat('d',22)));
 begin
   perform public.create_push_job(gen_random_uuid(),current_setting('test.player_id')::uuid,'Test','Test','/');
   raise exception 'TEST: non-admin sender';
 exception when insufficient_privilege then null; end;
 select * into job from public.create_push_job(current_setting('test.push_job')::uuid,current_setting('test.admin_id')::uuid,'Test push','Rollback only','/');
 perform public.create_push_job(job.id,current_setting('test.admin_id')::uuid,'Test push','Rollback only','/');
 if job.total<2 or (select count(*) from public.push_deliveries where job_id=job.id)<>job.total then raise exception 'TEST: recipient snapshot'; end if;
 begin
   perform public.create_push_job(job.id,current_setting('test.admin_id')::uuid,'Different','Rollback only','/');
   raise exception 'TEST: reused send id with changed content';
 exception when serialization_failure then null; end;
 select count(*) into n from public.claim_push_deliveries(job.id);
 if n=0 then raise exception 'TEST: no deliveries claimed'; end if;
 if exists(select 1 from public.claim_push_deliveries(job.id)) then raise exception 'TEST: deliveries claimed twice'; end if;
 update public.push_deliveries set status='accepted' where job_id=job.id and subscription_id=(select id from public.push_subscriptions where endpoint='https://fcm.googleapis.com/fcm/send/rollback-test-a');
 update public.push_deliveries set updated_at=now()-interval '2 minutes' where job_id=job.id and status='sending';
 perform public.claim_push_deliveries(job.id);
 select * into job from public.summarize_push_job(job.id);
 if job.accepted<1 or job.uncertain<1 or job.remaining<>0 or job.status<>'finished' then raise exception 'TEST: summary or uncertain retry'; end if;
end $$;
select set_config('request.jwt.claims',current_setting('test.player_claims'),true);
set local role authenticated;
do $$
begin
 if exists(select 1 from public.push_subscriptions where user_id<>auth.uid()) then raise exception 'TEST: private endpoints leaked'; end if;
 if exists(select 1 from public.push_jobs where id=current_setting('test.push_job')::uuid) then raise exception 'TEST: admin history leaked'; end if;
 begin
   perform public.push_vapid_read(); raise exception 'TEST: signing key leaked';
 exception when insufficient_privilege then null; end;
 begin
   perform public.claim_push_deliveries(current_setting('test.push_job')::uuid); raise exception 'TEST: client could claim deliveries';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.push_subscriptions(user_id,endpoint,keys) values(auth.uid(),'https://fcm.googleapis.com/fcm/send/injected','{}');
   raise exception 'TEST: direct subscription write';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',current_setting('test.admin_claims'),true);
do $$
begin
 if not exists(select 1 from public.push_jobs where id=current_setting('test.push_job')::uuid) then raise exception 'TEST: admin history unreadable'; end if;
 begin
   perform public.push_vapid_read(); raise exception 'TEST: private key leaked to admin client';
 exception when insufficient_privilege then null; end;
end $$;
select 'PASS: subscription privacy, admin-only sending/history, protected Vault keys, idempotent jobs and uncertain delivery handling' as verification;
rollback;
