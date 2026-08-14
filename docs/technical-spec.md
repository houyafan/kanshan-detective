# 看山侦探事务所 MVP 技术文档

版本：V0.2  
日期：2026-08-14  
范围：看山 coding 挑战赛 PC-only 最小可运行 Demo

## 0. 产品与技术评审结论

2026-08-14 已对产品文档全文、首页 7 张交互示意和本技术文档完成联合评审。产品主链路、任务依赖、证据规则、推理硬规则与结案结构完整，可以进入开发。以下冲突项以本技术文档为最终研发口径：

1. 产品稿中的 375px 移动端验收项不执行；本项目只验收 1440×900 与 1366×768 PC 页面。
2. 产品稿中的登录、OAuth、真实发布及发布回流不进入 MVP；调查笔记和结案报告只提供本地保存、复制草稿与知乎主站跳转。
3. 产品稿中的真实 AI Service 不进入 MVP；看山对白、提示、推理点评和报告生成过程全部由预制配置驱动，并明确标注为演示表现。
4. CLI 能力以当前 zhihu-cli 0.3.0 运行时为准；MVP 只调用 `search zhihu`，卷宗阅读、关键来源与发布不假设存在 CLI 能力。
5. P04-A 至 P04-E 共用一个调查工作台与统一任务壳，通过任务类型切换内容，减少路由和状态分叉，同时完整保留五类调查行为。
6. SQLite 是进度真源；浏览器 localStorage 仅保存匿名 runId 与未提交草稿。静态 seed 与初始数据库随仓库提交，运行期写入同一数据库文件。
7. CASE 001 当前内容均为研发演示 seed，页面统一显示“演示内容”标识；正式路演前必须使用人工填充模板补齐真实来源并通过审核。

本轮优化重点：首屏快速接案、调查桌面唯一下一步建议、任务完成即时获得证据与拼图、证据板清楚展示“已知/未知”、推理不允许只猜选项、报告完整回溯来源与限制。

## 1. 已确认约束

1. 线上部署在云服务，运行时允许本地 SQLite 读写。
2. CASE 001 内容由人工审核；受限于当前 CLI 能力，CLI 查不到的内容由人工补充进案件配置。
3. P0 不做真实发布，不接 OAuth；发布/分享入口可以增加跳转知乎主站的超链。
4. CLI 首版锁定真实能力 `search zhihu`。
5. 暂不接入真实 AI 服务，所有结果内容预制；界面可以做 AI 思考、打字、推理中的样式封装。
6. 看山素材只用当前 `看山三视图/`。如需扩展图，先提供 Image-to-Image 提示词，由用户生成后再接入。
7. 后端使用 Python 实现，复用用户已有 Python 云服务部署经验。
8. PC 端以 1440×900 为主验收分辨率，兼容 1366×768。
9. 视觉方向为沉浸式侦探事务所/档案桌面，做精品 MVP，不做粗糙线框。
10. 先使用演示 seed；开发完成后提供内容填充模板，由人工补正式来源与事实内容。
11. 线上可以提供 `ZHIHU_ACCESS_SECRET` 环境变量。
12. git 在本地开发完成后由用户初始化或接入。

## 2. 后续待补充材料

1. Python 云服务的具体启动命令、开放端口和可写目录。
2. CASE 001 正式来源 URL、摘录、正确项、限制条件和审核人信息。
3. 如需要扩展视觉资产，用户生成后的图片文件。

## 3. 技术目标

P0 做一个 PC 端可体验的单案闭环：用户进入事务所，接受 CASE 001《失踪的睡眠》，完成搜索调查、卷宗阅读、观点对照、关键来源、证据板、推理提交和结案报告。

工程上优先保证：

- 无登录也能完整体验主线。
- 至少一处真实调用知乎开放平台 CLI 能力。
- CLI 不可用时仍能用演示数据和模板结案。
- 所有状态可恢复，刷新、返回、重复点击不会重复发证据或碎片。
- 数据库、案件配置、图片和静态演示数据随 git 提交，保证本地和线上环境一致。

## 4. 非目标

- 不适配移动端。
- 不接 OAuth，不做多端实时同步。
- 不做真实发布到知乎，只提供知乎主站跳转和可复制分享草稿。
- 不接真实 AI 服务，首版所有对话、点评和报告均使用预制内容。
- 不做多人协作、排行、商城、每日案件、自由 NPC 对话。
- 不让 AI 生成或裁定事实真相。
- 不做完整后台，P0 用本地 JSON/SQLite seed 作为运营配置。

## 5. 推荐技术栈

