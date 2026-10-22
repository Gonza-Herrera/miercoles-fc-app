-- All fixture writes roll back. Uses real users only to exercise actual roles/RLS/RPCs.
begin;
select set_config('test.admin_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true),set_config('test.admin_id',id::text,true)
 from auth.users where email='gon.herrera.dev@gmail.com';
select set_config('test.player_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true),set_config('test.player_id',id::text,true)
 from auth.users where email<>'gon.herrera.dev@gmail.com' order by created_at,id limit 1;
select set_config('test.second_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true),set_config('test.second_id',id::text,true)
 from auth.users where email<>'gon.herrera.dev@gmail.com' order by created_at,id offset 1 limit 1;
select set_config('test.outside_claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true),set_config('test.outside_id',id::text,true)
 from auth.users where email<>'gon.herrera.dev@gmail.com' order by created_at,id offset 2 limit 1;
select set_config('request.jwt.claims',current_setting('test.admin_claims'),true);
set local role authenticated;
do $$
declare e uuid; d jsonb; a text:=auth.uid()::text; b text:=current_setting('test.player_id'); c text:=current_setting('test.second_id');
begin
 d:=jsonb_build_object('title','Voting integration test','date','2026-10-21','time','22:00','location','Test','pitchPrice',100,
   'status','open','matchPlayedPlayerIds','[]'::jsonb,'dinnerAttendedPlayerIds','[]'::jsonb,'menuItems','[]'::jsonb,
   'teams',jsonb_build_object('teams',jsonb_build_array(jsonb_build_object('id','A','name','Equipo A','playerIds',jsonb_build_array(a,b)),jsonb_build_object('id','B','name','Equipo B','playerIds',jsonb_build_array(c)))));
 insert into public.event_records(data) values(d) returning id into e;
 perform set_config('test.event_id',e::text,true);
 insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player)
   values(e,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Admin test'));
end $$;
select set_config('request.jwt.claims',current_setting('test.player_claims'),true);
insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player)
 values(current_setting('test.event_id')::uuid,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Player test'));
select set_config('request.jwt.claims',current_setting('test.second_claims'),true);
insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player)
 values(current_setting('test.event_id')::uuid,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Second test'));
select set_config('request.jwt.claims',current_setting('test.admin_claims'),true);
do $$
declare e uuid:=current_setting('test.event_id')::uuid; d jsonb; v bigint; f jsonb; empty_fixture jsonb; removable jsonb; sports jsonb; ballot public.fixture_votes;
begin
 select data,version into d,v from public.event_records where id=e;
 perform public.save_event(e,v,d||'{"status":"playing"}',gen_random_uuid());
 select data,version into d,v from public.event_records where id=e;
 perform public.save_event(e,v,d||jsonb_build_object('status','dinner','matchPlayedPlayerIds',jsonb_build_array(auth.uid()::text,current_setting('test.player_id'),current_setting('test.second_id'))),gen_random_uuid());
 f:=jsonb_build_object('id',gen_random_uuid(),'homeTeamId','A','awayTeamId','B','homeScore',0,'awayScore',0,'players','[]'::jsonb,'mvpPlayerId',null);
 empty_fixture:=jsonb_set(f,'{id}',to_jsonb(gen_random_uuid()::text));
 removable:=jsonb_set(f,'{id}',to_jsonb(gen_random_uuid()::text));
 sports:=jsonb_build_object('fixtures',jsonb_build_array(f,empty_fixture,removable));
 perform set_config('test.fixture_id',f->>'id',true); perform set_config('test.empty_id',empty_fixture->>'id',true);
 begin
   perform public.save_event_sports(e,-1,jsonb_set(sports,'{fixtures,0,mvpPlayerId}',to_jsonb(auth.uid()::text)),gen_random_uuid());
   raise exception 'TEST: admin assigned a new MVP';
 exception when raise_exception then if sqlerrm='TEST: admin assigned a new MVP' then raise; end if; end;
 perform public.save_event_sports(e,-1,sports,gen_random_uuid());
 if (select count(*) from public.fixture_polls where event_id=e)<>3 then raise exception 'TEST: polls not created'; end if;
 if exists(select 1 from public.fixture_polls where event_id=e and (closed_at is not null or vote_count is not null or cardinality(winner_player_ids)>0)) then raise exception 'TEST: open results leaked'; end if;
 -- A no-vote open fixture can be removed; its unused poll is also removed.
 sports:=jsonb_build_object('fixtures',jsonb_build_array(f,empty_fixture));
 perform public.save_event_sports(e,0,sports,gen_random_uuid());
 if (select count(*) from public.fixture_polls where event_id=e)<>2 then raise exception 'TEST: unused poll not removed'; end if;
 perform set_config('test.sports',sports::text,true);
 perform set_config('test.admin_op',gen_random_uuid()::text,true);
 select * into ballot from public.cast_fixture_vote(e,(f->>'id')::uuid,current_setting('test.player_id')::uuid,-1,current_setting('test.admin_op')::uuid);
 perform public.cast_fixture_vote(e,(f->>'id')::uuid,current_setting('test.player_id')::uuid,-1,current_setting('test.admin_op')::uuid);
 if ballot.version<>0 or (select count(*) from public.fixture_votes where event_id=e)<>1 then raise exception 'TEST: duplicate vote'; end if;
 begin
   perform public.cast_fixture_vote(e,(f->>'id')::uuid,auth.uid(),0,gen_random_uuid());
   raise exception 'TEST: self vote accepted';
 exception when raise_exception then if sqlerrm='TEST: self vote accepted' then raise; end if; end;
 begin
   perform public.save_event_sports(e,1,jsonb_build_object('fixtures',jsonb_build_array(empty_fixture)),gen_random_uuid());
   raise exception 'TEST: removed voted fixture';
 exception when raise_exception then if sqlerrm='TEST: removed voted fixture' then raise; end if; end;
 begin
   perform public.save_event_sports(e,1,jsonb_set(jsonb_set(sports,'{fixtures,0,homeTeamId}','"B"'),'{fixtures,0,awayTeamId}','"A"'),gen_random_uuid());
   raise exception 'TEST: changed voting teams';
 exception when raise_exception then if sqlerrm='TEST: changed voting teams' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',current_setting('test.player_claims'),true);
do $$
declare e uuid:=current_setting('test.event_id')::uuid; f uuid:=current_setting('test.fixture_id')::uuid; op uuid:=gen_random_uuid();
begin
 if (select count(*) from public.fixture_votes where event_id=e)<>0 then raise exception 'TEST: read another voter'; end if;
 perform public.cast_fixture_vote(e,f,current_setting('test.admin_id')::uuid,-1,op);
 perform public.cast_fixture_vote(e,f,current_setting('test.second_id')::uuid,0,gen_random_uuid());
 perform public.cast_fixture_vote(e,f,current_setting('test.admin_id')::uuid,1,gen_random_uuid());
 if (select count(*) from public.fixture_votes where event_id=e)<>1 or (select version from public.fixture_votes where event_id=e)<>2 then raise exception 'TEST: vote change duplicated'; end if;
 begin
   perform public.cast_fixture_vote(e,f,current_setting('test.admin_id')::uuid,-1,gen_random_uuid());
   raise exception 'TEST: stale vote overwrote current';
 exception when serialization_failure then null; end;
 begin
   perform public.cast_fixture_vote(e,f,current_setting('test.outside_id')::uuid,2,gen_random_uuid());
   raise exception 'TEST: outsider candidate';
 exception when raise_exception then if sqlerrm='TEST: outsider candidate' then raise; end if; end;
 begin
   perform public.close_fixture_poll(e,f); raise exception 'TEST: player closed poll';
 exception when insufficient_privilege then null; end;
 begin
   update public.fixture_polls set winner_player_ids=array[auth.uid()] where event_id=e;
   raise exception 'TEST: direct poll write';
 exception when insufficient_privilege then null; end;
 begin
   update public.fixture_votes set candidate_id=auth.uid() where event_id=e;
   raise exception 'TEST: direct vote write';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',current_setting('test.outside_claims'),true);
do $$
begin
 begin
   perform public.cast_fixture_vote(current_setting('test.event_id')::uuid,current_setting('test.fixture_id')::uuid,current_setting('test.admin_id')::uuid,-1,gen_random_uuid());
   raise exception 'TEST: outsider voted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',current_setting('test.admin_claims'),true);
do $$
declare e uuid:=current_setting('test.event_id')::uuid; f uuid:=current_setting('test.fixture_id')::uuid; poll public.fixture_polls; d jsonb; v bigint;
begin
 if (select count(*) from public.fixture_votes where event_id=e)<>1 then raise exception 'TEST: admin read other ballots'; end if;
 select * into poll from public.close_fixture_poll(e,f);
 if poll.vote_count<>2 or cardinality(poll.winner_player_ids)<>2 or not(auth.uid()=any(poll.winner_player_ids)) or not(current_setting('test.player_id')::uuid=any(poll.winner_player_ids)) then raise exception 'TEST: tied figures wrong'; end if;
 perform public.close_fixture_poll(e,f); -- Idempotent close.
 select * into poll from public.close_fixture_poll(e,current_setting('test.empty_id')::uuid);
 if poll.vote_count<>0 or cardinality(poll.winner_player_ids)<>0 then raise exception 'TEST: empty poll awarded MVP'; end if;
 perform public.cast_fixture_vote(e,f,current_setting('test.player_id')::uuid,-1,current_setting('test.admin_op')::uuid); -- Lost response retry after close.
 begin
   perform public.cast_fixture_vote(e,f,current_setting('test.second_id')::uuid,0,gen_random_uuid());
   raise exception 'TEST: changed closed vote';
 exception when raise_exception then if sqlerrm='TEST: changed closed vote' then raise; end if; end;
 begin
   perform public.save_event_sports(e,1,'{"fixtures":[]}',gen_random_uuid()); raise exception 'TEST: removed closed results';
 exception when raise_exception then if sqlerrm='TEST: removed closed results' then raise; end if; end;
 select data,version into d,v from public.event_records where id=e;
 perform public.save_event(e,v,d||jsonb_build_object('status','completed','dinnerAttendedPlayerIds',jsonb_build_array(auth.uid()::text,current_setting('test.player_id'))),gen_random_uuid());
 perform public.save_event_sports(e,1,jsonb_set(current_setting('test.sports')::jsonb,'{fixtures,0,homeScore}','1'),gen_random_uuid()); -- Sporting corrections preserve vote snapshots.
 if (select vote_count from public.fixture_polls where event_id=e and fixture_id=f)<>2 then raise exception 'TEST: correction reset poll'; end if;
end $$;
set local role anon;
do $$
begin
 begin
   perform public.close_fixture_poll(current_setting('test.event_id')::uuid,current_setting('test.fixture_id')::uuid);
   raise exception 'TEST: anonymous RPC access';
 exception when insufficient_privilege then null; end;
end $$;
select 'PASS: voter eligibility, private ballots, changes, idempotency, ties, zero votes, closure and immutable history' as verification;
rollback;
