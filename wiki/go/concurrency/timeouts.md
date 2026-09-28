---
title: "并发模式：超时，继续前进"
updated: "2026-09-28"
tags:
  - golang
  - go
  - concurrency
  - timeout
---

> 本文整理自 [Go Concurrency Patterns: Timing out, moving on](https://go.dev/blog/concurrency-timeouts)。

Channel 本身没有超时，用 `select` 同时等待数据和 `time.After`，谁先就绪就走谁——超时后放弃本次接收，继续往下执行：

```go
select {
case <-ch:
    // a read from ch has occurred
case <-time.After(1 * time.Second):
    // the read from ch has timed out
}
```

并行查询多个副本、只取最先返回的那个：`ch` 缓冲 1，保证第一个发送总能放下；其余 goroutine 用带 `default` 的非阻塞发送，发不出去就直接退出，不会卡住：

```go
func Query(conns []Conn, query string) Result {
    ch := make(chan Result, 1)
    for _, conn := range conns {
        go func(c Conn) {
            select {
            case ch <- c.DoQuery(query):
            default:
            }
        }(conn)
    }
    return <-ch
}
```
