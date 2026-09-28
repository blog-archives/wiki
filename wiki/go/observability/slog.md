---
title: "结构化日志 slog"
updated: "2026-09-28"
tags:
  - golang
  - go
  - slog
  - observability
---

> 本文整理自 [Structured Logging with slog](https://go.dev/blog/slog)。
>
> 扩展参考：[Logging in Go with Slog](https://betterstack.com/community/guides/logging/logging-in-go/)

`log/slog` 是 Go 1.21 正式加入标准库的结构化日志库，在完全兼容旧 log 使用习惯的基础上，补齐了生产级服务所需的结构化字段、日志级别、可扩展输出、链路上下文等能力，是官方推荐的新一代日志方案。

它围绕三个核心类型展开：

- **Logger**：日志前端，提供 `Info`、`Error` 等按级别记录事件的 API
- **Record**：单条自包含的日志记录
- **Handler**：决定 Record 如何格式化、过滤与输出；内置 `TextHandler`（key=value）与 `JSONHandler`（JSON）

```go
slog.Info("hello, world")
// 2023/08/04 16:09:19 INFO hello, world

slog.Info("hello, world", "user", os.Getenv("USER"))
// 2023/08/04 16:27:19 INFO hello, world user=jba

logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
logger.Info("hello, world", "user", os.Getenv("USER"))
// {"time":"2023-08-04T16:58:02.939245411-04:00","level":"INFO","msg":"hello, world","user":"jba"}
```

默认 Logger 的输出风格接近旧 `log` 包，只是多了级别前缀。要真正发挥结构化能力，应通过 `slog.New` 指定 Handler：

```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
logger.Debug("Debug message") // 默认最低级别为 INFO，Debug 会被丢弃
logger.Info("Info message")
logger.Warn("Warning message")
logger.Error("Error message")
```

```text
{"time":"...","level":"INFO","msg":"Info message"}
{"time":"...","level":"WARN","msg":"Warning message"}
{"time":"...","level":"ERROR","msg":"Error message"}
```

改用 `TextHandler` 则按 Logfmt 风格输出：

```go
logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
// time=... level=INFO msg="Info message"
```

## 自定义默认 Logger

`slog.SetDefault` 可替换包级默认 Logger，之后顶层 `slog.Info` 等函数都会走新配置：

```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
slog.SetDefault(logger)
slog.Info("Info message")
// {"time":"...","level":"INFO","msg":"Info message"}
```

`SetDefault` 还会同步影响旧 `log` 包的默认 Logger，便于存量代码平滑过渡到结构化输出：

```go
slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
log.Println("Hello from old logger")
// {"time":"...","level":"INFO","msg":"Hello from old logger"}
```

若第三方 API 只接受 `*log.Logger`（如 `http.Server.ErrorLog`），可用 `slog.NewLogLogger` 做桥接：

```go
handler := slog.NewJSONHandler(os.Stdout, nil)
_ = http.Server{
    ErrorLog: slog.NewLogLogger(handler, slog.LevelError),
}
```

## 结构化属性

结构化日志的核心价值，是为每条记录附加任意 key/value 上下文，便于排查、聚合与审计：

```go
logger.Info(
    "incoming request",
    "method", "GET",
    "time_taken_ms", 158,
    "path", "/hello/world?q=search",
    "status", 200,
)
```

```json
{
  "time": "...",
  "level": "INFO",
  "msg": "incoming request",
  "method": "GET",
  "time_taken_ms": 158,
  "path": "/hello/world?q=search",
  "status": 200
}
```

交替 key-value 写法简洁，但 key/value 数量不配对时，缺失的一侧会被标记为 `!BADKEY`：

```go
logger.Info("incoming request", "method", "GET", "time_taken_ms") // 缺少 value
// "...", "method":"GET", "!BADKEY":"time_taken_ms"
```

更稳妥的做法是使用强类型 `Attr`，或配合 vet / linter 检查配对错误：

```go
logger.Info(
    "incoming request",
    slog.String("method", "GET"),
    slog.Int("time_taken_ms", 158),
    slog.String("path", "/hello/world?q=search"),
    slog.Int("status", 200),
)
```

若要在类型层面杜绝松散 key-value，应使用只接受 `slog.Attr` 的 `LogAttrs`。它对高频日志也更友好：可减少内存分配。

```go
slog.LogAttrs(context.Background(), slog.LevelInfo, "hello, world",
    slog.String("user", os.Getenv("USER")),
)
```

### 属性分组：slog.Group

可用 `slog.Group` 把多个字段归入同一命名空间。`JSONHandler` 会输出嵌套对象，`TextHandler` 则用 `group.key` 前缀：

```go
logger.LogAttrs(context.Background(), slog.LevelInfo, "image uploaded",
    slog.Int("id", 23123),
    slog.Group("properties",
        slog.Int("width", 4000),
        slog.Int("height", 3000),
        slog.String("format", "jpeg"),
    ),
)
```

```json
{
  "msg": "image uploaded",
  "id": 23123,
  "properties": {"width": 4000, "height": 3000, "format": "jpeg"}
}
```

```text
msg="image uploaded" id=23123 properties.width=4000 properties.height=3000 properties.format=jpeg
```

## 日志级别体系

slog 内置四级标准日志级别，优先级从低到高为：`Debug`(-4) < `Info`(0) < `Warn`(4) < `Error`(8)。级别间隔为 4，便于在中间插入自定义级别（如数值 2）。同时提供通用 `Log` / `LogAttrs` 支持传入任意级别。

```go
slog.Debug("debug detail")
slog.Info("business event")
slog.Warn("unusual status")
slog.Error("request failed", "err", err)
```

所有 Logger 默认最低级别为 `INFO`，因此 `Debug` 会被静默丢弃。通过 `HandlerOptions.Level` 可调整：

```go
opts := &slog.HandlerOptions{Level: slog.LevelDebug}
logger := slog.New(slog.NewJSONHandler(os.Stdout, opts))
logger.Debug("Debug message") // 现在会输出
```

若需运行时动态调整级别，使用 `LevelVar`：

```go
logLevel := &slog.LevelVar{} // 默认 INFO
opts := &slog.HandlerOptions{Level: logLevel}
handler := slog.NewJSONHandler(os.Stdout, opts)
// 任意时刻切换：
logLevel.Set(slog.LevelDebug)
```

### 自定义级别

超出内置四级时，可定义新的 `slog.Level`，并通过 `Log` / `LogAttrs` 使用：

```go
const (
    LevelTrace = slog.Level(-8)
    LevelFatal = slog.Level(12)
)

opts := &slog.HandlerOptions{Level: LevelTrace}
logger := slog.New(slog.NewJSONHandler(os.Stdout, opts))
logger.Log(context.Background(), LevelTrace, "Trace message")
logger.Log(context.Background(), LevelFatal, "Fatal level")
// 默认会显示为 DEBUG-4 / ERROR+4
```

借助 `HandlerOptions.ReplaceAttr` 可把自定义级别映射为可读名称：

```go
var LevelNames = map[slog.Leveler]string{
    LevelTrace: "TRACE",
    LevelFatal: "FATAL",
}

opts := &slog.HandlerOptions{
    Level: LevelTrace,
    ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
        if a.Key == slog.LevelKey {
            level := a.Value.Any().(slog.Level)
            if label, ok := LevelNames[level]; ok {
                a.Value = slog.StringValue(label)
            }
        }
        return a
    },
}
// level 字段将输出 TRACE / FATAL
```

`ReplaceAttr` 还可用于重命名字段、改写时间格式、脱敏等通用属性处理。

## 可插拔 Handler 架构

slog 采用「Logger 前端 + Handler 后端」的分层设计：Logger 负责对外提供日志 API，Handler 负责真正的格式化、过滤与输出。切换输出格式或扩展能力时，只需更换 Handler，业务日志代码无需修改。

内置两种标准 Handler：

- **TextHandler**：输出 `key=value` 格式的结构化文本，字符串自动加引号保证结构可解析
- **JSONHandler**：输出单行 JSON 格式，适合日志采集系统解析、检索与聚合分析

`HandlerOptions` 还支持附带来源信息：

```go
opts := &slog.HandlerOptions{
    AddSource: true,
    Level:     slog.LevelDebug,
}
// 输出中会包含 source.function / source.file / source.line
```

也可按环境切换 Handler——开发用可读的 Text，生产用 JSON：

```go
opts := &slog.HandlerOptions{Level: slog.LevelDebug}
var handler slog.Handler = slog.NewTextHandler(os.Stdout, opts)
if os.Getenv("APP_ENV") == "production" {
    handler = slog.NewJSONHandler(os.Stdout, opts)
}
logger := slog.New(handler)
```

Handler 接口本身完全可自定义：

```go
type Handler interface {
    Enabled(context.Context, Level) bool
    Handle(context.Context, Record) error
    WithAttrs(attrs []Attr) Handler
    WithGroup(name string) Handler
}
```

- `Enabled`：按级别（也可结合 context）决定是否处理
- `Handle`：真正格式化并写出 Record
- `WithAttrs` / `WithGroup`：派生带公共字段或分组的新 Handler

社区也有不少现成 Handler，例如彩色输出（tint）、采样（slog-sampling）、多路分发（slog-multi）等。

## 核心进阶用法

### 预绑定公共字段：Logger.With

通过 `Logger.With` 可向 Logger 预挂载固定字段，返回一个新的 Logger 实例；后续该实例的所有日志都会自动携带这些公共字段，无需重复书写。

该机制不仅简化代码，还能让公共字段仅执行一次格式化，在高频日志场景下显著提升性能。

```go
buildInfo, _ := debug.ReadBuildInfo()
child := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With(
    slog.Group("program_info",
        slog.Int("pid", os.Getpid()),
        slog.String("go_version", buildInfo.GoVersion),
    ),
)
child.Info("image upload successful", slog.String("image_id", "39ud88"))
```

```json
{
  "msg": "image upload successful",
  "program_info": {"pid": 229108, "go_version": "go1.21"},
  "image_id": "39ud88"
}
```

### 字段分组：Logger.WithGroup

`Logger.WithGroup` 会创建一个命名分组，后续添加的所有属性（含调用点新增字段）都会归入该分组下，形成嵌套的结构化层级。

它的核心作用是为字段增加命名空间，解决不同模块字段 key 重名覆盖的问题，同时让日志结构更贴合业务语义分层。分组支持多层嵌套，可与 `With` 链式组合使用。

```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil)).WithGroup("program_info")
child := logger.With(
    slog.Int("pid", os.Getpid()),
    slog.String("go_version", buildInfo.GoVersion),
)
child.Warn("storage is 90% full", slog.String("available_space", "900.1 MB"))
```

```json
{
  "msg": "storage is 90% full",
  "program_info": {
    "pid": 1971993,
    "go_version": "go1.21",
    "available_space": "900.1 MB"
  }
}
```

对比：`With(slog.Group(...))` 只把预挂载字段放进分组；`WithGroup` 会把之后所有属性都纳入该分组。

### Context 链路透传

slog 为各级别方法提供了 Context 变体（`InfoContext`、`ErrorContext` 等），签名形如：

```go
func (l *Logger) InfoContext(ctx context.Context, msg string, args ...any)
```

可把请求级字段放进 `context.Context`，再在 Handler 中取出并写入 Record，适配微服务全链路追踪。

> 注意：上下文取消不会阻止日志写入。

默认 Handler **不会** 自动读取 context 中的值。下面这段代码里的 `request_id` 不会出现在日志中：

```go
ctx := context.WithValue(context.Background(), "request_id", "req-123")
logger.InfoContext(ctx, "image uploaded", slog.String("image_id", "img-998"))
// 输出中没有 request_id
```

需要自定义 Handler，在 `Handle` 里从 context 提取属性：

```go
type ctxKey string

const slogFields ctxKey = "slog_fields"

type ContextHandler struct {
    slog.Handler
}

func (h ContextHandler) Handle(ctx context.Context, r slog.Record) error {
    if attrs, ok := ctx.Value(slogFields).([]slog.Attr); ok {
        for _, v := range attrs {
            r.AddAttrs(v)
        }
    }
    return h.Handler.Handle(ctx, r)
}

// AppendCtx 将属性写入 context，供 ContextHandler 读取
func AppendCtx(parent context.Context, attr slog.Attr) context.Context {
    if parent == nil {
        parent = context.Background()
    }
    if v, ok := parent.Value(slogFields).([]slog.Attr); ok {
        return context.WithValue(parent, slogFields, append(v, attr))
    }
    return context.WithValue(parent, slogFields, []slog.Attr{attr})
}
```

使用方式：

```go
h := &ContextHandler{slog.NewJSONHandler(os.Stdout, nil)}
logger := slog.New(h)

ctx := AppendCtx(context.Background(), slog.String("request_id", "req-123"))
logger.InfoContext(ctx, "image uploaded", slog.String("image_id", "img-998"))
```

```json
{
  "msg": "image uploaded",
  "image_id": "img-998",
  "request_id": "req-123"
}
```

这样 `request_id`、`trace_id` 等可沿调用链透传，各层日志自动携带，无需层层手写。

### 错误日志

slog 没有专门的 `error` 辅助函数，通常用 `slog.Any`（或松散写法 `"err", err`）记录：

```go
err := errors.New("something happened")
logger.ErrorContext(ctx, "upload failed", slog.Any("error", err))
// {"msg":"upload failed","error":"something happened"}
```

若需要堆栈，可配合带 stack 的错误库（如 `go-xerrors`），再通过 `ReplaceAttr` 把 error 展开为含 `msg` / `trace` 的分组，便于生产排查。

### 自定义日志表现：LogValuer

自定义类型可通过实现 `LogValuer` 接口，控制自身在日志中的展示形式：

```go
type LogValuer interface {
    LogValue() Value
}
```

典型场景：

- 结构体自动展开为字段分组
- 密码、手机号等敏感数据自动脱敏
- 大对象按需精简输出，避免日志膨胀

未实现时，结构体会按字段原样输出，容易泄露敏感信息：

```go
type User struct {
    ID       string `json:"id"`
    Email    string `json:"email"`
    Password string `json:"password"`
}

logger.Info("info", "user", u)
// password 会出现在日志中
```

实现 `LogValuer` 后可只输出安全字段：

```go
func (u User) LogValue() slog.Value {
    return slog.GroupValue(
        slog.String("id", u.ID),
        slog.String("email", maskEmail(u.Email)), // 脱敏
    )
}

logger.Info("info", "user", u)
// {"user":{"id":"user-12234","email":"j***@example.com"}}
```

也可进一步精简为仅输出 ID：`return slog.StringValue(u.ID)`。

## 对接第三方后端

slog 的设计目标之一是统一前端 API，后端可按需替换。业务代码只依赖 `slog.Logger`，切换 Zap、Zerolog 等实现时改动面很小：

```go
// Zap 作为 Handler 后端
zapL := zap.Must(zap.NewProduction())
defer zapL.Sync()
logger := slog.New(zapslog.NewHandler(zapL.Core(), nil))
logger.Info("incoming request",
    slog.String("method", "GET"),
    slog.String("path", "/api/user"),
    slog.Int("status", 200),
)
```

## 性能设计要点

slog 在接口层面内置了多处针对性优化：

1. **前置级别过滤**：每条日志格式化前先调用 Handler 的 `Enabled` 方法，可快速丢弃低于级别的日志，避免无效的格式化开销。
2. **公共字段预格式化**：`WithAttrs`、`WithGroup` 挂载的字段仅做一次格式化，后续所有日志调用直接复用，大字段场景性能提升显著。
3. **低分配优化**：基于真实业务场景调研（95% 的日志属性不超过 5 个），针对性优化内存分配；`Attr` + `LogAttrs` 的组合可将高频日志的分配开销降到最低。

## 实践建议

1. **统一类型输出**：对领域类型实现 `LogValuer`，保证字段一致并默认脱敏。
2. **错误带堆栈**：生产环境的 Error 日志尽量附带 stack，缩短定位时间。
3. **用 linter 约束风格**：可用 [sloglint](https://github.com/go-simpler/sloglint) 强制 Attr-only、必须传 context、key 命名风格（如 snake_case）等规则。
4. **先落本地再集中采集**：应用写 stdout/文件，由 Vector、Fluentd 等 shipper 负责上报，降低耦合与丢日志风险。
5. **高流量场景考虑采样**：可用 slog-sampling 等 Handler 中间件，或在 shipper 侧采样，控制成本。

## 设计理念与生态定位

slog 的目标不是替代第三方日志库，而是提供一套通用的标准底层框架。现有主流日志库（如 Zap、logr、hclog）均可通过实现 Handler 接口接入统一生态，解决大型项目因依赖引入多套日志框架、输出格式难以统一的痛点。

在 API 设计上，slog 保留了轻量的交替 key-value 语法，同时配套静态 vet 检查工具捕获参数配对错误，兼顾了易用性与正确性。
