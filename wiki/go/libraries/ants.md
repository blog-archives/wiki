---
title: "ants"
updated: "2026-09-28"
tags:
  - golang
  - go-library
  - ants
  - concurrency
---

> 本文介绍 [panjf2000/ants](https://github.com/panjf2000/ants)，API 文档见 [pkg.go.dev](https://pkg.go.dev/github.com/panjf2000/ants/v2)。

Go 里开 goroutine 很便宜，但无上限地 `go func()` 仍可能把内存和调度拖垮。`ants` 提供一个固定容量的 goroutine 池：任务提交进池，由有限个 worker 复用执行，从而把并发度卡在你设定的上限内。

适合批量请求、爬虫、队列消费这类「任务很多、但并发不能无限涨」的场景。手写 channel + worker 也能做到类似效果，但 `ants` 更省事，性能也够用。之后遇到要控并发的地方，可以优先考虑它。

## 基础用法

```go
p, _ := ants.NewPool(10000)
defer p.Release()

_ = p.Submit(func() {
	// 任务逻辑
})
```

`Tune` 可动态调容量，`WithPreAlloc` 预分配 worker 队列，`NewPoolWithFunc` 绑固定处理函数；也支持 `ReleaseTimeout` / `Reboot`，并在 worker 里兜住 panic。
