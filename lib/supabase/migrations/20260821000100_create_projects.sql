create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_clerk_id text not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  context text not null check (char_length(btrim(context)) between 1 and 8000),
  created_at timestamptz not null default now()
);

-- Earlier versions of the app used clerk_id and description for the same
-- values. Rename those columns in place so existing projects are preserved.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'clerk_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'owner_clerk_id'
  ) then
    alter table public.projects rename column clerk_id to owner_clerk_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'description'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'context'
  ) then
    alter table public.projects rename column description to context;
  end if;
end
$$;

create index if not exists projects_owner_created_at_idx
  on public.projects (owner_clerk_id, created_at desc);

alter table public.projects enable row level security;

revoke all on table public.projects from anon, authenticated;
