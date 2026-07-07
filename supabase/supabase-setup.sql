-- Creative Toolbox: anonymous cloud sharing
-- Run this entire file in Supabase SQL Editor.
-- Then create a PRIVATE Storage bucket named: creative-cloud-assets
-- Finally enable Anonymous Sign-Ins in Authentication > Providers.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.ct_cloud_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  tool_type text not null check (
    tool_type in (
      'creative-toolbox-design-board',
      'creative-toolbox-timeline',
      'creative-toolbox-launch-checklist'
    )
  ),
  name text not null default '未命名项目',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ct_cloud_project_members (
  project_id uuid not null references public.ct_cloud_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.ct_cloud_project_members
  add column if not exists expires_at timestamptz;

create table if not exists public.ct_cloud_share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ct_cloud_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ct_cloud_projects_owner_idx
  on public.ct_cloud_projects(owner_id);

create index if not exists ct_cloud_members_user_idx
  on public.ct_cloud_project_members(user_id);

create index if not exists ct_cloud_share_project_idx
  on public.ct_cloud_share_links(project_id);

alter table public.ct_cloud_projects enable row level security;
alter table public.ct_cloud_project_members enable row level security;
alter table public.ct_cloud_share_links enable row level security;

drop policy if exists "ct_projects_select_owner_or_member" on public.ct_cloud_projects;
create policy "ct_projects_select_owner_or_member"
on public.ct_cloud_projects
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.ct_cloud_project_members member
    where member.project_id = ct_cloud_projects.id
      and member.user_id = (select auth.uid())
      and (member.expires_at is null or member.expires_at > now())
  )
);

drop policy if exists "ct_projects_insert_owner" on public.ct_cloud_projects;
create policy "ct_projects_insert_owner"
on public.ct_cloud_projects
for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "ct_projects_update_owner" on public.ct_cloud_projects;
create policy "ct_projects_update_owner"
on public.ct_cloud_projects
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "ct_projects_delete_owner" on public.ct_cloud_projects;
create policy "ct_projects_delete_owner"
on public.ct_cloud_projects
for delete
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "ct_members_select_self" on public.ct_cloud_project_members;
drop policy if exists "ct_members_select_self_or_owner" on public.ct_cloud_project_members;
create policy "ct_members_select_self"
on public.ct_cloud_project_members
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "ct_members_delete_owner" on public.ct_cloud_project_members;
create policy "ct_members_delete_owner"
on public.ct_cloud_project_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.ct_cloud_projects project
    where project.id = ct_cloud_project_members.project_id
      and project.owner_id = (select auth.uid())
  )
);

drop policy if exists "ct_shares_select_owner" on public.ct_cloud_share_links;
create policy "ct_shares_select_owner"
on public.ct_cloud_share_links
for select
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "ct_shares_insert_owner" on public.ct_cloud_share_links;
create policy "ct_shares_insert_owner"
on public.ct_cloud_share_links
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.ct_cloud_projects project
    where project.id = ct_cloud_share_links.project_id
      and project.owner_id = (select auth.uid())
  )
);

drop policy if exists "ct_shares_update_owner" on public.ct_cloud_share_links;
create policy "ct_shares_update_owner"
on public.ct_cloud_share_links
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "ct_shares_delete_owner" on public.ct_cloud_share_links;
create policy "ct_shares_delete_owner"
on public.ct_cloud_share_links
for delete
to authenticated
using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.ct_cloud_projects to authenticated;
grant select, delete on public.ct_cloud_project_members to authenticated;
grant select, insert, update, delete on public.ct_cloud_share_links to authenticated;

create or replace function public.ct_redeem_share(p_token text)
returns table (
  project_id uuid,
  tool_type text,
  role text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_share public.ct_cloud_share_links%rowtype;
  v_tool_type text;
  v_already_member boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select share.*
    into v_share
  from public.ct_cloud_share_links share
  where share.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and share.revoked_at is null
    and (share.expires_at is null or share.expires_at > now())
  for update;

  if not found then
    raise exception 'invalid_or_expired_share';
  end if;

  select exists (
    select 1
    from public.ct_cloud_project_members member
    where member.project_id = v_share.project_id
      and member.user_id = v_user_id
      and (member.expires_at is null or member.expires_at > now())
  )
  into v_already_member;

  if not v_already_member
     and v_share.max_uses is not null
     and v_share.use_count >= v_share.max_uses then
    raise exception 'share_use_limit_reached';
  end if;

  insert into public.ct_cloud_project_members (project_id, user_id, role, expires_at)
  values (v_share.project_id, v_user_id, v_share.role, v_share.expires_at)
  on conflict on constraint ct_cloud_project_members_pkey
  do update set
    role = excluded.role,
    expires_at = excluded.expires_at;

  if not v_already_member then
    update public.ct_cloud_share_links
      set use_count = use_count + 1
    where id = v_share.id;
  end if;

  select project.tool_type
    into v_tool_type
  from public.ct_cloud_projects project
  where project.id = v_share.project_id;

  return query
  select v_share.project_id, v_tool_type, v_share.role;
end;
$$;

revoke all on function public.ct_redeem_share(text) from public;
grant execute on function public.ct_redeem_share(text) to authenticated;

-- Storage policies for the PRIVATE bucket "creative-cloud-assets".
-- Object paths must start with the project UUID:
--   <project-id>/<asset-id>.webp

drop policy if exists "ct_assets_insert_owner" on storage.objects;
create policy "ct_assets_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'creative-cloud-assets'
  and (storage.foldername(name))[1] in (
    select project.id::text
    from public.ct_cloud_projects project
    where project.owner_id = (select auth.uid())
  )
);

drop policy if exists "ct_assets_select_project_access" on storage.objects;
create policy "ct_assets_select_project_access"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'creative-cloud-assets'
  and (storage.foldername(name))[1] in (
    select project.id::text
    from public.ct_cloud_projects project
    where project.owner_id = (select auth.uid())
       or exists (
         select 1
         from public.ct_cloud_project_members member
         where member.project_id = project.id
           and member.user_id = (select auth.uid())
           and (member.expires_at is null or member.expires_at > now())
       )
  )
);

drop policy if exists "ct_assets_update_owner" on storage.objects;
create policy "ct_assets_update_owner"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'creative-cloud-assets'
  and (storage.foldername(name))[1] in (
    select project.id::text
    from public.ct_cloud_projects project
    where project.owner_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'creative-cloud-assets'
  and (storage.foldername(name))[1] in (
    select project.id::text
    from public.ct_cloud_projects project
    where project.owner_id = (select auth.uid())
  )
);

drop policy if exists "ct_assets_delete_owner" on storage.objects;
create policy "ct_assets_delete_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'creative-cloud-assets'
  and (storage.foldername(name))[1] in (
    select project.id::text
    from public.ct_cloud_projects project
    where project.owner_id = (select auth.uid())
  )
);
