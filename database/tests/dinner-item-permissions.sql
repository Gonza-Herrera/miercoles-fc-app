-- Isolated fixture: authorization and all expense/event writes roll back.
begin;
update public.group_invites set active=true;
select set_config('test.admin',id::text,true) from auth.users where email='gon.herrera.dev@gmail.com';
select set_config('test.shopper',id::text,true) from auth.users where email<>'gon.herrera.dev@gmail.com' and email_confirmed_at is not null order by created_at,id limit 1;
select set_config('test.other',id::text,true) from auth.users where email<>'gon.herrera.dev@gmail.com' and email_confirmed_at is not null order by created_at,id offset 1 limit 1;
set local role authenticated;
do $$
declare
 a text:=current_setting('test.admin'); s text:=current_setting('test.shopper'); o text:=current_setting('test.other');
 e public.event_records; base jsonb; payload jsonb; extra jsonb; first_op uuid:=gen_random_uuid(); first_version bigint; n int; target text;
 invite public.group_invites;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','gon.herrera.dev@gmail.com','role','authenticated')::text,true);
 insert into public.event_records(data) values(jsonb_build_object('title','Dinner shopper permission test','date','2026-11-04','time','22:00','location','Test','pitchPrice',55000,'status','open','dinnerTitle','Menú fijo','dinnerShopperPlayerId',s,'menuItems','[]'::jsonb,'matchPlayedPlayerIds','[]'::jsonb,'dinnerAttendedPlayerIds','[]'::jsonb)) returning * into e;
 foreach target in array array[a,s,o] loop
   perform set_config('request.jwt.claims',jsonb_build_object('sub',target,'email',case when target=a then 'gon.herrera.dev@gmail.com' else 'player@test.invalid' end,'role','authenticated')::text,true);
   insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(e.id,target::uuid,true,true,jsonb_build_object('id',target,'name','Dinner test'));
 end loop;
 payload:=jsonb_build_object('id',gen_random_uuid(),'name','Pan','amount',100.25,'icon','🥖','buyerPlayerId',s);
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'add',payload); raise exception 'TEST: ordinary user edited expenses';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',s,'email','shopper@test.invalid','role','authenticated')::text,true);
 base:=e.data-'menuItems'; first_version:=e.version;
 select * into e from public.dinner_item_action(e.id,e.version,first_op,'add',payload);
 if e.data-'menuItems'<>base or jsonb_array_length(e.data->'menuItems')<>1 then raise exception 'TEST: shopper altered non-expense fields'; end if;
 begin
   perform public.save_event(e.id,e.version,e.data||'{"pitchPrice":1,"dinnerTitle":"Hack"}',gen_random_uuid()); raise exception 'TEST: shopper gained general event save';
 exception when insufficient_privilege then null; end;
 update public.event_records set data=data||'{"pitchPrice":1}' where id=e.id;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'TEST: direct event update allowed'; end if;
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'add',payload||'{"status":"completed"}'); raise exception 'TEST: extra event fields accepted';
 exception when raise_exception then if sqlerrm='TEST: extra event fields accepted' then raise; end if; end;
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'add',payload||'{"amount":-1}'); raise exception 'TEST: negative expense accepted';
 exception when raise_exception then if sqlerrm='TEST: negative expense accepted' then raise; end if; end;
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'add',payload||jsonb_build_object('buyerPlayerId',gen_random_uuid())); raise exception 'TEST: outsider buyer accepted';
 exception when raise_exception then if sqlerrm='TEST: outsider buyer accepted' then raise; end if; end;
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'add',payload); raise exception 'TEST: duplicate item accepted';
 exception when unique_violation then null; end;
 -- Another session adds an item between a lost response and its retry.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','gon.herrera.dev@gmail.com','role','authenticated')::text,true);
 extra:=payload||jsonb_build_object('id',gen_random_uuid(),'name','Carne','amount',1000);
 select * into e from public.dinner_item_action(e.id,e.version,gen_random_uuid(),'add',extra);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',s,'email','shopper@test.invalid','role','authenticated')::text,true);
 select * into e from public.dinner_item_action(e.id,first_version,first_op,'add',payload);
 if jsonb_array_length(e.data->'menuItems')<>2 or e.data-'menuItems'<>base then raise exception 'TEST: replay lost newer expenses or changed the event'; end if;
 begin
   perform public.dinner_item_action(e.id,first_version,gen_random_uuid(),'add',extra); raise exception 'TEST: stale write accepted';
 exception when serialization_failure then null; end;
 begin
   perform public.dinner_item_action(e.id,first_version,first_op,'add',payload||'{"amount":2}'); raise exception 'TEST: changed replay accepted';
 exception when insufficient_privilege then null; end;
 select * into e from public.dinner_item_action(e.id,e.version,gen_random_uuid(),'remove',jsonb_build_object('itemId',extra->>'id'));
 if jsonb_array_length(e.data->'menuItems')<>1 then raise exception 'TEST: shopper cannot remove admin expense'; end if;
 -- Reassigning the shopper revokes the previous shopper, including retries.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','gon.herrera.dev@gmail.com','role','authenticated')::text,true);
 select * into e from public.save_event(e.id,e.version,e.data||jsonb_build_object('dinnerShopperPlayerId',o),gen_random_uuid());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',s,'email','shopper@test.invalid','role','authenticated')::text,true);
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'remove',jsonb_build_object('itemId',payload->>'id')); raise exception 'TEST: former shopper retained access';
 exception when insufficient_privilege then null; end;
 begin
   perform public.dinner_item_action(e.id,first_version,first_op,'add',payload); raise exception 'TEST: former shopper retried write';
 exception when insufficient_privilege then null; end;
 -- Group revocation is enforced even if the event still names that shopper.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','gon.herrera.dev@gmail.com','role','authenticated')::text,true);
 select * into invite from public.group_invites where user_id=o::uuid;
 select * into invite from public.save_group_invite(invite.id,invite.version,invite.display_name,invite.email,false,gen_random_uuid());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'email','player@test.invalid','role','authenticated')::text,true);
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'add',extra); raise exception 'TEST: revoked member edited expense';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','gon.herrera.dev@gmail.com','role','authenticated')::text,true);
 perform public.save_group_invite(invite.id,invite.version,invite.display_name,invite.email,true,gen_random_uuid());
 select * into e from public.save_event(e.id,e.version,e.data||'{"status":"playing"}',gen_random_uuid());
 select * into e from public.save_event(e.id,e.version,e.data||jsonb_build_object('status','dinner','matchPlayedPlayerIds',jsonb_build_array(a,s,o)),gen_random_uuid());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'email','player@test.invalid','role','authenticated')::text,true);
 select * into e from public.dinner_item_action(e.id,e.version,gen_random_uuid(),'add',extra);
 select * into e from public.dinner_item_action(e.id,e.version,gen_random_uuid(),'remove',jsonb_build_object('itemId',payload->>'id'));
 -- Admin alone closes actual attendance; then neither admin nor shopper edits expenses.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','gon.herrera.dev@gmail.com','role','authenticated')::text,true);
 select * into e from public.save_event(e.id,e.version,e.data||jsonb_build_object('status','completed','dinnerAttendedPlayerIds',jsonb_build_array(a,s,o)),gen_random_uuid());
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'add',payload); raise exception 'TEST: admin edited closed expense';
 exception when raise_exception then if sqlerrm='TEST: admin edited closed expense' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'email','player@test.invalid','role','authenticated')::text,true);
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'remove',jsonb_build_object('itemId',extra->>'id')); raise exception 'TEST: shopper edited closed expense';
 exception when raise_exception then if sqlerrm='TEST: shopper edited closed expense' then raise; end if; end;
end $$;
reset role;
select 'PASS: admin/shopper expenses, ordinary user denial, narrow writes, validation, CAS, retries, reassignment, membership revocation and dinner closure' result;
rollback;
