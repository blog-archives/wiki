# Eino DeepAgent 动态创建 subagent 的最小 Demo

> Source: 用户提供的可运行 demo（cloudwego/eino，DeepAgent 版）
> Collected: 2026-09-20
> Published: Unknown

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/adk"
	"github.com/cloudwego/eino/adk/prebuilt/deep"
	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"
	"github.com/cloudwego/eino/compose"
	"github.com/cloudwego/eino/schema"
)

// 演示「动态创建 subagent + deep agent」：
// 和 04 一样先预定义角色，运行时按角色 new 出 adk.Agent。
// 区别是这里不再自己 adk.NewAgentTool，而是把原始 agent 交给 deep.New；
// deep 内部会把每个 SubAgent 包成工具并注册进内置的 task 工具，
// 模型通过 task(subagent_type=...) 来调度它们。

// ---------- agent-as-subagent：动态创建 subagent ----------

// agentRole 是一个预先设计好的 agent 角色：职责、指令、可用工具。
type agentRole struct {
	name, desc, instruction string
	tools                   []tool.BaseTool
}

// newSubAgent 运行时按角色动态实例化出一个子 agent。
func newSubAgent(ctx context.Context, cm model.ToolCallingChatModel, r agentRole) (adk.Agent, error) {
	sub, err := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
		Name:        r.name,
		Description: r.desc,
		Instruction: r.instruction,
		Model:       cm,
		ToolsConfig: adk.ToolsConfig{ToolsNodeConfig: compose.ToolsNodeConfig{Tools: r.tools}},
	})
	if err != nil {
		return nil, err
	}
	fmt.Printf("  [+] 动态创建 subagent: %s\n", r.name)
	return sub, nil
}

// ---------- main ----------

type weatherInput struct {
	City string `json:"city" jsonschema_description:"City name, e.g. Beijing"`
}

type calcInput struct {
	Expression string `json:"expression" jsonschema_description:"Arithmetic expression, e.g. 1+2*3"`
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	cm, err := openai.NewChatModel(ctx, &openai.ChatModelConfig{
		APIKey:  os.Getenv("OPENAI_API_KEY"),
		Model:   os.Getenv("OPENAI_MODEL"),
		BaseURL: os.Getenv("OPENAI_BASE_URL"),
	})
	if err != nil {
		log.Fatal(err)
	}

	weather, err := utils.InferTool("get_weather", "Get the current weather of a city",
		func(_ context.Context, in *weatherInput) (string, error) {
			return fmt.Sprintf("%s: sunny, 25C", in.City), nil
		})
	if err != nil {
		log.Fatal(err)
	}

	calc, err := utils.InferTool("calculate", "Evaluate a simple arithmetic expression",
		func(_ context.Context, _ *calcInput) (string, error) { return "42", nil })
	if err != nil {
		log.Fatal(err)
	}

	// 预定义角色（这里硬编码），运行时再按角色动态实例化成 adk.Agent。
	roles := []agentRole{
		{"weather_agent", "An agent that answers weather questions", "You are a weather expert. Use get_weather.", []tool.BaseTool{weather}},
		{"calculator_agent", "An agent that evaluates arithmetic", "You are a math expert. Use calculate.", []tool.BaseTool{calc}},
	}

	subAgents := make([]adk.Agent, 0, len(roles))
	for _, r := range roles {
		sub, err := newSubAgent(ctx, cm, r)
		if err != nil {
			log.Fatal(err)
		}
		subAgents = append(subAgents, sub)
	}
	fmt.Println()

	// deep 内部会把这些 subagent 包成 task 工具的候选类型，父 agent 通过 task 调度。
	deepAgent, err := deep.New(ctx, &deep.Config{
		Name:        "supervisor",
		Description: "Delegates tasks to subagents",
		ChatModel:   cm,
		Instruction: "You are a supervisor. Delegate each request to the right subagent via the task tool: " +
			"weather_agent / calculator_agent, then summarize the result.",
		SubAgents:              subAgents,
		WithoutWriteTodos:      true, // 关掉内置 write_todos，聚焦 subagent 调度
		WithoutGeneralSubAgent: true, // 不加默认的 general-purpose 子 agent
		ToolsConfig: adk.ToolsConfig{
			// 让 task 工具把子 agent 的内部事件透传到顶层，
			// 这样 printEvent 才能打印出 supervisor > weather_agent 这样的 RunPath。
			EmitInternalEvents: true,
		},
	})
	if err != nil {
		log.Fatal(err)
	}

	runner := adk.NewRunner(ctx, adk.RunnerConfig{Agent: deepAgent, EnableStreaming: true})
	iter := runner.Query(ctx, "Tell me the weather in Beijing, then calculate 6*7.")
	for {
		event, ok := iter.Next()
		if !ok {
			break
		}
		if event.Err != nil {
			log.Fatal(event.Err)
		}
		printEvent(event)
	}
}

// printEvent 打印一条事件。用 RunPath 表示调用链（如 supervisor > weather_agent），
// 因为父 flowAgent 会覆盖 AgentName，但 RunPath 保留来源。
func printEvent(event *adk.AgentEvent) {
	if event.Output == nil || event.Output.MessageOutput == nil {
		return
	}
	mv := event.Output.MessageOutput

	msg := mv.Message
	if msg == nil && mv.MessageStream != nil {
		var err error
		if msg, err = schema.ConcatMessageStream(mv.MessageStream); err != nil {
			log.Printf("流式输出错误: %v", err)
			return
		}
	}
	if msg == nil {
		return
	}

	label := event.AgentName
	if len(event.RunPath) > 0 {
		steps := make([]string, 0, len(event.RunPath))
		for _, s := range event.RunPath {
			steps = append(steps, s.String())
		}
		label = strings.Join(steps, " > ")
	}

	for _, tc := range msg.ToolCalls {
		fmt.Printf("[%s] -> 调用工具 %s 参数: %s\n", label, tc.Function.Name, tc.Function.Arguments)
	}
	if msg.Content != "" {
		prefix := ""
		if msg.Role == schema.Tool {
			prefix = "工具返回: "
		}
		fmt.Printf("[%s] %s%s\n", label, prefix, msg.Content)
	}
}
```