- 前端：React + Vite + TypeScript。
- 后端：Python + FastAPI + Uvicorn。
- 数据库：SQLite + Python 标准库 `sqlite3`。如后续表关系明显复杂，再引入 SQLAlchemy。
- 样式：CSS Modules 或普通 CSS，PC 端固定主宽度布局。
- CLI 调用：后端 `subprocess.run` / `asyncio.create_subprocess_exec` 调用 `zhihu-cli` 绝对路径。
- AI：不接真实服务，仅保留 UI 层“AI 思考中”样式和模板生成接口。

推荐原因：项目为空仓库，React/Vite 做 PC 端体验效率高；Python 后端可复用既有云服务部署经验；SQLite 易提交，CLI Adapter 也适合在 Python 服务层统一做超时、降级和日志隔离。

## 6. 目录结构

```text
.
├── AGENTS.md
├── data/
│   ├── kanshan.db
│   └── seeds/
│       ├── case_001.json
│       ├── demo_search_results.json
│       └── content_template.case_001.json
├── docs/
│   └── technical-spec.md
├── public/
│   └── assets/
│       └── kanshan/
├── src/
│   ├── App.tsx
│   ├── api.ts
│   ├── state.tsx
│   ├── styles.css
│   └── types.ts
├── server/
│   ├── app.py
│   ├── db.py
│   └── cli_adapter.py
├── package.json
├── requirements.txt
└── README.md
```

## 7. 核心页面

P0 页面按产品文档保留 7 个页面，但实现从简：

- P01 事务所首页：今日案件、继续调查、已结案报告入口。
- P02 案件 Brief：谜面、目标、免责声明、开始调查。
- P03 调查桌面：任务卡、证据数、拼图数、下一步建议。
- P04 任务页：搜索调查、卷宗阅读、观点对照、调查笔记、关键来源可以共用页面壳。
- P05 证据板：证据卡、拼图、加入推理。
- P06 推理提交：单选结论、证据槽、排序、理由、提交反馈。
- P07 结案报告：评级、证据链、固定结论、来源、分享草稿。

PC-only 交互策略：

- 主容器建议 `min-width: 1180px`，内容宽度 1180-1360px。
- 重点验收 `1440×900`，兼容 `1366×768`。
- 不做移动布局，但仍避免文本溢出、按钮挤压和横向错位。
- 拖拽不是必须，首版使用点击加入/移除证据。
- 视觉目标是沉浸式侦探事务所：档案、证据板、线索卡、看山角色对白、桌面质感，但交互仍保持清晰高效。

## 8. 交互示意图落地要求

Word 文档第 1 页包含 7 张核心页面示意，开发时作为首版视觉与交互参考，不按普通表格后台实现。

1. 事务所首页：深色夜间事务所氛围，今日案件主卡、看山形象、案件进度和未解锁案件卡。
2. 案件 Brief：纸质档案/卷宗风格，CASE 编号、标题、机密档案章、调查目标和开始调查按钮。
3. 调查桌面：俯视桌面场景，搜索终端、知乎卷宗、专家证词、调查笔记、真相拼图等任务入口以实体卡片呈现。
4. 搜索任务页：保留任务目标和进度，搜索框、结果卡、线索标记状态、领取线索碎片按钮。
5. 线索与拼图板：左侧线索记录，右侧 3×3 真相拼图，未解锁块用问号/锁，底部看山提示。
6. 推理提交页：问题、单选结论、关键证据卡、提交推理按钮并列呈现，强调证据链组织。
7. 结案报告页：档案报告感，案件已解决盖章、评级、经验/徽章、看山照片和分享/返回按钮。

实现优先级：

- 先还原信息层级和交互位置，再做质感细节。
- 关键容器使用档案纸、卡片、桌面阴影、印章、线索贴纸等视觉语言。
- 看山形象需要贯穿首页、Brief、提示、推理、报告，但不遮挡核心操作。
- 所有“AI 思考/推理中”只是展示动效，内容仍来自预制配置。

## 9. 状态机

```text
NOT_STARTED
  -> BRIEF
  -> INVESTIGATING
  -> READY
  -> REASONING
  -> CLOSED

REASONING 失败后可回到 INVESTIGATING 或保留 REASONING。
连续失败 3 次后可进入 ASSISTED，再进入 CLOSED，评级最高 B。
```

状态写入原则：

- 每次任务完成、证据新增、拼图解锁、推理提交、报告生成都立即持久化。
- 幂等键使用 `runId + taskId/evidenceId/attemptId`。
- 刷新后根据 `PlayerCase.lastPage` 和状态恢复。
- 直接访问不合法页面时重定向到最近可继续页面。

## 10. SQLite 数据模型

### `case_configs`

| 字段 | 类型 | 说明 |
|---|---|---|
| `case_id` | text primary key | 例如 `case_001` |
| `title` | text | 案件标题 |
| `version` | integer | 配置版本 |
| `config_json` | text | 完整案件配置 JSON |
| `created_at` | text | 创建时间 |

### `player_cases`

