# Idea Planet · Backend API v0

当前版本是 Idea Planet 的网页 API。公开首页接口不需要登录，个人数据和 Agent 任务仍然只对当前用户开放。

## 启动

```bash
npm install
IDEA_PLANET_DB=/tmp/idea-planet.sqlite npm run dev
```

默认端口 `4317`，健康检查：

```text
GET /api/v1/health
```

### 公开首页

```text
GET /api/v1/public/config
GET /api/v1/public/home
```

两个接口不需要 `Authorization`。`public/config` 返回当前部署是否允许本地开发会话，以及 Agent 的产品状态；`public/home` 返回首页文案、功能卡片、作品展示、社区和统计数据。首页内容集中在 `landing.mjs`，后续可以迁移到 CMS 或管理后台，网页不需要改路由。

### 开发会话

开发环境可以通过下面的接口取得本地开发会话：

```text
POST /api/v1/auth/dev-session
```

正式环境会关闭这个入口。当前已提供邮箱和密码注册/登录，用于内测；生产环境仍应在开放更大范围前接入邮件验证、限流和密码找回。

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
```

注册和登录返回 `{ token, user }`，数据接口继续使用 `Authorization: Bearer <session-token>`。

## 当前接口

除健康检查、公开首页和认证接口外，都需要：

```text
Authorization: Bearer <session-token>
```

### 当前用户

```text
GET /api/v1/me
```

### Ideas

```text
GET   /api/v1/ideas
POST  /api/v1/ideas
GET   /api/v1/ideas/:id
PATCH /api/v1/ideas/:id
```

`POST` 和 `PATCH` 使用当前网页的 Idea 字段命名（camelCase）。服务端在数据库中使用 snake_case，并将 `tags`、`sourceTypes` 和父级快照存为受控 JSON 字段。

服务端不会把 `practice` 作为核心字段；旧数据如果仍携带该字段，只作为迁移兼容信息保存，不参与新的业务逻辑。

### 同步与版本

```text
POST /api/v1/sync/push
GET  /api/v1/sync/pull?after=<cursor>
```

`sync/push` 接收：

```json
{
  "ideas": [
    {
      "id": "idea-123",
      "sourceType": "bookmark",
      "body": "...",
      "tags": ["Reference"]
    }
  ]
}
```

每个 Idea 返回 `revision`。更新时如果客户端带有过期的 revision，服务端返回 `409 revision_conflict`，不会静默覆盖另一台设备的修改。

`sync/pull` 返回变更序号和变更对应的 Idea。删除使用软删除墓碑，客户端可以通过 cursor 得知删除，而不会因为服务端列表过滤而永久保留本地旧数据。

当前网页仍会保留 localStorage fallback；更完整的离线冲突解决界面会在 API 迁移稳定后加入。

### Idea relations

```text
GET    /api/v1/relations?ideaId=<id>
POST   /api/v1/relations
DELETE /api/v1/relations/:id?revision=<revision>
```

关系是独立的一等数据，而不是只依赖 `parentUrl`。当前关系至少包含：

```json
{
  "fromIdeaId": "idea-a",
  "toIdeaId": "idea-b",
  "relationType": "extends",
  "metadata": {}
}
```

后续 Agent 的召回、引用和输出回写都会使用关系表。

### Tags / Boards

```text
GET    /api/v1/tags
POST   /api/v1/tags
DELETE /api/v1/tags/:name

GET    /api/v1/boards
POST   /api/v1/boards
PATCH  /api/v1/boards/:id
DELETE /api/v1/boards/:id?revision=<revision>
```

标签仍然是轻量的观察方式；Board 保存查询条件和 pinned 状态，不改变“一切皆为 Idea”的核心模型。

## 当前刻意没有做的事情

- OAuth、邮件验证、密码找回和多因素认证。
- 生产环境 CORS、域名和反向代理配置。
- 公开 API key。
- 外部模型 Provider、向量检索和工具执行；当前只有不调用外部模型的本地 Recall runner。
- credits、支付和订阅。
- 附件上传。

这些功能需要在数据模型和安全边界验证后再接入。

## Agent task API

当前已经提供任务生命周期接口：

```text
POST /api/v1/agent/tasks
GET  /api/v1/agent/tasks/:id
POST /api/v1/agent/tasks/:id/cancel
GET  /api/v1/agent/tasks/:id/events
POST /api/v1/agent/outputs/:id/save-as-idea
```

目前只有 `recall` 类型会通过本地 deterministic provider 执行；`synthesize`、`draft` 和 `research` 会进入可追踪的失败状态，不会伪装成已经完成。任务、运行、事件和输出都已持久化。

这些接口只定义任务、运行、事件和输出的生命周期，不暴露具体的模型 Provider 或 Agent 框架。Recall 输出现在可以通过 `save-as-idea` 写回 Planet，并保留任务事件记录。
