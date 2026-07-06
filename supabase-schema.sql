-- Creative Toolbox v2.4 Cloud Workspace
-- Run this in Supabase SQL Editor.
-- Before using anonymous identity, enable Anonymous sign-ins in:
-- Supabase Dashboard -> Authentication -> Sign In / Providers -> Anonymous sign-ins.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled Workspace',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.share_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token text not null unique,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_type text not null check (tool_type in ('design_board', 'timeline_planner', 'launch_checklist')),
  title text not null default '',
  payload_json jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (workspace_id, tool_type)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_workspaces_touch on public.workspaces;
create trigger trg_workspaces_touch
before update on public.workspaces
for each row execute function public.touch_updated_at();

drop trigger if exists trg_documents_touch on public.documents;
create trigger trg_documents_touch
before update on public.documents
for each row execute function public.touch_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.share_tokens enable row level security;
alter table public.documents enable row level security;

-- 权限辅助函数：SECURITY DEFINER 绕过 RLS，避免策略在 workspace_members 上自引用递归。
create or replace function public.is_member(p_workspace_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit(p_workspace_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

drop policy if exists "members can read workspaces" on public.workspaces;
create policy "members can read workspaces"
on public.workspaces
for select
using (public.is_member(id));

drop policy if exists "owners can update workspaces" on public.workspaces;
create policy "owners can update workspaces"
on public.workspaces
for update
using (public.can_edit(id))
with check (public.can_edit(id));

-- 非自引用：用户只读自己的成员记录（客户端列表用；协作读取走 SECURITY DEFINER 函数）。
drop policy if exists "members can read memberships" on public.workspace_members;
create policy "members can read memberships"
on public.workspace_members
for select
using (user_id = auth.uid());

drop policy if exists "members can read documents" on public.documents;
create policy "members can read documents"
on public.documents
for select
using (public.is_member(workspace_id));

drop policy if exists "editors can insert documents" on public.documents;
create policy "editors can insert documents"
on public.documents
for insert
with check (public.can_edit(workspace_id));

drop policy if exists "editors can update documents" on public.documents;
create policy "editors can update documents"
on public.documents
for update
using (public.can_edit(workspace_id))
with check (public.can_edit(workspace_id));

-- share_tokens：成员可读自己工作区的分享码（用于重新展示/复制分享链接）。兑换分享码走 RPC。
drop policy if exists "no direct share token read" on public.share_tokens;
drop policy if exists "members can read share tokens" on public.share_tokens;
create policy "members can read share tokens"
on public.share_tokens
for select
using (public.is_member(workspace_id));

create or replace function public.random_share_token()
returns text
language sql
as $$
  select lower(encode(gen_random_bytes(9), 'hex'));
$$;

create or replace function public.current_workspace_role(p_workspace_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.create_workspace(p_name text)
returns table (
  workspace_id uuid,
  workspace_name text,
  edit_token text,
  view_token text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_edit_token text;
  v_view_token text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.workspaces (name, owner_id)
  values (coalesce(nullif(trim(p_name), ''), 'Untitled Workspace'), auth.uid())
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, auth.uid(), 'owner');

  loop
    v_edit_token := public.random_share_token();
    exit when not exists (select 1 from public.share_tokens where token = v_edit_token);
  end loop;

  loop
    v_view_token := public.random_share_token();
    exit when not exists (select 1 from public.share_tokens where token = v_view_token);
  end loop;

  insert into public.share_tokens (workspace_id, token, role)
  values
    (v_workspace_id, v_edit_token, 'editor'),
    (v_workspace_id, v_view_token, 'viewer');

  return query
  select v_workspace_id, (select name from public.workspaces where id = v_workspace_id), v_edit_token, v_view_token, 'owner'::text;
end;
$$;

create or replace function public.accept_share_token(p_token text)
returns table (
  workspace_id uuid,
  workspace_name text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select st.workspace_id, st.role
  into v_workspace_id, v_role
  from public.share_tokens st
  where st.token = trim(p_token)
  limit 1;

  if v_workspace_id is null then
    raise exception 'Invalid share token';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, auth.uid(), v_role)
  on conflict (workspace_id, user_id)
  do update set role =
    case
      when workspace_members.role = 'owner' then 'owner'
      when workspace_members.role = 'editor' then 'editor'
      else excluded.role
    end;

  return query
  select v_workspace_id, (select name from public.workspaces where id = v_workspace_id), public.current_workspace_role(v_workspace_id);
end;
$$;

create or replace function public.get_or_create_document(
  p_workspace_id uuid,
  p_tool_type text,
  p_title text,
  p_default_payload jsonb
)
returns table (
  document_id uuid,
  workspace_id uuid,
  tool_type text,
  title text,
  payload_json jsonb,
  version integer,
  updated_at timestamptz,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_document_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_role := public.current_workspace_role(p_workspace_id);

  if v_role is null then
    raise exception 'No permission for workspace';
  end if;

  if p_tool_type not in ('design_board', 'timeline_planner', 'launch_checklist') then
    raise exception 'Invalid tool_type';
  end if;

  select d.id into v_document_id
  from public.documents d
  where d.workspace_id = p_workspace_id
    and d.tool_type = p_tool_type
  limit 1;

  if v_document_id is null then
    if v_role not in ('owner', 'editor') then
      return query
      select null::uuid, p_workspace_id, p_tool_type, coalesce(p_title, ''), p_default_payload, 0, now(), v_role;
      return;
    end if;

    insert into public.documents (workspace_id, tool_type, title, payload_json, updated_by)
    values (p_workspace_id, p_tool_type, coalesce(p_title, ''), coalesce(p_default_payload, '{}'::jsonb), auth.uid())
    returning id into v_document_id;
  end if;

  return query
  select d.id, d.workspace_id, d.tool_type, d.title, d.payload_json, d.version, d.updated_at, v_role
  from public.documents d
  where d.id = v_document_id;
end;
$$;

create or replace function public.update_document_payload(
  p_document_id uuid,
  p_payload jsonb,
  p_expected_version integer default null
)
returns table (
  document_id uuid,
  version integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_role text;
  v_current_version integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select d.workspace_id, d.version
  into v_workspace_id, v_current_version
  from public.documents d
  where d.id = p_document_id
  limit 1;

  if v_workspace_id is null then
    raise exception 'Document not found';
  end if;

  v_role := public.current_workspace_role(v_workspace_id);

  if v_role not in ('owner', 'editor') then
    raise exception 'Read-only workspace';
  end if;

  if p_expected_version is not null and p_expected_version <> v_current_version then
    raise exception 'Version conflict';
  end if;

  update public.documents
  set
    payload_json = coalesce(p_payload, '{}'::jsonb),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_document_id
  returning id, version, updated_at
  into document_id, version, updated_at;

  return next;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.workspaces to authenticated;
grant select, insert, update on public.workspace_members to authenticated;
grant select on public.share_tokens to authenticated;
grant select, insert, update on public.documents to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.can_edit(uuid) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.accept_share_token(text) to authenticated;
grant execute on function public.get_or_create_document(uuid, text, text, jsonb) to authenticated;
grant execute on function public.update_document_payload(uuid, jsonb, integer) to authenticated;
grant execute on function public.current_workspace_role(uuid) to authenticated;

-- Enable Realtime for document updates.
do $$
begin
  begin
    alter publication supabase_realtime add table public.documents;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
