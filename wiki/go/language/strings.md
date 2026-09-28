---
title: "Strings、bytes、runes 与 characters"
updated: "2026-09-28"
tags:
  - golang
  - go
  - string
  - utf-8
---

> 本文整理自 [Strings, bytes, runes and characters in Go](https://go.dev/blog/strings)。

> **Go 的 `string` 本质是一个只读的字节序列（read-only slice of bytes），而不是字符数组。理解 `byte`、`Unicode`、`UTF-8` 和 `rune` 的关系，才能真正理解 Go 的字符串。**

## string 是什么？

> Go 官方定义：**String is a read-only slice of bytes.**

这意味着：

- `string` 保存的是连续的 **byte**。
- `string` 不可修改（immutable）。
- `len()` 返回的是 **字节数**。
- `s[i]` 返回的是 **byte**，而不是字符。

因此，Go 并没有把 `string` 当作文本，而只是一个字节容器，它甚至可以保存任意二进制数据或非法 UTF-8 数据。

不过，大多数情况下我们看到的字符串都是 UTF-8，这是因为 **Go 源码要求使用 UTF-8 编码**。因此，字符串字面量通常都是 UTF-8，而不是 `string` 类型本身要求必须是 UTF-8。

## Unicode、UTF-8 和 rune

理解这三个概念后，前面很多问题都会迎刃而解。

- **Unicode**：字符标准，为每个字符分配唯一编号（Code Point），例如 `你` 对应 `U+4F60`。Unicode **不是编码方式**。
- **UTF-8**：一种编码方式，用于将 Unicode 码点转换为字节序列。UTF-8 是变长编码，ASCII 字符通常占 1 个字节，中文通常占 3 个字节，Emoji 通常占 4 个字节。
- **rune**：Go 对 Unicode Code Point 的命名，本质就是 `int32`，用于表示一个 Unicode 字符。

因此可以简单理解为：

> **Unicode 定义字符，UTF-8 负责编码字符，而 `rune` 是 Go 中表示 Unicode 字符的类型。**

## 为什么 `len("你好") == 6`？

因为 `len()` 统计的是 **字节数**。

UTF-8 中：

- `"你"` 占 3 个字节
- `"好"` 占 3 个字节

因此 `"你好"` 共占 6 个字节，所以 `len("你好")` 的结果是 6，而不是 2。

同样，由于字符串底层保存的是字节：

- `s[i]` 返回的是第 `i` 个 **byte**
- 而不是第 `i` 个字符

如果需要按字符访问，应先转换为 `[]rune`。

## 为什么 `range` 可以遍历字符？

遍历字符串时，Go 会自动按照 UTF-8 解码。

因此：

- `i` 表示当前字符的 **字节下标**
- `r` 表示当前字符对应的 **rune**

也就是说，`range` 已经帮我们完成了 UTF-8 解码，因此遍历字符串时几乎都应该优先使用 `range`。

## 总结

这篇文章最重要的结论只有几条：

1. **`string` 是只读的字节序列，而不是字符数组。**
2. **`string` 可以保存任意字节，不一定是 UTF-8；字符串字面量通常才是 UTF-8。**
3. **Unicode 是字符标准，UTF-8 是编码方式，`rune` 是 Go 中表示 Unicode 码点的类型。**
4. **`len()` 返回字节数，`s[i]` 返回 `byte`，`range` 返回 `rune`。**
5. **只有需要按字符索引或修改字符时，才转换为 `[]rune`。**

对于日常 Go 开发来说，只要牢记一句话即可：

> **把 `string` 当作字节序列处理；只有处理字符时，再借助 `rune` 和 UTF-8 解码。**
