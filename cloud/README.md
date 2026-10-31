# Codex Cloud 环境

本目录的环境只属于 Codex（ChatGPT 账号）。2026-10-30 起后续工作由本机 Claude 主会话接手，这两个 Codex 云环境改为由用户手动派发的可选通道；同日稍后本机 Codex 重新上线，`dev` lane 的本机 Codex 也可为自己认领的 issue 派发云任务，方针见 `docs/07-工作环境/多lane并行协作.md` 第 11 节（`start-skill.md` 中阶段 3—4 的范围已过时，以任务说明为准）；Claude 侧的执行方式和待建的 Claude 云环境配置见 `docs/07-工作环境/Claude作业方式.md`。

`pokemon-dungeon-lab` 已于 2026 年 10 月 25 日发布，并通过一个新云端任务的复用检查。环境仅连接私有仓库 [392fyc/pokemon-dungeon-lab](https://github.com/392fyc/pokemon-dungeon-lab)，访问范围为 **Only me**，没有添加秘密值。

2026-10-29用户已批准按[阶段3—4规格（固定提交 d03ef51）](https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/90-archive/trial-spec/README.md)开展阶段3—4，采用Phaser 4.2.1＋TypeScript与Vite。本页下方的工具与检查记录均属于2026-10-25历史验证，不能代替本轮工作区、安装、构建或浏览器结果。当前任务按[start-skill.md](start-skill.md)核对实际状态。

## 已保存的配置

- [安装脚本](install.sh)：真实环境中保存并重复执行通过的配置，使用仓库外的 `/workspace/.local/` 安装工具链。
- [启动规则](start-skill.md)：启用工具链、读取研究资料、执行检查及处理后续任务范围。
- [验证记录](verification-2026-10-25.json)：版本、检查结果、真实限制和来源任务标识。

安装脚本依赖当前云端基础镜像提供 Python、Git 和 `/usr/bin/chromium`，会核实 Chromium 是否存在。它不声称能在任意 Linux 机器上从零安装全部系统软件。

## 实测工具链

| 工具 | 版本 |
| --- | --- |
| Node.js | 24.22.1 |
| npm | 11.16.0 |
| REA 官方 npm 包 | 6.7.0 |
| Python | 3.12.14 |
| Pillow | 12.3.0 |
| Playwright | 1.62.0 |
| Chromium | 154.0.8037.57 |
| Git | 2.52.0 |

## 已通过的检查

安装脚本重复执行、新任务中直接复用已有工具链、PNG 读写、JSON/CSV/XML、本地 HTTP 页面、浏览器按钮点击与截图均通过。云端 REA doctor 返回 `healthy=true`：工具 207/207、提示 6/6，无缺失、意外项或重复；初始化、服务身份和请求流程全部通过。新任务检查前后仓库工作区均干净。

普通任务的默认命令沙箱会阻止本地套接字，并影响 REA stdio 子进程检查。通过平台执行审批机制重跑后，这两项检查通过；没有改动环境的全局访问范围。遇到同类错误时，先按平台流程申请本次必要执行权限，不重装正常依赖或放宽全局设置。

具体分析引擎尚未配置。云端采用官方 npm 发布包，本机采用 Git 源码构建，分别按各自清单校验；本机工具数为 227，不据此声称两份构建内容完全相同。Linux 验证不代替 Windows 原生版本的验收。

## 联网与使用入口

环境保存的允许域名为 `registry.npmjs.org`、`pypi.org`、`files.pythonhosted.org`，全网访问和包管理器预设关闭。三个安装来源实际请求成功。新任务的实际策略还自动包含 `www.pypi.org` 别名；不要把界面条目数解释为逐字符相同的实际主机清单。后续研究、引擎或数据下载需要其他来源时，按具体任务调整。

在网页的 Explore → Codex 中，新建任务，选择 Work in → Cloud，再选择 `pokemon-dungeon-lab`。环境已经在这个普通任务选择器中出现并成功启动检查任务。安装与启动配置的官方说明见 [Codex Cloud 环境](https://learn.chatgpt.com/docs/environments/cloud-environments)。

- [环境准备会话](https://chatgpt.com/local/01a1718c-7389-76ce-ad04-9d2242aa40ba)
- [新任务复用验证](https://chatgpt.com/local/01a17197-73b0-70db-bac7-7a80702b60b7)

研究库已并入本仓库 `docs/`，云端直接读取，不再需要快照清单；本目录记录后续建立的环境状态。
