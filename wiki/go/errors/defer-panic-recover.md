---
title: "defer、panic 和 recover"
updated: "2026-09-28"
tags:
  - golang
  - go
  - defer
  - panic
  - recover
---

> 本文整理自 [Defer, Panic, and Recover](https://go.dev/blog/defer-panic-and-recover)。

## defer

`defer` 语句会将一个函数调用压入一个列表中。这些被保存的调用列表会在其所在的函数返回后执行。`defer` 通常用于简化需要执行各类清理操作的函数。

```go {6, 12}
func CopyFile(dstName, srcName string) (written int64, err error) {
    src, err := os.Open(srcName)
    if err != nil {
        return
    }
    defer src.Close()

    dst, err := os.Create(dstName)
    if err != nil {
        return
    }
    defer dst.Close()

    return io.Copy(dst, src)
}
```

> defer 会立刻求值并保存参数，函数本身延后执行

在这个例子中，表达式 `i` 在 `Println` 调用被 defer 时就已经求值。延迟调用会在函数返回后打印 `0`。

```go
func a() {
    i := 0
    defer fmt.Println(i)
    i++
    return
}

// Output: 0
```

> 延迟执行的函数调用会在相关函数返回后，按照先进先出的顺序依次执行

```go
func b() {
    for i := 0; i < 4; i++ {
        defer fmt.Print(i)
    }
}

// Output: 3210
```

> 延迟调用的函数可以读取并赋值给返回函数中的命名返回值

```go
func c() (i int) {
    defer func() { i++ }()
    return 1
}

// Output: 2
```

## panic

panic 是一个内置函数，它会终止正常的控制流并开始触发恐慌机制。当函数 F 调用 panic 时，F 的执行会中止，F 中所有已延迟的函数会正常执行，随后 F 返回到其调用方。对调用方而言，F 的行为就如同一次对 panic 的调用。该过程会沿着调用栈向上持续，直到当前 goroutine 中的所有函数都返回，此时程序会崩溃。恐慌既可以通过直接调用 panic 来触发，也可能由数组越界访问等运行时错误引发。

## recover

Recover 是一个内置函数，用于重新获取发生 panic 的 goroutine 的控制权。Recover 仅在延迟函数（deferred function）中有效。在正常执行流程中，调用 recover 会返回 nil 且不会产生任何其他影响。若当前 goroutine 正处于 panic 状态，调用 recover 会捕获传入 panic 的值，并让程序恢复正常执行。

```go {12, 24}
package main

import "fmt"

func main() {
    f()
    fmt.Println("Returned normally from f.")
}

func f() {
    defer func() {
        if r := recover(); r != nil {
            fmt.Println("Recovered in f", r)
        }
    }()
    fmt.Println("Calling g.")
    g(0)
    fmt.Println("Returned normally from g.")
}

func g(i int) {
    if i > 3 {
        fmt.Println("Panicking!")
        panic(fmt.Sprintf("%v", i))
    }
    defer fmt.Println("Defer in g", i)
    fmt.Println("Printing in g", i)
    g(i + 1)
}
```
