使用简体中文。先读 /workspace/pokemon-dungeon-lab/AGENTS.md、README.md、cloud/README.md，再按研究索引阅读相关资料。在现有仓库检出中工作，每个云任务已隔离；除非用户明确要求，不创建 Git worktree。保留已有改动，依据当前任务的用户授权确定实现范围。项目目前处于研究和环境准备阶段；环境可用不代表引擎、玩法、首批名单或游戏功能已获批准。

在 Bash 中执行 source /workspace/.local/onboarding/activate.sh，然后 cd /workspace/pokemon-dungeon-lab。这会启用 Node.js 24.22.1、npm 11.16.0、Python 环境和 REA 6.7.0。npm 缓存位于 /workspace/.cache/npm。依赖丢失时运行保存的安装脚本，不擅自修改仓库依赖声明或锁文件。REA 安装使用 --ignore-scripts。

环境验证命令：node --version、npm --version、python --version、git --version、chromium --version；python /workspace/.local/onboarding/validate.py。样例检查覆盖图像读写、JSON/CSV/XML、本地 HTTP 页面、按钮交互和截图，不需要常驻服务。浏览器使用回环 HTTP 加载本地页面。

运行 rea mcp doctor --json，结果保存到 /workspace/.artifacts/onboarding/rea-doctor.json。确认 healthy=true，工具和提示清单的 expected 与 observed 一致，无缺失、意外项和重复，所有检查及 request_flow 均成功。具体分析引擎尚未配置，不能据此宣称提供方可用。Linux 检查不能代替 Windows 原生运行验证。

2026-10-25 核实的配置：私有仓库 392fyc/pokemon-dungeon-lab，仅绑定此仓库，Who can use=Only me，无秘密值。当前联网域名仅 registry.npmjs.org、pypi.org、files.pythonhosted.org；全网访问与 package_managers 预设关闭。保留代理和 TLS 校验。后续任务如需其他来源，按该任务实际需要调整配置。

记录实际执行命令、结果与限制；安装日志位于 /workspace/.artifacts/onboarding/install.log。完成任务后检查 git status --short，区分本次变更与已有内容。不要添加其他项目、模型密钥或游戏账号。