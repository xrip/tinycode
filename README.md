# nanocode

A minimal, single-file AI coding assistant built with TypeScript and Bun. Uses Claude AI with tool-calling capabilities for intelligent code manipulation.

## ✨ Features

- 🛠️ **10 Built-in Tools**: File operations, code search, shell execution, and more
- 🧠 **Context-Aware**: Knows your OS, timezone, and working directory
- ⚡ **Zero Dependencies**: Single TypeScript file (~345 lines)
- 🔄 **Live Output**: Real-time streaming for long-running commands
- 🎨 **Beautiful CLI**: Colored output with markdown rendering
- 📊 **Token Tracking**: Displays API token usage after each interaction
- 🔧 **Cross-Platform**: Works on Windows, macOS, and Linux

## 🚀 Quick Start

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Set your API key
export ANTHROPIC_API_KEY=your_key_here
# Or on Windows:
# set ANTHROPIC_API_KEY=your_key_here

# Run nanocode
bun run index.ts
# Or make it executable:
chmod +x index.ts && ./index.ts
```

## 🎮 Commands

| Command | Description |
|---------|-------------|
| `/q` or `exit` | Quit the assistant |
| `/c` | Clear conversation history |

## 🔧 Available Tools

1. **read** - Read files with line numbers (supports offset/limit)
2. **write** - Write content to files
3. **edit** - Find and replace in files (supports single or all occurrences)
4. **glob** - Find files by pattern (sorted by modification time)
5. **grep** - Search files with regex (limited to 50 results)
6. **exec** - Execute commands with live output and custom timeout (1ms - 300s)
7. **list** - List directory contents (supports recursive listing)
8. **delete** - Delete files/directories (supports recursive deletion)
9. **move** - Move or rename files
10. **copy** - Copy files/directories (supports recursive copy)

## 📝 Example Usage

```
|> What files are in this directory?
⏺ glob({"pattern":"*"})
  |> README.md ... +5 files

|> Read the first 10 lines of index.ts
⏺ read({"path":"index.ts","limit":10})
  |> 1| #!/usr/bin/env bun ... +9 lines

|> Find all TODO comments
⏺ grep({"pattern":"TODO"})
  |> index.ts:42:// TODO: Add error handling ... +2 lines

|> Run tests with live output
⏺ exec({"command":"npm test","timeout":60000})
  [stdout] Running tests...
  [stdout] ✓ Test 1 passed
  [stderr] Warning: deprecated API
  [exit: 0]

📊 Tokens: 1250 in, 340 out, 1590 total
```

## ⚙️ Configuration

Environment variables:

```bash
API_URL=http://127.0.0.1:8045/v1/messages  # API endpoint
MODEL=claude-opus-4-5                       # Claude model
GREP_LIMIT=50                               # Max grep results
MAX_FILE_SIZE=10485760                      # Max file size (10MB)
ANTHROPIC_API_KEY=sk-ant-...                # Your API key
```

## 🎯 Use Cases

- **Code Generation**: "Create a React component with TypeScript"
- **Refactoring**: "Refactor this function to use async/await"
- **Bug Fixing**: "Fix the type errors in this file"
- **Code Review**: "Review this code and suggest improvements"
- **Documentation**: "Add JSDoc comments to all functions"
- **Testing**: "Generate unit tests for this module"

## 🧪 Advanced Features

### Context-Aware Responses
The AI knows your system environment:

```
System Prompt includes:
- OS: win32 x64 (or darwin arm64, linux x64, etc.)
- Current time: 2026-01-11T11:26:56.779Z
- Working directory: /path/to/project
```

### Live Command Execution
Use `exec` for commands with real-time output:

```
|> Run build with live output
⏺ exec({"command":"npm run build","timeout":120000})
  [stdout] Building...
  [stdout] ✓ Compiled successfully
  [exit: 0]
```

### Smart File Filtering
Automatically ignores common directories:
- `.git`, `node_modules`, `dist`, `build`
- `.next`, `coverage`, `.cache`

## 📚 Documentation

- [CLAUDE.md](CLAUDE.md) - Architecture and design notes for AI
- [EXEC_METHOD.md](EXEC_METHOD.md) - Details on the `exec` tool
- [SYSTEM_PROMPT_CHANGELOG.md](SYSTEM_PROMPT_CHANGELOG.md) - System prompt enhancements
- [FEATURES.md](FEATURES.md) - Complete feature list and roadmap
- [SESSION_LOGGING.md](SESSION_LOGGING.md) - Session logging documentation
- [SESSION_SUMMARY.md](SESSION_SUMMARY.md) - Development session notes

## 🤝 Contributing

This is a minimal, educational project. Key principles:

- **Single file** - Keep everything in `index.ts`
- **Zero dependencies** - Only use Bun APIs
- **Simple & clear** - Readable code over clever abstractions

## 📄 License

MIT License - Feel free to use, modify, and distribute.

## 🙏 Acknowledgments

Built with:
- [Bun](https://bun.sh) - Fast JavaScript runtime
- [Claude AI](https://anthropic.com) - Anthropic's AI assistant
- TypeScript - Type-safe JavaScript

---

**Version**: Enhanced - January 2026  
**Lines of Code**: ~345  
**Dependencies**: 0  
**Awesomeness**: ∞
