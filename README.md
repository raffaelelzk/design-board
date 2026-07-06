# Creative Toolbox / Design Board

面向文创产品策划的本地优先项目工作台。测试阶段不需要登录，不依赖 Supabase，适合直接部署到 GitHub Pages。

## 本次改动

- 移除 Supabase、公共 Storage 和共享 `system_store.json`
- 改为 IndexedDB 本地自动保存
- 增加只读示例项目，可复制为本地项目
- 增加单项目 / 全部项目 JSON 导入导出
- 版本历史改为保存完整项目快照
- 图片和附件改为本地保存，并进入项目备份
- 重构为四个模块：产品地图、文化叙事、工艺与供应、提案输出
- 提案输出改为正式预览，可打印或另存为 PDF
- 增加目标售价、预估成本、MOQ、供应商、交期、风险、负责人和下一步等字段
- 增加移动端适配、明确的保存状态与错误提示

## 文件结构

```text
index.html     页面结构
styles.css     界面、响应式和打印样式
app.js         数据、交互和导入导出逻辑
README.md      使用和部署说明
CHANGELOG.md   版本改动记录
```

## 本地运行

直接双击 `index.html` 可以打开，但部分浏览器对本地文件的下载与剪贴板权限有限。建议使用本地静态服务器：

```bash
python3 -m http.server 8000
```

然后访问：

```text
http://localhost:8000
```

## 部署到 GitHub Pages

1. 将本目录文件放到仓库根目录。
2. 推送到 GitHub。
3. 在仓库 `Settings → Pages` 中选择从主分支根目录部署。
4. 等待 GitHub Pages 发布。

不需要配置环境变量或数据库。

## 数据说明

- 项目保存在当前浏览器的 IndexedDB 中。
- 不会自动上传到服务器。
- 更换设备、浏览器或清理网站数据前，应先点击“导出全部”。
- 导出的 JSON 包含项目文字、图片和附件，因此文件可能较大。
- 单张图片限制为 3MB，单个附件限制为 5MB。

## 测试版限制

- 不支持多人实时协作。
- 不支持跨设备自动同步。
- 浏览器隐私模式可能在关闭后清除数据。
- 大量高清图片会增加浏览器存储和 JSON 备份体积。

## 后续升级建议

当有稳定的真实用户后，再增加：

1. 邮箱免密码登录
2. 用户与项目数据隔离
3. 云端备份
4. 团队成员和权限
5. 冲突检测与多人协作
6. 正式的账号注销、隐私政策和数据导出机制


## 页面入口

- `index.html`：Creative Toolbox 工具箱主页
- `design-board.html`：Design Board 项目工作台
- `home.css`：工具箱主页样式
- `styles.css`：Design Board 样式
- `app.js`：Design Board 功能与本地数据逻辑

部署到 GitHub Pages 后，首页会先展示工具箱，点击 **Design Board** 卡片进入项目工作台。

## Loading compatibility

`design-board.html` contains its runtime script inline. If IndexedDB is blocked,
the app automatically falls back to browser localStorage and still opens normally.

## Timeline Planner

The toolbox now includes a lightweight project scheduling tool:

- Cultural product, brand design, event, and blank templates
- Task owner, phase, start/end dates, status, dependency, and notes
- Automatic horizontal timeline
- Overdue, missing owner, dependency, and date risk detection
- Multiple local schedule projects
- JSON import/export, CSV export, and print/PDF
- Browser localStorage persistence without login

Open `timeline-planner.html` directly, or enter it from the homepage.

## Launch Checklist

The toolbox now includes an independent product production and delivery checklist:

- Multiple local checklist projects
- Product number, image, product name, status, supplier, MOQ, arrival date, dimensions, and material
- Design concept and pre-production sample notes
- Apparel size quantity matrix from XS/155 to XXL/180
- Automatic total quantity and MOQ validation
- Pre-production sample and production-file confirmation
- Completion percentage and automatic delivery risk detection
- Private cost quote field, collapsed by default
- Private cost quote excluded from normal views and exports unless explicitly selected
- JSON import/export, CSV export, and print/PDF
- Independent localStorage namespace with hidden `externalRefs` compatibility fields
- No visible cross-tool synchronization

Open `launch-checklist.html` directly, or enter it from the homepage.

## Cloud Workspace setup

Creative Toolbox v2.4 adds optional Supabase cloud workspaces while keeping GitHub Pages as the static host.

### Setup

1. Create a Supabase project.
2. In Supabase Dashboard, enable Anonymous sign-ins.
3. Open SQL Editor and run `supabase-schema.sql`.
4. Open `cloud-config.js` and paste:
   - `supabaseUrl`
   - `supabaseAnonKey`
5. Upload all files to the GitHub repository root and deploy with GitHub Pages.

Do not place service_role keys, database passwords, or other secrets in GitHub Pages.

### Sharing model

- New workspace: creates an anonymous owner and two share tokens.
- Edit link: lets another anonymous user join as editor.
- Read-only link: lets another anonymous user join as viewer.
- Documents are stored as JSON payloads in Supabase.
- The three tools remain independent documents:
  - `design_board`
  - `timeline_planner`
  - `launch_checklist`

### Sync states

The UI can show:

- 云端已连接
- 正在同步……
- 已同步 HH:MM
- 同步失败，点击重试
- 离线，修改暂存中
- 发现远程更新

If Supabase is not configured or connection fails, tools fall back to local browser mode.
