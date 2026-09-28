---
title: "Go 测试怎么写"
updated: "2026-09-28"
tags:
  - golang
  - testing
---

> 配套练习仓库：[code-practice-archives/test](https://github.com/code-practice-archives/test) —— 按包拆分的可运行示例，建议「源码 → 测试 → README」对照阅读。

## 基本约定

- 测试文件以 `_test.go` 结尾，与被测代码同目录。
- 测试函数命名为 `TestXxx(t *testing.T)`。
- 白盒：`package foo`，可测未导出细节；黑盒：`package foo_test`，只测对外行为。
- 跑测试：`go test ./...`；看竞态加 `-race`；看覆盖率加 `-cover`。

```go
func TestAdd(t *testing.T) {
	got := Add(1, 2)
	if got != 3 {
		t.Errorf("Add(1, 2) = %d, want 3", got)
	}
}
```

## 表驱动：Go 测试的默认写法

用例是数据，循环 + `t.Run` 跑子测试。新增场景通常只加一行；失败时子测试名能直接定位。

```go
tests := []struct {
	name    string
	a, b    int
	want    int
	wantErr error
}{
	{name: "整除", a: 10, b: 2, want: 5},
	{name: "除以零", a: 10, b: 0, wantErr: ErrDivideByZero},
}
for _, tt := range tests {
	t.Run(tt.name, func(t *testing.T) {
		got, err := Divide(tt.a, tt.b)
		if tt.wantErr != nil {
			require.ErrorIs(t, err, tt.wantErr)
			return
		}
		require.NoError(t, err)
		assert.Equal(t, tt.want, got)
	})
}
```

几个习惯：

1. **正常路径 + 异常 / 边界** 都要覆盖，不要只测 happy path。
2. **哨兵错误用 `errors.Is` / `ErrorIs`**，不要只比 `err.Error()` 字符串（除非就是测文案）。
3. 项目用了 `testify` 时：`require` 失败立刻结束当前子测试；`assert` 只记录并继续。有错误时先 `require`，避免拿脏返回值继续断言。

## 测有依赖的代码

被测逻辑依赖 DB、HTTP、时钟等外部世界时，**用接口注入**，测试里换成替身：

| 替身 | 关注点 | 典型用法 |
|------|--------|----------|
| Fake | 可工作的简化实现 | 内存仓储测 CRUD |
| Stub | 预设返回值，断言业务结果 | `stub.getErr = ErrNotFound` |
| Mock | 调用与否、参数、顺序 | `EXPECT().Save(...).Once()` |

口诀：**Stub 管结果，Mock 管交互**。接口方法少时手写 stub 往往更清晰；关心「有没有调 / 调对了没」再用 mock。

其他常见手法：

- **HTTP**：`httptest.NewRequest` + `httptest.NewRecorder`，直接调 Handler，不必起真服务。
- **时间**：注入 FakeClock，禁止单测里真 `time.Sleep`。
- **并发**：子 goroutine 里不要直接 `require`；收集错误后在主测试里断言，并用 `go test -race` 扫竞态。
- **无序集合**：map / `List()` 顺序不稳定时用 `ElementsMatch`，不要 `Equal`。

## 怎么练

推荐按练习仓库的顺序上手：

1. `calculator` — 表驱动、`ErrorIs`、Benchmark
2. `validator` — 黑盒包、多错误、字符串边界
3. `sliceutil` — 泛型、`Example*`
4. `wallet` — 有状态对象、`-race`
5. `store` — Fake / Stub / Mock
6. `httpapi` — `httptest`
7. `retry` — FakeClock、ctx 取消（较难，放最后）

```bash
go test ./...
go test ./... -race
go test ./calculator -bench=.
go test ./... -cover
```
