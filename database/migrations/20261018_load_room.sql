-- Service-only combined rate check and room load, reducing every request by a DB round trip.
create function public.baron_load_room(p_code text, p_session_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare room jsonb;
begin
 if not public.baron_take_rate('session:' || p_session_hash,180,60) then
  return jsonb_build_object('limited',true);
 end if;
 select to_jsonb(r) into room from public.baron_rooms r where r.code=p_code;
 return jsonb_build_object('room',room,'limited',false);
end;
$$;
revoke all on function public.baron_load_room(text,text) from public, anon, authenticated;
grant execute on function public.baron_load_room(text,text) to service_role;
