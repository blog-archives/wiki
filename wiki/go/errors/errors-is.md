---
title: "errors.Is(err, target error) bool"
updated: "2026-09-28"
tags:
  - golang
  - error-handling
  - source-code
---

`errors.Is` 用来判断错误链（树）里是否出现了目标错误，是 Go 1.13+ 处理 wrapping error 的标准方式。

## 作用

判断 `err` 及其 unwrap 出来的错误里，是否有任何一个“匹配”`target`。

匹配有两种：

1. **值相等**：`err == target`（sentinel error，如 `io.EOF`）
2. **自定义 `Is` 方法**：`err.Is(target) == true`

## 源码拆解

```go
func Is(err, target error) bool {
	if err == nil || target == nil {
		return err == target
	}

	isComparable := reflectlite.TypeOf(target).Comparable()
	return is(err, target, isComparable)
}
```

- 任一为 `nil`：只有两者都是 `nil` 才为 `true`
- 先判断 `target` 是否可比较（slice/map/func 等不可比较），再交给内部 `is`

```go
func is(err, target error, targetComparable bool) bool {
	for {
		if targetComparable && err == target {
			return true
		}
		if x, ok := err.(interface{ Is(error) bool }); ok && x.Is(target) {
			return true
		}
		switch x := err.(type) {
		case interface{ Unwrap() error }:
			err = x.Unwrap()
			// ...
		case interface{ Unwrap() []error }:
			// 深度优先遍历多错误
			// ...
		default:
			return false
		}
	}
}
```

对每个错误依次：

1. 若可比较且 `err == target` → `true`
2. 若实现了 `Is(error) bool` 且返回 `true` → `true`
3. 否则 unwrap：
   - `Unwrap() error`：沿单链继续
   - `Unwrap() []error`：对 `errors.Join` 等多错误做 **深度优先** 递归
   - 都没有 → `false`

## 用法对比

```go
var ErrNotFound = errors.New("not found")

// 旧写法：包装后会失败
if err == ErrNotFound { ... }

// 正确写法：能穿透 fmt.Errorf("%w", ...) / errors.Join
if errors.Is(err, ErrNotFound) { ... }
```

自定义等价判断示例：

```go
func (m MyError) Is(target error) bool {
    return target == fs.ErrExist
}
// errors.Is(MyError{}, fs.ErrExist) == true
```

## 和 `errors.As` 的区别

| | `errors.Is` | `errors.As` |
|---|---|---|
| 目的 | 是否等于某个 sentinel / 语义等价 | 是否能取出某具体类型 |
| 典型场景 | `io.EOF`、`sql.ErrNoRows` | 取出 `*os.PathError` 读字段 |

一句话：**`Is` 比的是“是不是这个错误”，`As` 比的是“能不能转成这个类型”。**

## 相关文档

[Go 1.13 错误处理](go-1-13-errors.md)介绍调用侧的错误包装与检查。
