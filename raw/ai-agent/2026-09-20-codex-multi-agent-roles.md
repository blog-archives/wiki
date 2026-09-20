# DeepWiki Q&A with Code Context for Repository: openai/codex

> Source: https://deepwiki.com/search/-agent_d23811ee-bb5b-4491-82c4-d059f75ccab0
> Collected: 2026-09-20
> Published: Unknown

## Q1

有哪些预先定义好的 agent

## 预先定义好的 Agent（Built-in Agent Roles）体系

本图梳理 Codex 多智能体（sub-agent）系统中“预先定义好的 agent”是如何声明、暴露给顶层 agent、与用户自定义角色合并、并在运行时被追踪管理的。核心入口是内置角色表 [1a]，运行时应用逻辑在 [2b]，暴露给 spawn 工具的描述文本生成在 [3a]-[3e]，用户自定义角色的加载逻辑在 [4a]-[4e]，运行时实例追踪在 [5a]-[5e]。

### 1. 内置 Agent 角色定义在哪里、有哪几种

codex-rs/core crate；定义了系统预置的 agent_type 集合（default / explorer / worker，以及被临时下线的 awaiter），是所有其他 trace 的数据源头。

### 1a. 默认角色常量 (`role.rs:33`)

当调用方未指定 agent_type 时使用的兜底角色名

```text
pub const DEFAULT_ROLE_NAME: &str = "default";
```

### 1b. default 角色 (`role.rs:347`)

无特殊配置的默认 agent

```text
DEFAULT_ROLE_NAME.to_string(), AgentRoleConfig { description: Some("Default agent."...) }
```

### 1c. explorer 角色 (`role.rs:355`)

用于快速、权威地回答范围明确的代码库问题，鼓励并行生成多个 explorer

```text
"explorer".to_string(), AgentRoleConfig { description: Some(r#"Use `explorer` for specific codebase questions..."#) }
```

### 1d. worker 角色 (`role.rs:369`)

用于实际编码执行任务，要求明确划分文件所有权避免冲突

```text
"worker".to_string(), AgentRoleConfig { description: Some(r#"Use for execution and production work..."#) }
```

### 1e. awaiter 角色（已临时下线） (`role.rs:385`)

原本用于等待长耗时命令完成再汇报状态，目前被注释移除但配置文件仍在

```text
// "awaiter".to_string(), AgentRoleConfig { description: Some(r#"Use an `awaiter` agent EVERY TIME..."#) }
```

### 1f. 内置角色配置文件映射 (`role.rs:408`)

通过 include_str! 将 explorer.toml / awaiter.toml 静态嵌入二进制

```text
match path.to_str()? { "explorer.toml" => Some(EXPLORER), "awaiter.toml" => Some(AWAITER), _ => None }
```

### 2. 生成子 Agent 时如何应用角色覆盖

core crate 中当顶层 agent 调用 spawn 工具指定 agent_type 时，如何解析角色配置并将其覆盖到子会话 Config 上。

### 2a. 查找角色配置 (`role.rs:57`)

先查用户自定义角色，再回退到内置角色表 [1a]

```text
let role = resolve_role_config(config, role_name).cloned().ok_or_else(...)
```

### 2b. 应用角色覆盖 (`role.rs:61`)

apply_role_to_config 的核心调用，出错时统一返回不可用提示

```text
apply_role_to_config_inner(config, role_name, &role).await
```

### 2c. 加载角色配置层 (`role.rs:78`)

内置角色从静态字符串解析，用户角色从磁盘文件读取

```text
let role_layer_toml = load_role_layer_toml(config, config_file, is_built_in, role_name).await?;
```

### 2d. 读取内置 TOML 内容 (`role.rs:138`)

对应 [1f] 中嵌入的 explorer.toml / awaiter.toml

```text
let role_config_contents = built_in::config_file_contents(config_file)...
```

### 2e. 生成新 Config (`role.rs:127`)

把角色层插入 config_layer_stack 并覆盖 model/personality 等字段

```text
*config = role_overrides::build_next_config(config, role_layer_toml, &overrides)?;
```

### 2f. 插入角色配置层 (`role.rs:184`)

按优先级把角色 TOML 层插入到已有配置层栈中

```text
next_config.config_layer_stack = build_config_layer_stack(config, &role_layer_toml)?;
```

### 3. spawn 工具描述中如何列出所有可用角色

core crate；负责把内置角色 [1a] 与用户自定义角色 [4] 合并，生成顶层 agent 在调用 spawn_agent 工具时看到的角色说明文本。

### 3a. 构建 spawn 工具描述入口 (`role.rs:271`)

被 spawn 工具 spec 生成逻辑调用，传入用户配置中的角色表

```text
pub(crate) fn build(user_defined_agent_roles: &BTreeMap<String, AgentRoleConfig>) -> String {
```

### 3b. 获取内置角色表 (`role.rs:271`)

复用 [1a] 中的 LazyLock 静态角色集合

```text
let built_in_roles = built_in::configs();
```

### 3c. 优先加入用户自定义角色 (`role.rs:282`)

用户角色优先级高于同名内置角色

```text
for (name, declaration) in user_defined_roles { if seen.insert(...) { formatted_roles.push(format_role(name, declaration)); } }
```

### 3d. 补充内置角色 (`role.rs:287`)

未被用户覆盖的内置角色（default/explorer/worker）加入列表

```text
for (name, declaration) in built_in_roles { if seen.insert(...) { formatted_roles.push(format_role(name, declaration)); } }
```

### 3e. 格式化单个角色说明 (`role.rs:332`)

拼接角色描述及被锁定的 model/reasoning_effort 提示，最终汇入工具 schema

```text
format!("{name}: {{\n{description}{locked_settings_note}\n}}")
```

### 4. 用户/项目自定义 Agent 角色如何被发现和加载

