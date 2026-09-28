---
title: "可测试示例"
updated: "2026-09-28"
tags:
  - golang
  - go
  - testing
  - example
---

> 本文整理自 [Testable Examples in Go](https://go.dev/blog/examples)。

> **写在 `_test.go` 里的 `Example` 既是文档，也会被 `go test` 编译/执行；有 `// Output:` 就比对标准输出，没有则只保证能编译。**

示例函数放在 `*_test.go`，无参数，以 `Example` 开头。命名约定决定它挂在哪条文档下：

```go
func ExampleFoo()     // 对应 Foo 函数或类型
func ExampleBar_Qux() // 对应 Bar 的 Qux 方法
func Example()        // 对应整个包
```

同一标识符可写多个示例，后缀用 `_` + 小写字母，如 `ExampleString_second`。

有 `// Output:` 时，测试框架会捕获 stdout 并比对；去掉 Output 则只编译不执行——适合演示访问网络等不便当单元测试跑的代码。

需要额外类型/方法时（例如演示 `sort.Interface`），用「整文件示例」：文件以 `_test.go` 结尾，只含一个 Example、不含 Test/Benchmark，且至少还有一个包级声明，godoc 会展示整个文件：

```go
package sort_test

import (
    "fmt"
    "sort"
)

type Person struct {
    Name string
    Age  int
}

func (p Person) String() string {
    return fmt.Sprintf("%s: %d", p.Name, p.Age)
}

type ByAge []Person

func (a ByAge) Len() int           { return len(a) }
func (a ByAge) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
func (a ByAge) Less(i, j int) bool { return a[i].Age < a[j].Age }

func Example() {
    people := []Person{
        {"Bob", 31},
        {"John", 42},
        {"Michael", 17},
        {"Jenny", 26},
    }

    fmt.Println(people)
    sort.Sort(ByAge(people))
    fmt.Println(people)

    // Output:
    // [Bob: 31 John: 42 Michael: 17 Jenny: 26]
    // [Michael: 17 Jenny: 26 Bob: 31 John: 42]
}
```
