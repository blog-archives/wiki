---
title: "错误即值"
updated: "2026-09-28"
tags:
  - golang
  - go
  - error-handling
---

> 本文整理自 [Errors are values](https://go.dev/blog/errors-are-values)。

> **错误是值，值可以编程；与其反复写 `if err != nil`，不如用语言本身把错误处理设计得更优雅。**

你可能也会抱怨：Go 的错误处理常让代码变得繁琐，一段并不复杂的逻辑里塞满了重复的检查。

```go
_, err = fd.Write(p0[a:b])
if err != nil {
    return err
}
_, err = fd.Write(p1[c:d])
if err != nil {
    return err
}
_, err = fd.Write(p2[e:f])
if err != nil {
    return err
}
// and so on
```

其实不必如此。既然错误是值，就可以对它编程。比如用闭包把多次写入收拢到一处错误处理：

```go
var err error
write := func(buf []byte) {
    if err != nil {
        return
    }
    _, err = w.Write(buf)
}
write(p0[a:b])
write(p1[c:d])
write(p2[e:f])
// and so on
if err != nil {
    return err
}
```

还能再进一步：把这个思路封装成可复用的类型。一旦出错，`write` 就会变成空操作，同时把错误值保存下来：

```go
type errWriter struct {
    w   io.Writer
    err error
}

func (ew *errWriter) write(buf []byte) {
    if ew.err != nil {
        return
    }
    _, ew.err = ew.w.Write(buf)
}
```

用法如下：

```go
ew := &errWriter{w: fd}
ew.write(p0[a:b])
ew.write(p1[c:d])
ew.write(p2[e:f])
// and so on
if ew.err != nil {
    return ew.err
}
```

这比闭包更干净，也让真正的写入顺序一目了然。杂乱的错误检查消失了——通过错误值（以及接口）编程，代码变得更简洁。

用语言本身简化错误处理。但请记住：无论怎么做，都要检查你的错误！
