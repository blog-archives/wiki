---
title: "sonyflake"
updated: "2026-09-28"
tags:
  - golang
  - go-library
  - sonyflake
  - distributed-id
---

> 本文介绍 [sony/sonyflake](https://github.com/sony/sonyflake)，API 文档见 [pkg.go.dev](https://pkg.go.dev/github.com/sony/sonyflake/v2)。

分布式系统里给订单、日志、消息生成全局唯一 ID，常见做法是数据库自增或 UUID。自增在分库分表、跨库合并时容易撞号；UUID 虽无中心节点，但字符串长、无序，对索引不友好。`sonyflake` 是 Sony 开源的 Snowflake 风格 ID 生成器：64 位整数、趋势递增、本地生成无网络往返，适合高并发写入场景。

默认位分配为 39 位时间（10 ms 粒度）+ 8 位序列号 + 16 位机器 ID。相比 Twitter Snowflake，可用机器数更多（2^16）、寿命更长（约 174 年），单实例每 10 ms 最多 256 个 ID；需要更高吞吐时，可在同一主机上并行跑多个实例。机器 ID 默认取私网 IP 低 16 位，AWS 上可用 `awsutil.AmazonEC2MachineID`；也支持自定义 `Settings` 调整位宽与时间起点。

## 基础用法

```go
sf, err := sonyflake.New(sonyflake.Settings{})
if err != nil {
	panic(err)
}

id, err := sf.NextID()
if err != nil {
	panic(err)
}
```

`Settings` 可配置 `MachineID`、`StartTime`、`TimeUnit` 以及序列号/机器 ID 的位长；`CheckMachineID` 用于启动时校验机器 ID 是否冲突。
