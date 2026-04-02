# Claude Code — Agent Learning Guide

> A deep-dive into the architecture of `junhuabrave/claude-code` and the best practices you can apply when building or using agents.

---

## Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [Architecture Overview](#2-architecture-overview)
3. [How Agents Work](#3-how-agents-work)
   - [Core Agent Loop](#31-core-agent-loop)
   - [Tool System](#32-tool-system)
   - [Sub-Agent Spawning](#33-sub-agent-spawning-agenttool)
   - [Multi-Agent Coordination](#34-multi-agent-coordination)
4. [Best Practices](#4-best-practices)
   - [Tool Design](#41-tool-design)
   - [Agent Spawning](#42-agent-spawning)
   - [Permission System](#43-permission-system)
   - [Streaming & Progress](#44-streaming--progress)
   - [Context Management](#45-context-management)
   - [Multi-Agent Coordination](#46-multi-agent-coordination)
   - [Error Handling & Resilience](#47-error-handling--resilience)
   - [State & Architecture](#48-state--architecture)
   - [MCP Integration](#49-mcp-integration)
   - [Memory & Persistence](#410-memory--persistence)
5. [Key Patterns Reference](#5-key-patterns-reference)
6. [Quick-Reference Cheatsheet](#6-quick-reference-cheatsheet)

---

## 1. What Is This Project?

**Claude Code** is Anthropic's official CLI tool for interacting with Claude directly from the terminal. It enables developers to:

- Edit files, run shell commands, search codebases
- Review code and manage git workflows
- Spawn sub-agents and coordinate multi-agent workflows
- Integrate with IDEs (VS Code, JetBrains) via a bidirectional bridge
- Extend functionality via Model Context Protocol (MCP) servers
- Define and execute reusable skills

**Tech stack:** TypeScript · Bun runtime · React + Ink (terminal UI) · ~512,000 lines of code

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────┐
│        Terminal UI  (React + Ink)           │  ← User Interface
├─────────────────────────────────────────────┤
│   Command System  (/commit, /review …)      │  ← Slash Commands
├─────────────────────────────────────────────┤
│   QueryEngine  — Core Agent Brain           │  ← LLM Loop
├─────────────────────────────────────────────┤
│   Tool System  (~40 built-in + MCP tools)   │  ← Agent Capabilities
├─────────────────────────────────────────────┤
│   Services  (API, MCP, OAuth, Analytics…)   │  ← External Integrations
├─────────────────────────────────────────────┤
│   Bridge  (IDE ↔ CLI bidirectional link)    │  ← IDE Integration
└─────────────────────────────────────────────┘
```

### Key Source Directories

| Path | Purpose |
|------|---------|
| `src/QueryEngine.ts` | Core LLM loop, streaming, tool orchestration |
| `src/query.ts` | Query pipeline, message normalization |
| `src/Tool.ts` | Base tool type system |
| `src/tools/` | ~40 built-in agent tools |
| `src/commands/` | ~50 slash commands |
| `src/coordinator/` | Multi-agent supervisor logic |
| `src/services/` | API, MCP, OAuth, compact, analytics |
| `src/bridge/` | VS Code / JetBrains IDE bridge |
| `src/state/` | React context-based `AppState` |
| `src/entrypoints/` | CLI, MCP server, SDK entry points |
| `src/memdir/` | Persistent memory (`CLAUDE.md`) |

---

## 3. How Agents Work

### 3.1 Core Agent Loop

The **QueryEngine** runs a continuous loop until Claude stops requesting tools:

```
User Input
    │
    ▼
Build System Prompt  ←─ tool.prompt() contributions
    │
    ▼
Stream from Claude API
    │
    ├── Text content     → render to UI
    ├── Thinking blocks  → handle per config
    └── tool_use blocks  → identify requested tool
                               │
                               ▼
                       Check Permissions
                       (useCanUseTool hook)
                               │
                               ▼
                       Execute tool.call()
                               │
                               ▼
                       Feed results back into conversation
                               │
                               ▼
                     Repeat until stop_reason ≠ "tool_use"
```

### 3.2 Tool System

Every tool is declared with a `buildTool()` factory — a single self-contained object covering schema, permissions, UI, and prompt injection:

```typescript
export const MyTool = buildTool({
  name: 'MyTool',
  description: 'What this tool does',

  // Declarative Zod schema — validated before execution
  inputSchema: z.object({
    param: z.string(),
  }),

  // Core execution
  async call(args, context, canUseTool, parentMessage, onProgress) {
    onProgress({ status: 'running...' })   // Real-time UI update
    return { data: result }
  },

  // Permission gate
  async checkPermissions(input, context) {
    return { granted: true }
  },

  // Concurrency hint — the executor parallelises safe tools
  isConcurrencySafe(input) { return true },
  isReadOnly(input)        { return true },

  // Injects context into the system prompt
  prompt(options) { return 'MyTool is available for ...' },

  // Terminal UI rendering
  renderToolUseMessage(input, options)     { /* ... */ },
  renderToolResultMessage(content, _, opts){ /* ... */ },
})
```

**~40 built-in tools, grouped by category:**

| Category | Examples |
|----------|---------|
| File I/O | `FileReadTool`, `FileWriteTool`, `FileEditTool`, `NotebookEditTool` |
| Search | `GlobTool`, `GrepTool`, `WebSearchTool`, `WebFetchTool` |
| Execution | `BashTool`, `SkillTool`, `REPLTool` |
| Agents & Teams | `AgentTool`, `SendMessageTool`, `TeamCreateTool` |
| Tasks | `TaskCreateTool`, `TaskUpdateTool`, `TaskListTool` |
| Flow control | `EnterPlanModeTool`, `ExitPlanModeV2Tool`, `EnterWorktreeTool` |
| Utility | `TodoWriteTool`, `AskUserQuestionTool`, `ConfigTool` |

### 3.3 Sub-Agent Spawning (AgentTool)

The `AgentTool` lets the main agent spawn child agents:

```typescript
// Full input schema for spawning an agent
{
  // ── Required ──────────────────────────────────────
  description: "3-5 word task summary",  // for display/logging
  prompt:      "Full task description",  // what the agent executes

  // ── Optional tuning ───────────────────────────────
  subagent_type:      "explore" | "plan" | ...,
  model:              "sonnet" | "opus" | "haiku",
  run_in_background:  true,              // non-blocking

  // ── Isolation ─────────────────────────────────────
  isolation: "worktree" | "remote",      // git / cloud sandbox
  cwd:       "/path/to/working/dir",

  // ── Multi-agent ───────────────────────────────────
  name:      "addressable-name",         // so SendMessage can reach it
  team_name: "my-team",
  mode:      "default" | "plan" | "auto",
}
```

**Execution modes:**

| Mode | Behaviour |
|------|-----------|
| Foreground | Blocks until complete, streams progress to UI |
| Background (`run_in_background: true`) | Non-blocking; parent is notified on completion |
| Worktree-isolated (`isolation: "worktree"`) | Agent runs in a clean git worktree |
| Remote (`isolation: "remote"`) | Agent runs in Anthropic's cloud compute (CCR) |

### 3.4 Multi-Agent Coordination

A **coordinator agent** orchestrates **worker agents** in a supervisor-worker pattern:

```
Coordinator Agent
    ├── spawn Worker A  (AgentTool, background)
    ├── spawn Worker B  (AgentTool, background)
    └── spawn Worker C  (AgentTool, background)
            │
            ▼
    Workers execute tasks, communicate via SendMessageTool
            │
            ▼
    Coordinator collects results, synthesises final output
```

- The coordinator's system prompt lists which tools workers have access to
- "Internal" tools (`TeamCreateTool`, `SendMessageTool`, `SyntheticOutput`) are reserved for the coordinator
- Workers share MCP context and team-level memory

---

## 4. Best Practices

### 4.1 Tool Design

#### ✅ Use a consistent factory pattern

All tools go through `buildTool()`. This enforces a uniform interface for schema, permissions, rendering, and prompt contribution — making tools easy to audit and test individually.

#### ✅ Declare concurrency hints

```typescript
isConcurrencySafe(input) { return !input.writes }  // run in parallel when safe
isReadOnly(input)        { return true }            // no side effects
```

The `StreamingToolExecutor` uses these to parallelise safe tools automatically — no manual orchestration needed.

#### ✅ Inject context, don't use globals

Tools receive a rich `ToolUseContext` object:

```typescript
type ToolUseContext = {
  cwd: string                  // working directory
  appState: AppState           // global app state
  canUseTool: CanUseToolFn     // permission checker
  elicit?: ElicitFn            // prompt user for input
  messages: Message[]          // full conversation history
  // … 30+ more fields
}
```

Pass everything in; never reach for global state inside a tool.

#### ✅ Each tool owns its UI rendering

```typescript
renderToolUseMessage(input, options)      // shown while tool is running
renderToolResultMessage(content, _, opts) // shown after tool completes
```

Collapsible, streaming-aware rendering keeps the terminal readable even for large outputs.

---

### 4.2 Agent Spawning

#### ✅ Always provide both `description` and `prompt`

- `description` (3–5 words) — for display, logging, and task tracking
- `prompt` — the full, detailed task the agent will execute

#### ✅ Background long-running or independent tasks

```typescript
// ❌ Blocks the main agent unnecessarily
{ prompt: "Analyse the entire codebase…" }

// ✅ Non-blocking — main agent continues; notified on completion
{ prompt: "Analyse the entire codebase…", run_in_background: true }
```

#### ✅ Isolate file-mutating agents

```typescript
// Prevents conflicts when multiple agents modify files in parallel
{ isolation: "worktree" }
```

#### ✅ Name agents you need to message later

```typescript
{ name: "test-runner", prompt: "Run the test suite and report failures" }
// Later the coordinator can do:
SendMessageTool({ to: "test-runner", message: "re-run failing tests only" })
```

#### ✅ Choose the right model for the task

| Model | Best for |
|-------|---------|
| `haiku` | Fast, cheap, simple lookups / formatting |
| `sonnet` | Balanced — most agent tasks |
| `opus` | Complex reasoning, architecture decisions |

---

### 4.3 Permission System

#### ✅ Use wildcard patterns

```typescript
// Allow all git commands in Bash
allowedTools: ['Bash(git *)']

// Allow edits only under /src
allowedTools: ['FileEdit(/src/*)']

// Allow all tools from an MCP server
allowedTools: ['mcp__my_server']
```

#### ✅ Understand the precedence order

```
deny rules  →  allow rules  →  ask rules
   (wins)                       (fallback)
```

Deny always wins. Structure rules from most-restrictive to least.

#### ✅ Use `plan` mode for dangerous operations

In `plan` mode the agent shows what it intends to do and asks once before proceeding — safer than individual prompts for multi-step destructive operations.

---

### 4.4 Streaming & Progress

#### ✅ Report progress incrementally

```typescript
async call(args, context, canUseTool, parentMessage, onProgress) {
  onProgress({ status: 'fetching data…' })
  const data = await fetchData()

  onProgress({ status: 'processing…', progress: 50 })
  const result = process(data)

  return { data: result }
}
```

Never make the user stare at a spinner with no feedback for long operations.

#### ✅ Stream responses — don't buffer

Process API events as they arrive. Buffering the entire response before rendering adds unnecessary latency and breaks the "live" feel of agent interaction.

#### ✅ Parallelise safe tools

The `StreamingToolExecutor` automatically runs tools flagged as `isConcurrencySafe` in parallel. Mark tools correctly and let the framework do the scheduling.

---

### 4.5 Context Management

#### ✅ Sort built-in tools consistently to maximise prompt cache hits

The tools list is part of the system prompt. Sorting it alphabetically means it stays identical across turns → Claude's prompt cache fires → lower latency and cost.

```typescript
// Built-in tools sorted, then MCP tools appended after the cache breakpoint
const tools = [...builtInTools.sort(byName), ...mcpTools.sort(byName)]
```

#### ✅ Compress context before it gets too large

Strategies used in the codebase:
- **Snip compacting** — remove old tool results once summarised
- **Auto-compact** — triggered at a token threshold
- **Microcompact boundaries** — compress at natural turn boundaries

Unbounded context growth slows responses and increases cost significantly.

#### ✅ Summarise sub-agent output before returning to parent

```
Sub-agent returns 10,000 tokens of logs
    ↓
AgentSummary service distils it to ~300 tokens
    ↓
Parent receives concise result
```

The parent agent's context stays lean; only the key findings propagate upward.

---

### 4.6 Multi-Agent Coordination

#### ✅ Give the coordinator a map of worker capabilities

The coordinator's system prompt should explicitly list what tools each worker type has access to. Without this the coordinator makes assumptions that lead to failed delegations.

#### ✅ Reserve internal tools for the coordinator

Mark tools like `TeamCreateTool`, `SendMessageTool`, and `SyntheticOutput` as coordinator-only. Workers should not spawn further sub-agents unless explicitly designed to do so.

#### ✅ Give workers narrow, well-defined roles

```typescript
// ❌ Vague — worker has to decide what to do
{ prompt: "Help with the project" }

// ✅ Clear scope — worker knows exactly what success looks like
{ prompt: "Run `npm test`, capture all failing test names, return them as a JSON array. Do nothing else." }
```

#### ✅ Use background tasks for truly parallel work

```typescript
// Spawn three workers simultaneously
await Promise.all([
  spawnAgent({ name: "linter",   prompt: "…", run_in_background: true }),
  spawnAgent({ name: "tester",   prompt: "…", run_in_background: true }),
  spawnAgent({ name: "auditor",  prompt: "…", run_in_background: true }),
])
// Coordinator is notified when each finishes
```

---

### 4.7 Error Handling & Resilience

#### ✅ Use typed error classes

```typescript
// ❌ Opaque
throw new Error("something went wrong")

// ✅ Typed — caller can handle specifically
throw new ShellError({ exitCode: 1, stderr: "…" })
throw new AbortError("user cancelled")
throw new ImageSizeError({ maxBytes: 5_000_000, actual: 7_000_000 })
```

#### ✅ Retry with exponential backoff

```typescript
await withRetry(
  () => apiCall(),
  {
    maxAttempts: 3,
    backoff: 'exponential',
    retryableErrors: [RateLimitError, NetworkError],
  }
)
```

#### ✅ Degrade gracefully with feature flags

```typescript
import { feature } from 'bun:bundle'

if (feature('VOICE_MODE')) {
  // Only compiled into the binary when voice is enabled
  const VoiceTool = require('./tools/VoiceTool')
}
```

Optional subsystems (analytics, telemetry, voice) are excluded from the build entirely unless enabled — no runtime `if` chains needed.

---

### 4.8 State & Architecture

#### ✅ Single source of truth

All mutable state lives in `AppState` (React context + custom store). Change observers receive `(newState, oldState)` diffs. Components and tools never maintain their own copies.

#### ✅ Lazy-load heavy dependencies

```typescript
// ❌ Imported at module level — always loaded (~400 KB)
import * as opentelemetry from '@opentelemetry/api'

// ✅ Lazy — only loaded when actually needed
const opentelemetry = await import('@opentelemetry/api')
```

OpenTelemetry (~400 KB) and gRPC (~700 KB) are lazy-loaded to keep startup time fast.

#### ✅ Consistent naming conventions

| Thing | Convention |
|-------|-----------|
| Exported files | `PascalCase.tsx` / `PascalCase.ts` |
| Commands | `kebab-case.ts` |
| Types | `PascalCase` + suffix (`Props`, `State`, `Context`) |
| React hooks | `useCamelCase` |

---

### 4.9 MCP Integration

#### ✅ Append MCP tools after built-ins (preserve cache breakpoint)

```typescript
// Built-ins are cached. MCP tools come after — changes to MCP tools
// don't invalidate the built-in cache segment.
const toolPool = [
  ...builtInTools.sort(byName),   // ← cached segment
  ...mcpTools.sort(byName),       // ← dynamic segment
]
```

#### ✅ Filter MCP tools per permission context

Don't expose every MCP tool to every agent. Apply deny-rules by server name:

```typescript
allowedTools: ['mcp__safe_server']
// Implicitly denies tools from all other MCP servers
```

#### ✅ Expose your own agent as an MCP server

`src/entrypoints/mcp.ts` shows how to launch Claude Code as an MCP server, making all ~40 tools available to Claude Desktop, VS Code, Cursor, and other MCP clients. Mirror this pattern in your own projects.

---

### 4.10 Memory & Persistence

#### ✅ Use `CLAUDE.md` for persistent memory

| File | Scope |
|------|-------|
| `<project>/.claude/CLAUDE.md` | Project-specific context |
| `~/.claude/CLAUDE.md` | User-level context (all projects) |

Both are auto-loaded as nested attachments on every session start. No special code needed.

#### ✅ Snapshot files before editing

```typescript
fileHistoryMakeSnapshot()   // record state before edit
fileHistoryTrackEdit()      // track the modification
```

Gives agents a rollback path and provides an audit trail for destructive operations.

#### ✅ Persist background task state

Background agents should write their progress to disk so they survive process restarts. The `LocalAgentTask` service shows a reference implementation.

---

## 5. Key Patterns Reference

### Pattern: Tool with parallelism hint

```typescript
export const SearchTool = buildTool({
  name: 'SearchTool',
  inputSchema: z.object({ query: z.string() }),
  isConcurrencySafe: () => true,   // can run alongside other tools
  isReadOnly: () => true,          // no side effects
  async call({ query }, context) {
    return await search(query)
  },
})
```

### Pattern: Background sub-agent with notification

```typescript
// Spawn and forget — parent continues immediately
await AgentTool.call({
  description: "run tests",
  prompt: "Run `npm test` and return a JSON summary of failures.",
  run_in_background: true,
  name: "test-runner",
}, context)

// ... parent does other work ...

// Worker notifies parent on completion via task lifecycle hooks
```

### Pattern: Worktree-isolated parallel agents

```typescript
const [agentA, agentB] = await Promise.all([
  AgentTool.call({
    description: "refactor auth",
    prompt: "Refactor the auth module…",
    isolation: "worktree",
    run_in_background: true,
  }, context),
  AgentTool.call({
    description: "refactor payments",
    prompt: "Refactor the payments module…",
    isolation: "worktree",
    run_in_background: true,
  }, context),
])
// Each agent works in its own git worktree — no merge conflicts
```

### Pattern: Context-compressed multi-agent pipeline

```
Coordinator
    │
    ├── [Worker A] Deep analysis  → summarise to 300 tokens → Coordinator
    ├── [Worker B] File search    → summarise to 300 tokens → Coordinator
    └── [Worker C] Test run       → summarise to 300 tokens → Coordinator
                                                │
                                        Coordinator synthesises
                                        all summaries into one
                                        final response
```

### Pattern: Layered permission rules

```typescript
const permissionContext = {
  // Always allow (no prompt)
  alwaysAllowRules: { 'Bash(git log *)': true, 'FileReadTool': true },

  // Always deny (hard block)
  alwaysDenyRules:  { 'Bash(rm -rf *)': true },

  // Ask the user each time
  alwaysAskRules:   { 'BashTool': true },
}
```

---

## 6. Quick-Reference Cheatsheet

| Principle | Rule of Thumb |
|-----------|--------------|
| **Tool design** | One `buildTool()` per capability; schema + perms + UI in one place |
| **Parallelism** | Mark `isConcurrencySafe: true` wherever there are no side effects |
| **Agent spawning** | Always give a `description` (3–5 words) AND a detailed `prompt` |
| **Background tasks** | Use `run_in_background: true` for anything taking > ~2 seconds |
| **Isolation** | Use `isolation: "worktree"` when multiple agents touch the same files |
| **Sub-agent names** | Set `name:` if you'll need to send messages to the agent later |
| **Permissions** | Deny → Allow → Ask precedence; use wildcards like `Bash(git *)` |
| **Context size** | Summarise sub-agent output before returning it to the parent |
| **Prompt cache** | Sort tools alphabetically so the system prompt stays stable |
| **Memory** | Write project context to `CLAUDE.md`; it's auto-loaded every session |
| **Error handling** | Typed error classes + `withRetry()` for API calls |
| **Feature flags** | Gate optional systems at build time, not with runtime `if` chains |
| **MCP tools** | Append after built-ins to avoid busting the prompt cache |
| **Model selection** | `haiku` for speed, `sonnet` for balance, `opus` for hard reasoning |

---

*Generated by exploring `junhuabrave/claude-code` · April 2026*
