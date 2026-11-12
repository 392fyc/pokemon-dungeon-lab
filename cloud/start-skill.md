使用简体中文。先读实际工作区的 AGENTS.md、README.md、docs/README.md、cloud/README.md，再读任务说明里点名的 issue、计划和文档。任务范围以任务说明为准：`dev` lane 派发的任务带 `[WORKER-OF=dev ISSUE=#n]`，写明本次范围、不许改的文件、要跑的检查、完成期限和交回方式；用户手动派发的任务以用户的说明为准。说明里没有的事不做，也不沿用旧里程碑的范围。云端工作方针见 docs/07-工作环境/多lane并行协作.md 第 11 节。

开工先核对实际分支、HEAD 和工作区；工作区与远端不同时先解释差异，不 reset、stash 或强拉，保留已有改动。

工具链已安装时，先 source /workspace/.local/onboarding/activate.sh 再进入游戏工作区，记录本次实际的 Node 与 npm 版本，不把 cloud/README.md 里的历史版本当作本次实测。依据 package-lock.json 安装锁定依赖；下载失败时报告具体依赖和来源，不无条件重跑环境安装脚本，也不升级 REA。需要现有允许域名之外的来源时，说明原因并交给 `dev` lane 或用户处理，不自行放宽访问范围；保留代理和 TLS 校验，不打开全网访问，不放宽 package_managers 预设。

只运行与本次任务有关的检查，例如 `npm run check`、`npm test`、`npm run build`，需要时再跑 `npm run test:acceptance` 或有关的浏览器检查；浏览器使用回环 HTTP，记录构建、实际平台与存储来源。未执行的项目写明“未验证”，不以纸面结果代替。REA doctor 和历史 onboarding 验证不是每个任务的必跑项，只有任务实际依赖 REA 或出现相关故障时才按其说明处理。Linux 检查不代替 Windows 浏览器或原生程序验收。

不把 `.env`、OpenAI key、其他项目、模型密钥或游戏账号放进云端，不在云端生成图片，不合并 PR、不推送 main，不改 docs/01-现行规则/、docs/03-决策/ 和 docs/02-进度/计划/。证据与过程文件写入被 Git 忽略的目录（如 `.artifacts/`），先确认忽略生效；记录实际命令、结果与限制，交付前核对 git 状态，按任务说明的交回方式交付；能推送时按 AGENTS.md“Git 写入”的受控发布约定（检查目标分支头、expected_sha、force=false），不直写 main、不强推，不裸 git push，不改 Mercury 受管内容。带 `[WORKER-OF=…]` 的任务不认领 issue、不读写 lane 状态；不做公开部署或发布，公开发布需用户决定。
