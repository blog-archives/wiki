---
title: Go 性能：内存分配
updated: "2026-09-28"
tags:
  - golang
  - performance
---

本目录关注 Go 程序的内存分配。目前的笔记以栈分配优化为例，说明编译器怎样减少部分短生命周期对象的堆分配。
