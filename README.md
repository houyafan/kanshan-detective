# 看山侦探事务所

看山 coding challenge 的 PC-only 精品 MVP。用户围绕 CASE 001《失踪的睡眠》完成知乎搜索、卷宗阅读、观点对照、证据整理、推理与结案报告。

## 技术栈

- React + Vite + TypeScript
- Python + FastAPI
- SQLite
- zhihu-cli 0.3.0，MVP 只调用 `search zhihu`

不接 OAuth，不接真实 AI，不做真实发布。看山对白与推理点评均为预制内容；分享入口只复制草稿并打开知乎主站。

## 本地启动

```bash
pnpm install
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

终端一：

```bash
.venv/bin/uvicorn server.app:app --reload --host 0.0.0.0 --port 8000
```

终端二：

```bash
pnpm dev
```

打开 <http://127.0.0.1:5173>。

## 生产方式

```bash
pnpm build
.venv/bin/uvicorn server.app:app --host 0.0.0.0 --port 8000
```

构建完成后 FastAPI 会直接托管 `dist/`，验收地址为云服务的 8000 端口。SQLite 文件位于 `data/kanshan.db`，部署目录需要可写。

## CLI 配置

本机默认读取：

```text
/Users/zhihu/Library/Application Support/zhihu-cli/current/zhihu-cli
```

云服务使用：

```bash
export ZHIHU_CLI_PATH=/absolute/path/to/zhihu-cli
export ZHIHU_ACCESS_SECRET=your_secret
```

凭证不要提交到 git。CLI 不可用或超时时，搜索页会返回明确标注的演示数据，主线仍可结案。

## 内容与静态文件

- `data/seeds/case_001.json`：当前 CASE 001 演示配置
- `data/seeds/demo_search_results.json`：CLI 降级数据
- `data/seeds/content_template.case_001.json`：人工审核填充模板
- `data/kanshan.db`：可提交的初始 SQLite 数据库
- `public/assets/kanshan/`：项目使用的看山三视图素材

当前内容仅用于联调和比赛 Demo。正式展示前，应根据模板补齐真实来源、准确摘录、限制条件和审核信息。

## 验收口径

- 只适配 PC，主验收 1440×900，兼容 1366×768。
- 游客从首页到结案报告全程无需登录。
- 只猜正确选项不能通关，证据链必须包含 E05 和至少一条支持证据。
- 刷新后从 SQLite 恢复进度，任务奖励保持幂等。
- CLI 与预制 AI 表现不可用时不阻断主线。
