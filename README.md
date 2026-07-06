# Creative Toolbox

一个“本地优先、云端分享可选”的创意项目工具箱，包含：

- **设计台板**：产品策划、文化叙事、工艺供应与提案输出
- **排期规划**：任务节点、负责人、依赖关系与风险提醒
- **上线清单**：产品资料、样品、生产与交付检查

## 默认工作方式

创建和编辑内容时，项目仍然保存在当前浏览器的 IndexedDB / localStorage 中。没有配置 Supabase 时，三个工具可以继续完全本地使用：

- 二维码
- 压缩分享码
- `.ctbshare` 分享文件
- CSV / PDF 输出

## 可选的免费云端短链接

配置免费 Supabase 后，分享弹窗会出现“生成云端短链接”。

只有用户主动点击这个按钮时，当前项目快照才会上传：

- 文字和结构化数据进入私有数据库表。
- Base64 图片和附件会被提取出来，上传到 Private Storage。
- 图片上传前会尽量压缩为 WebP，并限制最大边长。
- 分享链接只包含一个随机令牌，不会随着图片数量无限增长。
- 接收者打开链接后会自动匿名登录、领取该项目的查看权限，并创建一份新的本地副本。
- 接收者看不到分享者的其他项目。

云端链接分享的是生成链接时的快照，不是实时多人协作。接收者修改自己的本地副本，不会改变原作者项目。

完整配置步骤见：

`supabase/CLOUD_SETUP.md`

数据库和 RLS 脚本：

`supabase/supabase-setup.sql`

## 隐私设计

- 未分享的项目默认只存在于当前浏览器。
- Supabase 匿名用户拥有独立 `user_id`。
- 云端项目通过 `owner_id + auth.uid() + RLS` 隔离。
- 分享令牌只授权一个项目。
- 图片存放在 Private bucket，并使用同一套项目权限检查。
- 前端只使用 Publishable key。
- 不要把 `service_role`、secret key 或数据库密码上传到 Git。

## Launch Checklist 私密报价

上线清单默认不会把私密报价放进任何分享内容。只有主动勾选“包含私密报价”后，离线分享和云端短链接才会包含报价。

## 本地运行

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

访问：

```text
http://localhost:8000/
```

建议通过本地服务器运行，不要直接双击 HTML。剪贴板、模块和浏览器安全策略在 `file://` 下可能表现不同。

## 部署到 GitHub Pages

这是静态网站，不需要构建步骤。将整个目录推送到仓库根目录，在：

`Settings → Pages`

选择主分支根目录发布即可。

若要启用云端短链接，先编辑：

`supabase-config.js`

Supabase Project URL 和 Publishable key 可以出现在公开前端代码中，但前提是已经正确启用 RLS。

## 文件结构

```text
index.html                       工具箱主页
design-board.html                设计台板
timeline-planner.html            排期规划
launch-checklist.html            上线清单
tool-theme.css                   三个工具共用的视觉层
share-code.js                    离线分享码、链接与分享文件
qr-code.js                       本地二维码生成
supabase-config.js               可选云端分享配置
cloud-share.js                   匿名登录、私有文件与短链接
supabase/CLOUD_SETUP.md          Supabase 配置步骤
supabase/supabase-setup.sql      建表、RPC、RLS 与 Storage 策略
app.js                           设计台板运行逻辑
timeline.js                      排期规划运行逻辑
launch.js                        上线清单运行逻辑
```

## 重要提醒

匿名用户清除浏览器数据、退出或更换设备后，无法恢复同一个匿名身份。重要项目仍建议定期下载 `.ctbshare` 备份。
