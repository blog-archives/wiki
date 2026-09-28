---
title: "viper"
updated: "2026-09-28"
tags:
  - golang
  - go-library
  - viper
  - configuration
---

> 本文介绍 [spf13/viper](https://github.com/spf13/viper)，API 文档见 [pkg.go.dev](https://pkg.go.dev/github.com/spf13/viper)。

Go 应用的配置往往要同时照顾 YAML/JSON、环境变量、命令行 flag，以及默认值。`viper` 把这些来源收拢到同一套 key 上，按明确优先级合并：显式 `Set` > flag > 环境变量 > 配置文件 > 远程存储 > 默认值。

适合 CLI、服务端这类「本地文件起步、环境变量覆盖、必要时再接 Consul/Etcd」的场景。它还支持热更新配置文件、`Unmarshal` 到结构体，以及和 Cobra/pflag 绑定。自己拼 `os.Getenv` + 手写解析也能做，但来源一多就容易乱；需要统一配置入口时，可以优先考虑它。

## 基础用法

```go
// Name of the config file without an extension (Viper will intuit the type
// from an extension on the actual file)
viper.SetConfigName("config")

// Add search paths to find the file
viper.AddConfigPath("/etc/appname/")
viper.AddConfigPath("$HOME/.appname")
viper.AddConfigPath(".")

// Find and read the config file
err := viper.ReadInConfig()

// Handle errors
if err != nil {
	panic(fmt.Errorf("fatal error config file: %w", err))
}
```

也支持默认值、环境变量、`BindPFlag`、`WatchConfig` 热更新、`Unmarshal` 到结构体，以及 Etcd / Consul 等远程配置源。
