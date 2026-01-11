#!/usr/bin/env bun
import {Glob} from "bun";
import {copyFile, cp, readdir, rename, rm, stat, unlink} from "fs/promises";
import {join} from "path";

const API_URL = process.env.API_URL || "http://127.0.0.1:8045/v1/messages";
const MODEL = process.env.MODEL || "claude-opus-4-5";
const GREP_LIMIT = parseInt(process.env.GREP_LIMIT || "50", 10);
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "10485760", 10); // 10MB default
const IGNORE_PATTERNS = ['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.cache'];
const [RESET, BOLD, DIM, BLUE, CYAN, GREEN, RED, YELLOW] = ["\x1b[0m", "\x1b[1m", "\x1b[2m", "\x1b[34m", "\x1b[36m", "\x1b[32m", "\x1b[31m", "\x1b[33m"];
const IS_WINDOWS = process.platform === "win32";
const SHELL = IS_WINDOWS ? ["cmd", "/c"] : ["sh", "-c"];

let stopRequested = false;

type ToolArgs = Record<string, unknown>;
type Tool = [string, Record<string, string>, (args: ToolArgs) => Promise<string>];

interface ContentBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: ToolArgs
}

interface Message {
    role: string;
    content: string | ContentBlock[] | ToolResult[]
}

interface ToolResult {
    type: string;
    tool_use_id: string;
    content: string
}

interface APIResponse {
    content?: ContentBlock[];
    error?: { message: string };
    usage?: {
        input_tokens: number;
        output_tokens: number;
    }
}

const getPath = (args: ToolArgs): string => {
    const path = (args.path || args.file_path) as string | undefined;
    if (!path) throw new Error("path parameter is required");
    return path;
};
const shouldIgnore = (filepath: string): boolean =>
    IGNORE_PATTERNS.some(pattern => filepath.includes(`/${pattern}/`) || filepath.includes(`\\${pattern}\\`));

