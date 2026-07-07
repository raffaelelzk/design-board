-- Creative Toolbox v3.4.1
-- 修复 storage.objects.name 与 ct_cloud_projects.name 的列名撞名问题。
-- 已部署 v3.4.0 的项目只需在 Supabase SQL Editor 中执行本文件。

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

-- 可选清理旧实验策略。确认不再使用旧 design-images 桶后再取消下面两行注释。
-- drop policy if exists "Allow All Uploads" on storage.objects;
-- drop policy if exists "Allow_All_Operations" on storage.objects;
