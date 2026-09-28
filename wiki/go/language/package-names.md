---
title: "Go 包命名规范"
updated: "2026-09-28"
tags:
  - golang
  - go
  - package-naming
---

> 本文整理自 [Package names](https://go.dev/blog/package-names)。

> **包名是设计的一部分——要短、清晰、有意义；内容命名从调用方视角出发，避免与包名重复，并拆掉 util / common 这类空壳包。**

好的包名能提升代码可用性：它为包内容提供上下文，让调用方更容易理解用途；也帮维护者判断什么该放进包、什么不该。命名得当，找代码也更轻松。

## 包名

好的包名应简短、清晰：小写，不用 `under_scores` 或 `mixedCaps`，常见形式是简单名词，如 `time`、`list`、`http`。

- **谨慎缩写**：缩写对程序员熟悉时可以用，如 `strconv`、`fmt`；若会变得含糊，就别缩。
- **别抢用户的好名字**：避免用客户端代码里常见的变量名当包名。例如缓冲 I/O 叫 `bufio` 而不是 `buf`，因为 `buf` 是很好的缓冲区变量名。

### 糟糕的包名

- **避免无意义的名字**：`util`、`common`、`misc` 既说不清内容，也难保持聚焦，还容易和别的包撞名。
- **拆开通用包**：找出名字里共有的元素，抽成独立包。例如：

```go
// 之前
package util
func NewStringSet(...string) map[string]bool { /* ... */ }
func SortStringSet(map[string]bool) []string { /* ... */ }

set := util.NewStringSet("c", "a", "b")
fmt.Println(util.SortStringSet(set))

// 之后
package stringset
type Set map[string]bool
func New(...string) Set { /* ... */ }
func (s Set) Sort() []string { /* ... */ }

set := stringset.New("c", "a", "b")
fmt.Println(set.Sort())
```

- **不要把所有 API 塞进一个包**：`api`、`types`、`interfaces` 会和 `util` 一样膨胀、无指引、易冲突。拆开，必要时用目录区分对外包和实现。
- **避免不必要的撞名**：不同目录下的包可以同名，但经常一起用的包应有不同名字；也尽量别和常用标准库包（如 `io`、`http`）重名。

## 包内容命名

设计包时，站在调用方视角看 `pkg.Name` 是否顺口。

- **避免重复**：调用方本就会加包名前缀，内容名不必再带一遍。HTTP 服务器叫 `Server` 而不是 `HTTPServer`，写成 `http.Server` 已足够清楚。
- **简化函数名**：当包 `pkg` 中的函数返回 `pkg.Pkg`（或 `*pkg.Pkg`）时，常可省略类型名而不致混淆：

```go
start := time.Now()                           // time.Time
q := list.New()                               // *list.List
ctx = context.WithTimeout(ctx, 10*time.Millisecond)
```

若返回的是包内其他类型 `pkg.T`，函数名可带上 `T`，例如 `time.ParseDuration`、`time.NewTicker`。
