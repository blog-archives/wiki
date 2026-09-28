---
title: "Go maps 的实际应用"
updated: "2026-09-28"
tags:
  - golang
  - go
  - map
---

> 本文整理自 [Go maps in action](https://go.dev/blog/maps)。

```go
map[KeyType]ValueType
```

KeyType 可以是任何可比较的类型，而 ValueType 则可以是任何类型，包括另一个映射对象！

## 利用零值进行剥削

当键不存在时，映射检索返回零值，这一特性会带来便利。

例如，布尔值映射可作为类集合数据结构使用（请注意，布尔类型的零值为 false）。以下示例会遍历由节点（Node） 构成的链表并打印其值，该示例通过 Node 指针构成的映射来检测链表中的环。

```go {8, 12}
type Node struct {
    Next  *Node
    Value interface{}
}
var first *Node

visited := make(map[*Node]bool)
for n := first; n != nil; n = n.Next {
    if visited[n] {
        fmt.Println("cycle detected")
        break
    }
    visited[n] = true
    fmt.Println(n.Value)
}
```

如果已经访问过 n ，那么 `visited[n]` 就等于 true ；如果 n 不存在，那么 `visited[n]` 就等于 false 。无需使用双值形式来检测映射中是否存在 n ，因为默认情况下，零值就代表了该元素的存在。

另一个有用的零值用法是处理切片映射。将值添加到空切片中时，只会分配一个新的切片；因此，只需一步操作即可将值添加到切片映射中，无需检查该键是否存在。在下面的例子中，people 切片被填充了 Person 值。每个 Person 都包含一个 Name ，并且还有一个“喜欢”切片。这个例子创建了一个映射，将每个“喜欢”与对应的 people 切片关联起来。

```go {8}
type Person struct {
    Name  string
    Likes []string
}
var people []*Person

likes := make(map[string][]*Person)
for _, p := range people {
    for _, l := range p.Likes {
        likes[l] = append(likes[l], p)
    }
}
```

## Key 主要类型

映射键可以是任何可比较的类型。

语言规范对此有明确的定义，简而言之，可比较的类型包括布尔值、数字、字符串、指针、通道、接口类型，以及仅包含这些类型的结构体或数组。值得注意的是，切片、映射和函数不在这些类型的列表中；这些类型无法使用 == 进行比较，因此也不应被用作映射键。

## 并发性

映射在并发使用时并不安全：没有明确的规定在同时读写映射时会发生什么情况。如果需要在并发执行的 goroutine 之间读写映射，那么必须通过某种同步机制来协调这些访问操作。一种常见的保护映射的方法是使用 `sync.RWMutex`。

## 迭代顺序

在通过循环遍历映射时，迭代的顺序是不确定的，无法保证每次迭代的顺序与之前相同。如果你需要固定的迭代顺序，就必须维护一个单独的数据结构来记录这个顺序。

### 为什么不能依赖遍历顺序

以下补充来自 [原仓库的 map 遍历笔记](https://github.com/blog-archives/go/blob/master/content/note/iterating-map.md)。

Go map 的无序具体表现为：**使用 `range` 遍历 map 时，元素返回的顺序是不确定的，同一个 map 多次遍历可能得到不同顺序；即使按照固定顺序插入 key，也无法保证按插入顺序输出。** Go 不保证 map 的遍历顺序，程序不能依赖某个 key 先出现或后出现，若需要固定顺序必须额外维护或排序。

因为哈希表的性质，遍历的顺序与插入顺序不同很好理解。但是每次遍历的顺序为什么要刻意打乱呢？

- 底层原因：

    Go map 是哈希表，key 根据 hash 分布到 bucket 中。随着元素增加，map 会扩容，bucket 数量增加，部分 key 会被重新分配到新的 bucket，因此原来的存储排列会变化，遍历顺序自然无法保持。

- 设计原因：

    即使某些情况下 map 没有扩容，内部 bucket 排列可能看起来比较稳定。如果遍历顺序一直固定，开发者容易写出依赖顺序的代码。因此 Go runtime 在遍历时会随机选择起始位置和偏移，让这种错误更容易暴露。
