---
title: "JSON and Go"
updated: "2026-09-28"
tags:
  - golang
  - go
  - json
  - encoding
---

> 本文整理自 [JSON and Go](https://go.dev/blog/json)。

`encoding/json` 提供 `Marshal` / `Unmarshal`，在 Go 值与 JSON 之间互转。文章主体是入门示例；真正值得记的是编码约束，以及结构体只导出字段会参与编解码。

## 编码

```go
func Marshal(v interface{}) ([]byte, error)
```

只有能表示为合法 JSON 的数据结构才会被编码：

- JSON 对象的键必须是字符串，因此 Go map 须为 `map[string]T`（`T` 为 json 包支持的类型）。
- channel、complex、function 无法编码。
- 不支持循环结构；`Marshal` 会陷入无限循环。
- 指针编码为其指向的值；`nil` 编码为 `null`。
- 结构体只编码导出字段（首字母大写）。

## 解码

```go
func Unmarshal(data []byte, v interface{}) error
```

`Unmarshal` 按字段名（或 struct tag）填充目标值；JSON 里多出来的键会被忽略，未导出字段不受影响。未知结构时可解到 `interface{}`，对象对应 `map[string]interface{}`，数组对应 `[]interface{}`。
