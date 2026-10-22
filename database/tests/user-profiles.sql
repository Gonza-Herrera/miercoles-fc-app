-- Existing identities, all profile/storage metadata changes rolled back.
begin;
-- Authorize fixture identities for this isolated transaction only; ROLLBACK restores access.
update public.group_invites set active=true;
select set_config('test.profile_a',id::text,true) from auth.users order by created_at,id limit 1;
select set_config('test.profile_b',id::text,true) from auth.users order by created_at,id offset 1 limit 1;
set local role authenticated;
do $$
declare a uuid:=current_setting('test.profile_a')::uuid; b uuid:=current_setting('test.profile_b')::uuid; affected int;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','email','profile-test@example.invalid')::text,true);
 insert into public.user_profiles(id,display_name) values(a,'Gonza de prueba') on conflict(id) do update set display_name=excluded.display_name;
 if (select display_name from public.user_profiles where id=a)<>'Gonza de prueba' then raise exception 'TEST: own save failed'; end if;
 begin
   insert into public.user_profiles(id,display_name) values(b,'Nombre ajeno') on conflict(id) do update set display_name=excluded.display_name;
   raise exception 'TEST: other profile write allowed';
 exception when insufficient_privilege then null; end;
 update public.user_profiles set display_name='Nombre ajeno' where id=b;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'TEST: changed someone else'; end if;
 begin
   update public.user_profiles set avatar_path=b::text||'/'||gen_random_uuid()::text||'.jpg' where id=a;
   raise exception 'TEST: foreign avatar path allowed';
 exception when check_violation then null; end;
 begin
   update public.user_profiles set display_name='  ' where id=a;
   raise exception 'TEST: blank name allowed';
 exception when check_violation then null; end;
 update public.user_profiles set avatar_path=a::text||'/'||gen_random_uuid()::text||'.jpg',use_google_avatar=false where id=a;
 insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',a::text||'/'||gen_random_uuid()::text||'.jpg',a::text);
 begin
   insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',b::text||'/'||gen_random_uuid()::text||'.jpg',a::text);
   raise exception 'TEST: foreign storage folder allowed';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','email','profile-test-b@example.invalid')::text,true);
 if (select display_name from public.user_profiles where id=a)<>'Gonza de prueba' then raise exception 'TEST: participants cannot read display name'; end if;
 update public.user_profiles set display_name='Intruso' where id=a;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'TEST: second user changed profile'; end if;
end $$;
reset role;
select 'PASS: own profile save, shared display names, foreign writes blocked, avatar ownership, name validation and storage policies' as result;
rollback;
