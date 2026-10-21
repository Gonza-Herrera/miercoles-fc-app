-- Integration checks use real RLS/RPC/trigger code. All fixture writes roll back.
begin;
select set_config('test.admin_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true) from auth.users where email='gon.herrera.dev@gmail.com';
select set_config('test.player_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true),set_config('test.player_id',id::text,true) from auth.users where email <> 'gon.herrera.dev@gmail.com' order by created_at limit 1;
select set_config('request.jwt.claims',current_setting('test.admin_claims'),true);
set local role authenticated;
do $$
declare e uuid; d jsonb;
begin
 d := jsonb_build_object('title','Integration test','date','2026-10-21','time','22:00','location','Test','pitchPrice',55000.01,'status','open','matchPlayedPlayerIds','[]'::jsonb,'dinnerAttendedPlayerIds','[]'::jsonb,'menuItems','[]'::jsonb);
 insert into public.event_records(data) values(d) returning id into e;
 perform set_config('test.event_id',e::text,true);
 insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(e,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Admin test'));
end $$;
select set_config('request.jwt.claims',current_setting('test.player_claims'),true);
do $$
declare e uuid := current_setting('test.event_id')::uuid;
begin
 insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(e,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Player test'));
 if not exists(select 1 from public.event_records where id=e) then raise exception 'Player read failed'; end if;
 begin
   perform public.set_event_payment(e,'pitch',auth.uid(),true,gen_random_uuid());
   raise exception 'Non-admin payment was accepted';
 exception when insufficient_privilege then null; end;
 begin
   perform public.save_event(e,0,'{}',gen_random_uuid());
   raise exception 'Non-admin save was accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',current_setting('test.admin_claims'),true);
do $$
declare e uuid := current_setting('test.event_id')::uuid; d jsonb; op uuid := gen_random_uuid(); v bigint; player uuid := current_setting('test.player_id')::uuid; payment uuid; void_op uuid := gen_random_uuid(); total numeric;
begin
 select data into d from public.event_records where id=e;
 -- Two devices loaded version 0. First succeeds, second must conflict.
 perform public.save_event(e,0,d||'{"dinnerTitle":"Cena test"}',op);
 perform public.save_event(e,0,d||'{"dinnerTitle":"Cena test"}',op);
 select version into v from public.event_records where id=e;
 if v <> 1 then raise exception 'Retry was not idempotent'; end if;
 begin
   perform public.save_event(e,0,d||'{"dinnerTitle":"Stale session"}',gen_random_uuid());
   raise exception 'Stale save overwrote a newer version';
 exception when serialization_failure then null; end;
 begin
   perform public.set_event_payment(e,'pitch',player,true,gen_random_uuid());
   raise exception 'Payment allowed before closure';
 exception when raise_exception then
   if sqlerrm='Payment allowed before closure' then raise; end if;
 end;
 select data,version into d,v from public.event_records where id=e;
 perform public.save_event(e,v,d||'{"status":"playing"}',gen_random_uuid());
 select data,version into d,v from public.event_records where id=e;
 d := d || jsonb_build_object('status','dinner','matchPlayedPlayerIds',jsonb_build_array(auth.uid()::text,player::text),'menuItems',jsonb_build_array(jsonb_build_object('id','item','name','Comida','amount',100.01)));
 perform public.save_event(e,v,d,gen_random_uuid());
 select data,version into d,v from public.event_records where id=e;
 if not (d ? 'matchClosedAt') then raise exception 'No server match closure timestamp'; end if;
 begin
   perform public.save_event(e,v,d||'{"pitchPrice":1}',gen_random_uuid());
   raise exception 'Closed pitch share changed';
 exception when raise_exception then
   if sqlerrm='Closed pitch share changed' then raise; end if;
 end;
 perform public.set_event_payment(e,'pitch',player,true,gen_random_uuid());
 perform public.set_event_payment(e,'pitch',player,true,gen_random_uuid());
 if (select count(*) from public.event_payments where event_id=e and kind='pitch' and player_id=player and voided_at is null) <> 1 then raise exception 'Duplicate active payment'; end if;
 perform public.set_event_payment(e,'pitch',auth.uid(),true,gen_random_uuid());
 select sum(amount) into total from public.event_payments where event_id=e and kind='pitch' and voided_at is null;
 if total <> 55000.01 then raise exception 'Pitch remainder mismatch: %',total; end if;
 d := d || jsonb_build_object('status','completed','dinnerAttendedPlayerIds',jsonb_build_array(auth.uid()::text,player::text));
 perform public.save_event(e,v,d,gen_random_uuid());
 perform public.set_event_payment(e,'dinner',player,true,gen_random_uuid());
 perform public.set_event_payment(e,'dinner',auth.uid(),true,gen_random_uuid());
 select sum(amount) into total from public.event_payments where event_id=e and kind='dinner' and voided_at is null;
 if total <> 100.01 then raise exception 'Dinner remainder mismatch: %',total; end if;
 select id into payment from public.event_payments where event_id=e and kind='dinner' and player_id=player and voided_at is null;
 begin
   update public.event_payments set amount=1 where id=payment;
   raise exception 'Original payment amount was mutable';
 exception when raise_exception then
   if sqlerrm='Original payment amount was mutable' then raise; end if;
 end;
 perform public.set_event_payment(e,'dinner',player,false,void_op,payment);
 perform public.set_event_payment(e,'dinner',player,false,void_op,payment);
 if not exists(select 1 from public.event_payments where id=payment and voided_at is not null and voided_by=auth.uid()) then raise exception 'Audit missing'; end if;
 perform public.set_event_payment(e,'dinner',player,true,gen_random_uuid());
 -- An old cancellation retry must never cancel the newly recorded payment.
 perform public.set_event_payment(e,'dinner',player,false,void_op,payment);
 if (select count(*) from public.event_payments where event_id=e and kind='dinner' and voided_at is null) <> 2 then raise exception 'Old cancellation affected new payment'; end if;
 select data,version into d,v from public.event_records where id=e;
 begin
   perform public.save_event(e,v,d||'{"menuItems":[]}',gen_random_uuid());
   raise exception 'Final dinner expenses changed';
 exception when raise_exception then
   if sqlerrm='Final dinner expenses changed' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claims',current_setting('test.player_claims'),true);
do $$
begin
 begin
   update public.event_rsvps set attends_dinner=false where event_id=current_setting('test.event_id')::uuid and player_id=auth.uid();
   -- RLS may reject with zero rows; either behavior must leave the confirmation intact.
 exception when raise_exception or insufficient_privilege then null; end;
 if not exists(select 1 from public.event_rsvps where event_id=current_setting('test.event_id')::uuid and player_id=auth.uid() and attends_dinner) then raise exception 'Closed registration changed'; end if;
end $$;
rollback;
