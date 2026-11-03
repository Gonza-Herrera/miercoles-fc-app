-- Synthetic events only; all changes and temporary fixture authorizations roll back.
begin;
update public.group_invites set active=true;
select set_config('test.admin',id::text,true) from auth.users where email='gon.herrera.dev@gmail.com';
select set_config('test.player',id::text,true) from auth.users where email<>'gon.herrera.dev@gmail.com' and email_confirmed_at is not null order by created_at,id limit 1;
set local role authenticated;
do $$
declare a text:=current_setting('test.admin'); p text:=current_setting('test.player'); e public.event_records; started public.event_records;
 d jsonb; baseline jsonb; cancellation jsonb; operation uuid:=gen_random_uuid(); version_before bigint;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','gon.herrera.dev@gmail.com','role','authenticated')::text,true);
 d:=jsonb_build_object('title','Cancellation integration test','date','2026-11-04','time','22:00','location','Test','pitchPrice',55000,'status','open','dinnerTitle','Menú de prueba','dinnerShopperPlayerId',p,
 'matchPlayedPlayerIds','[]'::jsonb,'dinnerAttendedPlayerIds','[]'::jsonb,'menuItems',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Pan comprado','icon','🥖','amount',100)),
 'teams',jsonb_build_object('teams',jsonb_build_array(jsonb_build_object('id','team_1','name','Equipo A','playerIds',jsonb_build_array(a)),jsonb_build_object('id','team_2','name','Equipo B','playerIds',jsonb_build_array(p)))));
 begin
   insert into public.event_records(data) values(d||jsonb_build_object('status','cancelled','cancellationReason','No permitido')); raise exception 'TEST: created cancelled event';
 exception when raise_exception then if sqlerrm='TEST: created cancelled event' then raise; end if; end;
 begin
   insert into public.event_records(data) values(d||'{"cancellationReason":"Spoof"}'); raise exception 'TEST: created false cancellation metadata';
 exception when raise_exception then if sqlerrm='TEST: created false cancellation metadata' then raise; end if; end;
 insert into public.event_records(data) values(d) returning * into e;
 insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(e.id,a::uuid,true,true,jsonb_build_object('id',a,'name','Admin test'));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p,'email','player@test.invalid','role','authenticated')::text,true);
 insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(e.id,p::uuid,true,true,jsonb_build_object('id',p,'name','Player test'));
 begin
   perform public.save_event(e.id,e.version,e.data||'{"status":"cancelled","cancellationReason":"Mal clima"}',gen_random_uuid()); raise exception 'TEST: player cancelled event';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','gon.herrera.dev@gmail.com','role','authenticated')::text,true);
 begin
   perform public.save_event(e.id,e.version,e.data||'{"cancelledAt":"2020-01-01"}',gen_random_uuid()); raise exception 'TEST: forged metadata without cancellation';
 exception when raise_exception then if sqlerrm='TEST: forged metadata without cancellation' then raise; end if; end;
 begin
   perform public.save_event(e.id,e.version,e.data||'{"status":"cancelled","cancellationReason":"  "}',gen_random_uuid()); raise exception 'TEST: empty cancellation reason accepted';
 exception when raise_exception then if sqlerrm='TEST: empty cancellation reason accepted' then raise; end if; end;
 begin
   perform public.save_event(e.id,e.version,e.data||'{"status":"cancelled","cancellationReason":"Mal clima","pitchPrice":1}',gen_random_uuid()); raise exception 'TEST: cancellation changed price';
 exception when raise_exception then if sqlerrm='TEST: cancellation changed price' then raise; end if; end;
 baseline:=e.data; version_before:=e.version;
 cancellation:=e.data||jsonb_build_object('status','cancelled','cancellationReason','  Mal clima  ','cancelledBy',p,'cancelledAt','2020-01-01');
 select * into e from public.save_event(e.id,e.version,cancellation,operation);
 if e.data->>'status'<>'cancelled' or e.data->>'cancellationReason'<>'Mal clima' or e.data->>'cancelledBy'<>a or e.data->>'cancelledAt'='2020-01-01' or e.version<>version_before+1 then raise exception 'TEST: cancellation audit fields invalid'; end if;
 if e.data-array['cancelledAt','cancelledBy','cancellationReason','status']<>baseline-'status' then raise exception 'TEST: cancellation modified records'; end if;
 if (select count(*) from public.event_rsvps where event_id=e.id and plays_soccer and attends_dinner)<>2 then raise exception 'TEST: cancellation removed RSVPs'; end if;
 select * into e from public.save_event(e.id,version_before,cancellation,operation);
 if e.version<>version_before+1 then raise exception 'TEST: lost response retry changed cancellation'; end if;
 begin
   perform public.save_event(e.id,e.version,e.data||'{"status":"open"}',gen_random_uuid()); raise exception 'TEST: reopened cancelled event';
 exception when raise_exception then if sqlerrm='TEST: reopened cancelled event' then raise; end if; end;
 begin
   perform public.save_event(e.id,e.version,e.data||'{"cancellationReason":"Changed reason"}',gen_random_uuid()); raise exception 'TEST: changed cancellation audit';
 exception when raise_exception then if sqlerrm='TEST: changed cancellation audit' then raise; end if; end;
 begin
   perform public.dinner_item_action(e.id,e.version,gen_random_uuid(),'remove',jsonb_build_object('itemId',e.data#>>'{menuItems,0,id}')); raise exception 'TEST: edited cancelled dinner';
 exception when raise_exception then if sqlerrm='TEST: edited cancelled dinner' then raise; end if; end;
 begin
   perform public.captain_action(e.id,e.version,gen_random_uuid(),'classic','{}'); raise exception 'TEST: edited cancelled teams';
 exception when raise_exception then if sqlerrm='TEST: edited cancelled teams' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p,'email','player@test.invalid','role','authenticated')::text,true);
 begin
   update public.event_rsvps set plays_soccer=false where event_id=e.id and player_id=p::uuid; raise exception 'TEST: changed cancelled RSVP';
 exception when insufficient_privilege then null; when raise_exception then if sqlerrm='TEST: changed cancelled RSVP' then raise; end if; end;
 -- A new date can be created. Starting it wins over a stale cancellation form.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','gon.herrera.dev@gmail.com','role','authenticated')::text,true);
 insert into public.event_records(data) values(d) returning * into started;
 insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(started.id,a::uuid,true,true,jsonb_build_object('id',a,'name','Admin test'));
 version_before:=started.version;
 select * into started from public.save_event(started.id,started.version,started.data||'{"status":"playing"}',gen_random_uuid());
 begin
   perform public.save_event(started.id,version_before,d||'{"status":"cancelled","cancellationReason":"Mal clima"}',gen_random_uuid()); raise exception 'TEST: stale cancellation overwrote started match';
 exception when serialization_failure then null; end;
 begin
   perform public.save_event(started.id,started.version,started.data||'{"status":"cancelled","cancellationReason":"Mal clima"}',gen_random_uuid()); raise exception 'TEST: cancelled started match';
 exception when raise_exception then if sqlerrm='TEST: cancelled started match' then raise; end if; end;
end $$;
reset role;
select 'PASS: admin-only cancellation before start, required reason, server audit, records preserved, immutable terminal state, retry, RSVP/expense/team locking and stale start conflict' result;
rollback;
