# Idea Planet

让过去的想法，在今天继续为你创造。

本地优先的个人 Idea 工作台。通过 X 插件或手动输入收集内容，回顾、延伸自己的想法，并在需要时召回它们。无需注册、登录或官方云端服务。

## 运行

需要 Node.js 22：

```bash
npm ci
npm start
```

打开 <http://127.0.0.1:4317>，直接进入 Planet。

## 数据属于你

- Ideas、关系、标签、Board 和 Recall 任务保存在本机 SQLite：`.data/local-planet.sqlite`。
- 浏览器保留缓存和待写入队列；侧栏显示 `local SQLite` 时表示当前写入已完成，`browser cache · pending` 表示还有待保存的数据。
- 侧栏 export 导出当前浏览器中的 Ideas JSON；完整数据库备份请先停止服务，再复制 SQLite 文件。Board 固定视图偏好仍保存在浏览器中。
- 首次使用空数据库时导入当前浏览器的已有 Ideas；旧账户数据库 `.data/idea-planet.sqlite` 保留原样，不自动合并不同账户。
- 不连接官方服务器、不上传数据；当前 Recall 只使用本地关键词检索。
- 用户自己的模型 Provider / API Key 配置尚未实现，接入后调用模型会将所选上下文发送至用户选择的服务。

## 本地配置

通过进程环境变量设置，应用不会自动读取 `.env`：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| IDEA_PLANET_PORT | 4317 | 本地端口 |
| IDEA_PLANET_DB | .data/local-planet.sqlite | SQLite 路径 |
| IDEA_PLANET_HOST | 127.0.0.1 | 监听地址 |
| PORT | 未设置 | 设置后优先于 IDEA_PLANET_PORT |

此版本是单人本地工作台，无账户或权限系统。默认只监听回环地址，拒绝其他网站的跨域请求。

Docker 本地运行：

```bash
docker build -t idea-planet .
docker run --rm -p 127.0.0.1:4317:4317 -v idea-planet-data:/app/.data idea-planet
```

## 使用

1. 点击 new idea，保存一段内容。
2. 回顾内容，Sweep 放下，或从原文延伸新的 Idea。
3. 使用标签、Planet、Timeline 和 All ideas 浏览积累。
4. 在 Ask Planet 输入关键词，查看本地 Recall 结果和引用，再保存为新的 Idea。

## X 插件

在 Chrome 的 `chrome://extensions` 开启开发者模式，加载 `extension/`。启动本地网站后，在 X 点赞、收藏、发帖或回复时采集内容；网页未打开时暂存在插件队列。

插件读取浏览器已呈现的内容，尝试展开 Show more，支持正文补全和去重。不会同步历史点赞或书签；图片、视频、完整线程和引用原帖不保证完整采集。插件目前连接 4317，修改端口需要同步修改插件地址。

## 开发状态

```bash
npm run check
npm test
```

已实现本地存储、Idea 编辑和关系、插件采集、关键词 Recall 及结果保存。外部模型、综合/写作/研究任务、智能关联仍待开发。

产品核心见 [产品核心](docs/04-product-core.md)，当前路线见 [开发路线](docs/07-backend-agent-roadmap.md)，接口见 [本地 API](docs/08-backend-api.md)。
