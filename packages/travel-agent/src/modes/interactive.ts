/**
 * Interactive TUI mode for the travel agent.
 *
 * Provides a terminal-based chat interface with:
 * - Multi-line editor for input
 * - Streaming markdown responses
 * - Tool call/result display
 * - Slash commands (/checklist, /state, /reset, /help, /quit)
 */

import { appendFileSync } from "node:fs";
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
import { formatChecklist } from "../core/checklist.js";
import type { TravelSession } from "../core/sdk.js";
import { formatStateForPrompt } from "../core/state.js";

function debugLog(msg: string) {
	try {
		appendFileSync("travel-agent-debug.log", `[${new Date().toISOString()}] ${msg}\n`);
	} catch (_e) {}
}

// =============================================================================
// Theme
// =============================================================================

const editorTheme: EditorTheme = {
	borderColor: (s) => chalk.green(s),
	selectList: {
		selectedPrefix: (s) => chalk.green(s),
		selectedText: (s) => chalk.bold(s),
		description: (s) => chalk.dim(s),
		scrollInfo: (s) => chalk.dim(s),
		noMatch: (s) => chalk.dim(s),
	},
};

const markdownTheme: MarkdownTheme = {
	heading: (s) => chalk.bold.green(s),
	link: (s) => chalk.underline(s),
	linkUrl: (s) => chalk.dim(s),
	code: (s) => chalk.yellow(s),
	codeBlock: (s) => chalk.gray(s),
	codeBlockBorder: (s) => chalk.dim(s),
	quote: (s) => chalk.italic(s),
	quoteBorder: (s) => chalk.dim(s),
	hr: (s) => chalk.dim(s),
	listBullet: (s) => chalk.green(s),
	bold: (s) => chalk.bold(s),
	italic: (s) => chalk.italic(s),
	strikethrough: (s) => chalk.strikethrough(s),
	underline: (s) => chalk.underline(s),
};

// =============================================================================
// Interactive Mode
// =============================================================================

export interface InteractiveModeOptions {
	session: TravelSession;
	modelName: string;
}

export class InteractiveMode {
	private session: TravelSession;
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
		this.ui.addChild(new Text(chalk.bold.green("  Travel Agent") + chalk.dim("  --  /help for commands"), 0, 0));
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

		// Focus the editor
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
		const session = chalk.dim(`session: ${this.session.state.sessionId}`);
		const msgs = this.session.agent.state.messages.length;
		const msgInfo = chalk.dim(`msgs: ${msgs}`);
		return `  ${model}  ${session}  ${msgInfo}`;
	}

	private updateFooter(): void {
		this.footer.setText(this.buildFooter());
	}

	private async handleInput(text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;

		if (trimmed.startsWith("/")) {
			debugLog(`User issued command: ${trimmed}`);
			await this.handleCommand(trimmed);
			return;
		}

		debugLog(`User input: ${trimmed.slice(0, 50)}...`);
		this.addUserMessage(trimmed);
		this.isProcessing = true;
		this.editor.disableSubmit = true;
		this.startLoading();

		try {
			debugLog("Calling agent.prompt()...");
			await this.session.agent.prompt(trimmed);
			debugLog("agent.prompt() completed successfully.");

			if (this.session.agent.state.errorMessage) {
				const errMsg = this.session.agent.state.errorMessage;
				debugLog(`Agent finished with internal error: ${errMsg}`);
				this.addSystemMessage(`Agent Error: ${errMsg}`, "error");
			}
		} catch (err) {
			const trace = err instanceof Error ? err.stack : String(err);
			debugLog(`agent.prompt() threw error:\n${trace}`);
			this.addSystemMessage(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
		} finally {
			this.isProcessing = false;
			this.editor.disableSubmit = false;
			this.stopLoading();
			this.updateFooter();
		}
	}

	private async handleCommand(input: string): Promise<void> {
		const cmd = input.split(/\s+/)[0].toLowerCase();

		switch (cmd) {
			case "/quit":
			case "/exit":
			case "/q":
				this.shutdown();
				break;

			case "/checklist":
				this.addSystemMessage(formatChecklist(this.session.state.checklist));
				break;

			case "/state":
				this.addSystemMessage(formatStateForPrompt(this.session.state));
				break;

			case "/reset":
				this.addSystemMessage(
					"Session reset is not yet implemented. Start a new session with a different --session-id.",
				);
				break;

			case "/help":
				this.showHelp();
				break;

			default:
				this.addSystemMessage(`Unknown command: ${cmd}. Type /help for available commands.`);
		}
	}

	private showHelp(): void {
		this.addSystemMessage(
			[
				chalk.bold("Commands:"),
				"  /checklist  -- Show travel planning progress",
				"  /state      -- Show current travel state",
				"  /reset      -- Start over",
				"  /help       -- Show this help",
				"  /quit       -- Exit",
				"",
				chalk.bold("Tips:"),
				"  - Describe your trip and the agent will guide you through planning",
				"  - Ask to go back to change preferences or destinations",
				"  - Use Shift+Enter for multi-line input",
				"  - Press Ctrl+C to cancel a running request",
				"  - Press Ctrl+C twice to quit",
			].join("\n"),
		);
	}

	// ========================================================================
	// Agent Event Handling
	// ========================================================================

	private handleAgentEvent(event: AgentEvent): void {
		debugLog(`AgentEvent received: ${event.type}`);
		switch (event.type) {
			case "turn_start":
				this.startLoading("Thinking...");
				break;
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
		debugLog(`Executing tool: ${event.toolName} args: ${JSON.stringify(event.args)}`);
		this.stopLoading();
		let argsPreview = "";
		if (event.args) {
			if (event.toolName === "web_search" && event.args.query) {
				argsPreview = event.args.query;
			} else if (event.toolName === "update_travel_state" && event.args.field) {
				argsPreview = event.args.field;
			} else if (event.toolName === "go_back_to_phase" && event.args.phase_id) {
				argsPreview = event.args.phase_id;
			} else {
				argsPreview = JSON.stringify(event.args).slice(0, 80);
			}
		}

		const label = chalk.dim("-> ") + chalk.yellow(event.toolName) + (argsPreview ? chalk.dim(` ${argsPreview}`) : "");
		this.chatContainer.addChild(new Text(label, 1, 0));
		this.startLoading("Running...");
	}

	private handleToolEnd(event: { toolCallId: string; toolName: string; result: any; isError: boolean }): void {
		const resStr = typeof event.result === "string" ? event.result : JSON.stringify(event.result);
		debugLog(
			`Tool finished: ${event.toolName} (isError: ${event.isError}). Result preview: ${resStr?.slice(0, 3000)}`,
		);
		this.stopLoading();
		if (event.isError) {
			const errorText =
				event.result?.content
					?.filter((c: any) => c.type === "text")
					.map((c: any) => c.text)
					.join("\n") ?? "Unknown error";
			this.chatContainer.addChild(new Text(chalk.red(`  x ${errorText.split("\n")[0]}`), 0, 0));
		} else {
			this.chatContainer.addChild(new Text(chalk.green("  done"), 0, 0));
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
			(s) => chalk.green(s),
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