const TOOLS: Record<string, Tool> = {
    read: ["Read file with line numbers", {path: "string", offset: "number?", limit: "number?"}, async (args) => {
        const lines = (await Bun.file(getPath(args)).text()).split("\n");
        const offset = (args.offset as number) ?? 0;
        const selected = args.limit ? lines.slice(offset, offset + (args.limit as number)) : lines.slice(offset);
        return selected.map((line, index) => `${String(offset + index + 1).padStart(4)}| ${line}`).join("\n");
    }],

    write: ["Write content to file", {path: "string", content: "string"}, async (args) => {
        await Bun.write(getPath(args), args.content as string);
        return "ok";
    }],

    edit: ["Replace old with new in file", {
        path: "string",
        old: "string",
        new: "string",
        all: "boolean?"
    }, async (args) => {
        const text = await Bun.file(getPath(args)).text();
        const oldString = args.old as string;
        if (!text.includes(oldString)) return "error: old_string not found";
        const count = text.split(oldString).length - 1;
        if (!args.all && count > 1) return `error: old_string appears ${count} times, use all=true`;
        await Bun.write(getPath(args), args.all ? text.replaceAll(oldString, args.new as string) : text.replace(oldString, args.new as string));
        return "ok";
    }],

    glob: ["Find files by pattern", {pattern: "string", path: "string?"}, async (args) => {
        const files: { path: string; mtime: number }[] = [];
        for await (const filepath of new Glob(args.pattern as string).scan({
            cwd: (args.path as string) ?? ".",
            absolute: true
        })) {
            if (shouldIgnore(filepath)) continue;
            try {
                const fileStat = await Bun.file(filepath).stat();
                files.push({path: filepath, mtime: fileStat?.mtime?.getTime() ?? 0});
            } catch {
                files.push({path: filepath, mtime: 0});
            }
        }
        return files.sort((a, b) => b.mtime - a.mtime).map(file => file.path).join("\n") || "none";
    }],

    grep: ["Search files for regex", {pattern: "string", path: "string?"}, async (args) => {
        const regex = new RegExp(args.pattern as string);
        const hits: string[] = [];
        for await (const filepath of new Glob("**/*").scan({cwd: (args.path as string) ?? ".", absolute: true})) {
            if (shouldIgnore(filepath)) continue;
            try {
                const fileStat = await Bun.file(filepath).stat();
                if (!fileStat || fileStat.isDirectory()) continue;
                const lines = (await Bun.file(filepath).text()).split("\n");
                for (const [index, line] of lines.entries()) {
                    if (regex.test(line)) {
                        hits.push(`${filepath}:${index + 1}:${line.trimEnd()}`);
                        if (hits.length >= GREP_LIMIT) break;
                    }
                }
                if (hits.length >= GREP_LIMIT) break;
            } catch {
            }
        }
        return hits.join("\n") || "none";
    }],

    exec: ["Execute shell command with live output and timeout", {
        command: "string",
        timeout: "number"
    }, async (args) => {
        const timeoutMs = Math.min(Math.max(args.timeout as number, 1000), 300000);
        const output: string[] = [];
        const proc = Bun.spawn([...SHELL, args.command as string], {stdout: "pipe", stderr: "pipe"});
        let killed = false;
        const timeoutId = setTimeout(() => {
            killed = true;
            proc.kill();
        }, timeoutMs);

        const readStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, prefix: string) => {
            const decoder = new TextDecoder();
            try {
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    const text = decoder.decode(value, {stream: true});
                    for (const line of text.split('\n').filter(l => l)) {
                        output.push(`${prefix}${line}`);
                        console.log(`  ${DIM}${prefix}${line}${RESET}`);
                    }
                }
            } catch {
            }
        };

        await Promise.all([
            readStream(proc.stdout.getReader(), "[stdout] "),
            readStream(proc.stderr.getReader(), "[stderr] ")
        ]);

        await proc.exited;
        clearTimeout(timeoutId);
        const result = output.join('\n') || "(no output)";
        return killed ? `${result}\n[TIMEOUT after ${timeoutMs}ms]` : `${result}\n[exit: ${proc.exitCode}]`;
    }],

    list: ["List directory", {path: "string", recursive: "boolean?"}, async (args) => {
        const listDir = async (directory: string, prefix = ""): Promise<string[]> => {
            const results: string[] = [];
            for (const entry of await readdir(directory, {withFileTypes: true})) {
                const fullPath = join(directory, entry.name);
                if (shouldIgnore(fullPath) && entry.isDirectory()) continue;
                results.push(`${prefix}${entry.name}${entry.isDirectory() ? "/" : ""}`);
                if (entry.isDirectory() && args.recursive) results.push(...await listDir(fullPath, prefix + "  "));
            }
            return results;
        };
        try {
            return (await listDir(getPath(args))).join("\n") || "(empty)";
        } catch (error) {
            return `error: ${(error as Error).message}`;
        }
    }],

    delete: ["Delete file/directory", {path: "string", recursive: "boolean?"}, async (args) => {
        try {
            const filepath = getPath(args);
            const fileStat = await stat(filepath);
            fileStat.isDirectory() ? await rm(filepath, {recursive: !!args.recursive}) : await unlink(filepath);
            return `Deleted: ${filepath}`;
        } catch (error) {
            return `error: ${(error as Error).message}`;
        }
    }],

    move: ["Move or rename", {from: "string", to: "string"}, async (args) => {
        try {
            await rename(args.from as string, args.to as string);
            return `Moved: ${args.from} -> ${args.to}`;
        } catch (error) {
            return `error: ${(error as Error).message}`;
        }
    }],

    copy: ["Copy file/directory", {from: "string", to: "string", recursive: "boolean?"}, async (args) => {
        try {
            const fileStat = await stat(args.from as string);
            fileStat.isDirectory()
                ? await cp(args.from as string, args.to as string, {recursive: !!args.recursive})
                : await copyFile(args.from as string, args.to as string);
            return `Copied: ${args.from} -> ${args.to}`;
        } catch (error) {
            return `error: ${(error as Error).message}`;
        }
    }],
};

async function runTool(name: string, args: ToolArgs): Promise<string> {
    try {
        return TOOLS[name] ? await TOOLS[name][2](args) : `error: unknown tool ${name}`;
    } catch (error) {
        return `error: ${error}`;
    }
}

function makeSchema() {
    return Object.entries(TOOLS).map(([name, [description, params]]) => ({
        name, description,
        input_schema: {
            type: "object",
            properties: Object.fromEntries(Object.entries(params).map(([key, value]) =>
                [key, {type: value.replace("?", "") === "number" ? "integer" : value.replace("?", "")}]
            )),
            required: Object.entries(params).filter(([, value]) => !value.endsWith("?")).map(([key]) => key),
        },
    }));
}

