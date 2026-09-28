---
title: "Go 并发模式：管道处理与取消操作"
updated: "2026-09-28"
tags:
  - golang
  - go
  - concurrency
  - pipeline
---

> 本文整理自 [Go Concurrency Patterns: Pipelines and cancellation](https://go.dev/blog/pipelines)。

在 Go 中，“管道”没有正式定义，只是一类并发程序。非正式地说，管道是由通道连接的一系列阶段，每个阶段由运行同一函数的一组 goroutine 组成。各阶段中的 goroutine：

- 通过入站通道接收上游的值
- 对这些数据执行操作，通常产生新值
- 通过出站通道将值发送给下游

每个阶段可以有任意数量的入站与出站通道；首尾阶段例外——首阶段（source / producer）只有出站，末阶段（sink / consumer）只有入站。

```go
func gen(nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        for _, n := range nums {
            out <- n
        }
        close(out)
    }()
    return out
}

func sq(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        for n := range in {
            out <- n * n
        }
        close(out)
    }()
    return out
}

func main() {
    // Set up the pipeline and consume the output.
    for n := range sq(sq(gen(2, 3))) {
        fmt.Println(n) // 16 then 81
    }
}
```

正常结束时，管道阶段遵循两条准则：

- 阶段在所有发送完成后关闭出站通道
- 阶段持续接收入站值，直到入站通道关闭

这样接收端可以写成 `range` 循环，并保证值都成功传给下游后所有 goroutine 都能退出。

## 扇出 / 扇入

多个函数可以持续从同一通道读取，直到该通道关闭，这称为 **扇出（fan-out）**，用来在一组 worker 间分配任务，并行化 CPU 与 I/O。

一个函数也可以从多个输入读取：把多个入站通道多路复用到单个出站通道，并在全部输入关闭后再关闭该出站通道，这称为 **扇入（fan-in）**。关闭前必须保证所有发送已完成（向已关闭通道发送会 panic），通常用 `sync.WaitGroup` 同步。

## 妥善停止

真实管道中，阶段并不总能收完所有入站值：有时接收方只需子集即可继续；更常见的是因上游错误而提前退出。此时接收方不应再等待剩余数据，上游也应尽早停止生产下游不再需要的值。

若下游停止接收而上游仍在发送，**上游发送方的 goroutine 会永久阻塞**。

> [!tip] 资源泄漏
> goroutine 会占用内存和运行时资源，其栈上的堆引用也会阻止数据被回收。goroutine 本身不会被垃圾回收，必须自行退出。

### 缓冲不是可靠解法

当创建通道时已知发送数量，缓冲可以简化代码（例如 `gen` 可直接写入缓冲通道而不起 goroutine）。但若靠“刚好够装下未消费值”的缓冲来掩盖下游提前退出，则很脆弱：发送量或消费量稍有变化，阻塞与泄漏会再现。正确做法是让下游能明确通知发送方：自己将停止接收。

### 显式取消

取消机制经历了两步演进：

1. **按发送者数量向 `done` 发信号**：下游退出前向 `done` 发送 N 次（N 为可能阻塞的上游发送者数）。发送操作改为 `select`，在 `out <- v` 与 `<-done` 之间二选一。`done` 的元素类型用 `struct{}`，因为值无意义，**接收事件本身** 就是放弃发送的信号。问题是：下游必须知道有多少发送者，计数既繁琐又易错。
2. **`close(done)` 广播**：对已关闭通道的接收会立即成功并得到零值，因而一次 `close` 就能通知未知数量的发送者。各阶段接收 `done` 参数，并由最下游用 `defer close(done)` 保证所有返回路径都会发出取消信号。

取消后，下游阶段可以不排空入站通道就返回——因为上游也会在 `done` 关闭后停止发送。构造准则因此修订为：

- 阶段在所有发送完成后关闭出站通道
- 阶段持续接收入站值，直到通道关闭，**或发送方已被解除阻塞**

解除阻塞的方式：为全部待发值提供足够缓冲，或在接收方可能放弃通道时显式通知发送方。

## 有界并行：MD5 目录校验

更贴近现实的例子是：对目录树中每个常规文件计算 MD5。实现从串行，到 **每个文件一个 goroutine** 的无界并行（文件很多时可能耗尽内存），再到固定 worker 数量的有界并行。下面以有界三阶段管道为例：遍历路径 → 读取并摘要 → 收集结果。

### 第一阶段：生产路径

通过 `filepath.Walk` 遍历目录树，流式发送每个常规文件的路径。

- `done <-chan struct{}`：接收下游取消信号，以便提前退出，避免发送阻塞造成泄漏
- `<-chan string`：流式传出文件路径（阶段间的数据通道，不依赖缓冲来表达正确性）
- `<-chan error`：传出 Walk 的错误

> [!tip] 错误通道必须缓冲
> 下游要在 `paths` 关闭之后才从 `errc` 取错误。若 `errc` 无缓冲，Walk 结束时发送错误会阻塞，导致 `paths` 无法关闭；而 `paths` 不关闭，下游又不会去读 `errc`，二者死锁。官方因此使用 `make(chan error, 1)`，发送错误时无需再 `select`。

```go {6, 11, 20}
// walkFiles starts a goroutine to walk the directory tree at root and send the
// path of each regular file on the string channel.  It sends the result of the
// walk on the error channel.  If done is closed, walkFiles abandons its work.
func walkFiles(done <-chan struct{}, root string) (<-chan string, <-chan error) {
	paths := make(chan string)
	errc := make(chan error, 1)
	go func() {
		// Close the paths channel after Walk returns.
		defer close(paths)
		// No select needed for this send, since errc is buffered.
		errc <- filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if !info.Mode().IsRegular() {
				return nil
			}
			select {
			case paths <- path:
			case <-done:
				return errors.New("walk canceled")
			}
			return nil
		})
	}()
	return paths, errc
}
```

### 第二阶段：有界加工

从 `paths` 读取路径后，启动 **固定数量** 的 digester 并发读文件并计算 MD5。文件 I/O 远慢于一般 CPU 计算，并发有收益；但无界 goroutine 可能耗尽资源，故用 `numDigesters` 限制并行度。

多个 digester **共享** 同一个结果通道 `c`，因此 digester 自身不关闭 `c`（多发送者各自 `close` 不安全），而由编排代码在全部 digester 结束后用 `WaitGroup` 统一关闭。也可以让每个 digester 返回独立通道再 fan-in，但需要额外的 goroutine。

```go {12, 15}
// A result is the product of reading and summing a file using MD5.
type result struct {
	path string
	sum  [md5.Size]byte
	err  error
}

// digester reads path names from paths and sends digests of the corresponding
// files on c until either paths or done is closed.
func digester(done <-chan struct{}, paths <-chan string, c chan<- result) {
	for path := range paths {
		data, err := os.ReadFile(path)
		select {
		case c <- result{path, md5.Sum(data), err}:
		case <-done:
			return
		}
	}
}
```

### 第三阶段：收集结果

`MD5All` 编排整条管道：创建并在返回时 `defer close(done)`（可能在尚未收完 `c` / `errc` 时就关闭，从而取消上游）；接收全部 `result` 填入 map；**最后** 再读 `errc`。

`errc` 不能更早检查：在此之前 `walkFiles` 仍可能因向下游发送而阻塞。这与 `context` 中先等 `Done` 再查 `Err` 的顺序类似——必须先让上游不再卡在发送路径上，再安全地取错误。

```go {6, 10, 20, 28, 30, 46}
// MD5All reads all the files in the file tree rooted at root and returns a map
// from file path to the MD5 sum of the file's contents.  If the directory walk
// fails or any read operation fails, MD5All returns an error.  In that case,
// MD5All does not wait for inflight read operations to complete.
func MD5All(root string) (map[string][md5.Size]byte, error) {
	// MD5All closes the done channel when it returns; it may do so before
	// receiving all the values from c and errc.
	done := make(chan struct{})
	defer close(done)

	paths, errc := walkFiles(done, root)

	// Start a fixed number of goroutines to read and digest files.
	c := make(chan result)
	var wg sync.WaitGroup
	const numDigesters = 20
	wg.Add(numDigesters)
	for i := 0; i < numDigesters; i++ {
		go func() {
			digester(done, paths, c)
			wg.Done()
		}()
	}
	go func() {
		wg.Wait()
		close(c)
	}()

	m := make(map[string][md5.Size]byte)
	for r := range c {
		if r.err != nil {
			return nil, r.err
		}
		m[r.path] = r.sum
	}
	// Check whether the Walk failed.
	if err := <-errc; err != nil {
		return nil, err
	}
	return m, nil
}
```

管道之外，`main` 调用 `MD5All` 后按路径排序并打印：

```go
func main() {
	// Calculate the MD5 sum of all files under the specified directory,
	// then print the results sorted by path name.
	m, err := MD5All(os.Args[1])
	if err != nil {
		fmt.Println(err)
		return
	}
	var paths []string
	for path := range m {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, path := range paths {
		fmt.Printf("%x  %s\n", m[path], path)
	}
}
```
