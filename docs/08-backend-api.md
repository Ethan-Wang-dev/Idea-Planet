# 本地 API

服务默认位于 http://127.0.0.1:4317/api/v1，无账户和身份凭证，仅用于本地单人工作台。跨站请求被拒绝。

## 数据

- GET /health
- GET /ideas
- POST /ideas
- GET /ideas/:id
- PATCH /ideas/:id
- DELETE /ideas/:id?revision=…
- POST /local/ideas/batch，接收 { "ideas": [...] }，返回 accepted 和 conflicts
- GET /relations?ideaId=…
- POST /relations
- DELETE /relations/:id?revision=…
- GET /tags
- POST /tags
- DELETE /tags/:name
- GET /boards
- POST /boards
- PATCH /boards/:id
- DELETE /boards/:id?revision=…

Idea 字段使用 camelCase。更新携带 revision 时会检测旧版本并返回 409，删除记录保留 deletedAt。批量写入用于把浏览器待保存修改落到本机数据库，不是跨设备云端同步。

## Recall

- POST /agent/tasks：{ "type": "recall", "prompt": "关键词" }
- GET /agent/tasks/:id
- POST /agent/tasks/:id/cancel
- GET /agent/tasks/:id/events
- POST /agent/outputs/:id/save-as-idea

任务及输出持久化在本机。当前只有本地 Recall；其他类型尚无模型 Provider。结果可以保存为 Idea，来源任务记录在本地事件中；自动建立完整引用关系仍待完善。

旧 auth、me、public/home、public/config 和 sync 接口已移除。
