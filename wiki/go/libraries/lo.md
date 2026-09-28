---
title: "lo"
updated: "2026-09-28"
tags:
  - golang
  - go-library
  - lo
  - generics
---

> 本文介绍 [samber/lo](https://github.com/samber/lo)，API 文档见 [pkg.go.dev](https://pkg.go.dev/github.com/samber/lo)。

Go 里对 slice / map 做过滤、映射、去重、分组，往往要手写一堆 `for` 循环。`lo` 是一套基于 Go 1.18+ 泛型的 Lodash 风格工具库，把这些常见操作收成可读的 helper，少写样板代码。

适合业务代码里频繁做集合变换、查找和聚合的场景。标准库 `slices` / `maps` 也能覆盖一部分，但 `lo` 的面更广；除了同步 helper，还有 `parallel` 并行版和 `mutable` 原地修改版。之后再写一长串循环处理数据时，可以优先看看它有没有现成函数。

## 基础用法

```go
names := lo.Uniq([]string{"Samuel", "John", "Samuel"})
// []string{"Samuel", "John"}

evens := lo.Filter([]int{1, 2, 3, 4}, func(x int, index int) bool {
	return x%2 == 0
})
// []int{2, 4}
```

常见的还有 `Map` / `Reduce` / `GroupBy`、`Contains` / `Find`，以及 map 侧的 `Keys` / `PickBy` / `Assign`；扩展包包括 `lo/parallel` 和 `lo/mutable`。
