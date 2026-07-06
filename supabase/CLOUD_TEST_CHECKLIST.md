# 云端短链接测试清单

## A. 未配置 Supabase 时

1. 保持 `supabase-config.js` 中 `enabled: false`。
2. 启动本地服务器。
3. 新建项目并刷新页面，确认本地内容仍在。
4. 打开分享弹窗。
5. “云端短链接”应显示“未配置”。
6. 离线二维码、分享码和 `.ctbshare` 文件仍应正常工作。

## B. 完成 Supabase 配置后

1. 将 `enabled` 改成 `true`。
2. 填入 Project URL 和 Publishable key。
3. 强制刷新页面。
4. 分享弹窗中的云端状态应显示“已连接”。

## C. 短链接测试

在普通窗口创建项目：

- 写入明显的测试名称。
- 添加一张测试图片。
- 点击“生成云端短链接”。
- 确认生成的链接包含 `#cloud=`，不包含 `CTB1`。
- 链接长度不应随着图片体积明显增长。

在无痕窗口打开链接：

1. 页面显示“正在获取云端分享”。
2. 自动进入对应工具。
3. 自动创建一份本地副本。
4. 项目名称、字段、任务依赖和图片应完整。
5. 修改无痕窗口中的副本，不应改变原窗口项目。

## D. 隐私测试

1. 在普通窗口创建项目 A，并生成链接。
2. 再创建未分享的项目 B。
3. 在无痕窗口打开项目 A 的链接。
4. 无痕窗口只能获得项目 A，不能看到项目 B。
5. 在 Supabase Table Editor 中检查：
   - A 的 `owner_id` 与接收者 `user_id` 不同。
   - `ct_cloud_project_members` 只包含被分享项目 A 的授权记录。

## E. 图片测试

1. 添加一张图片并生成链接。
2. 在 Supabase Storage 中确认文件位于：
   `<project-id>/<asset-id>.webp`
3. Bucket 必须显示为 Private。
4. 直接复制 Storage 内部路径不应成为公开永久图片网址。
5. 无痕窗口通过已领取的项目权限可以正常读取图片。

## F. 到期测试

将 `supabase-config.js` 中：

```js
shareExpiresDays: 1
```

生成链接。授权到期后，新用户不能再领取；已导入到本机的副本不会被删除。

## 常见错误

### “Anonymous sign-ins are disabled”

在 Supabase Authentication 中启用 Anonymous Sign-Ins。

### “new row violates row-level security policy”

通常是 SQL 没有完整执行，或者当前页面仍在使用旧缓存。

### “Bucket not found”

创建名为 `creative-cloud-assets` 的 Private bucket。

### “The resource was not found”

检查 Project URL、Publishable key 和数据库表名。

### 页面显示“未配置”

检查：

- `enabled: true`
- URL 以 `https://` 开头并以 `.supabase.co` 结尾
- Publishable key 不是占位符
- 浏览器能访问 jsDelivr 和 Supabase
