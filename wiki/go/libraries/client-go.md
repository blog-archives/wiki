---
title: "client-go"
updated: "2026-09-28"
tags:
  - golang
  - go-library
  - client-go
  - kubernetes
---

> 本文介绍 [kubernetes/client-go](https://github.com/kubernetes/client-go)，API 文档见 [pkg.go.dev](https://pkg.go.dev/k8s.io/client-go)。

要在 Go 里操作 Kubernetes 集群，最常见的入口就是 `client-go`：用它连上 API Server，创建、查询、更新 Pod、Deployment 等资源。模块路径是 `k8s.io/client-go`，版本一般跟集群大版本对齐（`v0.x.y` 对应 Kubernetes `v1.x.y`）。

适合写控制器、Operator、运维工具，或任何需要程序化访问集群的场景。集群内可用 ServiceAccount（`rest.InClusterConfig`），集群外则读 kubeconfig。自己拼 REST 请求也能做，但鉴权、资源类型和 watch 细节很多；需要正经和 K8s 打交道时，基本都会用它。

## 基础用法

```go
config, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
if err != nil {
	panic(err.Error())
}

clientset, err := kubernetes.NewForConfig(config)
if err != nil {
	panic(err.Error())
}

pods, err := clientset.CoreV1().Pods("").List(context.TODO(), metav1.ListOptions{})
if err != nil {
	panic(err.Error())
}
fmt.Printf("There are %d pods in the cluster\n", len(pods.Items))
```

仓库里还有 `dynamic` 客户端（含 CRD）、`informers` / `tools/cache`、`discovery`、Server-Side Apply、leader election，以及各类鉴权插件。
