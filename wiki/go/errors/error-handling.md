---
title: "错误处理"
updated: "2026-09-28"
tags:
  - golang
  - go
  - error-handling
---

> 本文整理自 [Error handling and Go](https://go.dev/blog/error-handling-and-go)。

> **Go 的错误是值，不是异常；通过显式检查、自定义错误类型、以及把重复处理抽成适配层，可以写出既可靠又简洁的错误处理代码。**

Go 不用异常跳转控制流，而是把错误当作函数返回值的一部分，要求调用方显式处理。这样做的代价是样板代码多一点，收益是错误路径清晰、不容易被悄悄忽略。

下面用同一个场景串起各要点：HTTP 接口根据 `id` 读取并展示一条 `Record`。先看最基础的写法，再逐步补上上下文、类型分支，以及如何去掉重复的处理逻辑。

## 基本用法

这一节只解决一件事：错误长什么样，以及调用方怎么接住它。

`error` 是一个内置接口：

```go
type error interface {
    Error() string
}
```

常见模式是函数返回 `(result, error)`，调用方立刻用 `if err != nil` 检查：

```go
func viewRecord(w http.ResponseWriter, r *http.Request) {
    record, err := loadRecord(r.FormValue("id"))
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }
    viewTemplate.Execute(w, record)
}
```

知道这一点就能写很多 Go 代码。但上面的 handler 还太粗：失败一律 500，错误信息也未必够用。要写得好，还需要下面几个观念。

## 错误要携带上下文

只把底层错误原样往上抛，调用方往往看不出「是在哪一层、对哪个对象」失败的。错误字符串的责任是 **总结现场**：发生了什么、在哪一层、关键参数是什么。

`os.Open` 返回的是 `"open /etc/passwd: permission denied"`，而不只是 `"permission denied"`。前者能定位问题，后者几乎没用。

同样，`loadRecord` 不应只往上抛底层错误：

```go
func loadRecord(id string) (*Record, error) {
    record := new(Record)
    if err := datastore.Get(keyFor(id), record); err != nil {
        // 缺上下文：调用方只知道 datastore 失败了
        // return nil, err

        // 带上下文：补上本层信息（操作 + id）
        // 用 %w 包装，保留错误链，上层才能用 errors.Is / errors.As 判断
        return nil, fmt.Errorf("load record %s: %w", id, err)
    }
    return record, nil
}
```

用什么 API 构造错误并不重要；重要的是：**向上返回时补上本层能提供、调用方需要的信息**。包装时优先 `%w`，这样上下文和可判断性可以兼得。

## 可以自定义错误类型

有了可读的错误信息还不够——有时调用方需要按失败原因分支，例如「找不到」返回 404、「其它失败」返回 500。这时字符串比对就太脆了；`error` 只要求 `Error() string`，你可以定义自己的类型来携带可检查的细节：

```go
type NotFoundError struct {
    ID string
}

func (e *NotFoundError) Error() string {
    return fmt.Sprintf("record %s not found", e.ID)
}

func loadRecord(id string) (*Record, error) {
    record := new(Record)
    if err := datastore.Get(keyFor(id), record); err != nil {
        if errors.Is(err, datastore.ErrNoSuchEntity) {
            return nil, &NotFoundError{ID: id}
        }
        return nil, fmt.Errorf("load record %s: %w", id, err)
    }
    return record, nil
}
```

普通调用方照常打印；需要分支的调用方用 `errors.As`（哨兵错误用 `errors.Is`）。它们能穿透 `%w` 包装，比 `==` 和类型断言更稳妥：

```go
record, err := loadRecord(id)
if err != nil {
    var notFound *NotFoundError
    if errors.As(err, &notFound) {
        http.Error(w, err.Error(), 404)
        return
    }
    http.Error(w, err.Error(), 500)
    return
}
```

还可以在 `error` 上扩展方法，表达错误类别。例如 `net.Error` 的 `Temporary()`，让调用方决定是否重试——思路相同：错误不只是一段字符串，还可以携带可检查的语义。

## 减少重复的错误处理

到这里，错误已经能说明现场、也能按类型分支了；但每个 handler 里仍要重复写「打日志 / 选状态码 / 回用户消息」。handler 一多，样板代码会迅速膨胀。

解决办法是：**业务函数只负责 return error，统一的适配层负责展示**。

```go
type appError struct {
    Err     error
    Message string // 给用户看
    Code    int
}

type appHandler func(http.ResponseWriter, *http.Request) *appError

func (fn appHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    if e := fn(w, r); e != nil {
        log.Printf("%v", e.Err)           // 完整错误写日志
        http.Error(w, e.Message, e.Code)  // 友好消息返回用户
    }
}

func viewRecord(w http.ResponseWriter, r *http.Request) *appError {
    record, err := loadRecord(r.FormValue("id"))
    if err != nil {
        var notFound *NotFoundError
        if errors.As(err, &notFound) {
            return &appError{err, "Record not found", 404}
        }
        return &appError{err, "Can't load record", 500}
    }
    if err := viewTemplate.Execute(w, record); err != nil {
        return &appError{err, "Can't display record", 500}
    }
    return nil
}

// http.Handle("/view", appHandler(viewRecord))
```

业务代码每一行都有明确含义：底层原因是什么、给用户看什么、返回什么状态。需要时还可以在适配层加 HTML 错误页、堆栈、`recover` panic 等，而不必改每个 handler。

## 核心原则

从接住 `error`，到补上下文、做类型分支，再到把展示逻辑上收——整条路径可以收成四句话：

1. **错误是值**：用返回值显式传递，不靠异常跳转控制流
2. **携带上下文**：错误信息要能还原现场，而不只是底层原因
3. **需要时自定义类型**：调用方要分支处理细节时，用结构化错误或扩展接口
4. **把重复处理上收**：用适配层统一日志、状态码、用户提示，让业务函数只关心 `return err`
