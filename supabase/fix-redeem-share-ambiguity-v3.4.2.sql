-- Creative Toolbox v3.4.2
-- 修复 ct_redeem_share() 中 project_id 与 RETURNS TABLE 输出字段撞名的问题。
-- 已部署 v3.4.0 / v3.4.1 的项目，请在 Supabase SQL Editor 中执行本文件。

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

  insert into public.ct_cloud_project_members (
    project_id,
    user_id,
    role,
    expires_at
  )
  values (
    v_share.project_id,
    v_user_id,
    v_share.role,
    v_share.expires_at
  )
  on conflict on constraint ct_cloud_project_members_pkey
  do update set
    role = excluded.role,
    expires_at = excluded.expires_at;

  if not v_already_member then
    update public.ct_cloud_share_links share_row
      set use_count = share_row.use_count + 1
    where share_row.id = v_share.id;
  end if;

  select project_row.tool_type
    into v_tool_type
  from public.ct_cloud_projects project_row
  where project_row.id = v_share.project_id;

  return query
  select
    v_share.project_id,
    v_tool_type,
    v_share.role;
end;
$$;

revoke all on function public.ct_redeem_share(text) from public;
grant execute on function public.ct_redeem_share(text) to authenticated;
