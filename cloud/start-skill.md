使用简体中文。先读实际工作区的AGENTS.md、README.md、docs/trial-spec/README.md和cloud/README.md。2026-10-29用户已批准准备包阶段3—4及Vite；按固定规格连续实现和验证。本次不做正式经济、第三方角色／数据、公开部署或网络扩权。保留既有改动，核对实际分支、HEAD和工作区；旧work与远端main不同时先解释差异，不reset、stash或强拉。

存在已有工具链时，先读并source /workspace/.local/onboarding/activate.sh，再进入游戏工作区，记录实际Node/npm版本。2026-10-29只读观察为激活后Node24.22.1、npm11.16.0，不把历史值当每次实测。依据本次锁文件安装游戏依赖；下载失败报告具体依赖和来源，不无条件重跑环境安装脚本或升级REA。

运行与本次游戏有关的类型检查、规则与保存验收、生产构建和浏览器实操。浏览器使用回环HTTP，记录构建、实际平台与存储来源。阶段3先确认完整一轮和保存，阶段4再覆盖真实邀请、退出、全灭与重开。验收清单内未执行项保持未验证，不以纸面结果代替。

历史onboarding验证和REA doctor不作为每个游戏任务的必跑项。只有任务实际依赖REA或出现相关故障时才按其说明处理。Linux检查不代替Windows浏览器或原生程序验收。

2026-10-25 核实的配置：私有仓库 392fyc/pokemon-dungeon-lab，仅绑定此仓库，Who can use=Only me，无秘密值。当前联网域名仅 registry.npmjs.org、pypi.org、files.pythonhosted.org；全网访问与 package_managers 预设关闭。保留代理和 TLS 校验。后续任务如需其他来源，按该任务实际需要调整配置。

本次证据写入所属游戏仓被忽略的.artifacts/trial/，检查忽略生效后使用；历史onboarding日志保持原位置。记录实际命令、结果与限制，交付前核对git状态，按当前规格受控发布，不裸git push或改Mercury受管内容。不要加入其他项目、模型密钥或游戏账号。
