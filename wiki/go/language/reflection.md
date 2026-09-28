---
title: "反射定律"
updated: "2026-09-28"
tags:
  - golang
  - go
  - reflection
  - interface
---

> 本文整理自 [The Laws of Reflection](https://go.dev/blog/laws-of-reflection)。

> **反射围绕接口里的 `(值, 类型)` 配对展开——可拆解为反射对象、可还原回接口值；若要修改，反射对象必须是可设置的。**

## 类型与接口

### Go 是静态类型语言

每个变量在编译期就拥有唯一确定的静态类型；即便两个类型底层类型相同（如内建类型 `int` 与自定义类型 `MyInt`），只要静态类型不同，就不能直接相互赋值，必须经过显式类型转换。

```go
type MyInt int

var i int
var j MyInt
```

### 接口是静态的方法集合

接口是一类特殊的静态类型，它定义了固定的方法集合。只要一个具体类型实现了接口的全部方法，就可以被赋值给该接口变量。

```go
var r io.Reader
r = os.Stdin
r = bufio.NewReader(r)
r = new(bytes.Buffer)
// and so on
```

**接口变量的静态类型始终是接口本身（例如 `io.Reader`）**，无论内部装的是什么具体值。接口只暴露自身定义的方法；即便具体值还有更多方法，也不能通过该接口直接调用。

最极端的接口是空接口 `interface{}`（别名 `any`）：方法集合为空，任意值都满足它。反射的入口函数正是以空接口为参数——调用时先把实参装进空接口，再拆开读取其中的类型与值。

有人说 Go 的接口是「动态类型」，这容易误导。接口变量本身的静态类型始终不变；变的是运行时装在里面的具体值，且该值必须始终满足接口。

## 接口的表示方式

> Russ Cox 撰写了一篇[关于 Go 语言中接口值表示](https://research.swtch.com/2009/12/go-data-structures-interfaces.html)的详细博客文章。

接口类型的变量存储了一对数据：赋给变量的 **具体值**，以及该值的 **类型描述符**。

更准确地说，这个值是实现该接口的具体数据项，而类型描述符则指明该数据项的完整类型。

```go
var r io.Reader
tty, err := os.OpenFile("/dev/tty", os.O_RDWR, 0)
if err != nil {
    return nil, err
}
r = tty
```

此时 `r` 内部是一对 `(值, 类型)`，示意为 (`tty`, `*os.File`)。类型 `*os.File` 除了 `Read` 还有别的方法；尽管通过 `io.Reader` 只能调用 `Read`，接口内部仍保留该值的完整类型信息。因此可以做类型断言：

```go
var w io.Writer
w = r.(io.Writer) // 断言 r 内的具体值也实现了 io.Writer
```

断言成功后，`w` 里仍是同一对 (`tty`, `*os.File`)。接口的静态类型决定能调用哪些方法，与内部具体值是否还有更多方法无关。

继续赋给空接口也一样：

```go
var empty interface{}
empty = w // 无需断言：Writer 静态上满足空接口
```

`empty` 里还是那一对 (`tty`, `*os.File`)。空接口能装任意值，并保留我们需要的全部类型信息。

一个重要细节：接口变量内部始终是 `(值, 具体类型)`，而不会是 `(值, 接口类型)`——**接口不会再嵌套另一个接口值**。

## 反射定律

### 第一定律：从接口值到反射对象

反射的底层机制，就是拆开接口变量里存的「具体值 + 类型描述符」。

```go
// TypeOf returns the reflection Type of the value in the interface{}.
func TypeOf(i interface{}) Type
```

`reflect` 包用 `reflect.Type` 和 `reflect.Value` 分别暴露接口内的类型与值；入口函数 `reflect.TypeOf` 和 `reflect.ValueOf` 负责把接口值转成对应的反射对象。

看起来像是直接传入了 `float64`，其实调用时会先把 `x` 装进空接口，再由 `TypeOf` / `ValueOf` 拆开：

```go
var x float64 = 3.4
fmt.Println("type:", reflect.TypeOf(x))

// Output:
// type: float64
```

```go
var x float64 = 3.4
v := reflect.ValueOf(x)
fmt.Println("type:", v.Type())
fmt.Println("kind is float64:", v.Kind() == reflect.Float64)
fmt.Println("value:", v.Float())

// Output:
// type: float64
// kind is float64: true
// value: 3.4
```

两处值得单独记住的设计：

1. **API 简化**：同大类的取值 / 设值方法统一用最大宽度类型（如有符号整数一律走 `int64`），减少方法数量，调用方按需转换：

```go
var x uint8 = 'x'
v := reflect.ValueOf(x)
fmt.Println("type:", v.Type())                            // uint8
fmt.Println("kind is uint8:", v.Kind() == reflect.Uint8) // true
x = uint8(v.Uint())                                       // Uint 返回 uint64
```

2. **Type 与 Kind**：`Type` 是完整静态类型（能区分 `int` 与 `MyInt`）；`Kind` 只反映底层类别。例如：

```go
type MyInt int
var x MyInt = 7
v := reflect.ValueOf(x)
// v.Kind() == reflect.Int，尽管 x 的静态类型是 MyInt
```

### 第二定律：从反射对象到接口值

像物理反射一样，Go 的反射也有逆过程：从 `reflect.Value` 用 `Interface` 把类型和值重新打包成接口值。

```go
// Interface returns v's value as an interface{}.
func (v Value) Interface() interface{}
```

```go
y := v.Interface().(float64) // y 的类型是 float64
fmt.Println(y)

// 也可以直接交给 fmt：参数本身就是空接口，包内部会再拆开
fmt.Println(v.Interface())
```

`Interface` 方法是 `ValueOf` 的逆操作（结果的静态类型始终是 `interface{}`）。合起来看：**反射从接口值出发，经过反射对象，再回到接口值。**

### 第三定律：要修改反射对象，该值必须可设置

并非所有 `reflect.Value` 都能改。只有当反射对象能改到「创建它时所用的那块原始存储」时，才具备 **可设置性**（可用 `CanSet` 查询）。对不可设置的 `Value` 调用 `SetFloat` / `SetInt` 等会 panic。

```go
var x float64 = 3.4
v := reflect.ValueOf(x)
fmt.Println("settability of v:", v.CanSet()) // false
v.SetFloat(7.1)                              // panic: using unaddressable value
```

直接把普通变量传给 `reflect.ValueOf` 时，遵循值传递：装进接口的是 `x` 的副本。若允许 `Set`，只会改副本，原变量不动——既混乱又无用，因此语言直接禁止。这和普通函数 `f(x)` 改不了调用方的 `x` 是同一套语义；若要改 `x`，必须传入地址：

```go
var x float64 = 3.4
p := reflect.ValueOf(&x) // 注意：取的是 x 的地址
fmt.Println("type of p:", p.Type())
fmt.Println("settability of p:", p.CanSet())

// Output:
// type of p: *float64
// settability of p: false

v := p.Elem() // 解引用，得到可指向 x 本身的 Value
fmt.Println("settability of v:", v.CanSet())

// Output:
// settability of v: true

v.SetFloat(7.1)
fmt.Println(v.Interface())
fmt.Println(x)

// Output:
// 7.1
// 7.1
```

`p` 本身不可设置——我们要改的也不是指针，而是它指向的内容；`Elem` 之后得到的 `v` 才可设置。

## 结构体

修改结构体字段是可设置性最常见的用法：只要掌握结构体的地址，就可以改其字段。字段名须导出（首字母大写），未导出字段不可设置——这与包外不可写未导出字段的规则一致。

```go
type T struct {
    A int
    B string
}
t := T{23, "skidoo"}
s := reflect.ValueOf(&t).Elem()
typeOfT := s.Type()
for i := 0; i < s.NumField(); i++ {
    f := s.Field(i)
    fmt.Printf("%d: %s %s = %v\n", i,
        typeOfT.Field(i).Name, f.Type(), f.Interface())
}

// Output:
// 0: A int = 23
// 1: B string = skidoo

s.Field(0).SetInt(77)
s.Field(1).SetString("Sunset Strip")
fmt.Println("t is now", t)

// Output:
// t is now {77 Sunset Strip}
```

若用 `reflect.ValueOf(t)` 而不是 `&t` 创建 `s`，字段将不可设置，`SetInt` / `SetString` 会失败。

可设置性并不是反射另立的规矩，而是值传递、指针语义与导出规则在反射 API 上的复现；反射没有突破语言本身的约束。

## 结论

- 反射从接口值到反射对象。
- 反射从反射对象到接口值。
- 要修改反射对象，该值必须可设置。

理解这三条后，Go 反射会好用得多，但它依然微妙。反射很强大，应谨慎使用，非必要尽量避免。