| 字段 | 类型 | 说明 |
|---|---|---|
| `run_id` | text primary key | 匿名运行 ID |
| `case_id` | text | 案件 ID |
| `status` | text | 状态机状态 |
| `last_page` | text | 最近页面 |
| `state_json` | text | 任务、证据、拼图、草稿等 |
| `fallback_used` | integer | 是否使用演示数据 |
| `created_at` | text | 创建时间 |
| `updated_at` | text | 更新时间 |

### `events`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | integer primary key autoincrement | 自增 ID |
| `run_id` | text | 运行 ID |
| `event_name` | text | 事件名 |
| `payload_json` | text | 参数 |
| `created_at` | text | 事件时间 |

### `reasoning_attempts`

| 字段 | 类型 | 说明 |
|---|---|---|
| `attempt_id` | text primary key | 幂等提交 ID |
| `run_id` | text | 运行 ID |
| `selected_option_id` | text | 用户选择 |
| `evidence_json` | text | 证据与排序 |
| `reason` | text | 用户理由 |
| `hard_result` | text | `success` / `fail` |
| `feedback_json` | text | 预制点评 |
| `created_at` | text | 提交时间 |

### `reports`

| 字段 | 类型 | 说明 |
|---|---|---|
| `report_id` | text primary key | 报告 ID |
| `run_id` | text | 运行 ID |
| `grade` | text | S/A/B |
| `assisted` | integer | 是否协助结案 |
| `report_json` | text | 结案报告 |
| `created_at` | text | 创建时间 |

## 11. API 设计

基础前缀：`/api`

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/case/current` | 获取 CASE 001 配置 |
| `POST` | `/runs` | 创建 run |
| `GET` | `/runs/:runId` | 获取进度 |
| `PATCH` | `/runs/:runId` | 保存 lastPage、草稿等 |
| `POST` | `/runs/:runId/tasks/:taskId/start` | 开始任务 |
| `POST` | `/runs/:runId/tasks/:taskId/complete` | 完成任务并发证据/碎片 |
| `POST` | `/runs/:runId/search` | 调用 CLI 搜索或演示数据 |
| `POST` | `/runs/:runId/reasoning` | 提交推理 |
| `GET` | `/runs/:runId/report` | 获取结案报告 |
| `POST` | `/events` | 记录埋点 |

所有写接口返回最新 `PlayerCase` 摘要，前端以服务端结果为准。

## 12. CLI Adapter

P0 建议只接一项真实能力：知乎搜索。

真实命令示例：

```bash
"/Users/zhihu/Library/Application Support/zhihu-cli/current/zhihu-cli" search zhihu --query "睡够还是困" --count 10
```

后端封装：

```text
CliAdapter.searchZhihu(query, traceId)
  -> normalize results[{sourceId,title,author,summary,url,type}]
  -> schema validate
  -> timeout 10s
  -> retry once
  -> fallback demo_search_results.json
