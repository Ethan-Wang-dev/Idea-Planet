# Idea Planet

让过去的想法，在今天继续为你创造。

把你在 X 上看过、写过和实践过的内容，交给逐渐了解你的 Agent，在你需要时帮你写出内容、做出判断、推进事情。

产品核心、目标用户和对外表达见 [docs/04-product-core.md](./docs/04-product-core.md)。

当前按开源项目推进，域名、Cloudflare 和 Zeabur 保留用于官网、文档和官方在线 Demo；详见 [docs/09-open-source-direction.md](./docs/09-open-source-direction.md)。云端化、订阅、AI credits 与 SaaS UI 仍是未来假设，见 [docs/05-business-model.md](./docs/05-business-model.md) 和 [docs/06-saas-ui-direction.md](./docs/06-saas-ui-direction.md)。

## 本地运行

需要 Node.js 18+：

```bash
npm run dev
```

然后打开 <http://localhost:4317>。未登录访问时会看到公开创作首页；登录或注册后才进入个人工作区。若需要本地演示工作区，可以使用 `IDEA_PLANET_DEV_SESSION=true npm run dev` 显式启用开发会话。当前网页仍在使用浏览器 `localStorage`；后端基础 API 已经可以用本地 SQLite 开发数据库运行，数据库默认位于 `.data/idea-planet.sqlite`，可以在侧栏导出 JSON 备份。若端口被占用，可以用 `IDEA_PLANET_PORT=4300 npm run dev` 更换端口；插件当前固定连接 4317，换端口时需同步修改插件中的地址。

后端 API 开发测试：

```bash
npm install
npm test
IDEA_PLANET_DB=/tmp/idea-planet.sqlite npm run dev
```

健康检查地址为 <http://localhost:4317/api/v1/health>。公开首页数据位于 `/api/v1/public/home`，部署配置位于 `/api/v1/public/config`。生产环境会自动关闭 `dev-session`；当前内测可使用邮箱和密码注册/登录。

## 容器部署

这是一个可持久化 SQLite 数据目录的单体服务，适合先部署到支持 Docker volume 的平台。复制 `.env.example` 为部署环境变量参考，并将 `/app/.data` 挂载到持久化磁盘：

```bash
docker build -t idea-planet .
docker run --rm -p 4317:4317 -v idea-planet-data:/app/.data idea-planet
```

生产环境会关闭 `dev-session`；邮箱密码登录目前适合内测，开放更大范围前还需要邮件验证、限流和密码找回。

如果要最快看到公网版本，可以将仓库连接到 Render 并使用根目录的 `render.yaml`。Render 会构建 Docker 镜像、挂载 SQLite 持久化磁盘并使用 `/api/v1/health` 做健康检查。首次部署先把 `IDEA_PLANET_ALLOWED_ORIGIN` 设置为 Render 分配的 `https://...onrender.com` 地址；正式用户体系接入前，这个环境只适合个人或邀请制内测。

## 试用闭环

1. 在“今日回顾”点击“收集 Idea”，保存一条完整内容。
2. 对卡片选择“扫掉”“保留”或“写下我的想法”。放下的内容可以在数据备份中恢复，目前界面保留了可恢复状态。
3. 对一条内容继续写下自己的 Idea；新的观点、行动、结果和问题都作为新的 Idea 保留。
4. 在 `Ask Planet` 中输入一个问题，使用本地 Recall 找回相关 Idea；结果可以保存为新的 Idea。
4. 侧栏“思想时间线”会把来源内容和自己的表达放在一起。

## 加载 Chrome 插件

打开 `chrome://extensions`，开启“开发者模式”，选择“加载已解压的扩展程序”，选中 `extension/` 文件夹。先启动本地网站，再打开 X 页面。点击 X 自带的 Like 或 Bookmark 后，插件会自动采集当前帖子，并显示一颗飞入 Idea Planet 的火花；网页打开时会自动导入，网页未打开时会先留在插件队列。

插件只读取当前浏览器中已经呈现的帖子正文；遇到 `Show more` 会先展开再保存，并过滤作者重复、Show translation、Quote、Relevant、Views、计数和操作按钮文本。插件弹窗里的“重新采集当前帖子”可以补全已经保存过的截断内容。它没有 X 账户登录能力，也不会同步历史 Like 或 Bookmark。

更新到 0.1.1 后，在 `chrome://extensions` 重新加载扩展，再刷新 X 页面和 Idea Planet。旧的截断内容需要回到原帖，用插件弹窗“重新采集当前帖子”补全；已有想法和归档状态会保留。长卡片可点击“展开全文”。

发布自己的帖子或回复时，点击 Post/发布或使用 macOS `Cmd+Enter`（Windows/Linux `Ctrl+Enter`）都能触发采集；普通 Enter 只会换行。

展开操作最多等待约 8 秒，并等待正文稳定后才保存。如果加载失败，插件提示重新采集，不会把这次折叠预览报告为保存成功。正文不再设置 20,000 字符截断，也不删除正文中的重复行、纯数字或 @ 提及。引用内容、未加载的线程、图片内文字及 X 文章不属于全文保证范围。

本地浏览器回归验证（隔离临时 Chrome，不使用个人登录）：启动网站后运行 `python3 tests/long-post.py`，需安装 Google Chrome 和 Python 的 `websocket-client`。覆盖延迟展开、帖子节点替换、超长正文、重复采集补全、保留个人想法、网页全文展开及刷新持久化。当前 `Ask Planet` 的 API 闭环由 `npm test` 覆盖。

## MVP 边界

需求原意与取舍分别记录在 [docs/01-user-intent.md](./docs/01-user-intent.md) 和 [docs/02-mvp-scope.md](./docs/02-mvp-scope.md)。这一版先验证“收集 → 回顾 → 决定去留 → 内化和延伸”，没有接入 LLM、账号和云端同步。
