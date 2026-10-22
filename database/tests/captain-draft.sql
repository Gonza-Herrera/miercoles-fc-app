-- Integration test with existing identities, isolated event and full rollback.
begin;
-- Authorize fixture identities for this isolated transaction only; ROLLBACK restores access.
update public.group_invites set active=true;
select set_config('test.people',(select jsonb_agg(to_jsonb(u))::text from (select id,email from auth.users order by (email='gon.herrera.dev@gmail.com') desc,created_at,id limit 10) u),true);
set local role authenticated;
do $$
declare
 people jsonb:=current_setting('test.people')::jsonb; admin_claims jsonb; claims jsonb;
 e public.event_records; d jsonb; i int; chosen text; captain text; target text; next_id text;
 retry_operation uuid; retry_version bigint; retry_payload jsonb; prior_version bigint;
 cap_a text:=people#>>'{1,id}'; cap_b text:=people#>>'{2,id}'; old_captain text; new_captain text;
begin
 if jsonb_array_length(people)<10 or people#>>'{0,email}'<>'gon.herrera.dev@gmail.com' then raise exception 'TEST requires admin and nine players'; end if;
 admin_claims:=(people->0)||'{"role":"authenticated"}'; admin_claims:=admin_claims||jsonb_build_object('sub',people#>>'{0,id}');
 perform set_config('request.jwt.claims',admin_claims::text,true);
 d:=jsonb_build_object('title','Captain draft integration test','date','9998-10-28','time','22:00','location','Test','pitchPrice',55000,'status','open','matchPlayedPlayerIds','[]'::jsonb,'dinnerAttendedPlayerIds','[]'::jsonb,'menuItems','[]'::jsonb);
 insert into public.event_records(data) values(d) returning * into e;
 -- Register only seven at first. No real RSVP is edited.
 for i in 0..6 loop
   claims:=(people->i)||jsonb_build_object('role','authenticated','sub',people#>>array[i::text,'id']);
   perform set_config('request.jwt.claims',claims::text,true);
   insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(e.id,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Test '||i));
 end loop;
 begin
   perform public.captain_action(e.id,e.version,gen_random_uuid(),'random','{}'); raise exception 'TEST: regular player assigned captains';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',admin_claims::text,true);
 begin
   perform public.captain_action(e.id,e.version,gen_random_uuid(),'random','{}'); raise exception 'TEST: fewer than 8 accepted';
 exception when raise_exception then if sqlerrm='TEST: fewer than 8 accepted' then raise; end if; end;
 claims:=(people->7)||jsonb_build_object('role','authenticated','sub',people#>>'{7,id}');
 perform set_config('request.jwt.claims',claims::text,true);
 insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(e.id,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Test 7'));
 perform set_config('request.jwt.claims',admin_claims::text,true);
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'manual',jsonb_build_object('captainAId',cap_a,'captainBId',cap_b));
 if e.data#>>'{teams,teams,0,captainPlayerId}'<>cap_a or e.data#>>'{teams,teams,0,playerIds,0}'<>cap_a then raise exception 'TEST: captain not own player'; end if;
 begin
   perform public.save_event(e.id,e.version,jsonb_set(e.data,'{teams}','{"teams":[]}'),gen_random_uuid()); raise exception 'TEST: generic save bypass';
 exception when insufficient_privilege then null; end;
 begin
   perform public.captain_action(e.id,e.version,gen_random_uuid(),'pick',jsonb_build_object('playerId',people#>>'{3,id}')); raise exception 'TEST: admin picked for captain';
 exception when insufficient_privilege then null; end;
 for i in 1..6 loop
   next_id:=e.data#>>'{captainDraft,nextTeamId}';
   captain:=case when next_id='team_1' then cap_a else cap_b end;
   claims:=jsonb_build_object('role','authenticated','sub',captain,'email','captain@test.invalid');
   perform set_config('request.jwt.claims',claims::text,true);
   select r.player_id::text into chosen from public.event_rsvps r where r.event_id=e.id and plays_soccer and not exists(select 1 from jsonb_array_elements(e.data#>'{teams,teams}') t where t->'playerIds' @> jsonb_build_array(r.player_id::text)) order by player_id limit 1;
   if i=1 then retry_operation:=gen_random_uuid(); retry_version:=e.version; retry_payload:=jsonb_build_object('playerId',chosen);
     select * into e from public.captain_action(e.id,e.version,retry_operation,'pick',retry_payload);
     perform set_config('test.retry_actor',captain,true);
   else select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'pick',jsonb_build_object('playerId',chosen)); end if;
   if i=1 then
     begin
       perform public.captain_action(e.id,e.version,gen_random_uuid(),'pick',jsonb_build_object('playerId',chosen)); raise exception 'TEST: repeated turn accepted';
     exception when insufficient_privilege then null; end;
   end if;
 end loop;
 if not app_private.captain_teams_ready(e.id,e.data) then raise exception 'TEST: 4 vs 4 not ready'; end if;
 prior_version:=e.version;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.retry_actor'),'email','captain@test.invalid')::text,true);
 select * into e from public.captain_action(e.id,retry_version,retry_operation,'pick',retry_payload);
 if e.version<>prior_version then raise exception 'TEST: lost response replay changed event'; end if;
 begin
   perform public.captain_action(e.id,0,gen_random_uuid(),'pick',retry_payload); raise exception 'TEST: stale version accepted';
 exception when serialization_failure then null; end;
 -- Captains cannot edit the opposing team's positions.
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',cap_a,'email','captain@test.invalid')::text,true);
 begin
   perform public.captain_action(e.id,e.version,gen_random_uuid(),'position',jsonb_build_object('playerId',cap_b,'role','ARQ')); raise exception 'TEST: edited opponent';
 exception when insufficient_privilege then null; end;
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'position',jsonb_build_object('playerId',cap_a,'role','ARQ'));
 perform set_config('request.jwt.claims',admin_claims::text,true);
 begin
   perform public.save_event(e.id,e.version,e.data||'{"status":"playing"}',gen_random_uuid()); raise exception 'TEST: unconfirmed match started';
 exception when raise_exception then if sqlerrm='TEST: unconfirmed match started' then raise; end if; end;
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'confirm','{}');
 -- Two late arrivals must be drafted, even though a confirmation timestamp existed.
 for i in 8..9 loop
   claims:=(people->i)||jsonb_build_object('role','authenticated','sub',people#>>array[i::text,'id']);
   perform set_config('request.jwt.claims',claims::text,true);
   insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(e.id,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Late test '||i));
 end loop;
 perform set_config('request.jwt.claims',admin_claims::text,true);
 begin
   perform public.save_event(e.id,e.version,e.data||'{"status":"playing"}',gen_random_uuid()); raise exception 'TEST: pending late players ignored';
 exception when raise_exception then if sqlerrm='TEST: pending late players ignored' then raise; end if; end;
 for i in 8..9 loop
   next_id:=e.data#>>'{captainDraft,nextTeamId}'; captain:=case when next_id='team_1' then cap_a else cap_b end;
   perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',captain,'email','captain@test.invalid')::text,true);
   select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'pick',jsonb_build_object('playerId',people#>>array[i::text,'id']));
 end loop;
 -- Non-captain withdrawal with no spare: remove, rebalance, then a late return.
 select value into target from jsonb_array_elements_text(e.data#>'{teams,teams,0,playerIds}') where value<>cap_a limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',target,'email','player@test.invalid')::text,true);
 update public.event_rsvps set plays_soccer=false where event_id=e.id and player_id=target::uuid;
 perform set_config('request.jwt.claims',admin_claims::text,true);
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'remove',jsonb_build_object('outgoingId',target));
 if not app_private.captain_teams_ready(e.id,e.data) then raise exception 'TEST: removed non-captain left invalid roster'; end if;
 select value into chosen from jsonb_array_elements_text(e.data#>'{teams,teams,1,playerIds}') where value<>cap_b limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',cap_b,'email','captain@test.invalid')::text,true);
 begin
   perform public.captain_action(e.id,e.version,gen_random_uuid(),'move',jsonb_build_object('playerId',chosen)); raise exception 'TEST: captain moved teams';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',admin_claims::text,true);
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'move',jsonb_build_object('playerId',chosen));
 if not app_private.captain_teams_ready(e.id,e.data) then raise exception 'TEST: admin rebalance failed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',target,'email','player@test.invalid')::text,true);
 update public.event_rsvps set plays_soccer=true where event_id=e.id and player_id=target::uuid;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',cap_b,'email','captain@test.invalid')::text,true);
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'pick',jsonb_build_object('playerId',target));
 -- A captain withdraws: admin promotes a teammate without duplicating that teammate.
 old_captain:=cap_a;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',cap_a,'email','captain@test.invalid')::text,true);
 update public.event_rsvps set plays_soccer=false where event_id=e.id and player_id=cap_a::uuid;
 perform set_config('request.jwt.claims',admin_claims::text,true);
 select value into new_captain from jsonb_array_elements_text(e.data#>'{teams,teams,0,playerIds}') where value<>cap_a limit 1;
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'replace',jsonb_build_object('outgoingId',cap_a,'playerId',new_captain));
 if e.data#>>'{captainDraft,captainAId}'<>new_captain or jsonb_array_length(e.data#>'{teams,teams,0,playerIds}')<>4 then raise exception 'TEST: captain replacement failed'; end if;
 if not app_private.captain_teams_ready(e.id,e.data) then raise exception 'TEST: 4 vs 5 not ready'; end if;
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'confirm','{}');
 select * into e from public.save_event(e.id,e.version,e.data||'{"status":"playing"}',gen_random_uuid());
 begin
   perform public.captain_action(e.id,e.version,gen_random_uuid(),'classic','{}'); raise exception 'TEST: started teams reset';
 exception when raise_exception then if sqlerrm='TEST: started teams reset' then raise; end if; end;
 -- Close the synthetic match so it participates in the rotation history.
 select * into e from public.save_event(e.id,e.version,e.data||jsonb_build_object('status','dinner','matchPlayedPlayerIds',
   (select jsonb_agg(player_id::text) from public.event_rsvps where event_id=e.id and plays_soccer)),gen_random_uuid());
 -- A new date starts with a fresh roster. Previous captains are avoided.
 d:=jsonb_set(d,'{date}','"9998-11-04"');
 insert into public.event_records(data) values(d) returning * into e;
 for i in 0..9 loop
   perform set_config('request.jwt.claims',((people->i)||jsonb_build_object('role','authenticated','sub',people#>>array[i::text,'id']))::text,true);
   insert into public.event_rsvps(event_id,player_id,plays_soccer,attends_dinner,player) values(e.id,auth.uid(),true,true,jsonb_build_object('id',auth.uid(),'name','Test '||i));
 end loop;
 perform set_config('request.jwt.claims',admin_claims::text,true);
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'random','{}');
 if e.data#>>'{captainDraft,captainAId}' in (new_captain,cap_b) or e.data#>>'{captainDraft,captainBId}' in (new_captain,cap_b) then raise exception 'TEST: previous captains repeated with alternatives'; end if;
 if e.data#>>'{captainDraft,captainAId}'=e.data#>>'{captainDraft,captainBId}' then raise exception 'TEST: random captains repeated'; end if;
 -- Normal captains cannot reset or reequilibrate the draft.
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',e.data#>>'{captainDraft,captainAId}','email','captain@test.invalid')::text,true);
 begin
   perform public.captain_action(e.id,e.version,gen_random_uuid(),'classic','{}'); raise exception 'TEST: captain reset draft';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',admin_claims::text,true);
 select * into e from public.captain_action(e.id,e.version,gen_random_uuid(),'classic','{}');
 if e.data ? 'captainDraft' or jsonb_array_length(e.data#>'{teams,teams}')<>0 then raise exception 'TEST: classic reset failed'; end if;
 perform set_config('test.captain_result','PASS: permissions, min8, captain-player, turns, CAS, replay, positions, late arrivals, replacement, confirmation, removal, rebalance, closure, rotation and reset',true);
end $$;
reset role;
select current_setting('test.captain_result') result;
rollback;
