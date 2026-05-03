/**
 * Interactive TUI mode for the analytics agent.
 *
 * Provides a terminal-based chat interface with:
 * - Multi-line editor for input
 * - Streaming markdown responses
 * - Tool call/result display
 * - Slash commands (/quit, /datasets, /help)
 * - Loading animation during processing
 */

import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent } from "@mariozechner/pi-ai";
import {
	Container,
	Editor,
	type EditorTheme,
	Loader,
	Markdown,
	type MarkdownTheme,
	ProcessTerminal,
	Spacer,
	Text,
	TUI,
} from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { AnalyticsSession } from "../core/sdk.js";

// ============================================================================
// Theme
// ============================================================================

const editorTheme: EditorTheme = {
	borderColor: (s) => chalk.cyan(s),
	selectList: {
		selectedPrefix: (s) => chalk.cyan(s),
		selectedText: (s) => chalk.bold(s),
		description: (s) => chalk.dim(s),
		scrollInfo: (s) => chalk.dim(s),
		noMatch: (s) => chalk.dim(s),
	},
};

const markdownTheme: MarkdownTheme = {
	heading: (s) => chalk.bold.cyan(s),
	link: (s) => chalk.underline(s),
	linkUrl: (s) => chalk.dim(s),
	code: (s) => chalk.yellow(s),
	codeBlock: (s) => chalk.gray(s),
	codeBlockBorder: (s) => chalk.dim(s),
	quote: (s) => chalk.italic(s),
	quoteBorder: (s) => chalk.dim(s),
	hr: (s) => chalk.dim(s),
	listBullet: (s) => chalk.cyan(s),
	bold: (s) => chalk.bold(s),
	italic: (s) => chalk.italic(s),
	strikethrough: (s) => chalk.strikethrough(s),
	underline: (s) => chalk.underline(s),
};

// ============================================================================
// Interactive Mode
// ============================================================================

export interface InteractiveModeOptions {
	session: AnalyticsSession;
	modelName: string;
}

export class InteractiveMode {
	private session: AnalyticsSession;
	private ui!: TUI;
	private chatContainer!: Container;
	private editor!: Editor;
	private footer!: Text;
	private loader: Loader | null = null;
	private streamingText = "";
	private streamingComponent: Markdown | null = null;
	private modelName: string;
	private isProcessing = false;

	constructor(options: InteractiveModeOptions) {
		this.session = options.session;
		this.modelName = options.modelName;
	}

	async start(): Promise<void> {
		const terminal = new ProcessTerminal();
		this.ui = new TUI(terminal);

		// Header
		this.ui.addChild(new Spacer(1));
		this.ui.addChild(new Text(chalk.bold.cyan("  📊 Analytics Agent") + chalk.dim("  —  /help for commands"), 0, 0));
		this.ui.addChild(new Spacer(1));

		// Chat area
		this.chatContainer = new Container();
		this.ui.addChild(this.chatContainer);

		// Editor
		this.editor = new Editor(this.ui, editorTheme);
		this.editor.onSubmit = (text: string) => this.handleInput(text);
		this.ui.addChild(this.editor);

		// Footer
		this.footer = new Text(this.buildFooter(), 0, 0);
		this.ui.addChild(this.footer);

		// Focus the editor so it receives keyboard input
		this.ui.setFocus(this.editor);

		// Subscribe to agent events
		this.session.agent.subscribe((event: AgentEvent) => this.handleAgentEvent(event));

		// Handle Ctrl+C
		process.on("SIGINT", () => {
			if (this.isProcessing) {
				this.session.agent.abort();
			} else {
				this.shutdown();
			}
		});

		this.ui.start();
	}

	private buildFooter(): string {
		const model = chalk.dim(`model: ${this.modelName}`);
		const msgs = this.session.agent.state.messages.length;
		const msgInfo = chalk.dim(`msgs: ${msgs}`);
		return `  ${model}  ${msgInfo}`;
	}

	private updateFooter(): void {
		this.footer.setText(this.buildFooter());
	}

