# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

nanocode is a minimal, single-file Claude Code alternative - an interactive coding assistant CLI that uses the Anthropic Claude API with tool-calling capabilities. Built with TypeScript and Bun runtime (~345 lines, zero external dependencies).

## Running

```bash
# Set API key first
export ANTHROPIC_API_KEY=your_key

# Run the assistant
bun run index.ts
# or
./index.ts
```

**Built-in commands:** 
- `/q` or `exit` - quit the assistant
- `/c` - clear conversation history

## Architecture

**Single-file design** (`index.ts`) with these sections:

1. **Configuration & Constants** (lines 1-13): Environment variables, color codes, platform detection
2. **Types** (lines 15-42): TypeScript interfaces for tools, messages, API responses
3. **Utility Functions** (lines 44-50): Path resolution, ignore pattern matching
4. **Tool Implementations** (lines 52-208): Ten async functions using Bun APIs:
   - `read` - Read files with line numbers (supports offset/limit)
   - `write` - Write content to files
   - `edit` - Find and replace in files (single or all occurrences)
   - `glob` - Find files by pattern (sorted by mtime, newest first)
   - `grep` - Search files with regex (capped at GREP_LIMIT)
   - `exec` - Execute shell commands with live output streaming (timeout: 1ms-300s)
   - `list` - List directory contents (supports recursive)
   - `delete` - Delete files/directories (supports recursive)
   - `move` - Move or rename files
   - `copy` - Copy files/directories (supports recursive)
5. **Tool Registry** (lines 210-229): `TOOLS` record mapping names to `[description, params, fn]` tuples, plus `makeSchema()` for API format
6. **API Layer** (lines 231-246): Direct fetch calls to Anthropic API
7. **UI Utilities** (lines 248-252): Markdown rendering, separator formatting
8. **Signal Handlers** (lines 254-260): Graceful shutdown on SIGINT/SIGTERM
9. **REPL Loop** (lines 262-328): Agentic loop using `console` async iterator for input

**Bun-specific APIs used:**
- `Bun.file()` / `Bun.write()` for file I/O
- `Bun.spawn()` for shell commands
- `Bun.Glob` for file pattern matching
- `console` async iterator for stdin

**Key Features:**
- **Smart Filtering**: Auto-ignores `.git`, `node_modules`, `dist`, `build`, `.next`, `coverage`, `.cache`
- **File Size Limit**: Prevents reading files larger than MAX_FILE_SIZE (default 10MB)
- **Live Output**: `exec` tool streams stdout/stderr in real-time with prefixes
- **Error Handling**: Graceful error handling with detailed error messages
- **Cross-Platform**: Auto-detects Windows (cmd /c) vs Unix (sh -c)

**Key Constraints:**
- Exec commands: timeout range 1ms - 300,000ms (5 minutes)
- Grep results: capped at GREP_LIMIT (default 50)
- Model: `claude-opus-4-5` with 8192 max tokens
- System prompt: `NANOCODE: Concise coding assistant. OS: {platform} {arch}. Time: {ISO timestamp}. CWD: {working directory}`

## Adding New Tools

Add entry to `TOOLS` record:
```typescript
tool_name: ["Description for Claude", { param: "string", optional_param: "number?" }, async (args) => {
  // Implementation
  return "result";
}],
```

Schema types: `string`, `number` (becomes integer), `boolean`. Append `?` for optional params.

## Important Notes

- **No /info or /help commands**: These were planned but not implemented in current code
- **No session logging**: Logging features documented but not present in index.ts
- **Minimal REPL**: Only `/q`, `exit`, and `/c` commands are active
- **Simple system prompt**: Just OS info, time, and CWD - no local time formatting
