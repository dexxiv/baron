-- Private persistence. Browsers use the authenticated game API, never these tables.
create table public.baron_rooms (
 id uuid primary key,
 code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
 version bigint not null default 1 check (version > 0),
 state jsonb not null check (jsonb_typeof(state) = 'object'),
 updated_at timestamptz not null default now()
);
create index baron_rooms_updated_idx on public.baron_rooms(updated_at);
alter table public.baron_rooms enable row level security;
revoke all on public.baron_rooms from public, anon, authenticated;
grant select, insert, update, delete on public.baron_rooms to service_role;

create table public.baron_rate_limits (
 key text primary key,
 hits integer not null,
 reset_at timestamptz not null
);
create index baron_rate_reset_idx on public.baron_rate_limits(reset_at);
alter table public.baron_rate_limits enable row level security;
revoke all on public.baron_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.baron_rate_limits to service_role;

-- Compare-and-swap: competing requests always re-read and revalidate the game.
create function public.baron_commit(p_id uuid, p_expected bigint, p_state jsonb, p_notify boolean default true)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v bigint;
begin
 update public.baron_rooms set state=p_state, version=version+1, updated_at=now()
 where id=p_id and version=p_expected returning version into v;
 if not found then return false; end if;
 if p_notify then
  perform realtime.send(jsonb_build_object('version',v), 'changed', 'baron:' || p_id::text, false);
 end if;
 return true;
end;
$$;
revoke all on function public.baron_commit(uuid,bigint,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.baron_commit(uuid,bigint,jsonb,boolean) to service_role;

create function public.baron_take_rate(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v integer;
begin
 delete from public.baron_rate_limits where reset_at < now() - interval '1 hour';
 insert into public.baron_rate_limits(key,hits,reset_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set
 hits=case when public.baron_rate_limits.reset_at <= now() then 1 else public.baron_rate_limits.hits+1 end,
 reset_at=case when public.baron_rate_limits.reset_at <= now() then now()+make_interval(secs=>p_seconds) else public.baron_rate_limits.reset_at end
 returning hits into v;
 return v <= p_limit;
end;
$$;
revoke all on function public.baron_take_rate(text,integer,integer) from public, anon, authenticated;
grant execute on function public.baron_take_rate(text,integer,integer) to service_role;
