import { Markdown } from "@copilotkit/react-ui";
import type { FormEvent, ReactNode } from "react";
import { canRenderMarkdownImage } from "./render-safety.js";

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export type RunStatus = "idle" | "starting" | "sending";

interface TravelCopilotChatProps {
	messages: ChatMessage[];
	draft: string;
	onDraftChange: (draft: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onNewSession: () => void;
	onRetry?: () => void;
	error: string | null;
	progressMessage: string | null;
	sessionReady: boolean;
	runStatus: RunStatus;
}

export function TravelCopilotChat({
	messages,
	draft,
	onDraftChange,
	onSubmit,
	onNewSession,
	onRetry,
	error,
	progressMessage,
	sessionReady,
	runStatus,
}: TravelCopilotChatProps) {
	const disabled = !sessionReady || runStatus !== "idle";
	return (
		<section className="chat-column copilot-rest-chat" aria-label="Travel chat">
			<header className="app-header">
				<div>
					<p className="eyebrow">Pi Travel Agent</p>
					<h1>Plan the trip, keep the choices visible.</h1>
					<p className="copilot-shell-label">CopilotKit shell · Travel REST adapter</p>
				</div>
				<button type="button" className="secondary-button" onClick={onNewSession} disabled={runStatus !== "idle"}>
					New session
				</button>
			</header>

			{error ? (
				<div className="error-banner">
					<span>{error}</span>
					{onRetry ? <button type="button" onClick={onRetry} disabled={runStatus !== "idle"}>Retry last message</button> : null}
				</div>
			) : null}
			{progressMessage ? (
				<div className="progress-banner" role="status" aria-live="polite">
					<span className="spinner" aria-hidden="true" />
					{progressMessage}
				</div>
			) : null}

			<div className="messages copilot-messages" aria-live="polite">
				{messages.length === 0 ? (
					<div className="empty-state copilot-empty-state">
						<h2>Where are we going?</h2>
						<p>
							Start with dates, origin, budget, vibe, or a rough destination. I’ll keep the planning state visible on the right.
						</p>
					</div>
				) : (
					<>
						{messages.map((message, index) => (
							<article className={`message ${message.role} copilot-message`} key={`${message.role}-${index}`}>
								<strong>{message.role === "user" ? "You" : "Travel agent"}</strong>
								{message.role === "assistant" ? <CopilotMarkdown content={message.content} /> : <p>{message.content}</p>}
							</article>
						))}
						{runStatus === "sending" ? (
							<article className="message assistant pending copilot-message">
								<strong>Travel agent</strong>
								<p>
									<span className="typing-dot" /> Working on your request…
								</p>
							</article>
						) : null}
					</>
				)}
			</div>

			<form className="composer copilot-composer" onSubmit={onSubmit}>
				<input
					aria-label="Travel request"
					placeholder="Plan 5 days in Japan from Jakarta, mid-range budget..."
					value={draft}
					onChange={(event) => onDraftChange(event.target.value)}
					disabled={disabled}
				/>
				<button type="submit" disabled={disabled || !draft.trim()}>
					{runStatus === "sending" ? "Sending…" : "Send"}
				</button>
			</form>
		</section>
	);
}

function CopilotMarkdown({ content }: { content: string }) {
	return (
		<div className="markdown-content copilot-markdown-content">
			<Markdown
				content={content}
				components={{
					img: ({ src, alt }) => <SafeMarkdownImage src={typeof src === "string" ? src : undefined} alt={alt ?? "Travel image"} />,
				}}
			/>
		</div>
	);
}

function SafeMarkdownImage({ src, alt }: { src?: string; alt?: ReactNode }) {
	if (!src) return null;
	if (!canRenderMarkdownImage(src)) {
		return (
			<span className="image-fallback" title={`Blocked unverified image URL: ${src}`}>
				Image blocked until verified{typeof alt === "string" && alt.trim() ? `: ${alt}` : ""}
			</span>
		);
	}
	return null;
}
