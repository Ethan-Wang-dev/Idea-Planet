# Idea Planet · Session Handoff

更新时间：2026-09-07

## 当前产品决定

Idea Planet 已从闭源 SaaS 方案切换为：

> 开源、本地优先、用户自持数据的个人 Idea 工作台。

当前默认原则：

- 不需要注册、登录、密码、会话或账户体系；
- 不依赖官方云端服务和跨设备同步；
- Idea、关系、标签、Board 和 Agent 任务保存在用户本机；
- 用户可以自行修改代码、数据库和部署方式；
- 网页端是当前主要工作入口；
- 暂时不接入 Codex、Claude Code 或 MCP；
- 用户自配模型 Provider 和 API Key 是后续功能，不是当前前提；
- Zeabur 只作为未来隔离 Demo 的候选，不保存用户正式数据。

## 本次已完成

- 删除公开版登录、注册、session 和账户依赖；
- 删除 SaaS 云端同步接口及 change log；
- 删除营销首页、虚构社区统计和旧收费方案文档；
- 网页启动后直接进入本地工作台；
- SQLite 默认路径改为 `.data/local-planet.sqlite`；
- 服务默认只监听 `127.0.0.1`，拒绝跨站请求；
- 浏览器缓存保留离线待写入队列；
- 本地 SQLite 不可用时仍可使用浏览器缓存；
- 支持首次把浏览器缓存中的 Idea 写入本地 SQLite；
- 本地 Recall 不需要身份凭证；
- 保留 Idea revision 冲突检测；
- 增加本地工作台的 API 和 Chrome 回归测试；
- `npm run check` 通过；
- `npm test` 9/9 通过；
- `python3 tests/local-workspace.py` 通过，覆盖重启、SQLite 持久化、Recall、结果回写和断线恢复。

旧账户数据库不会自动迁移或删除。删除的代码仍可从 Git 历史恢复。

## 当前使用方式

```bash
npm ci
npm start
```

然后打开 `http://127.0.0.1:4317`。当前可以直接创建 Idea、使用 Timeline、标签、Board、导出 JSON，并使用本地关键词 Recall。

## 下个 session 优先事项

按以下顺序继续：

1. 检查并完善本地 SQLite 与浏览器缓存的导入、导出和恢复；
2. 完成用户自配 API Key 和模型 Provider 配置；
3. 将 Recall 抽象为可替换的本地模型任务；
4. 实现 Synthesize 和 Draft，并保留引用来源；
5. 将 Agent 输出编辑后保存为新的 Idea，并建立完整来源关系；
6. 再评估 Research、智能关联和旧 Idea 回访；
7. 产品功能稳定后，最后补充 `AGENTS.md`、一键部署脚本和让 Codex / Claude Code 自动部署的说明。

## 当前明确不做

- 不恢复登录注册和账户系统；
- 不恢复订阅、credits、支付和云端多租户；
- 不优先开发 Codex / Claude Code / MCP 集成；
- 不把 Zeabur Demo 当作用户数据服务；
- 不在产品完成前投入最终公开仓库发布流程。

