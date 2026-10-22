-- Real RPC/RLS/trigger integration checks. Every test write is rolled back.
begin;
select set_config('test.admin_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true),set_config('test.admin_id',id::text,true)
 from auth.users where email='gon.herrera.dev@gmail.com';
select set_config('test.player_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true),set_config('test.player_id',id::text,true)
 from auth.users where email<>'gon.herrera.dev@gmail.com' order by created_at limit 1;
select set_config('request.jwt.claims',current_setting('test.admin_claims'),true);
set local role authenticated;
do $$
declare e uuid; d jsonb; stats jsonb; f jsonb; v bigint; op uuid:=gen_random_uuid(); a text:=auth.uid()::text; b text:=current_setting('test.player_id');
begin
 d:=jsonb_build_object('title','Sports integration test','date','2026-10-21','time','22:00','location','Test','pitchPrice',100,
   'status','open','matchPlayedPlayerIds','[]'::jsonb,'dinnerAttendedPlayerIds','[]'::jsonb,'menuItems','[]'::jsonb,
   'teams',jsonb_build_object('teams',jsonb_build_array(jsonb_build_object('id','A','name','Equipo A','playerIds',jsonb_build_array(a)),jsonb_build_object('id','B','name','Equipo B','playerIds',jsonb_build_array(b)))));
 insert into public.event_records(data) values(d) returning id into e;
 perform set_config('test.event_id',e::text,true);
 insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player)
   values(e,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Admin test'));
 f:=jsonb_build_object('id',gen_random_uuid(),'homeTeamId','A','awayTeamId','B','homeScore',2,'awayScore',1,'mvpPlayerId',null,
   'players',jsonb_build_array(jsonb_build_object('playerId',a,'goals',2,'assists',0),jsonb_build_object('playerId',b,'goals',1,'assists',0)));
 stats:=jsonb_build_object('fixtures',jsonb_build_array(f));
 perform set_config('test.stats',stats::text,true);
 begin
   perform public.save_event_sports(e,-1,stats,op);
   raise exception 'TEST: accepted open event';
 exception when raise_exception then if sqlerrm='TEST: accepted open event' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',current_setting('test.player_claims'),true);
insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player)
 values(current_setting('test.event_id')::uuid,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Player test'));
do $$
begin
 begin
   perform public.save_event_sports(current_setting('test.event_id')::uuid,-1,current_setting('test.stats')::jsonb,gen_random_uuid());
   raise exception 'TEST: player could save';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',current_setting('test.admin_claims'),true);
do $$
declare e uuid:=current_setting('test.event_id')::uuid; d jsonb; original jsonb; v bigint; stats jsonb:=current_setting('test.stats')::jsonb;
 op uuid:=gen_random_uuid(); saved public.event_sports; bad jsonb; a text:=auth.uid()::text; b text:=current_setting('test.player_id');
begin
 select data,version into d,v from public.event_records where id=e;
 perform public.save_event(e,v,d||'{"status":"playing"}',gen_random_uuid());
 select data,version into d,v from public.event_records where id=e;
 perform public.save_event(e,v,d||jsonb_build_object('status','dinner','matchPlayedPlayerIds',jsonb_build_array(a,b)),gen_random_uuid());
 select * into saved from public.save_event_sports(e,-1,stats,op);
 if saved.version<>0 then raise exception 'TEST: initial version'; end if;
 select * into saved from public.save_event_sports(e,-1,stats,op);
 if saved.version<>0 or (select count(*) from public.event_sports where event_id=e)<>1 then raise exception 'TEST: retry not idempotent'; end if;
 begin
   perform public.save_event_sports(e,-1,stats,gen_random_uuid());
   raise exception 'TEST: stale writer accepted';
 exception when serialization_failure then null; end;
 bad:=jsonb_set(stats,'{fixtures,0,players,0,goals}','3');
 begin
   perform public.save_event_sports(e,0,bad,gen_random_uuid());
   raise exception 'TEST: goals exceeded score';
 exception when raise_exception then if sqlerrm='TEST: goals exceeded score' then raise; end if; end;
 bad:=jsonb_set(stats,'{fixtures,0,players,0,assists}','1');
 begin
   perform public.save_event_sports(e,0,bad,gen_random_uuid());
   raise exception 'TEST: self assist accepted';
 exception when raise_exception then if sqlerrm='TEST: self assist accepted' then raise; end if; end;
 bad:=jsonb_set(stats,'{fixtures,0,players,0,playerId}',to_jsonb(gen_random_uuid()::text));
 begin
   perform public.save_event_sports(e,0,bad,gen_random_uuid());
   raise exception 'TEST: absent scorer accepted';
 exception when raise_exception then if sqlerrm='TEST: absent scorer accepted' then raise; end if; end;
 bad:=jsonb_set(stats,'{fixtures,0,mvpPlayerId}',to_jsonb(gen_random_uuid()::text));
 begin
   perform public.save_event_sports(e,0,bad,gen_random_uuid());
   raise exception 'TEST: absent mvp accepted';
 exception when raise_exception then if sqlerrm='TEST: absent mvp accepted' then raise; end if; end;
 bad:=jsonb_set(stats,'{fixtures,0,homeScore}','1.5');
 begin
   perform public.save_event_sports(e,0,bad,gen_random_uuid());
   raise exception 'TEST: decimal score accepted';
 exception when raise_exception then if sqlerrm='TEST: decimal score accepted' then raise; end if; end;
 bad:=jsonb_build_object('fixtures',jsonb_build_array(stats->'fixtures'->0,stats->'fixtures'->0));
 begin
   perform public.save_event_sports(e,0,bad,gen_random_uuid());
   raise exception 'TEST: duplicate fixture accepted';
 exception when raise_exception then if sqlerrm='TEST: duplicate fixture accepted' then raise; end if; end;
 select data,version into d,v from public.event_records where id=e;
 perform public.save_event(e,v,d||jsonb_build_object('status','completed','dinnerAttendedPlayerIds',jsonb_build_array(a,b)),gen_random_uuid());
 select data into original from public.event_records where id=e;
 -- Sports may be corrected after completion without touching closed event/financial data.
 stats:=jsonb_set(stats,'{fixtures,0,homeScore}','3');
 select * into saved from public.save_event_sports(e,0,stats,gen_random_uuid());
 if saved.version<>1 then raise exception 'TEST: correction version'; end if;
 if (select data from public.event_records where id=e) is distinct from original then raise exception 'TEST: sports changed closed event'; end if;
 perform set_config('test.final_stats',stats::text,true);
end $$;
select set_config('request.jwt.claims',current_setting('test.player_claims'),true);
do $$
declare e uuid:=current_setting('test.event_id')::uuid;
begin
 if not exists(select 1 from public.event_sports where event_id=e) then raise exception 'TEST: player cannot read'; end if;
 update public.event_sports set data='{"fixtures":[]}' where event_id=e;
 if (select data from public.event_sports where event_id=e) is distinct from current_setting('test.final_stats')::jsonb then raise exception 'TEST: player changed results'; end if;
 begin
   perform public.save_event_sports(e,1,'{"fixtures":[]}',gen_random_uuid());
   raise exception 'TEST: player RPC accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