```

降级规则：

- 5 秒前端提示“仍在调查”。
- 10 秒后后端超时，允许重试一次。
- 第二次失败时返回演示数据，并给每条结果加 `fallback=true`。
- 使用演示数据必须写入 `player_cases.fallback_used=1` 和事件参数 `fallbackUsed=true`。

注意：产品文档里的 `read` 和 `publish` 不应假设 CLI 已有对应能力。P0 的卷宗阅读用 `case_001.json` 中的审核摘录；发布只做复制分享草稿和知乎主站跳转。

线上部署注意：

- 本机开发可以使用 macOS 钥匙串中已配置的 Access Secret。
- 云服务应通过 `ZHIHU_ACCESS_SECRET` 环境变量提供凭证，不提交到 git。
- CLI 二进制需要作为部署步骤安装，或随构建产物以固定路径提供，并由配置项 `ZHIHU_CLI_PATH` 指向。
- Python 服务启动前应执行一次健康检查，确认 SQLite 可写、CLI 可执行、环境变量存在。

## 13. AI-like Presentation

P0 不接真实 AI 服务。为了体现 AI 看山的存在感，只实现 AI-like 展示层。

允许的表现：

- 看山“思考中”状态。
- 打字机式对白。
- 预制点评分段展示。
- 报告生成进度条或步骤动画。

内容来源：

- 看山对白来自 `case_001.json` 的 `copy` 配置。
- 结案点评来自固定模板和用户状态拼接。
- 分享草稿来自固定模板。

禁止：

- 改写 `correctOptionId`。
- 新增证据或来源。
- 判断医学事实。
- 把个人笔记当成普遍结论。

## 14. 推理判定

硬规则由服务端执行：

```text
selectedOptionId == caseConfig.reasoning.correctOptionId
evidenceIds contains E05
evidenceIds contains at least one evidence that supports correctOptionId
```

首版排序只记录，不阻断通关。理由用于点评，不参与硬规则成败。

评级：

- S：未协助、首次成功、完成 E05、至少 4 条证据。
- A：未协助、1-2 次内成功、完成必做任务。
- B：使用协助或 3 次以上尝试。

## 15. 本地存储与恢复

前端保存：

- `sessionId`
- `activeRunId`
- 页面临时草稿，例如搜索词、推理未提交表单

后端 SQLite 保存：

- 可恢复的案件进度。
- 证据、碎片、报告。
- 事件和尝试记录。

本地存储只作为快速恢复和无网兜底，最终状态以 SQLite 为准。

## 16. 静态资源与提交

需要随仓库提交：

- `data/kanshan.db`
- `data/seeds/*.json`
- `data/seeds/content_template.case_001.json`
- `public/assets/kanshan/*`
- 演示搜索结果、模板文案、案件配置

不提交：

- Access Secret
- OAuth Token
- `.env`
- 用户真实隐私数据
- 运行日志中的敏感请求体

如基于 `看山三视图/` 需要生成额外图片，技术侧只提供 Image-to-Image 提示词，不直接引入未经用户确认的新图。

内容填充模板需要覆盖：

- sourceId、sourceUrl、标题、作者/机构、发布日期。
- 审核摘录、上下文说明、支持的结论、不能证明的限制。
- evidenceId、证据等级、是否 required、支持/反驳的 optionIds。
- 审核人、审核时间、是否可上线。

## 17. 埋点、指标与演示员面板

P0 埋点只做本地记录，写入 SQLite `events` 表，方便试玩复盘和路演故障分析，不接外部埋点平台。

关键事件：

- 曝光：`activity_view`、`case_card_view`
- 接案：`case_accept`、`brief_start`
- 调查：`task_start`、`task_complete`
- 内容：`search_submit`、`result_open`、`evidence_mark`
- 证据：`evidence_board_view`、`piece_unlock`
- 推理：`reasoning_start`、`reasoning_submit`、`reasoning_result`
- 结案：`case_close`、`report_view`
- 分享：`share_edit`、`publish_click`

首版关注指标：

- 首线索时间：首次 `evidence_mark` - `case_accept`，目标中位数 ≤60 秒。
- 核心完成率：`case_close` UV / `case_accept` UV，内部试玩目标 ≥80%。
- 真实内容参与：至少一次真实 CLI search 的结案 run 占比。
- 平均推理次数：`reasoning_submit` PV / `case_close` UV，目标 1-2 次。
- 降级率：`fallbackUsed` run / 全部 run。

演示员面板仅在测试模式开放：

- 重置本案：恢复当前 run 到 `NOT_STARTED`。
- 跳到任务：路演故障恢复，自动补齐依赖并标记 `demoOverride=true`。
- 切换数据源：真实 CLI / 演示数据，界面必须显示当前模式。
- 模拟错误：搜索超时、空结果、预制内容失败，用于验收降级路径。

## 18. 测试验收

P0 必测：

- 新用户从 P01 到 P07 完成一次完整案件。
- 不登录也能结案。
- T01/T02/T03/T05 依赖顺序不可绕过。
- 重复点击、刷新、返回不会重复发证据或碎片。
- CLI 成功时能拿到真实搜索结果。
- CLI 失败时能用演示数据继续，报告显示 fallback。
- 满足 READY 前不能提交推理。
- 只猜正确项但缺 E05 不能通关。
- 连续失败后可提示和协助结案，评级不高于 B。
- 无真实 AI 服务时仍能展示完整 AI-like 对白、点评和报告。
- 无无限 loading；首屏 8 秒、CLI 10 秒进入可操作错误态。
- 返回不会清空搜索、卷宗、证据板和推理草稿上下文。
- 键盘可完成搜索、选择证据和提交前表单操作。
- 报告展示关键来源、限制条件、fallback/assisted 标记。

## 19. 开发顺序

1. D1：搭建 Vite + React + FastAPI + SQLite，完成路由和 7 页空壳。
2. D2：落 CASE 001 seed、PlayerCase 状态机、任务完成和证据/拼图发放。
3. D3：完成推理硬规则、报告生成、刷新恢复和幂等。
4. D4：接入 `search zhihu` CLI Adapter、云端凭证配置和演示数据降级。
5. D5：补充看山三视图素材、预制对白、AI-like 动效和 PC 端视觉打磨。
6. D6：加测试数据、演示员开关、README、部署说明和 3 分钟录屏脚本。

## 20. 交付清单

- 可运行 Demo。
- SQLite seed 数据库。
- CASE 001 演示配置、来源审核表和人工填充模板。
- CLI Adapter 说明和至少一项真实能力接入。
- 预制内容、AI-like 展示和无真实 AI 边界说明。
- 事件字典、测试用例、演示员故障恢复说明。
- 作品说明材料草稿。
