import { Markdown } from "@copilotkit/react-ui";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export type RunStatus = "idle" | "starting" | "sending";

interface ResearchTabOption<T extends string = string> {
	id: T;
	label: string;
	count: number;
}

interface TravelCopilotChatProps<T extends string = string> {
	activeResearchTab: T;
	messages: ChatMessage[];
	draft: string;
	onDraftChange: (draft: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onNewSession: () => void;
	onResearchTabChange: (tab: T) => void;
	onRetry?: () => void;
	error: string | null;
	progressMessage: string | null;
	researchTabs: Array<ResearchTabOption<T>>;
	sessionReady: boolean;
	runStatus: RunStatus;
}

export function TravelCopilotChat<T extends string>({
	activeResearchTab,
	messages,
	draft,
	onDraftChange,
	onSubmit,
	onNewSession,
	onResearchTabChange,
	onRetry,
	error,
	progressMessage,
	researchTabs,
	sessionReady,
	runStatus,
}: TravelCopilotChatProps<T>) {
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

			<nav className="research-tabs" aria-label="Research sections">
				{researchTabs.map((tab) => (
					<button
						type="button"
						className={tab.id === activeResearchTab ? "active" : undefined}
						onClick={() => onResearchTabChange(tab.id)}
						key={tab.id}
					>
						<span>{tab.label}</span>
						<small>{tab.count}</small>
					</button>
				))}
			</nav>

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
	const [expandedImage, setExpandedImage] = useState<MarkdownImage | null>(null);
	const { contentWithoutImages, images } = useMemo(() => extractMarkdownImages(content), [content]);
	return (
		<div className="markdown-content copilot-markdown-content">
			<Markdown
				content={contentWithoutImages}
				components={{
					img: ({ src, alt }) => <SafeMarkdownImage src={typeof src === "string" ? src : undefined} alt={alt ?? "Travel image"} />,
				}}
			/>
			{images.length > 0 ? <ImageGallery images={images} onImageClick={setExpandedImage} /> : null}
			{expandedImage ? <ImageModal image={expandedImage} onClose={() => setExpandedImage(null)} /> : null}
		</div>
	);
}

interface MarkdownImage {
	src: string;
	alt: string;
}

function ImageGallery({ images, onImageClick }: { images: MarkdownImage[]; onImageClick: (image: MarkdownImage) => void }) {
	return (
		<div className="assistant-image-gallery" aria-label="Travel images">
			{images.map((image) => (
				<button type="button" key={`${image.src}-${image.alt}`} onClick={() => onImageClick(image)}>
					<img src={image.src} alt={image.alt} loading="lazy" />
				</button>
			))}
		</div>
	);
}

function ImageModal({ image, onClose }: { image: MarkdownImage; onClose: () => void }) {
	return (
		<div className="image-modal-backdrop" role="dialog" aria-modal="true" aria-label={image.alt}>
			<div className="image-modal">
				<button type="button" className="image-modal-close" onClick={onClose}>Close</button>
				<img src={image.src} alt={image.alt} />
			</div>
		</div>
	);
}

function extractMarkdownImages(content: string): { contentWithoutImages: string; images: MarkdownImage[] } {
	const images: MarkdownImage[] = [];
	const contentWithoutImages = content.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (_match, alt: string, src: string) => {
		images.push({ alt: alt || "Travel image", src });
		return "";
	});
	return { contentWithoutImages, images };
}

function SafeMarkdownImage({ src, alt }: { src?: string; alt?: ReactNode }) {
	if (!src) return null;
	return (
		<span className="markdown-safe-image-wrap">
			<img
				alt={typeof alt === "string" ? alt : "Travel image"}
				className="markdown-safe-image"
				onError={(event) => {
					const image = event.currentTarget;
					image.style.display = "none";
					const fallback = image.nextElementSibling;
					if (fallback instanceof HTMLElement) fallback.style.display = "block";
				}}
				src={src}
			/>
			<span className="image-fallback" style={{ display: "none" }}>Image unavailable</span>
		</span>
	);
}
