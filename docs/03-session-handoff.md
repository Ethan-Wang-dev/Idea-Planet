# Idea Planet · Session handoff

更新时间：2026-09-06

这份文档用于在新 session 中继续 Idea Planet / 灵感星球的产品和工程工作。工作名称仍是暂定名称，不代表最终品牌决定。

## 产品的一句话

把用户在 X 上一瞬间的喜欢、收藏、认同和表达，带回一个属于自己的 Idea 星球，让它经过回顾、筛选、内化、连接，最后变成行动。

核心问题不是“怎样保存更多内容”，而是：

> 我曾经觉得它很好，后来它有没有真正影响我的观点、判断或行为？

## 当前产品共识

Idea 是产品的核心对象。一条 X 内容、用户的理解、长期观点、行动、实践结果和新问题，都是 Idea；一个 Idea 可以继续产生新的 Idea，并与来源 Idea 建立关系。

Planet 是默认空间。采集内容直接进入 Planet，不要求用户处理 Inbox。用户通过 Planet 观察自己的兴趣、回看今天看过的内容，并判断哪些值得成为长期方法论或实践。

标签是轻量的浏览和观察方式，不是强制分类。默认标签包括 `Action`、`Longterm`、`Method`、`Question`、`Reference`、`Emotion`；一个 Idea 可以拥有多个标签，用户也可以创建标签和标签组合，并为组合建立看板。

当前卡片只保留两种核心行为：`Sweep` 和 `Idea`。Sweep 让内容降低存在感；Idea 从当前内容继续产生新的 Idea。Practice / Action 不再是独立对象；行动、实践结果和新问题都直接作为 Idea 保存。`Action` 如果继续存在，只是普通的用户标签，不代表另一种数据模型。

界面保持 Idea-first：左侧只承载 Planet、标签和看板入口，右侧空间主要呈现 Idea。内容类型和来源通过图标、形状和颜色表达，减少冗余文字。未来 Agent 可以降低低价值密度内容的存在感、建议标签和提示新的 Idea，但不替用户定义价值。

## 用户原始动机

目标人群主要是技术从业者、AI 博主和经常浏览 X 的人。他们会看到很多观点、干货、分享，有时会 Like、Bookmark、评论或转发，但过一段时间后往往忘记了。内容当时带来过认同或情绪价值，却没有成为自己的观点，也没有产生实际行动。

产品希望帮助用户：

- 再次遇见曾经打动自己的内容。
- 判断它现在是否仍然有价值。
- 从长帖中保留完整材料，或提炼真正有用的部分。
- 用自己的话重述、延伸或反驳别人的观点。
- 发现不同 Idea 之间的关联、递进和冲突。
- 把提示词、步骤和方法应用到真实任务中。
- 逐渐形成自己的长期观点库和行动轨迹。

## 已确认的输入行为

X 原生行为的含义不同，不能混为一种收藏：

| X 行为 | 产品含义 | 当前处理 |
| --- | --- | --- |
| Like | 弱信号，可能是互动、情绪共鸣或真实认同 | 自动采集为点赞候选，由用户决定去留 |
| Bookmark | 强信号，用户想稍后回来 | 自动采集并保留完整正文，进入收藏和回顾 |
| 用户主动发帖 | 用户自己的表达 | 自动采集为我的发帖 |
| 回复 / 评论 | 用户自己的表达，且依附某个原帖 | 自动采集为我的回复，并保存或复用原帖 |
| Quote post | 用户自己的评论加上被引用内容 | 把我的引用评论和被引用原帖拆开保存并建立关系 |

用户自己的评论、回复和引用评论必须被单独保存，不能只保存引用的原文或混合文本。

## 当前采集体验

Chrome Manifest V3 插件监听 X 页面：

- Like 和 Bookmark 使用 X 原生按钮，不额外插入每条帖子的操作按钮。
- 点击后会出现一颗从点击位置飞向 Idea Planet 的火花。
- 页面打开时，插件队列会自动导入网站。
- 网站未打开时，内容暂存于 `chrome.storage.local`。
- 插件重新加载导致旧 content script 失效时，bridge 会安静停止，不再持续抛出 `Extension context invalidated`。
- 用户可以从插件弹窗“重新采集当前帖子”，用于补全以前的截断记录。
- 同一条 X 内容按规范化 URL 归并；Like、Bookmark 和重复操作只保留一条记录，同时记录 `sourceTypes` 信号。

发布自己的帖子或回复时支持：

- 点击 X 的 Post / 发布按钮。
- macOS `Cmd+Enter`。
- Windows/Linux `Ctrl+Enter`。
- 普通 Enter 只换行，不触发采集。

