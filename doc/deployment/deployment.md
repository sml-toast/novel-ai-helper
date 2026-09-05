# Novel AI 部署文档

| 项目 | 内容 |
|---|---|
| 文档日期 | 2026-09-05 |
| 适用范围 | 本地部署、数据备份与恢复、换机迁移、进程常驻、升级回滚、故障排查 |
| 前置阅读 | `README.md`（快速开始）· `doc/architecture/architecture.md` §七（安全模型） |

## 一、部署形态定位

**单机单用户的本地写作工具**。默认所有服务只绑定 `127.0.0.1`，只有本机浏览器能访问。
这是刻意设计（F074）：稿件数据无账号体系保护，暴露到网络等于任何人可读写全部稿件。

支持的部署形态：

| 形态 | 支持度 | 说明 |
|---|---|---|
| 本机日常使用 | ✅ 推荐形态 | `npm run dev`，或下文的进程常驻方案 |
| 换机迁移 / 备份恢复 | ✅ 一等公民 | 见 §四、§五 |
| 局域网访问（自己一个人的多设备） | ⚠️ 可行但自担风险 | 见 §六，需同时评估密钥备份端点 |
| 公网部署 / 多用户 / 协作 | ❌ 不支持 | 需账号体系与鉴权重构，属显式非目标（F095 不排期） |

## 二、环境要求与安装

- **Node.js >= 22.5.0**（`node:sqlite` 最低版本）。启动时打印 `ExperimentalWarning: SQLite` 是正常现象。
- 安装与启动：

```bash
git clone <repo> && cd novel-ai
npm install          # 只有 @playwright/test 一个 devDependency
npm run dev          # API 8787 + Web 5175
```

- 验证：浏览器打开 `http://localhost:5175/novel-ai.html`，顶栏显示「API 在线」即部署成功；
  首次启动自动建库并写入演示项目「雾港星火」。

## 三、环境变量总表

AI 能力配置建议写入 `.env`（`cp .env.example .env`，已被 gitignore）。服务配置可用环境变量或启动脚本注入。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NOVEL_AI_BASE_URL` | 空（走项目库设置） | OpenAI 兼容服务地址，末尾不带 `/chat/completions` |
| `NOVEL_AI_MODEL` | `mock-novel-copilot` | 模型名；保持默认即 mock 演示模式 |
| `NOVEL_AI_API_KEY` | 空 | 优先级低于项目库加密保存的密钥（F075） |
| `NOVEL_API_PORT` | `8787` | API 端口 |
| `NOVEL_API_HOST` | `127.0.0.1` | API 绑定地址；改 `0.0.0.0` 见 §六 |
| `NOVEL_WEB_PORT` | `5175` | 静态服务端口；改动会被 dev 脚本同步给 API 白名单 |
| `NOVEL_WEB_HOST` | `127.0.0.1` | 静态服务绑定地址 |
| `NOVEL_ALLOWED_ORIGINS` | 本机 5175 两个来源 | 逗号分隔白名单；**放宽前先读 §六** |
| `NOVEL_DB_PATH` | `.data/novel-ai.sqlite` | 相对路径按项目根解析；备份/测试隔离用 |
| `NOVEL_MASTER_KEY_PATH` | `~/.novel-ai/master.key` | **仅测试用**。生产指向项目内目录会导致主密钥随 `.gitignore` 丢失 |

> 注意：当前版本**不会自动加载 `.env` 文件**——`.env` 供 `export` 后手动启动，或由进程管理器注入。
> 最简单的用法：在启动前 `set -a; source .env; set +a; npm run dev`（或写进 systemd 的 `EnvironmentFile=`，见 §七）。

## 四、数据资产清单与备份

系统只有两类需要备份的数据资产：

| 资产 | 位置 | 内容 | 丢失后果 |
|---|---|---|---|
| 业务数据库 | `.data/novel-ai.sqlite`（+ `-wal`/`-shm` 伴生文件） | 全部稿件、知识库、AI 历史、发布任务、审计 | 稿件全丢 |
| **主密钥** | `~/.novel-ai/master.key` | 解密「设置面板保存的 API Key」所需的 32 字节密钥 | 已保存的 AI 密钥**永久不可解密**（需重新录入；稿件本身不受影响） |

### 4.1 备份步骤

```bash
# 1) 数据库：推荐用 SQLite 在线备份（WAL 安全），三份产物一起拷贝亦可
sqlite3 .data/novel-ai.sqlite ".backup '/backup/novel-ai-$(date +%F).sqlite'"
#   简易方案：停服后整拷 .data/ 目录（必须含 -wal / -shm，否则丢最近事务）

