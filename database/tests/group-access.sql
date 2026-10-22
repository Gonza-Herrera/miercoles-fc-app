-- Integration coverage; every invitation, account and event is rolled back.
begin;
select set_config('test.admin',id::text,true) from auth.users where email='gon.herrera.dev@gmail.com';
select set_config('test.member',id::text,true) from auth.users where email<>'gon.herrera.dev@gmail.com' order by created_at,id limit 1;
select set_config('test.new_id',gen_random_uuid()::text,true),set_config('test.new_email','invite-test-'||gen_random_uuid()::text||'@example.invalid',true);
set local role authenticated;
do $$
declare admin uuid:=current_setting('test.admin')::uuid; member uuid:=current_setting('test.member')::uuid; invite public.group_invites;
 before_stamp timestamptz; first_op uuid:=gen_random_uuid(); version_before bigint; t text; n bigint;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','email','gon.herrera.dev@gmail.com')::text,true);
 if not public.is_group_admin() or not public.is_group_member() then raise exception 'TEST: admin locked out'; end if;
 select * into invite from public.group_invites where user_id=member;
 -- Explicitly deactivate the test member (never visible outside this transaction).
 select * into invite from public.save_group_invite(invite.id,invite.version,invite.display_name,invite.email,false,gen_random_uuid());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',member,'role','authenticated','email','gon.herrera.dev@gmail.com','user_metadata',jsonb_build_object('isAdmin',true))::text,true);
 if public.is_group_member() or public.is_group_admin() or (public.my_group_access()->>'allowed')::boolean then raise exception 'TEST: spoofed claims bypass membership'; end if;
 foreach t in array array['event_records','event_rsvps','event_payments','event_sports','fixture_polls','fixture_votes','user_profiles','push_subscriptions','push_jobs','push_deliveries','group_invites'] loop
   begin
     execute format('select count(*) from public.%I',t) into n;
     if n<>0 then raise exception 'TEST: restricted data visible in %',t; end if;
   exception when insufficient_privilege then null; end;
 end loop;
 begin
   perform public.save_group_invite(gen_random_uuid(),-1,'Intruso','intruder@example.invalid',true,gen_random_uuid()); raise exception 'TEST: member administered invites';
 exception when insufficient_privilege then null; end;
 begin
   perform public.captain_action(gen_random_uuid(),0,gen_random_uuid(),'pick','{}'); raise exception 'TEST: definer captain bypass';
 exception when insufficient_privilege then null; end;
 begin
   perform public.cast_fixture_vote(gen_random_uuid(),gen_random_uuid(),member,0,gen_random_uuid()); raise exception 'TEST: definer vote bypass';
 exception when insufficient_privilege then null; end;
 begin
   perform public.close_fixture_poll(gen_random_uuid(),gen_random_uuid()); raise exception 'TEST: definer close bypass';
 exception when insufficient_privilege then null; end;
 begin
   perform public.group_member_for_user(admin); raise exception 'TEST: user inspected another membership';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.user_profiles(id,display_name) values(member,'Blocked profile') on conflict(id) do update set display_name=excluded.display_name;
   raise exception 'TEST: blocked profile write';
 exception when insufficient_privilege then null; end;
 begin
   insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',member::text||'/'||gen_random_uuid()::text||'.jpg',member::text);
   raise exception 'TEST: blocked photo upload';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','email','gon.herrera.dev@gmail.com')::text,true);
 version_before:=invite.version;
 select * into invite from public.save_group_invite(invite.id,version_before,invite.display_name,invite.email,true,first_op);
 perform set_config('test.invite',invite.id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',member,'role','authenticated','email','stale-claim@example.invalid')::text,true);
 if not public.is_group_member() or not (public.my_group_access()->>'allowed')::boolean then raise exception 'TEST: approved verified user denied'; end if;
 -- Confirmation binds to the verified auth row, not a token's editable metadata.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','email','gon.herrera.dev@gmail.com')::text,true);
 select first_access_at into before_stamp from public.group_invites where id=invite.id;
 if before_stamp is null then raise exception 'TEST: first access missing'; end if;
 select * into invite from public.save_group_invite(invite.id,invite.version,invite.display_name,invite.email,false,gen_random_uuid());
 select * into invite from public.save_group_invite(invite.id,version_before,invite.display_name,invite.email,true,first_op);
 if invite.active then raise exception 'TEST: old lost response retry reactivated revoked user'; end if;
 begin
   perform public.save_group_invite(invite.id,version_before,invite.display_name,invite.email,true,gen_random_uuid()); raise exception 'TEST: stale version accepted';
 exception when serialization_failure then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',member,'role','authenticated','email','gon.herrera.dev@gmail.com')::text,true);
 if (public.my_group_access()->>'allowed')::boolean then raise exception 'TEST: revocation ignored by old session'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','email','gon.herrera.dev@gmail.com')::text,true);
 select * into invite from public.group_invites where email='gon.herrera.dev@gmail.com';
 begin
   perform public.save_group_invite(invite.id,invite.version,invite.display_name,invite.email,false,gen_random_uuid()); raise exception 'TEST: admin self-disabled';
 exception when raise_exception then if sqlerrm='TEST: admin self-disabled' then raise; end if; end;
 perform public.save_group_invite(gen_random_uuid(),-1,'Nuevo invitado',current_setting('test.new_email'),true,gen_random_uuid());
end $$;
reset role;
-- Exercise Auth's insert trigger with synthetic rows; all account writes roll back.
do $$ begin
 begin
   insert into auth.users(id,email) values(gen_random_uuid(),'blocked-'||gen_random_uuid()::text||'@example.invalid');
   raise exception 'TEST: uninvited signup accepted';
 exception when insufficient_privilege then null; end;
 insert into auth.users(id,email,aud,role) values(current_setting('test.new_id')::uuid,current_setting('test.new_email'),'authenticated','authenticated');
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.new_id'),'role','authenticated','email',current_setting('test.new_email'))::text,true);
do $$ begin
 if public.is_group_member() then raise exception 'TEST: unverified email accepted'; end if;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('test.new_id')::uuid;
reset role;
set local role authenticated;
do $$ begin
 if not (public.my_group_access()->>'allowed')::boolean then raise exception 'TEST: invited verified signup denied'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.group_invites where email=current_setting('test.new_email') and user_id=current_setting('test.new_id')::uuid and first_access_at is not null) then raise exception 'TEST: invite not bound at first access'; end if;
end $$;
select 'PASS: canonical identity, allowlist, first access, RLS, private RPCs, storage, admin isolation, CAS, lost-response retry, immediate revocation, verified signup and signup rejection' as result;
rollback;