codex-rs/agent-roles crate；在启动配置加载阶段扫描 agents.toml 与 ~/.codex(/project)/agents/*.toml，与内置角色 [1a] 合并进最终角色表，供 [2a][3c] 使用。

### 4a. 从配置层解析 agents.toml (`loader.rs:39`)

遍历配置层栈，逐层提取 [agents] 表

```text
let agents_toml = match agents_toml_from_layer(&layer.config, config_folder.as_deref()) {
```

### 4b. 读取声明式角色 (`loader.rs:49`)

处理 agents.toml 中显式声明的角色条目

```text
match read_declared_role(fs, declared_role_name, role_toml).await {
```

### 4c. 扫描 agents/ 目录 (`loader.rs:76`)

自动发现未在 agents.toml 中声明、但放在 agents/ 目录下的角色文件

```text
for (role_name, role) in discover_agent_roles_in_dir(fs, &config_folder.join("agents"), &declared_role_files, startup_warnings).await? {
```

### 4d. 解析角色文件 TOML (`agent_role_config.rs:44`)

parse_agent_role_file_contents 核心步骤，供 [4b][4c] 调用

```text
let role_file_toml: TomlValue = toml::from_str(contents).map_err(...)?;
```

### 4e. 合并写入最终角色表 (`loader.rs:112`)

校验描述非空后写入结果 BTreeMap，最终作为 config.agent_roles 提供给 [2a]

```text
roles.insert(role_name, merged_role);
```

### 5. 运行时如何追踪已生成的 Agent 实例

core crate；AgentRegistry 负责在会话内追踪已生成的子 agent（包括其角色/昵称/路径），与角色定义 [1]/[2] 相互独立但配合使用——角色决定“生成什么”，Registry 决定“生成后如何管理”。

### 5a. 注册根线程 (`registry.rs:136`)

会话启动时把主 agent 注册为 agent_tree 的根节点

```text
pub(crate) fn register_root_thread(&self, thread_id: ThreadId) {
```

### 5b. 预留生成配额 (`registry.rs:101`)

spawn 子 agent 前检查并发上限（max_threads）

```text
if !self.try_increment_spawned(max_threads) { return Err(CodexErr::new(CodexErrorDetails::AgentLimitReached { max_threads })); }
```

### 5c. 分配 Agent 昵称 (`registry.rs:280`)

从角色的 nickname_candidates（如 [1c][1d] 未设置则走默认池）中随机取一个未占用的名字

```text
if let Some(name) = available_names.choose(&mut rand::rng()) { name.clone() }
```

### 5d. 提交生成结果 (`registry.rs:388`)

SpawnReservation::commit 把子 agent 的 role/path/nickname 正式写入 agent_tree

```text
self.state.register_spawned_thread(agent_metadata);
```

### 5e. 列出存活 Agent (`registry.rs:217`)

供 TUI（如 agents_overview_view）等展示当前所有活跃子 agent 及其角色

```text
pub(crate) fn live_agents(&self) -> Vec<AgentMetadata> {
```

## Q2

每个 agent 的启动或使用条件是什么

## Agent 启动/使用条件的判定链路

梳理 Codex 中决定「某个 agent 能否被生成、以特定角色启动」的完整判定逻辑：从多智能体版本开关、并发名额校验，到角色解析与执行期二次限流。关键位置见 [1a][2b][3b][4c][5d]。

### 1. 决定当前会话是否允许生成子 agent（多智能体版本开关）

core crate 配置层；spawn 前的第一道门槛,决定 spawn 工具/子agent能力对该会话是否可用。

### 1a. agents_enabled 关闭时直接禁用 (`mod.rs:1542`)

配置显式关闭 agents 功能时,强制返回 Disabled,覆盖任何 feature flag

```text
} else if !self.agents_enabled { Some(MultiAgentVersion::Disabled) }
```

### 1b. MultiAgentV2 feature 优先 (`mod.rs:1540`)

若开启新版多智能体 feature,直接采用 V2 版本语义(并发/执行限流规则不同)

```text
if self.features.enabled(Feature::MultiAgentV2) { Some(MultiAgentVersion::V2) }
```

### 1c. 回退到 V1 或彻底禁用 (`mod.rs:1551`)

无覆盖、无 V2 时,按 Collab feature 判断走旧版 V1,否则完全禁用子 agent

```text
if self.features.enabled(Feature::Collab) { MultiAgentVersion::V1 } else { MultiAgentVersion::Disabled }
```

### 1d. spawn 前查询有效版本 (`spawn.rs:611`)

spawn_agent_internal 在生成子线程前,先解析出本次 spawn 应使用的多智能体版本

```text
let multi_agent_version = state.effective_multi_agent_version_for_spawn(...)
```

### 1e. 版本确定后立即做执行容量校验 (`spawn.rs:621`)

把版本信息传给执行限流器,决定是否需要做进一步的并发校验(见 trace 3)

```text
self.ensure_execution_capacity(multi_agent_version, session_source)?;
```

### 2. 生成子 agent 时的并发名额预占与拒绝

core crate AgentRegistry;在真正创建线程前对同时存活的 agent 数量做硬性上限校验,超限直接拒绝 spawn 请求。

### 2a. 计算 V2 模式下的最大线程数 (`mod.rs:1573`)

V2 版本按 per-session 配置的并发线程数(减去自身)算出上限

```text
MultiAgentVersion::V2 => Some(self.multi_agent_v2.max_concurrent_threads_per_session.saturating_sub(1))
```

### 2b. 取得本次 spawn 的有效上限 (`spawn.rs:623`)

V1/Disabled 走 agent_max_threads 配置项,V2 走 [2a] 的计算结果

```text
let agent_max_threads = config.effective_agent_max_threads(multi_agent_version);
```

### 2c. 预占一个生成名额 (`spawn.rs:641`)

把上限传入 registry,尝试原子占用一个 spawn 槽位;失败则整条 spawn 请求提前失败

```text
let mut reservation = self.state.reserve_spawn_slot(reservation_max_threads)?;
```

### 2d. 原子递增计数并判断上限 (`registry.rs:101`)

真正做上限判断的地方;达到上限时返回 AgentLimitReached,调用方(顶层 agent)会看到明确的错误信息

```text
if !self.try_increment_spawned(max_threads) { return Err(CodexErr::new(CodexErrorDetails::AgentLimitReached { max_threads })); }
```

### 2e. 生成成功后提交预占 (`spawn.rs:716`)

子线程创建成功后才正式提交,失败路径下 reservation 会在 drop 时自动释放名额

```text
reservation.commit(agent_metadata.clone());
```

### 3. V2 子 agent 在真正开始执行(turn start)时的二次限流

core crate AgentExecutionLimiter;与 trace 2 的生成期限流不同,这是执行期限流,只对 V2 子 agent 生效,防止同时运行的活跃回合过多。

### 3a. 判定是否受执行限流约束 (`execution.rs:95`)

只有 V2 版本的子 agent 会话才会被执行限流器管控,V1/Disabled 或根会话不受影响

```text
multi_agent_version == MultiAgentVersion::V2 && matches!(session_source, SessionSource::SubAgent(_))
```

### 3b. 检查执行名额是否充足 (`execution.rs:53`)

与生成名额（reservation）分离的另一个原子计数器,针对『正在执行』而非『已生成』的 agent

```text
if self.agent_execution_limiter.has_capacity() { Ok(()) } else { Err(...AgentLimitReached...) }
```

### 3c. 每次 turn 启动前的入口 (`execution.rs:30`)

调用方在子 agent 每次开始新一轮对话(而非只在 spawn 时)都要重新校验容量

```text
pub(crate) async fn ensure_execution_capacity_for_turn_start(&self, thread: &CodexThread)
```

### 3d. 已有活跃回合直接放行 (`execution.rs:34`)

只在开启全新回合时才占用执行名额,避免对同一个已在跑的回合重复计数

```text
if thread.session.active_turn.lock().await.is_some() { return Ok(()); }
```

### 3e. 占用执行名额并返回 RAII guard (`execution.rs:67`)

guard 在 drop 时自动释放名额,保证回合结束后计数正确回落

```text
is_execution_limited(multi_agent_version, session_source).then(|| Arc::clone(&self.agent_execution_limiter).guard())
```

### 4. spawn 时按 agent_type 解析并应用角色,决定该角色的可用性与能力边界

core crate role.rs;顶层 agent 调用 spawn 工具指定 agent_type 后,系统据此查找并应用对应角色的配置,决定子 agent 能做什么。

### 4a. spawn 流程中应用角色覆盖 (`spawn.rs:418`)

无论是新建还是恢复的子 agent,都要在 config 上应用角色对应的覆盖

```text
apply_role_to_config(&mut config, Some(&role_name)).await.map_err(CodexErr::InvalidRequest)?;
```

### 4b. 未指定角色时回退默认 (`role.rs:55`)

调用方省略 agent_type 时,启动条件退化为最宽松的 default 角色

```text
let role_name = role_name.unwrap_or(DEFAULT_ROLE_NAME);
```

### 4c. 未知角色名直接拒绝启动 (`role.rs:59`)

若既不在用户自定义角色表也不在内置角色表中,spawn 请求在此失败,子 agent 不会被创建

```text
.ok_or_else(|| format!("unknown agent_type '{role_name}'"))?;
```

### 4d. 加载角色的具体限制/参数 (`role.rs:78`)

解析出该角色允许的 model/reasoning effort/features 等,这些参数决定角色的『可用条件』

```text
let role_layer_toml = load_role_layer_toml(config, config_file, is_built_in, role_name).await?;
```

### 4e. 角色配置加载失败时统一报错 (`role.rs:65`)

解析/校验过程中任何失败(如角色文件损坏)都会转化为通用的『agent type 当前不可用』提示

```text
AGENT_TYPE_UNAVAILABLE_ERROR.to_string()
```

### 5. 顶层 agent 如何提前得知每个角色的使用场景与被锁定的设置

core crate spawn 工具 schema 构建;把角色的使用条件(适用场景+被锁定字段)以自然语言暴露给模型,供其在调用 spawn 前自行判断。

### 5a. 汇总用户自定义角色的使用说明 (`role.rs:282`)

用户/项目角色优先展示,格式化其 description 字段

```text
for (name, declaration) in user_defined_roles { if seen.insert(...) { formatted_roles.push(format_role(name, declaration)); } }
```

### 5b. 补充未被覆盖的内置角色 (`role.rs:287`)

explorer/worker/default 等内置角色的使用条件描述被追加进列表

```text
for (name, declaration) in built_in_roles { if seen.insert(...) { formatted_roles.push(format_role(name, declaration)); } }
```

### 5c. 格式化单个角色的说明文本 (`role.rs:296`)

把 description 与是否锁定 model/reasoning effort 组合成给模型看的调用条件说明

```text
fn format_role(name: &str, declaration: &AgentRoleConfig) -> String {
```

### 5d. 拼接『锁定设置』提示 (`role.rs:332`)

若该角色的 model/reasoning_effort 在 TOML 中被固定,会追加一句说明,提前告知模型这些设置无法在调用时更改

```text
format!("{name}: {{\n{description}{locked_settings_note}\n}}")
```

### 5e. spawn 工具描述文本的构建入口 (`role.rs:271`)

所有角色使用条件最终汇总进这段文本,直接嵌入 spawn 工具的 JSON schema 描述中

```text
pub(crate) fn build(user_defined_agent_roles: &BTreeMap<String, AgentRoleConfig>) -> String {
```

## Q3

每个 agent 的启动或使用条件是什么

### Answer

## 答案

每个内置 agent 角色的启动/使用条件分两层：**是否允许 spawn 子 agent（全局开关）** 和 **该角色本身的适用场景与被锁定的参数**。

---

### 1. 全局前提：多智能体功能必须开启

`apply_role_to_config` 在 spawn 前被调用，但更早的前提是 `Config::multi_agent_version_override`——若 `agents_enabled` 为 `false`，直接判定 `MultiAgentVersion::Disabled`，任何角色都无法启动 codex:1540-1542 。否则按 `Feature::MultiAgentV2` / `Feature::Collab` 决定走 V2 / V1 语义 codex:1549-1551 。

### 2. 各角色的使用条件（`description` 字段即条件说明)

角色表定义在 `built_in::configs()` codex:339-404 ：

| 角色 | 使用条件 | config_file（被锁定的参数来源） |
|---|---|---|
| `default` | 未指定 `agent_type` 时的兜底，无特殊限制 codex:346-353  | 无 |
| `explorer` | 用于范围明确的代码库问题，鼓励并行开多个 explorer，下游应直接信任其结果 codex:354-367  | `explorer.toml`（可能锁定 model / reasoning_effort） |
| `worker` | 用于实际执行/生产工作（实现功能、修 bug、拆分重构），必须明确划分文件所有权避免冲突 codex:368-382  | 无 |
| `awaiter`（已注释，当前不可用） | 原用于等待长耗时命令 codex:383-400  | `awaiter.toml` |

### 3. 启动时的解析与拒绝逻辑

调用方传入 `agent_type` 后：

1. 若为空，退化为 `DEFAULT_ROLE_NAME` codex:55-55 。
2. `resolve_role_config` 先查用户/项目自定义角色表，再查内置角色表；两者都查不到则报 `unknown agent_type` 并终止 spawn codex:57-59 。
3. 找到角色后加载其 `config_file`（若存在），把 model / reasoning_effort / features / skills 等作为覆盖层应用到子 config codex:69-127 。任何解析失败统一转成 `AGENT_TYPE_UNAVAILABLE_ERROR` codex:63-66 。

### 4. 模型如何提前知道"何时用哪个角色"

`spawn_tool_spec::build` 把每个角色的 `description`（即使用条件）以及是否锁定了 `model`/`model_reasoning_effort`（通过读取 `config_file` 并检查字段）拼接进 spawn 工具的参数说明，供顶层 agent 决策 codex:296-336 。用户自定义角色优先于同名内置角色展示/生效 codex:276-293 。

在实际 spawn 工具处理代码中（V2 版本），也是先解析 `agent_type` 再调用 `apply_spawn_agent_role` 完成上述角色应用 codex:117-143 。

---

## Notes

- 这与上一轮回答的内容一致，本轮做了更聚焦的角色级归纳；完整的并发限流（spawn 名额、执行期限流）逻辑请参考上一条回答中的 trace 1-3。
- `awaiter` 角色代码仍在但已被注释掉，目前不可通过 `agent_type` 启动。
- 由于索引大小限制，`explorer.toml` / `awaiter.toml` 的具体内容未能完整检索到；如需查看这些 TOML 文件里锁定的具体 model/reasoning_effort 值，建议开启一个 Devin session 直接查看 `codex-rs/core/assets/agent/builtins/` 目录下的文件。

Wiki pages you might want to explore:
- [Thread Management and Multi-Agent (openai/codex)](/wiki/openai/codex#3.6)

### Citations

**File:** codex-rs/core/src/agent/role.rs (L55-55)
```rust
    let role_name = role_name.unwrap_or(DEFAULT_ROLE_NAME);
```

**File:** codex-rs/core/src/agent/role.rs (L57-59)
```rust
    let role = resolve_role_config(config, role_name)
        .cloned()
        .ok_or_else(|| format!("unknown agent_type '{role_name}'"))?;
```

**File:** codex-rs/core/src/agent/role.rs (L63-66)
```rust
        .map_err(|err| {
            tracing::warn!("failed to apply role to config: {err}");
            AGENT_TYPE_UNAVAILABLE_ERROR.to_string()
        })
```

**File:** codex-rs/core/src/agent/role.rs (L69-127)
```rust
async fn apply_role_to_config_inner(
    config: &mut Config,
    role_name: &str,
    role: &AgentRoleConfig,
) -> anyhow::Result<()> {
    let is_built_in = !config.agent_roles.contains_key(role_name);
    let Some(config_file) = role.config_file.as_ref() else {
        return Ok(());
    };
    let role_layer_toml = load_role_layer_toml(config, config_file, is_built_in, role_name).await?;
    let role_config = deserialize_config_toml_with_base(role_layer_toml, &config.codex_home)?;
    let mut overrides = AgentRoleOverrides {
        developer_instructions: role_config.developer_instructions,
        model: role_config.model,
        model_reasoning_effort: role_config.model_reasoning_effort,
        model_reasoning_summary: role_config.model_reasoning_summary,
        model_verbosity: role_config.model_verbosity,
        personality: role_config.personality,
        service_tier: role_config.service_tier,
        ..Default::default()
    };

    if let Some(features) = role_config.features {
        for (key, enabled) in features.entries() {
            if !enabled
                && let Some(
                    feature @ (Feature::ShellTool
                    | Feature::Apps
                    | Feature::Personality
                    | Feature::Plugins
                    | Feature::MemoryTool
                    | Feature::RequestPermissionsTool),
                ) = feature_for_key(&key)
            {
                overrides.features.insert(feature.key().to_string(), false);
            }
        }
    }
    if let Some(mut skills) = role_config.skills {
        skills.config.retain(|skill| !skill.enabled);
        skills.bundled = skills.bundled.filter(|bundled| !bundled.enabled);
        skills.include_instructions = skills.include_instructions.filter(|enabled| !enabled);
        skills.max_context_tokens = None;
        if !skills.config.is_empty()
            || skills.bundled.is_some()
            || skills.include_instructions.is_some()
        {
            overrides.skills = Some(skills);
        }
    }

    let role_layer_toml = TomlValue::try_from(&overrides)?;
    if role_layer_toml
        .as_table()
        .is_some_and(toml::map::Map::is_empty)
    {
        return Ok(());
    }
    *config = role_overrides::build_next_config(config, role_layer_toml, &overrides)?;
```

**File:** codex-rs/core/src/agent/role.rs (L276-293)
```rust
    fn build_from_configs(
        built_in_roles: &BTreeMap<String, AgentRoleConfig>,
        user_defined_roles: &BTreeMap<String, AgentRoleConfig>,
    ) -> String {
        let mut seen = BTreeSet::new();
        let mut formatted_roles = Vec::new();
        for (name, declaration) in user_defined_roles {
            if seen.insert(name.as_str()) {
                formatted_roles.push(format_role(name, declaration));
            }
        }
        for (name, declaration) in built_in_roles {
            if seen.insert(name.as_str()) {
                formatted_roles.push(format_role(name, declaration));
            }
        }

        format!("Available roles:\n{}", formatted_roles.join("\n"))
```

**File:** codex-rs/core/src/agent/role.rs (L296-336)
```rust
    fn format_role(name: &str, declaration: &AgentRoleConfig) -> String {
        if let Some(description) = &declaration.description {
            let locked_settings_note = declaration
                .config_file
                .as_ref()
                .and_then(|config_file| {
                    built_in::config_file_contents(config_file)
                        .map(str::to_owned)
                        .or_else(|| std::fs::read_to_string(config_file).ok())
                })
                .and_then(|contents| toml::from_str::<TomlValue>(&contents).ok())
                .map(|role_toml| {
                    let model = role_toml
                        .get("model")
                        .and_then(TomlValue::as_str);
                    let reasoning_effort = role_toml
                        .get("model_reasoning_effort")
                        .and_then(TomlValue::as_str);
                    match (model, reasoning_effort) {
                        (Some(model), Some(reasoning_effort)) => format!(
                            "\n- This role's model is set to `{model}` and its reasoning effort is set to `{reasoning_effort}`. These settings cannot be changed."
                        ),
                        (Some(model), None) => {
                            format!(
                                "\n- This role's model is set to `{model}` and cannot be changed."
                            )
                        }
                        (None, Some(reasoning_effort)) => {
                            format!(
                                "\n- This role's reasoning effort is set to `{reasoning_effort}` and cannot be changed."
                            )
                        }
                        (None, None) => String::new(),
                    }
                })
                .unwrap_or_default();
            format!("{name}: {{\n{description}{locked_settings_note}\n}}")
        } else {
            format!("{name}: no description")
        }
    }
```

**File:** codex-rs/core/src/agent/role.rs (L339-404)
```rust
mod built_in {
    use super::*;

    /// Returns the cached built-in role declarations defined in this module.
    pub(super) fn configs() -> &'static BTreeMap<String, AgentRoleConfig> {
        static CONFIG: LazyLock<BTreeMap<String, AgentRoleConfig>> = LazyLock::new(|| {
            BTreeMap::from([
                (
                    DEFAULT_ROLE_NAME.to_string(),
                    AgentRoleConfig {
                        description: Some("Default agent.".to_string()),
                        config_file: None,
                        nickname_candidates: None,
                    }
                ),
                (
                    "explorer".to_string(),
                    AgentRoleConfig {
                        description: Some(r#"Use `explorer` for specific codebase questions.
Explorers are fast and authoritative.
They must be used to ask specific, well-scoped questions on the codebase.
Rules:
- In order to avoid redundant work, you should avoid exploring the same problem that explorers have already covered. Typically, you should trust the explorer results without additional verification. You are still allowed to inspect the code yourself to gain the needed context!
- You are encouraged to spawn up multiple explorers in parallel when you have multiple distinct questions to ask about the codebase that can be answered independently. This allows you to get more information faster without waiting for one question to finish before asking the next. While waiting for the explorer results, you can continue working on other local tasks that do not depend on those results. This parallelism is a key advantage of delegation, so use it whenever you have multiple questions to ask.
- Reuse existing explorers for related questions."#.to_string()),
                        config_file: Some("explorer.toml".to_string().parse().unwrap_or_default()),
                        nickname_candidates: None,
                    }
                ),
                (
                    "worker".to_string(),
                    AgentRoleConfig {
                        description: Some(r#"Use for execution and production work.
Typical tasks:
- Implement part of a feature
- Fix tests or bugs
- Split large refactors into independent chunks
Rules:
- Explicitly assign **ownership** of the task (files / responsibility). When the subtask involves code changes, you should clearly specify which files or modules the worker is responsible for. This helps avoid merge conflicts and ensures accountability. For example, you can say "Worker 1 is responsible for updating the authentication module, while Worker 2 will handle the database layer." By defining clear ownership, you can delegate more effectively and reduce coordination overhead.
- Always tell workers they are **not alone in the codebase**, and they should not revert the edits made by others, and they should adjust their implementation to accommodate the changes made by others. This is important because there may be multiple workers making changes in parallel, and they need to be aware of each other's work to avoid conflicts and ensure a cohesive final product."#.to_string()),
                        config_file: None,
                        nickname_candidates: None,
                    }
                ),
                // Awaiter is temp removed
//                 (
//                     "awaiter".to_string(),
//                     AgentRoleConfig {
//                         description: Some(r#"Use an `awaiter` agent EVERY TIME you must run a command that will take some very long time.
// This includes, but not only:
// * testing
// * monitoring of a long running process
// * explicit ask to wait for something
//
// Rules:
// - When an awaiter is running, you can work on something else. If you need to wait for its completion, use the largest possible timeout.
// - Be patient with the `awaiter`.
// - Do not use an awaiter for every compilation/test if it won't take time. Only use if for long running commands.
// - Close the awaiter when you're done with it."#.to_string()),
//                         config_file: Some("awaiter.toml".to_string().parse().unwrap_or_default()),
//                     }
//                 )
            ])
        });
        &CONFIG
    }
```

**File:** codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs (L117-143)
```rust
    let role_name = args
        .agent_type
        .as_deref()
        .map(str::trim)
        .filter(|role| !role.is_empty());

    let session_source = turn.session_source.clone();
    let child_depth = next_thread_spawn_depth(&session_source);
    let mut config =
        build_agent_spawn_config(&session.get_base_instructions().await, turn.as_ref())?;
    let is_full_history_fork = matches!(fork_mode, Some(SpawnAgentForkMode::FullHistory));
    apply_requested_spawn_agent_model_overrides(
        &session,
        turn.as_ref(),
        &mut config,
        args.model.as_deref(),
        args.reasoning_effort.clone(),
    )
    .await?;
    if !is_full_history_fork || role_name.is_some() {
        apply_spawn_agent_role(&session, &mut config, role_name).await?;
        if is_full_history_fork && config.developer_instructions.is_none() {
            config
                .developer_instructions
                .clone_from(&turn.developer_instructions);
        }
    }
```

## Q4

所以 agent 被视为一种角色，必须预先定义好内容。不会根据用户的临时需求或者问题，动态生成吗

### Answer

## 答案

不完全是。"角色（role）"本身确实必须预先定义好——无论是内置的 `default`/`explorer`/`worker`,还是用户在 `agents.toml`/`agents/` 目录下声明的角色,都属于**预先配置的静态"能力包"**(model、reasoning effort、developer instructions、可用 features 等) codex:339-404 。系统不会在运行时凭空"生成"一个新角色。

但**角色 ≠ 任务**。角色只决定子 agent 的"人设/能力边界",真正要它做什么事、回答什么问题,是顶层 agent 在调用 spawn 工具时临时传入的**动态内容**(prompt/instructions),这部分完全是按用户当次需求即时生成的,不受角色预定义限制。

---

### 角色是静态的部分

- 内置角色表 `built_in::configs()` 是编译期写死的 `BTreeMap`,`explorer`/`worker`/`default` 的 `description` 和行为规则都是固定文本 codex:339-404 。
- 用户自定义角色同样是"预先定义好"——通过 `agents.toml` 里的 `[agents.researcher]` 声明,或把角色文件放进 `agents/` 目录,在**会话启动/配置加载阶段**就被发现、解析、写入 `Config.agent_roles`,而不是在对话过程中临时生成 codex:704-715 。测试用例也印证了这一点:角色的 `description`、`config_file`、`nickname_candidates` 都来自磁盘上的 TOML 文件,加载失败(比如 `config_file` 路径不存在)会直接报错拒绝启动 codex:8302-8340 。
- spawn 时,`agent_type` 只能从这张**预先建好**的表里查找(先查用户角色,再查内置角色),查不到就报 `unknown agent_type` 并终止 codex:165-173 。这说明角色集合是封闭的、非即时生成的。

### 但任务内容是动态的

spawn 工具的处理逻辑里,`agent_type`(角色)和实际交给子 agent 的**任务/上下文**是分开处理的两件事:角色只用于 `apply_spawn_agent_role` 覆盖 model/reasoning_effort/features 等配置层 codex:117-140 ,而具体要探索什么代码问题、要实现什么功能,是顶层模型在这次调用中自由撰写的自然语言指令,完全可以针对用户的临时需求即时生成,不受角色定义的限制。

打个比方:角色像是"招聘一个特定工种的员工模板(explorer/worker)",而具体交代给这个员工做的活儿(任务描述)是每次都现场写的,不是模板的一部分。

---

## Notes

- 角色配置文件(如 `explorer.toml`/用户的 `researcher.toml`)本身也是可以按需增删的——即用户/项目可以随时新增一个角色定义,但这属于"修改配置"而非"模型在对话中临时创造角色",两者性质不同。
- 若想确认某次 spawn 调用中"任务内容"参数具体叫什么字段名、如何传递给子 agent 的完整 prompt 构造逻辑,由于索引限制未能看到 `spawn.rs` 更完整的参数定义,建议开一个 Devin session 查看 `codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs` 全文以获取更精确细节。

Wiki pages you might want to explore:
- [Configuration System (openai/codex)](/wiki/openai/codex#2.2)

### Citations

**File:** codex-rs/core/src/agent/role.rs (L165-173)
```rust
pub(crate) fn resolve_role_config<'a>(
    config: &'a Config,
    role_name: &str,
) -> Option<&'a AgentRoleConfig> {
    config
        .agent_roles
        .get(role_name)
        .or_else(|| built_in::configs().get(role_name))
}
```

**File:** codex-rs/core/src/agent/role.rs (L339-404)
```rust
mod built_in {
    use super::*;

    /// Returns the cached built-in role declarations defined in this module.
    pub(super) fn configs() -> &'static BTreeMap<String, AgentRoleConfig> {
        static CONFIG: LazyLock<BTreeMap<String, AgentRoleConfig>> = LazyLock::new(|| {
            BTreeMap::from([
                (
                    DEFAULT_ROLE_NAME.to_string(),
                    AgentRoleConfig {
                        description: Some("Default agent.".to_string()),
                        config_file: None,
                        nickname_candidates: None,
                    }
                ),
                (
                    "explorer".to_string(),
                    AgentRoleConfig {
                        description: Some(r#"Use `explorer` for specific codebase questions.
Explorers are fast and authoritative.
They must be used to ask specific, well-scoped questions on the codebase.
Rules:
- In order to avoid redundant work, you should avoid exploring the same problem that explorers have already covered. Typically, you should trust the explorer results without additional verification. You are still allowed to inspect the code yourself to gain the needed context!
- You are encouraged to spawn up multiple explorers in parallel when you have multiple distinct questions to ask about the codebase that can be answered independently. This allows you to get more information faster without waiting for one question to finish before asking the next. While waiting for the explorer results, you can continue working on other local tasks that do not depend on those results. This parallelism is a key advantage of delegation, so use it whenever you have multiple questions to ask.
- Reuse existing explorers for related questions."#.to_string()),
                        config_file: Some("explorer.toml".to_string().parse().unwrap_or_default()),
                        nickname_candidates: None,
                    }
                ),
                (
                    "worker".to_string(),
                    AgentRoleConfig {
                        description: Some(r#"Use for execution and production work.
Typical tasks:
- Implement part of a feature
- Fix tests or bugs
- Split large refactors into independent chunks
Rules:
- Explicitly assign **ownership** of the task (files / responsibility). When the subtask involves code changes, you should clearly specify which files or modules the worker is responsible for. This helps avoid merge conflicts and ensures accountability. For example, you can say "Worker 1 is responsible for updating the authentication module, while Worker 2 will handle the database layer." By defining clear ownership, you can delegate more effectively and reduce coordination overhead.
- Always tell workers they are **not alone in the codebase**, and they should not revert the edits made by others, and they should adjust their implementation to accommodate the changes made by others. This is important because there may be multiple workers making changes in parallel, and they need to be aware of each other's work to avoid conflicts and ensure a cohesive final product."#.to_string()),
                        config_file: None,
                        nickname_candidates: None,
                    }
                ),
                // Awaiter is temp removed
//                 (
//                     "awaiter".to_string(),
//                     AgentRoleConfig {
//                         description: Some(r#"Use an `awaiter` agent EVERY TIME you must run a command that will take some very long time.
// This includes, but not only:
// * testing
// * monitoring of a long running process
// * explicit ask to wait for something
//
// Rules:
// - When an awaiter is running, you can work on something else. If you need to wait for its completion, use the largest possible timeout.
// - Be patient with the `awaiter`.
// - Do not use an awaiter for every compilation/test if it won't take time. Only use if for long running commands.
// - Close the awaiter when you're done with it."#.to_string()),
//                         config_file: Some("awaiter.toml".to_string().parse().unwrap_or_default()),
//                     }
//                 )
            ])
        });
        &CONFIG
    }
}
```

**File:** codex-rs/config/src/config_toml.rs (L704-715)
```rust
    /// User-defined role declarations keyed by role name.
    ///
    /// Example:
    /// ```toml
    /// [agents.researcher]
    /// description = "Research-focused role."
    /// config_file = "./agents/researcher.toml"
    /// nickname_candidates = ["Herodotus", "Ibn Battuta"]
    /// ```
    #[serde(default, flatten)]
    pub roles: BTreeMap<String, AgentRoleToml>,
}
```

**File:** codex-rs/core/src/config/config_tests.rs (L8302-8340)
```rust
#[tokio::test]
async fn load_config_rejects_missing_agent_role_config_file() -> std::io::Result<()> {
    let codex_home = TempDir::new()?;
    let missing_path = codex_home.path().join("agents").join("researcher.toml");
    let cfg = ConfigToml {
        agents: Some(AgentsToml {
            enabled: None,
            max_concurrent_threads_per_session: None,
            max_depth: None,
            default_subagent_model: None,
            default_subagent_reasoning_effort: None,
            job_max_runtime_seconds: None,
            interrupt_message: None,
            roles: BTreeMap::from([(
                "researcher".to_string(),
                AgentRoleToml {
                    description: Some("Research role".to_string()),
                    config_file: Some(missing_path.abs()),
                    nickname_candidates: None,
                },
            )]),
        }),
        ..Default::default()
    };

    let result = Config::load_from_base_config_with_overrides(
        cfg,
        ConfigOverrides::default(),
        codex_home.abs(),
    )
    .await;
    let err = result.expect_err("missing role config file should be rejected");
    assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
    let message = err.to_string();
    assert!(message.contains("agents.researcher.config_file"));
    assert!(message.contains("must point to an existing file"));

    Ok(())
}
```

**File:** codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs (L117-143)
```rust
    let role_name = args
        .agent_type
        .as_deref()
        .map(str::trim)
        .filter(|role| !role.is_empty());

    let session_source = turn.session_source.clone();
    let child_depth = next_thread_spawn_depth(&session_source);
    let mut config =
        build_agent_spawn_config(&session.get_base_instructions().await, turn.as_ref())?;
    let is_full_history_fork = matches!(fork_mode, Some(SpawnAgentForkMode::FullHistory));
    apply_requested_spawn_agent_model_overrides(
        &session,
        turn.as_ref(),
        &mut config,
        args.model.as_deref(),
        args.reasoning_effort.clone(),
    )
    .await?;
    if !is_full_history_fork || role_name.is_some() {
        apply_spawn_agent_role(&session, &mut config, role_name).await?;
        if is_full_history_fork && config.developer_instructions.is_none() {
            config
                .developer_instructions
                .clone_from(&turn.developer_instructions);
        }
    }
```

## Q5

对呀，所以 agent 的角色（提示词）是必须预先定义好的，不会根据需求场景动态生成，这么理解没有问题吧

### Answer

## 答案

对，理解正确。Agent 角色的内容（description、developer_instructions、model、reasoning_effort、features 等）必须是预先定义好的静态配置，不会由模型在运行时动态生成新角色。

---

### 依据

- 内置角色是编译期写死在 `built_in::configs()` 的静态 `BTreeMap`,内容(如 `explorer`/`worker` 的 description 文本)在源码中硬编码 codex:339-404 。
- 用户自定义角色也必须提前写入 `agents.toml` 或 `agents/` 目录下的文件,在**配置加载阶段**被解析进 `Config.agent_roles`,而非对话过程中即时创建 codex:704-715 。
- `resolve_role_config` 的查找逻辑决定了这是一个**封闭集合**：先查用户角色表,再查内置表,查不到就直接报错终止,没有"临时生成一个角色"的分支 codex:165-173 ,对应的调用点在 `apply_role_to_config` 中会因此返回 `unknown agent_type` 错误 codex:57-59 。
- 角色配置文件缺失时,加载阶段会直接报错拒绝启动整个会话,而不是退化成动态生成一个替代角色 codex:8302-8340 。

唯一"动态"的部分是顶层 agent 在调用 spawn 工具时传入的任务内容/message,这与角色本身（`agent_type` 对应的 `AgentRoleConfig`）是分离的两个概念 codex:117-143 。

## Notes

此结论与上一轮回答一致，未发现相反证据。

Wiki pages you might want to explore:
- [Configuration System (openai/codex)](/wiki/openai/codex#2.2)
- [Thread Management and Multi-Agent (openai/codex)](/wiki/openai/codex#3.6)

### Citations

**File:** codex-rs/core/src/agent/role.rs (L57-59)
```rust
    let role = resolve_role_config(config, role_name)
        .cloned()
        .ok_or_else(|| format!("unknown agent_type '{role_name}'"))?;
```

**File:** codex-rs/core/src/agent/role.rs (L165-173)
```rust
pub(crate) fn resolve_role_config<'a>(
    config: &'a Config,
    role_name: &str,
) -> Option<&'a AgentRoleConfig> {
    config
        .agent_roles
        .get(role_name)
        .or_else(|| built_in::configs().get(role_name))
}
```

**File:** codex-rs/core/src/agent/role.rs (L339-404)
```rust
mod built_in {
    use super::*;

    /// Returns the cached built-in role declarations defined in this module.
    pub(super) fn configs() -> &'static BTreeMap<String, AgentRoleConfig> {
        static CONFIG: LazyLock<BTreeMap<String, AgentRoleConfig>> = LazyLock::new(|| {
            BTreeMap::from([
                (
                    DEFAULT_ROLE_NAME.to_string(),
                    AgentRoleConfig {
                        description: Some("Default agent.".to_string()),
                        config_file: None,
                        nickname_candidates: None,
                    }
                ),
                (
                    "explorer".to_string(),
                    AgentRoleConfig {
                        description: Some(r#"Use `explorer` for specific codebase questions.
Explorers are fast and authoritative.
They must be used to ask specific, well-scoped questions on the codebase.
Rules:
- In order to avoid redundant work, you should avoid exploring the same problem that explorers have already covered. Typically, you should trust the explorer results without additional verification. You are still allowed to inspect the code yourself to gain the needed context!
- You are encouraged to spawn up multiple explorers in parallel when you have multiple distinct questions to ask about the codebase that can be answered independently. This allows you to get more information faster without waiting for one question to finish before asking the next. While waiting for the explorer results, you can continue working on other local tasks that do not depend on those results. This parallelism is a key advantage of delegation, so use it whenever you have multiple questions to ask.
- Reuse existing explorers for related questions."#.to_string()),
                        config_file: Some("explorer.toml".to_string().parse().unwrap_or_default()),
                        nickname_candidates: None,
                    }
                ),
                (
                    "worker".to_string(),
                    AgentRoleConfig {
                        description: Some(r#"Use for execution and production work.
Typical tasks:
- Implement part of a feature
- Fix tests or bugs
- Split large refactors into independent chunks
Rules:
- Explicitly assign **ownership** of the task (files / responsibility). When the subtask involves code changes, you should clearly specify which files or modules the worker is responsible for. This helps avoid merge conflicts and ensures accountability. For example, you can say "Worker 1 is responsible for updating the authentication module, while Worker 2 will handle the database layer." By defining clear ownership, you can delegate more effectively and reduce coordination overhead.
- Always tell workers they are **not alone in the codebase**, and they should not revert the edits made by others, and they should adjust their implementation to accommodate the changes made by others. This is important because there may be multiple workers making changes in parallel, and they need to be aware of each other's work to avoid conflicts and ensure a cohesive final product."#.to_string()),
                        config_file: None,
                        nickname_candidates: None,
                    }
                ),
                // Awaiter is temp removed
//                 (
//                     "awaiter".to_string(),
//                     AgentRoleConfig {
//                         description: Some(r#"Use an `awaiter` agent EVERY TIME you must run a command that will take some very long time.
// This includes, but not only:
// * testing
// * monitoring of a long running process
// * explicit ask to wait for something
//
// Rules:
// - When an awaiter is running, you can work on something else. If you need to wait for its completion, use the largest possible timeout.
// - Be patient with the `awaiter`.
// - Do not use an awaiter for every compilation/test if it won't take time. Only use if for long running commands.
// - Close the awaiter when you're done with it."#.to_string()),
//                         config_file: Some("awaiter.toml".to_string().parse().unwrap_or_default()),
//                     }
//                 )
            ])
        });
        &CONFIG
    }
}
```

**File:** codex-rs/config/src/config_toml.rs (L704-715)
```rust
    /// User-defined role declarations keyed by role name.
    ///
    /// Example:
    /// ```toml
    /// [agents.researcher]
    /// description = "Research-focused role."
    /// config_file = "./agents/researcher.toml"
    /// nickname_candidates = ["Herodotus", "Ibn Battuta"]
    /// ```
    #[serde(default, flatten)]
    pub roles: BTreeMap<String, AgentRoleToml>,
}
```

**File:** codex-rs/core/src/config/config_tests.rs (L8302-8340)
```rust
#[tokio::test]
async fn load_config_rejects_missing_agent_role_config_file() -> std::io::Result<()> {
    let codex_home = TempDir::new()?;
    let missing_path = codex_home.path().join("agents").join("researcher.toml");
    let cfg = ConfigToml {
        agents: Some(AgentsToml {
            enabled: None,
            max_concurrent_threads_per_session: None,
            max_depth: None,
            default_subagent_model: None,
            default_subagent_reasoning_effort: None,
            job_max_runtime_seconds: None,
            interrupt_message: None,
            roles: BTreeMap::from([(
                "researcher".to_string(),
                AgentRoleToml {
                    description: Some("Research role".to_string()),
                    config_file: Some(missing_path.abs()),
                    nickname_candidates: None,
                },
            )]),
        }),
        ..Default::default()
    };

    let result = Config::load_from_base_config_with_overrides(
        cfg,
        ConfigOverrides::default(),
        codex_home.abs(),
    )
    .await;
    let err = result.expect_err("missing role config file should be rejected");
    assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
    let message = err.to_string();
    assert!(message.contains("agents.researcher.config_file"));
    assert!(message.contains("must point to an existing file"));

    Ok(())
}
```

**File:** codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs (L117-143)
```rust
    let role_name = args
        .agent_type
        .as_deref()
        .map(str::trim)
        .filter(|role| !role.is_empty());

    let session_source = turn.session_source.clone();
    let child_depth = next_thread_spawn_depth(&session_source);
    let mut config =
        build_agent_spawn_config(&session.get_base_instructions().await, turn.as_ref())?;
    let is_full_history_fork = matches!(fork_mode, Some(SpawnAgentForkMode::FullHistory));
    apply_requested_spawn_agent_model_overrides(
        &session,
        turn.as_ref(),
        &mut config,
        args.model.as_deref(),
        args.reasoning_effort.clone(),
    )
    .await?;
    if !is_full_history_fork || role_name.is_some() {
        apply_spawn_agent_role(&session, &mut config, role_name).await?;
        if is_full_history_fork && config.developer_instructions.is_none() {
            config
                .developer_instructions
                .clone_from(&turn.developer_instructions);
        }
    }
```