# 2) 主密钥（敏感！备份介质需妥善保管）
cp ~/.novel-ai/master.key /backup/master.key.bak
```

也可以在应用内做逻辑备份：设置区「导出项目 JSON」（`GET /api/novel/export/project`）。
F078 之后导出已覆盖**全部业务表**（章节、版本、批注、待办、术语、时间线、场景、世界观、
AI 历史、发布任务等 19 个集合，且永不携带密钥材料），与文件级备份互为补充：
JSON 便于跨版本/跨平台恢复与人工检视，文件级备份最完整（含审计日志与主密钥加密材料本身）。

### 4.2 恢复步骤

优先方式（应用内，F078）：设置区「导入项目 JSON」→ 选择导出快照 → 确认模式。
服务端会先做整库 `VACUUM INTO` 自动备份（路径在结果卡片中给出），再单事务回灌：
- **覆盖当前项目**：替换目标项目的全部业务数据，项目 id 与账号归属不变；
- **导入为新项目**：重映射 ID 生成新项目，现有数据零触碰（多项目切换上线前新项目暂需经 API 访问）。

文件级恢复（数据库损坏或需整库回退时）：

```bash
# 1) 停服（Ctrl-C 或停掉 systemd/launchd 单元）
# 2) 恢复数据库（三份产物放回 .data/，或直接替换为 .backup 产物并删掉 -wal/-shm）
cp /backup/novel-ai-2026-09-05.sqlite .data/novel-ai.sqlite
rm -f .data/novel-ai.sqlite-wal .data/novel-ai.sqlite-shm
# 3) 恢复主密钥（若换了机器）
mkdir -p ~/.novel-ai && cp /backup/master.key.bak ~/.novel-ai/master.key && chmod 600 ~/.novel-ai/master.key
# 4) 重启，顶栏确认「API 在线」、章节与版本完整
```

> 主密钥与数据库**要一起备份**：库里的密文用旧主密钥加密，只恢复库不恢复密钥，AI 密钥照样解不开。

## 五、换机迁移

1. 旧机按 §4.1 备份（数据库 + 主密钥）。
2. 新机安装 Node >= 22.5.0，克隆仓库，`npm install`。
3. 按 §4.2 恢复两份资产（注意主密钥放到新机的 `~/.novel-ai/master.key`）。
4. `.env` 若有自建配置一并拷贝；启动 `npm run dev`。
5. 首次启动若日志出现 `[db] schema v0 → v1，已应用迁移 …` 属正常（迁移框架自动补 schema）。

## 六、局域网访问（高风险操作，逐条确认后再做）

放开绑定**等于把无鉴权的稿件库暴露给同网段所有设备**。确需（例如手机上看稿）时：

```bash
NOVEL_API_HOST=0.0.0.0 NOVEL_WEB_HOST=0.0.0.0 \
NOVEL_ALLOWED_ORIGINS=http://192.168.1.10:5175 \
NOVEL_WEB_PORT=5175 npm run dev
```

放行前必须逐条确认：

1. **`NOVEL_ALLOWED_ORIGINS` 必须同步改成实际访问来源**（`http://<本机局域网IP>:<Web端口>`），
   否则页面请求被 403。默认白名单只有 `127.0.0.1`/`localhost`。
2. **先摘掉主密钥备份端点**（`GET /api/novel/settings/ai/master-key`）：它会把主密钥原文返回给页面，
   其安全边界依赖「仅本机可达」（见架构文档 §7.3）。
3. 可信网络（家庭/个人热点）；公共 Wi-Fi 下不要开放。
4. 不与公网端口映射/内网穿透叠加使用。
5. 评估后仍建议优先考虑「设备上跑一份 + 定期同步备份」的方案。

## 七、进程常驻（开机自启 / 后台运行）

### 7.1 macOS（launchd，用户级）

`~/Library/Launchers/com.novel-ai.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.novel-ai</string>
  <key>WorkingDirectory</key><string>/Users/you/novel-ai</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string><string>server/novel-api.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>NOVEL_AI_BASE_URL</key><string>https://api.example.com/v1</string>
    <key>NOVEL_AI_MODEL</key><string>your-model</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/novel-ai-api.log</string>
  <key>StandardErrorPath</key><string>/tmp/novel-ai-api.err</string>
</dict></plist>
```

```bash
launchctl load ~/Library/Launchers/com.novel-ai.plist
# 静态服务同理复制一份（server/web-server.js，com.novel-ai-web）
```

> launchd 直接拉起单进程时没有 dev 脚本的端口同步逻辑，自定义 `NOVEL_WEB_PORT` 需在两个单元里各自注入。

### 7.2 Linux（systemd，用户级）

`~/.config/systemd/user/novel-ai.service`：