打开回复框本身不会采集，真正提交后才尝试读取新出现的帖子。

## 长帖与清洗规则

采集前会识别并点击：

- `Show more`
- `显示更多`

插件会等待 X 更新正文，处理 X 替换帖子 DOM 的情况，并在正文稳定后保存。等待上限约 8 秒；加载失败会提示重试，不会假装保存了完整内容。

正文优先读取帖子正文节点。会过滤外围 UI 噪声：

- 作者信息重复。
- `Show translation`、`Translate`。
- `Quote`、`Relevant`、`View quotes`。
- `Views`、互动计数、时间。
- Reply、Repost、Like、Bookmark、Share 等操作文本。

Article 长文容器中的独立数字行（例如 `15`、`66`、`239`、`167K`）视为阅读量或互动统计并过滤；普通帖子正文中的数字、重复行和 `@` 提及仍然保留。

正文里的重复行、纯数字、`@` 提及和提示词结构会保留，因为它们可能本身有意义。当前不承诺读取图片文字、视频内容、未加载线程或 X Article 中无法进入 DOM 的内容。

## X Article

已支持识别并采集以下链接形式：

- `/username/article/...`
- `/i/article/...`
- `/i/articles/...`

Article Like / Bookmark 与普通帖子使用同一套原生按钮监听。采集结果带有 `contentType: article`，网页卡片显示 `Article` 标识。正文优先寻找 X 的长文容器。

## 父子关系模型

采集记录可能带有：

- `captureKey`：来源行为和原帖 URL 的唯一键。
- `parentUrl`：回复或引用所对应的原帖 URL。
- `relationType: reply | quote`。
- `parent`：采集时读取到的原帖快照。
- `sourceType: parent`：网页中为缺失的原帖创建的记录。

网页导入时会按 `captureId`、`captureKey` 和帖子 URL 去重。如果原帖已经存在，复用已有记录；否则先创建原帖，再创建用户的回复或引用评论。重新采集到更长正文时更新旧记录，但保留用户已有的个人想法和归档状态。

## 当前网页 MVP

项目目录：

`/Users/jamshed/Work/voke-cs-agent/projects/idea-planet`

启动：

```bash
cd /Users/jamshed/Work/voke-cs-agent/projects/idea-planet
npm run dev
```

访问：<http://localhost:4317>

数据目前保存在浏览器 `localStorage`，没有账号、云端数据库或多用户同步。侧栏可以导出 JSON 备份。

网页页面：

- Planet：所有采集内容默认进入 Planet，不再把 Inbox 作为用户必须处理的入口。
- 思想时间线：按时间查看来源内容和自己的表达。
- 全部收藏：查看书签、点赞候选、我的想法和已放下内容。
- Boards：由标签组合形成可选看板；标签只是观察和浏览方式，不代表独立的 Practice / Action 对象。

当前界面强调清新、留白、纸张和日记感。Idea Planet 是轻量视觉隐喻，不强迫用户使用固定标签。

## 当前数据对象的主要字段

```text
id
captureId
captureKey
sourceType: bookmark | like | authored | reply | parent | direct
sourceTypes: [bookmark, like, ...]  # 同一条内容收到的来源信号，兼容旧数据时可缺省
contentType: post | article
relationType: reply | quote
parentUrl
author
title
body
url
contentStatus: partial | expanded
createdAt
capturedAt
status: inbox | kept | dismissed
myThought
# 旧版本可能存在的兼容字段；不再作为核心模型
practice: { goal, due, result, done }
tags: [Action, Longterm, Method, Question, Reference, Emotion, ...]
```

## 当前工程文件

- `app/index.html`：网页结构。
- `app/styles.css`：视觉样式和响应式布局。
- `app/app.js`：网页状态、渲染、导入、回顾、Idea 延伸和导出。
- `server.mjs`：无依赖本地静态服务器。
- `extension/manifest.json`：Manifest V3 配置。
- `extension/content.js`：X DOM 采集、正文清洗、Show more、原生行为监听、飞行动画、发帖和回复识别。
- `extension/service-worker.js`：插件离线队列、去重、内容升级。
- `extension/bridge.js`：Idea Planet 网页与插件队列桥接。
- `extension/popup.*`：重新采集当前帖子和打开网页。
- `docs/01-user-intent.md`：用户原始构思忠实整理。
- `docs/02-mvp-scope.md`：当前 MVP 范围、边界和验收路径。
- `tests/long-post.py`：隔离 Chrome 回归测试。

## 已完成的验证

