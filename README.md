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

构建完成后 FastAPI 会直接托管 `dist/`，验收地址为云服务的 8000 端口。SQLite 默认位于 `data/kanshan.db`；设置 `KANSHAN_DATA_DIR` 后改用该可写目录，首次启动会自动复制仓库内的演示数据库。

## Docker

```bash
docker build -t kanshan-detective:local .
docker run --rm -p 8000:8000 \
  -v kanshan-detective-data:/app/runtime-data \
  kanshan-detective:local
```

打开 <http://127.0.0.1:8000>，健康检查为 <http://127.0.0.1:8000/api/health>。

生产镜像会从知乎官方 CDN 下载与容器架构匹配的 `zhihu-cli 0.3.0`，校验 SHA-256 后安装到 `/usr/local/bin/zhihu-cli`。无需进入运行中的容器手工安装。

## GitHub Actions 与 Sealos

`.github/workflows/deploy.yml` 会在 PR 上执行前后端校验和 Docker 构建；推送到 `main` 或手动触发时，还会：

1. 推送 `sunnynh/kanshan-detective:latest` 和当前 commit SHA 镜像到阿里云容器镜像服务。
2. 更新 Sealos 中 `ns-z8o8d2sw` 命名空间的 `kanshan-detective` StatefulSet。
3. 等待滚动部署完成，失败则让 Action 直接失败。

当前 GitHub 仓库需配置三个 Actions Secrets：

- `ALIYUN_USERNAME`：阿里云镜像仓库用户名。
- `ALIYUN_PASSWORD`：阿里云镜像仓库访问密码。
- `KUBE_CONFIG`：Sealos 集群的完整 kubeconfig 文本。

知乎开放平台的 Access Secret 不进入 GitHub 仓库或 Docker 镜像。在 Sealos 应用的环境变量中配置：

```text
ZHIHU_ACCESS_SECRET=<开放平台生成的 Access Secret>
```

保存后重新部署或重启应用。部署完成后访问 `/api/health`，应同时看到：

```json
{
  "cliAvailable": true,
  "cli": {
    "path": "/usr/local/bin/zhihu-cli",
    "available": true,
    "accessSecretEnvConfigured": true
  }
}
```

Sealos 首次创建应用时按下列参数与 Action 对齐：

- 应用名、StatefulSet 名和容器名：`kanshan-detective`
- 私有镜像：`crpi-4fx5gjh2gg6qrzgj.cn-beijing.personal.cr.aliyuncs.com/sunnynh/kanshan-detective:latest`
- 容器端口：`8000`
- 副本数：`1`（SQLite 不支持这个方案下的多副本共享写入）
- 持久卷挂载路径：`/app/runtime-data`
- 健康检查：HTTP GET `/api/health`，端口 `8000`

如 Sealos 实际生成的命名空间、StatefulSet 或容器名与上述不同，同步修改 workflow 顶部的 `K8S_NAMESPACE`、`K8S_STATEFULSET` 和 `K8S_CONTAINER`。

## CLI 配置

本机默认读取：

```text
/Users/zhihu/Library/Application Support/zhihu-cli/current/zhihu-cli
```

云服务使用（Dockerfile 已预设 CLI 路径，只需配置 Secret）：

```bash
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
