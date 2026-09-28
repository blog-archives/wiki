---
title: "Go 1.13 错误处理"
updated: "2026-09-28"
tags:
  - golang
  - go
  - error-handling
  - error-wrapping
---

> 本文整理自 [Working with Errors in Go 1.13](https://go.dev/blog/go1.13-errors)。

> **Go 1.13 用 `%w` 包装错误形成错误链，再用 `errors.Is` / `errors.As` 沿链检查哨兵值或提取具体类型。**

用 `fmt.Errorf` 配合 `%w` 包装错误，既补充上下文，又保留底层错误供后续检查：

```go
if err != nil {
    // 返回的错误可以 unwrap 到 err
    return fmt.Errorf("decompress %v: %w", name, err)
}
```

用 `errors.Is` 判断错误链中是否包含某个哨兵值（相当于沿链做 `==`）：

```go
if errors.Is(err, ErrPermission) {
    // err 本身，或其包装的某一层，是权限错误
}
```

用 `errors.As` 从错误链中提取特定类型（相当于沿链做类型断言）：

```go
var e *QueryError
if errors.As(err, &e) {
    // err 是 *QueryError，e 已被赋值为该错误
}
```

是否包装取决于你是否愿意把底层错误暴露给调用方：要让程序能据此做决策就用 `%w`；若那是实现细节、不想写进 API 契约，就用 `%v` 只保留文案。

## 相关文档

[errors.Is 的源码实现](errors-is.md)解释错误链的遍历和匹配条件。