```text
PASS: delayed Show more, article replacement, >20k body and meaningful repeated lines
PASS: re-capture in the same page delivers expanded content
PASS: article engagement counts removed while useful longform body is preserved
PASS: legacy/same-ID record upgraded, thoughts/practice preserved, full text visible and persisted
```

另外已验证：

- Like / Bookmark 原生按钮识别。
- Unlike / Remove Bookmark 不会误采集。
- 页面噪声过滤。
- 飞入星球动画。
- 本地服务加载和路径越界返回 404。
- JavaScript 语法和 Manifest JSON。

## 目前仍需真实 X 页面验证的部分

X DOM 会变化，下一次测试重点是：

- 个人账号发帖后新 Article 的实际 DOM。
- 回复框使用点击 Post、`Cmd+Enter` 和 `Ctrl+Enter` 的差异。
- 引用帖子中“我的评论”和嵌套原帖的 DOM 层级。
- X Article 长文正文容器的实际 selector。
- 帖子在时间线、详情页、搜索结果和通知页中的结构差异。
- 同一条帖子先 Like、后 Bookmark 时是否需要合并成一条并保留两个来源信号。

如果真实 X 页面仍有漏采集，应优先记录：页面 URL、使用的行为、是否是普通帖子/Article/回复/引用、插件控制台错误、网页中实际进入的文字。不要先扩大清洗规则，以免误删正文。

## 尚未实现的产品方向

这些是产品讨论方向，不是已确认的现成功能：

- LLM 判断内容是知识、行动还是单纯情绪价值。
- 自动标签、主题聚类、语义关系、冲突和递进。
- 从多个 Idea 生成新的观点、内容选题或研究路径。
- 用户的思想周报和观点变化记录。
- 联网搜索、网站推荐、AI Agent 研究和行动建议。
- 跨设备账号同步、云端存储和正式发布。
- 系统级后台提醒、邮件或移动端通知。

推进顺序仍应以真实采集可靠性和用户是否愿意回来处理内容为先，再扩大 AI 能力。

## 本 session 的结论（2026-09-06）

本 session 主要完成了 Idea Planet 的 UI 和交互雏形，产品核心进一步收敛为：

> 把瞬间的喜欢，变成可回看的兴趣线索；把零散内容，逐渐组织成自己的思想资产。

界面采用 Idea-first 方向：右侧尽量只呈现 Idea，减少说明文字、状态文字和多余按钮；左侧承载 Planet、Boards 和标签入口。卡片中的操作收敛为 Sweep、新 Idea、标签三个轻量图标行为。用户点击 Idea 正文可以直接编辑，点击卡片外部才结束编辑。长内容和 Article 默认折叠，保留换行和空行；Article 中的互动数字不进入正文。

产品模型也进一步明确：一切皆为 Idea。新的想法、长期方法论、行动计划、问题和情绪价值内容都可以是 Idea；`Action`、`Longterm` 等标签只是观察和组织方式。用户不需要被 Inbox 或“待处理”流程施加压力，Planet 是默认落点。

本 session 反复测试了多条 X 引用帖。普通帖子、Article、Like、Bookmark、去重、长文展开、正文清洗和旧记录升级已经有回归验证；但 X 的引用帖在不同页面和动态 DOM 下仍无法稳定捕捉原帖。当前已确认多个失败样例，包括：

- `https://x.com/Daniel_ccdy/status/2096450768933122107`
- `https://x.com/yuanyang_ai/status/2096228916742787459`
- `https://x.com/maxjjiang/status/2096537474898268649`
- `https://x.com/damiaoedux/status/2096425178293318092`

引用原帖自动捕捉暂时搁置，不应在下一 session 继续堆叠 DOM 选择器。若重新启动，应优先研究 X 的结构化网络响应或 `quoted_status` 数据，而不是继续依赖页面嵌套 `article`。

下一 session 可以转向产品层面的新问题：Planet 的回看节奏、标签和 Board 的信息架构、Idea 之间的连接方式、低价值内容的弱化策略，以及 Agent 如何在不增加用户压力的前提下放大 Idea 的价值。

## 新 session 开始时的建议顺序

1. 先阅读本文件、`01-user-intent.md` 和 `02-mvp-scope.md`。
2. 启动 `npm run dev`，重新加载 Chrome 插件并刷新 X。
3. 真实测试 Like、Bookmark、发帖、回复、引用、Article 和 `Cmd+Enter`。
4. 记录每个失败样例的 URL 类型、DOM 行为和实际保存结果。
5. 先修采集和父子关系，再讨论下一轮产品设计或 AI 功能。