async function callAPI(messages: Message[], systemPrompt: string): Promise<APIResponse> {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({model: MODEL, max_tokens: 8192, system: systemPrompt, messages, tools: makeSchema()}),
    });
    if (!response.ok) {
        const errorData = await response.json() as APIResponse;
        throw new Error(`API error (${response.status}): ${errorData.error?.message || response.statusText}`);
    }
    return await response.json() as APIResponse;
}

const separator = () => `${DIM}${"─".repeat(Math.min(process.stdout.columns ?? 80, 80))}${RESET}`;
const renderMarkdown = (text: string) => text
    .replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`)
    .replace(/`([^`]+)`/g, `${GREEN}$1${RESET}`)
    .replace(/^(#{1,6})\s+(.+)$/gm, `${BOLD}${CYAN}$2${RESET}`);

process.on('SIGINT', () => {
    stopRequested = true;
});
process.on('SIGTERM', () => {
    console.log(`\n${DIM}Bye!${RESET}`);
    process.exit(0);
});

void async function main() {
    const osInfo = `${process.platform} ${process.arch}`;
    const systemPrompt = `NANOCODE: Concise coding assistant. OS: ${osInfo}. Time: ${new Date().toISOString()}. CWD: ${process.cwd()}`;

    console.log(`${BOLD}nanocode${RESET} | ${DIM}${MODEL} | ${process.cwd()}${RESET}\n`);
    const messages: Message[] = [];
    const prompt = `${BOLD}${BLUE}|>${RESET} `;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    console.log(separator());
    process.stdout.write(prompt);

    for await (const line of console) {
        const userInput = line.trim();
        console.log(separator());

        if (userInput === "/q" || userInput === "exit") {
            console.log(`${DIM}Bye!${RESET}`);
            break;
        }
        if (userInput === "/c") {
            messages.length = 0;
            totalInputTokens = 0;
            totalOutputTokens = 0;
            console.log(`${GREEN}⏺ Cleared${RESET}`);
            console.log(separator());
            process.stdout.write(prompt);
            continue;
        }
        if (!userInput) {
            console.log(separator());
            process.stdout.write(prompt);
            continue;
        }

        try {
            messages.push({role: "user", content: userInput});
            stopRequested = false;

            while (!stopRequested) {
                process.stdout.write(`${DIM}⏳ Thinking...${RESET}`);
                const {content: blocks = [], usage} = await callAPI(messages, systemPrompt);
                process.stdout.write(`\r${" ".repeat(20)}\r`);

                if (usage) {
                    totalInputTokens += usage.input_tokens;
                    totalOutputTokens += usage.output_tokens;
                }

                const toolResults: ToolResult[] = [];
                for (const block of blocks) {
                    if (block.type === "text" && block.text) console.log(`\n${CYAN}⏺${RESET} ${renderMarkdown(block.text)}`);
                    if (block.type === "tool_use" && block.name && block.input && block.id) {
                        console.log(`\n${GREEN}⏺ ${block.name}${RESET}(${DIM}${JSON.stringify(block.input)}${RESET})`);
                        const result = await runTool(block.name, block.input);
                        const resultLines = result.split("\n");
                        const preview = resultLines[0]?.slice(0, 60) + (resultLines.length > 1 ? ` ... +${resultLines.length - 1} lines` : resultLines[0].length > 60 ? "..." : "");
                        console.log(`  ${DIM}|> ${preview}${RESET}`);
                        toolResults.push({type: "tool_result", tool_use_id: block.id, content: result});
                    }
                }

                messages.push({role: "assistant", content: blocks});
                if (!toolResults.length) break;
                messages.push({role: "user", content: toolResults});
            }
            
            if (totalInputTokens > 0 || totalOutputTokens > 0) {
                console.log(`\n${DIM}📊 Tokens: ${totalInputTokens} in, ${totalOutputTokens} out, ${totalInputTokens + totalOutputTokens} total${RESET}`);
            }
            console.log();
        } catch (error) {
            console.log(`${RED}⏺ Error: ${(error as Error).message}${RESET}`);
        }

        console.log(separator());
        process.stdout.write(prompt);
    }
}();