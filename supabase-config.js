/*
 * Creative Toolbox 云端分享配置
 *
 * 1. 在 Supabase 创建免费项目。
 * 2. 执行 supabase/supabase-setup.sql。
 * 3. 创建名为 creative-cloud-assets 的 Private bucket。
 * 4. 开启 Anonymous Sign-Ins。
 * 5. 填入 Project URL 和 Publishable key（旧项目可用 anon public key），并把 enabled 改为 true。
 *
 * Publishable key 可以出现在前端；不要填写 service_role / secret key。
 */
window.CreativeCloudConfig = {
  enabled: true,
  supabaseUrl: "https://rvklyahwvczxtpqxdnpl.supabase.co",
  publishableKey: "sb_publishable_GWRqFsgEVaa02WKtGQkAfw_8NCVDxvj",
  bucket: "creative-cloud-assets",
  shareExpiresDays: 30,
  imageMaxDimension: 1600,
  imageQuality: 0.82,
  maxAssetSizeMB: 5
};
