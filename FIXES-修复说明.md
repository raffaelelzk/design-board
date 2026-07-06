# v2.4 交叉验证修复说明（在原包基础上修改）

原包架构良好（全部经 SECURITY DEFINER RPC 读写 + 乐观锁版本冲突检测），
交叉验证后修复了 3 个 bug + 补齐 1 个规格缺口。

## 修复 1 — 数据库 RLS 无限递归（严重）
`supabase-schema.sql`
- 原策略里 `workspace_members` 的读取策略又查询了 `workspace_members` 自身，属 Supabase 官方
  警告的反模式，会触发 `infinite recursion detected in policy`，导致实时订阅收不到更新。
- 改法：新增 `is_member(uuid)` / `can_edit(uuid)` 两个 SECURITY DEFINER 辅助函数（绕过 RLS，
  不会递归）；`workspaces` / `documents` 策略改用它们；`workspace_members` 读取策略改为
  非自引用的 `user_id = auth.uid()`。

## 修复 2 — 成本报价上云泄露（隐私）
`launch.js`
- 原 `defaultPayload: localPayload` 首次建档带上了未剔除的完整 state（含 `privateCostQuote`），
  会把成本报价写进云端，协作者可见。
- 改法：新增 `stripPrivate()`，首次建档与每次上云都剔除 `privateCostQuote`。

## 修复 3 — 成本报价被云端覆盖丢失（数据丢失）
`launch.js`
- 原收到云端数据时直接整体替换 state，未回填本机报价，导致成本报价被清空。
- 改法：新增 `mergeLocalPrivate()`，在 `setPayload` / `onRemoteUpdate` / boot 结果处，
  按产品 ID 把本机成本报价合并回来。

## 补齐 — 首页「我的工作区」列表 + 分享码重取
`cloud.js` / `home-cloud.js` / `index.html` / `home.css`
- 原首页只有「新建 + 用分享码打开」，无法列出已加入的工作区，清了浏览器也拿不回分享码。
- 改法：`cloud.js` 新增 `listWorkspaces()` / `selectWorkspace()` / `fetchTokens()`；
  首页加「我的工作区」按钮与列表；`share_tokens` 改为成员可读，支持重新展示分享链接。

## 配置
`cloud-config.js` 已预填现有 Supabase 项目（rvklyahwvczxtpqxdnpl），换项目改两行即可。

## 部署前仍需在 Supabase 控制台完成
1. Authentication → Sign In / Providers → 打开 **Anonymous sign-ins**
2. SQL Editor 运行 `supabase-schema.sql`（可重复运行）
