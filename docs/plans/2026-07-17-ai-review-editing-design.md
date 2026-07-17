# AI 审阅编辑与已应用锁定设计

## 目标

为 AI Agent 会话中的待审阅修改建议增加“建议译文”编辑能力；同时把已经应用的独立审查任务锁定为只读，防止继续接受、编辑或拒绝审查建议。

## 交互设计

AI Agent 的待审阅建议仍沿用“暂存 → 用户确认 → 应用”的流程。建议展开后提供“编辑”入口，进入编辑态时显示建议译文输入框，并提供“保存修改”和“取消”。只允许修改建议译文；分类、原因、置信度和原始译文保持不变。空白译文不能保存。

独立审查任务的 `status` 为 `applied` 时，详情页显示只读提示，并禁用“全部接受、接受、编辑、拒绝、应用”等会改变审查决定的操作。任务在当前详情页完成应用后也立即进入只读态。

## 数据与接口

新增 `updateAiAgentRevision(revisionId, suggestedTargetText)` 桌面 API。调用链为渲染层、preload bridge、IPC handler、AgentRevisionService 和 AgentRevisionRepository。更新只允许发生在 `pending` 状态；服务层拒绝空白译文和非待审阅建议，数据库只更新 `suggested_target_text` 与 `updated_at`。

独立审查的状态保护放在 `AuditWorkflowService`：修改单条 finding 前读取 finding 所属任务，批量接受前读取任务；如果任务已经 `applied`，抛出明确错误。界面锁定与服务校验共同保证一致性。

## 错误处理

- 空白建议译文：界面禁用保存，服务层再次拒绝。
- 建议不存在：返回“修改建议不存在”。
- Agent 建议已经应用、忽略或过期：返回“仅待审阅建议可以编辑”。
- 审查任务已经应用：返回“已应用的审查任务不可再编辑”。
- 保存失败：保留编辑内容并在现有错误区域显示错误。

## 测试

- AgentRevisionService：待审阅建议可更新；已应用建议和空白译文不可更新。
- IPC contract：新通道和 preload 参数保持一致。
- AgentConversation：可进入编辑、保存并刷新对比；取消不调用 API。
- AuditWorkflowService：已应用任务拒绝单条决定和全部接受。
- AuditPanel：已应用任务的所有修改操作禁用；当前任务应用后立即只读。

