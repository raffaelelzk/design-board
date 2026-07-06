# 免费 Supabase 云端分享配置

这个版本仍然是“本地优先”：

- 创建和编辑默认保存在浏览器本机。
- 只有点击“生成云端短链接”时，当前项目快照和嵌入图片才会上传。
- 没有配置 Supabase 时，原有二维码、分享码和 `.ctbshare` 文件继续可用。

## 1. 创建免费 Supabase 项目

进入 Supabase 后创建一个免费项目。

## 2. 开启匿名登录

在 Supabase 控制台进入：

`Authentication → Providers → Anonymous Sign-Ins`

启用匿名登录。

## 3. 执行数据库脚本

进入：

`SQL Editor → New query`

粘贴并执行：

`supabase/supabase-setup.sql`

它会创建：

- `ct_cloud_projects`
- `ct_cloud_project_members`
- `ct_cloud_share_links`
- 匿名分享领取函数
- 数据库和 Storage 的 RLS 权限规则

## 4. 创建私有图片桶

进入：

`Storage → New bucket`

设置：

- Name：`creative-cloud-assets`
- Public bucket：关闭
- File size limit：建议 `5 MB`

图片和附件必须放在 Private bucket 中。

## 5. 填写前端配置

打开根目录的：

`supabase-config.js`

修改为：

```js
window.CreativeCloudConfig = {
  enabled: true,
  supabaseUrl: "https://你的项目ID.supabase.co",
  publishableKey: "你的 Publishable key",
  bucket: "creative-cloud-assets",
  shareExpiresDays: 30,
  imageMaxDimension: 1600,
  imageQuality: 0.82,
  maxAssetSizeMB: 5
};
```

Project URL 和 Publishable key 可以在 Supabase 项目设置的 API 页面找到。旧项目如果只显示 `anon public` key，也可以填入该公开客户端 key。

只能填写 Publishable key 或 `anon public` key。不要把以下内容放进 Git：

- `service_role`
- secret key
- 数据库密码

## 6. 本机测试

在网站目录启动：

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

打开：

```text
http://localhost:8000/
```

创建一个小项目，点击分享弹窗里的“生成云端短链接”。

复制生成的短链接，在无痕窗口打开。页面会：

1. 自动创建新的匿名用户。
2. 验证分享令牌。
3. 只授予这个项目的读取权限。
4. 下载项目内容和私有图片。
5. 创建一份新的本地副本。

## 7. GitHub Pages 测试

部署到 GitHub Pages 后，从正式域名打开项目并重新生成链接。

不要分享 `localhost` 链接。

## 当前边界

- 云端链接分享的是生成链接时的项目快照，不是实时多人协作。
- 接收者导入的是自己的本地副本，修改不会影响原作者。
- 匿名身份依赖当前浏览器；清除浏览器数据后不能恢复原匿名用户。
- 云端快照会占用免费额度。测试阶段建议使用 30 天有效期，并定期在 Supabase 控制台清理旧项目和文件。