	private async handleInput(text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;

		// Handle slash commands
		if (trimmed.startsWith("/")) {
			await this.handleCommand(trimmed);
			return;
		}

		// Show user message
		this.addUserMessage(trimmed);

		// Start processing
		this.isProcessing = true;
		this.editor.disableSubmit = true;
		this.startLoading();

		try {
			await this.session.agent.prompt(trimmed);
		} catch (err) {
			this.addSystemMessage(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
		} finally {
			this.isProcessing = false;
			this.editor.disableSubmit = false;
			this.stopLoading();
			this.updateFooter();
		}
	}

	private async handleCommand(input: string): Promise<void> {
		const parts = input.split(/\s+/);
		const cmd = parts[0].toLowerCase();

		switch (cmd) {
			case "/quit":
			case "/exit":
			case "/q":
				this.shutdown();
				break;

			case "/datasets": {
				const result = await this.session.runtime.listDatasets();
				if (result.ok) {
					const datasets = result.datasets as Array<{
						name: string;
						shape: [number, number];
						columns: string[];
						memory_bytes: number;
					}>;
					if (datasets.length === 0) {
						this.addSystemMessage("No datasets loaded. Use load_data to load a file.");
					} else {
						const lines = datasets.map((d) => {
							const mem =
								d.memory_bytes < 1024 * 1024
									? `${(d.memory_bytes / 1024).toFixed(1)} KB`
									: `${(d.memory_bytes / (1024 * 1024)).toFixed(1)} MB`;
							return `  ${chalk.cyan(d.name)}: ${d.shape[0]} rows × ${d.shape[1]} cols (${mem})\n    columns: ${d.columns.join(", ")}`;
						});
						this.addSystemMessage(`Loaded datasets:\n${lines.join("\n")}`);
					}
				}
				break;
			}

			case "/help":
				this.addSystemMessage(
					[
						chalk.bold("Commands:"),
						"  /datasets  — List loaded datasets",
						"  /help      — Show this help",
						"  /quit      — Exit",
						"",
						chalk.bold("Tips:"),
						"  • Ask to load a CSV/Excel file to start analyzing",
						"  • The agent can run pandas code, compute statistics, and explain findings",
						"  • Use Shift+Enter for multi-line input",
						"  • Press Ctrl+C to cancel a running request",
						"  • Press Ctrl+C twice to quit",
					].join("\n"),
				);
				break;

			default:
				this.addSystemMessage(`Unknown command: ${cmd}. Type /help for available commands.`);
		}
	}

	// ========================================================================
	// Agent Event Handling
	// ========================================================================

	private handleAgentEvent(event: AgentEvent): void {
		switch (event.type) {
			case "message_start":
				this.handleMessageStart(event.message);
				break;
			case "message_update":
				this.handleMessageUpdate(event as AgentEvent & { type: "message_update" });
				break;
			case "message_end":
				this.handleMessageEnd(event.message);
				break;
			case "tool_execution_start":
				this.handleToolStart(event as AgentEvent & { type: "tool_execution_start" });
				break;
			case "tool_execution_end":
				this.handleToolEnd(event as AgentEvent & { type: "tool_execution_end" });
				break;
		}
	}

	private handleMessageStart(message: AgentMessage): void {
		if (message.role === "assistant") {
			this.stopLoading();
			this.streamingText = "";
			this.streamingComponent = new Markdown("", 1, 0, markdownTheme);
			this.chatContainer.addChild(this.streamingComponent);
		}
	}

	private handleMessageUpdate(event: { assistantMessageEvent: AssistantMessageEvent; message: AgentMessage }): void {
		const aEvent = event.assistantMessageEvent;
		if (aEvent.type === "text_delta") {
			this.streamingText += aEvent.delta;
			if (this.streamingComponent) {
				this.streamingComponent.setText(this.streamingText);
			}
		}
	}

	private handleMessageEnd(message: AgentMessage): void {
		if (message.role === "assistant") {
			// Replace streaming component with final rendered version
			const assistant = message as AssistantMessage;
			const text = assistant.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("\n");

			if (this.streamingComponent) {
				this.streamingComponent.setText(text || "(no text response)");
				this.streamingComponent = null;
			}
			this.streamingText = "";
			this.chatContainer.addChild(new Spacer(1));
		}
	}

	private handleToolStart(event: { toolCallId: string; toolName: string; args: any }): void {
		this.stopLoading();

		let argsPreview = "";
		if (event.args) {
			if (event.toolName === "query_data" && event.args.code) {
				const code = event.args.code as string;
				argsPreview = code.length > 80 ? `${code.slice(0, 80)}...` : code;
			} else if (event.toolName === "load_data" && event.args.path) {
				argsPreview = event.args.path;
			} else if (event.toolName === "describe_data" && event.args.name) {
				argsPreview = event.args.name;
			} else {
				argsPreview = JSON.stringify(event.args).slice(0, 80);
			}
		}

		const label = chalk.dim("⚙ ") + chalk.yellow(event.toolName) + (argsPreview ? chalk.dim(` ${argsPreview}`) : "");
		this.chatContainer.addChild(new Text(label, 1, 0));
		this.startLoading("Running...");
	}

	private handleToolEnd(event: { toolCallId: string; toolName: string; result: any; isError: boolean }): void {
		this.stopLoading();

		if (event.isError) {
			const errorText =
				event.result?.content
					?.filter((c: any) => c.type === "text")
					.map((c: any) => c.text)
					.join("\n") ?? "Unknown error";
			this.chatContainer.addChild(new Text(chalk.red(`  ✗ ${errorText.split("\n")[0]}`), 0, 0));
		} else {
			this.chatContainer.addChild(new Text(chalk.green("  ✓ done"), 0, 0));
		}
	}

	// ========================================================================
	// UI Helpers
	// ========================================================================

	private addUserMessage(text: string): void {
		const prefix = chalk.bold.blue("You: ");
		const lines = text.split("\n");
		const formatted = lines.map((line, i) => (i === 0 ? prefix + line : `     ${line}`)).join("\n");
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new Text(formatted, 1, 0));
		this.chatContainer.addChild(new Spacer(1));
	}

	private addSystemMessage(text: string, type: "info" | "error" = "info"): void {
		const colorFn = type === "error" ? chalk.red : chalk.dim;
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new Text(colorFn(text), 1, 0));
		this.chatContainer.addChild(new Spacer(1));
	}

	private startLoading(message = "Thinking..."): void {
		if (this.loader) {
			this.loader.setMessage(message);
			return;
		}
		this.loader = new Loader(
			this.ui,
			(s) => chalk.cyan(s),
			(s) => chalk.dim(s),
			message,
		);
		this.chatContainer.addChild(this.loader);
		this.loader.start();
	}

	private stopLoading(): void {
		if (this.loader) {
			this.loader.stop();
			this.chatContainer.removeChild(this.loader);
			this.loader = null;
		}
	}

	private shutdown(): void {
		this.stopLoading();
		this.ui.stop();
		this.session.shutdown().then(() => process.exit(0));
	}
}