```ini
[Unit]
Description=Novel AI (API + Web)
After=network.target

[Service]
WorkingDirectory=/home/you/novel-ai
# API 进程
ExecStart=/usr/bin/node server/novel-api.js
EnvironmentFile=/home/you/novel-ai/.env
Restart=on-failure
# 由一个 unit 拉起两个进程：ExecStart 前 shell 包装亦可，或拆成两个 unit（推荐）

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now novel-ai
journalctl --user -u novel-ai -f
```

建议拆成 `novel-ai-api` / `novel-ai-web` 两个 unit 便于独立重启；`.env` 走 `EnvironmentFile=`
正好解决「本版本不自动加载 .env」的问题。

### 7.3 保持运行的其他注意点

- 进程退出不影响数据：SQLite 已落盘；未保存的浏览器草稿在 localStorage（换浏览器会丢）。
- 发布功能的**后台调度器尚未实现**（当前懒扫描），定时发布在「进程存活 + 作者打开发布面板」时才触发；
  该限制 UI 有标注，调度器在路线图 T018。
- 系统休眠/重启后 `KeepAlive`/`Restart` 会自动拉起，无需人工干预。

## 八、升级与回滚

### 8.1 升级

```bash
git pull
npm install            # playwright 版本变化时才需要
npm run dev            # 启动时自动执行未应用的 schema 迁移
```

启动日志出现 `[db] schema vN → vM，已应用迁移 …` 即迁移成功。**迁移失败会直接终止启动并整体回滚**
（绝不带半截 schema 运行），此时按 §8.2 回滚或按报错修复。

### 8.2 回滚

1. **代码回滚**：`git checkout <旧tag/commit>`。
2. **数据库回滚**：恢复升级前的备份（§4.2）。schema 已前移的库不建议直接配旧代码——先备份再操作。
3. **主密钥永不轮换覆盖**：升级不动 `~/.novel-ai/master.key`；若误删，已存 AI 密钥需重新录入（稿件无损）。

### 8.3 升级前检查单

- [ ] 数据库备份完成（§4.1）
- [ ] `~/.novel-ai/master.key` 已有备份
- [ ] `git status` 干净（无未提交的本地改动被 pull 冲突）
- [ ] 测试通过：`npm test`（用例用独立测试库，不碰开发库）

## 九、故障排查

| 症状 | 可能原因 | 处置 |
|---|---|---|
| 页面打开但顶栏「本地演示」 | API 未启动 / 端口不通 / 来源被 403 | 确认 8787 进程；`curl http://127.0.0.1:8787/api/novel/bootstrap`；核对 `NOVEL_ALLOWED_ORIGINS` |
| 请求 403 `origin not allowed` | 访问来源不在白名单 | 从 `127.0.0.1`/`localhost` 访问，或按 §六 配置白名单 |
| 请求 413 | 请求体 > 2MB | 预期防护；批量导入拆分提交 |
| AI 显示「本地演示模式（mock）」 | 未配置密钥 | 预期降级；在设置面板或 `.env` 配置 |
| AI 显示「AI 密钥不可用」 | 主密钥丢失/被替换 | 恢复主密钥备份（§4.2），或在设置中重新录入密钥 |
| 启动报「迁移 vN 失败，已回滚」 | schema 迁移异常 | 读报错中的迁移名；恢复备份库（§4.2）；修复后重试 |
| 端口占用 `EADDRINUSE` | 残留进程 | `lsof -i :8787 -i :5175` 结束残留；检查 dev 脚本是否被 SIGKILL 绕过了 trap |
| 打开即白屏 | `.js` 的 MIME 错误或路径穿越拦截 | 自带静态服务已处理；若换了反代/Nginx，确保 `.js` 为 `text/javascript` 且根目录映射正确 |
| 数据库磁盘占用异常增长 | 版本表膨胀（旧版本数据） | 本项目已通过「草稿不进版本表」规避；老库可检查 `chapter_versions` 行数并做一次导出归档 |

## 十、安全检查清单（上线/长期运行前）

- [ ] 两个服务 `address()` 均为 `127.0.0.1`（`lsof -iTCP -sTCP:LISTEN | grep -E '8787|5175'`）
- [ ] `.env` 在 `.gitignore` 内且从未被提交；全仓 `git log --all -S '<密钥前缀>'` 无命中
- [ ] `~/.novel-ai/master.key` 权限 600、目录 700，且**另有离线备份**
- [ ] 数据库有定期备份（建议每日 cron/launchd + 异地一份）
- [ ] 未放开 `NOVEL_ALLOWED_ORIGINS`；若放开了，已确认 §六 全部条目（含摘除主密钥端点）
- [ ] Node 版本 >= 22.5.0 且升级前跑过 `npm test`
