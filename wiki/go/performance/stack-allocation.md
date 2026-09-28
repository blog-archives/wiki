---
title: "在栈上分配内存"
updated: "2026-09-28"
tags:
  - golang
  - go
  - allocation
  - performance
---

> 本文整理自 [Allocating on the Stack](https://go.dev/blog/allocation-optimizations)。

> **堆分配贵且拖累 GC；Go 1.25/1.26 让编译器把更多小切片放到栈上，很多「先 append 再扩容」的启动垃圾可以自动消掉。**

堆分配要跑一大段分配器逻辑，还会增加 GC 压力。栈分配便宜得多（有时几乎免费），随栈帧一起回收，不给 GC 添负担，也更利于缓存复用。

## 定长 make

反复 `append` 时，容量按 1→2→4→8… 翻倍。切片还小时，这轮「启动阶段」会产生多次堆分配和一堆短命垃圾——很多程序里切片永远不大，开销全花在这里。

手写优化往往是先猜容量：

```go
func process2(c chan task) {
    tasks := make([]task, 0, 10) // 大概最多 10 个
    for t := range c {
        tasks = append(tasks, t)
    }
    processAll(tasks)
}
```

若猜测准确，表面上只剩一次 `make`。但基准测试里往往是 **0 次堆分配**：编译器把 backing store 直接放进 `process2` 的栈帧。前提是它不能在 `processAll` 里逃逸到堆。

## 常量 vs 非常量

Go **没有** C 那种 `alloca`：栈帧大小在编译期就定死了，运行时不能按变量再往栈上「抠」一块大小未知的空间。

| | 常量 `make(..., 0, 10)` | 非常量 `make(..., 0, lengthGuess)` |
|---|---|---|
| 编译期知道多大？ | 知道：`10 * sizeof(task)` | 不知道：要到运行时才有值 |
| 栈帧怎么处理？ | 直接画进栈帧布局 | 没法预留「刚好够」的空间 |
| 1.24 及更早 | 可栈分配 → 零堆分配 | 只能堆分配 → 至少一次堆分配 |

分界线不是「`make` 还是 `append`」，而是：**编译器能不能在固定大小的栈帧里给 backing store 留出确切位置**。常量可以；变量不行——除非另想办法。

## 1.24：变长只能上堆

硬编码 `10` 太死板。面对变长场景，你也许会改成让调用方传入估计长度，好避开反复扩容：

```go
func process3(c chan task, lengthGuess int) {
    tasks := make([]task, 0, lengthGuess)
    for t := range c {
        tasks = append(tasks, t)
    }
    processAll(tasks)
}
```

问题随之而来：`lengthGuess` 是变量，编译期不知道多大，没法画进固定栈帧 → `make` 只能上堆。相对裸 `append` 的多次扩容，这已经好很多（一次堆分配），但零分配变一分配，还是可惜。

手写也能绕：`lengthGuess <= 10` 时用常量 `make(..., 0, 10)`，否则再用变量大小——「小用栈、大用堆」能工作，但代码难看。

## 1.25：投机栈缓冲

1.25 让编译器替你做这件事，而且不靠动态栈帧。它在部分 `make` 位点 **预先** 在栈帧里留一小块固定缓冲（当前约 32 字节），运行时再看：

1. `lengthGuess` 能塞进这块缓冲 → 用栈缓冲，零堆分配
2. 塞不下 → 和平时一样走堆

栈帧大小仍然是编译期常量，只是多留了这块「说不定用得上」的空间。猜得准且能塞进 32 字节时，`process3` 可以重新变成零堆分配。

但优化挂在 `make` 上——得先写出 `make(..., 0, n)` 才吃得到。很多代码根本没预分配：

```go
func process(c chan task) {
    var tasks []task // 没有 make，容量从 0 开始
    for t := range c {
        tasks = append(tasks, t)
    }
    processAll(tasks)
}
```

第一次 `append` 时切片还是空的，只能去堆上分配。不知道最终多大，就从容量 1 起步，再 2、4、8… 翻倍。前几次扩容全是堆分配，旧 backing store 立刻变垃圾——1.25 对此无能为力。

## 1.26：覆盖 append 与逃逸

1.26 把同一块投机栈缓冲挂到 `append` 位点。第一次需要 backing store 时，先用栈缓冲，而不是立刻上堆。假设缓冲刚好能装 4 个 `task`：

1. 第 1 次 `append`：用栈缓冲，容量直接是 4（不是堆上的 1）
2. 第 2～4 次：往栈缓冲里写，无分配
3. 第 5 次：栈缓冲满了，这才第一次去堆上扩容

对照旧路径：省掉了容量 1、2、4 那几轮堆分配和短命垃圾。元素一直不超过栈缓冲时，整段循环可以是 **零堆分配**——不用改 API，也不用手写 `lengthGuess`。

还有一类更棘手的情况：切片要返回出去。

```go
func extract(c chan task) []task {
    var tasks []task
    for t := range c {
        tasks = append(tasks, t)
    }
    return tasks
}
```

返回值本身不能留在栈上——`extract` 一返回，栈帧就没了，调用方拿到的会是悬空指针。最终结果必须落在堆上。但中间那些「扩容时产生、随后又被丢掉」的临时 backing store 从不离开函数，本可以先用栈。手写可以这样拆：

```go
func extract2(c chan task) []task {
    var tasks []task
    for t := range c {
        tasks = append(tasks, t) // 中间过程尽量吃前面的栈优化
    }
    tasks2 := make([]task, len(tasks)) // 知道最终长度后，堆上精确分配一次
    copy(tasks2, tasks)
    return tasks2
}
```

1.26 不用手写这段。编译器会把原来的 `extract` 改成大致等价于 return 前调用 `runtime.move2heap(tasks)`：

1. 已经在堆上（中途溢出过）→ 原样返回，不再拷
2. 还在栈上（全程没超出栈缓冲）→ 按最终长度堆分配一次，拷过去再返回

这比手写更好：手写版本 **每次返回都** 要多一次分配 + 拷贝；编译器只在「全程都在栈缓冲里」时才搬一次。拷贝成本大致被省掉的启动阶段拷贝抵消——小切片场景下，往往正好是 **一次、且大小刚好** 的堆分配。

## 小结

有可靠容量估计时，手写 `make(..., 0, n)` 仍然值得；其余很多简单场景，升级到新版本编译器会帮你兜住。若怀疑这类优化导致正确性或负优化，可用 `-gcflags=all=-d=variablemakehash=n` 关闭，并给 Go 提 issue。
