---
title: "通过通信方式共享内存"
updated: "2026-09-28"
tags:
  - golang
  - go
  - concurrency
  - channel
---

> 本文整理自 [Share Memory By Communicating](https://go.dev/blog/codelab-share)。

> **不要通过共享内存来通信；相反，通过通信来共享内存。**

传统写法用锁保护共享数据结构，多个线程争抢同一把锁。Go 更推荐用 channel 在 goroutine 之间传递数据引用，保证同一时刻只有一个 goroutine 能访问该数据。

`Poller` 从 `in` 接收待处理的 Resource，处理完再发送到 `out`——调度与互斥都交给 channel，业务结构里不再需要 `polling`、`lock` 这类记账字段：

```go
type Resource string

func Poller(in, out chan *Resource) {
    for r := range in {
        // poll the URL

        // send the processed Resource to out
        out <- r
    }
}
```
