---
title: "上下文与结构体"
updated: "2026-09-28"
tags:
  - golang
  - go
  - context
  - api-design
---

> 本文整理自 [Contexts and structs](https://go.dev/blog/context-and-structs)。

不要将 `context.Context` 存入结构体，而是把 ctx 作为函数首参显式传入，因为存放在结构体中会让所有方法共享同一个上下文，无法为单次调用单独配置超时、取消与请求元数据，API 语义模糊且容易造成请求资源堆积、生命周期混乱；仅在需要兼容旧接口、大批量改造函数不现实的特殊场景才允许把 ctx 放进结构体，官方更推荐新增带 ctx 后缀的重载方法来实现兼容，保证上下文作用域清晰可控。

```go
type Worker struct {
  ctx context.Context
}

func New(ctx context.Context) *Worker {
  return &Worker{ctx: ctx}
}

func (w *Worker) Fetch() (*Work, error) {
  _ = w.ctx // A shared w.ctx is used for cancellation, deadlines, and metadata.
}

func (w *Worker) Process(work *Work) error {
  _ = w.ctx // A shared w.ctx is used for cancellation, deadlines, and metadata.
}
```
