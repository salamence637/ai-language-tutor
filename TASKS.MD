# TASKS（里程碑任务清单）

目标：先用 STT + LLM + TTS 做出能跑通的一轮外教对话闭环，再逐步增强。

---

## Milestone 0：仓库与规范（你 + Claude）

✅ 你要做（手动）：

- 新建仓库目录：client/ service/ docs/
- 放入：CLAUDE.md、docs/SPEC.md、docs/TASKS.md
- 创建 .gitignore（至少忽略 .env\*、node_modules、**pycache**）
- 准备 OpenAI API Key（先不一定立刻充值，但要能拿到 key）
- service/.env.example 写好变量名（不写真实 key）

✅ Claude 要做：

- 检查目录结构与文档一致
- 在 README 写清楚：如何运行、如何自检（先写占位，后续补齐）

验收：

- 仓库结构正确
- 三个文档齐全，内容一致

---

## Milestone 1：后端闭环（service only）

目标：给一个音频文件，返回 transcript + feedback JSON + TTS 音频（base64）。

Claude 要做：

1. FastAPI 项目骨架（service/）
2. 实现 POST /api/talk
   - 接收音频（multipart/form-data）
   - STT -> user_transcript
   - LLM -> assistant_reply_text + feedback（严格 JSON）
   - TTS -> mp3 base64
3. SQLite 持久化（session_id + 这一轮的文本与 feedback）
4. pytest 单测：
   - 空音频 -> BAD_AUDIO
   - 超长 -> TOO_LONG（服务端判断）
   - 正常音频 -> 200 + 字段齐全
5. README：写清 service 启动命令 + 环境变量 + curl 测试示例

你要做（手动）：

- 在本机设置 OPENAI_API_KEY 环境变量或 service/.env（不要提交）

验收（你照着 README 操作）：

- `curl -F audio=@sample.wav ...` 能返回可播放的 mp3 base64
- JSON 满足 SPEC：corrections <=2 且有 follow_up_question
- pytest 全绿

---

## Milestone 2：前端最小闭环（client + service）

目标：网页录音 -> 后端 -> 播放老师语音 + 显示纠错与下一问。

Claude 要做：

1. Next.js 项目骨架（client/）
2. 录音组件（Start/Stop）+ 上传音频到 /api/talk
3. 展示：
   - You said / Tutor said
   - 纠错卡片（最多 2 条）
   - follow-up question
4. 播放 TTS 音频（base64 转 Blob URL）
5. 错误提示与重试按钮
6. README 更新：如何同时启动 client/service

你要做（手动）：

- 浏览器麦克风权限允许
- 手动 smoke test 一轮

验收：

- 完整跑通 1 轮：说一句话 -> 看到字幕 -> 听到回复 -> 有纠错/下一问

---

## Milestone 3：会话（轻量）与教学体验增强

Claude 要做（建议）：

- session_id 自动维护（前端 localStorage 保存 session_id）
- LLM 输入带上最近 N 轮对话（让老师“记得上下文”）
- 更稳的 JSON 输出（失败重试一次/或使用结构化输出策略）
- 生成“本轮总结”：本轮关键错误 + 2 个更地道表达

验收：

- 连续对话 3 轮，老师能接上文
- feedback 结构稳定

---

## Milestone 4：上线前工程化（可选）

Claude 要做（建议）：

- 成本与延迟日志（每次请求记录耗时、token 估算）
- 基本限流（防刷）
- Docker/部署文档（Vercel + 独立后端 或 统一容器）
- 隐私声明/数据保留策略说明

验收：

- README 能按步骤部署/运行
- 简单压测不崩
