import { Markdown } from "@copilotkit/react-ui";
import type { FormEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { FillerContent, ValidatedImage } from "./api.js";
import { assistantMarkdownRehypePlugins } from "./render-safety.js";

const ImageEvidenceContext = createContext<ValidatedImage[]>([]);

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export type RunStatus = "idle" | "starting" | "sending" | "saving";

interface TravelCopilotChatProps {
	messages: ChatMessage[];
	approvedImages: ValidatedImage[];
	draft: string;
	onDraftChange: (draft: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onNewSession: () => void;
	onRetry?: () => void;
	onStop: () => void;
	error: string | null;
	progressMessage: string | null;
	/** Live tool-narration lines for the in-flight run (ADR 0003). */
	narration: string[];
	/** Assistant text streamed so far for the in-flight run. */
	streamingText: string;
	/** Static wait-filler content to keep the user engaged during the wait. */
	filler: FillerContent | null;
	sessionReady: boolean;
	runStatus: RunStatus;
}

export function TravelCopilotChat({
	messages,
    approvedImages,
	draft,
	onDraftChange,
	onSubmit,
	onNewSession,
	onRetry,
	onStop,
	error,
	progressMessage,
	narration,
	streamingText,
	filler,
	sessionReady,
	runStatus,
}: TravelCopilotChatProps) {
	const disabled = !sessionReady || runStatus !== "idle";
	const messageList = useRef<HTMLDivElement>(null);
	const following = useRef(true);
	useEffect(() => {
		const list = messageList.current;
		if (list && (following.current || messages.at(-1)?.role === "user")) list.scrollTop = list.scrollHeight;
	}, [messages, streamingText, narration]);
	return (
        <ImageEvidenceContext.Provider value={approvedImages}>
		<section className="chat-column copilot-rest-chat" aria-label="Travel chat">
			<header className="app-header">
				<div>
					<p className="eyebrow">Wander</p>
					<h1>Plan your next trip.</h1>
					<p className="copilot-shell-label">Discover places. Choose experiences. Make it yours.</p>
				</div>
				<button type="button" className="secondary-button" onClick={onNewSession} disabled={runStatus !== "idle"}>
					New trip
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

			<div className="messages copilot-messages" aria-live="polite" ref={messageList} onScroll={(event) => {
				const list = event.currentTarget;
				following.current = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
			}}>
				{messages.length === 0 && runStatus !== "sending" ? (
					<div className="empty-state copilot-empty-state">
						<h2>Where are we going?</h2>
						<p>
							Start with dates, origin, budget, interests, or a rough destination. Your choices and itinerary appear in My plan.
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
							<RunProgress narration={narration} streamingText={streamingText} filler={filler} />
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
                {runStatus === "sending" ? <button type="button" onClick={onStop}>Stop</button> : <button type="submit" disabled={disabled || !draft.trim()}>
					Send
				</button>}
			</form>
		</section>
        </ImageEvidenceContext.Provider>
	);
}

/**
 * Live progress for an in-flight run: streamed assistant text plus a running
 * list of tool-narration lines. This is the anti-"is it stuck?" surface — the
 * user always sees motion during the long tool-heavy middle (ADR 0003).
 */
function RunProgress({ narration, streamingText, filler }: { narration: string[]; streamingText: string; filler: FillerContent | null }) {
	return (
		<article className="message assistant pending copilot-message">
			<strong>Travel agent</strong>
			{streamingText ? <CopilotMarkdown content={streamingText} /> : null}
			{narration.length > 0 ? (
				<ul className="narration-list" aria-live="polite" aria-label="Progress">
					{narration.map((line, index) => {
						const isLast = index === narration.length - 1;
						return (
							<li className={isLast ? "narration-step active" : "narration-step done"} key={`${index}-${line}`}>
								{isLast ? (
									<span className="spinner" aria-hidden="true" />
								) : (
									<span className="narration-check" aria-hidden="true">✓</span>
								)}
								<span>{line}</span>
							</li>
						);
					})}
				</ul>
			) : streamingText ? null : (
				<p>
					<span className="typing-dot" /> Working on your request…
				</p>
			)}
			{filler && filler.tips.length > 0 ? (
				<aside className="wait-filler">
					<p className="wait-filler-headline">{filler.headline}</p>
					<ul className="wait-filler-tips">
						{filler.tips.slice(0, 3).map((tip) => (
							<li key={tip}>{tip}</li>
						))}
					</ul>
				</aside>
			) : null}
		</article>
	);
}

function CopilotMarkdown({ content }: { content: string }) {
	const [expandedImage, setExpandedImage] = useState<MarkdownImage | null>(null);
    const evidence = useContext(ImageEvidenceContext);
    const { contentWithoutImages, images: candidates } = useMemo(() => extractMarkdownImages(content), [content]);
    const images = candidates.filter((image) => evidence.some((item) => item.validationStatus === "valid" && /^https:\/\//i.test(item.finalUrl) && (item.url === image.src || item.finalUrl === image.src)));
    const approved = images.map((image) => ({ ...image, src: evidence.find((item) => item.url === image.src || item.finalUrl === image.src)!.finalUrl }));
	return (
		<div className="markdown-content copilot-markdown-content">
			<Markdown
				content={contentWithoutImages}
				rehypePlugins={assistantMarkdownRehypePlugins}
				components={{
					img: ({ src, alt }) => <SafeMarkdownImage src={typeof src === "string" ? src : undefined} alt={alt ?? "Travel image"} />,
				}}
			/>
			{images.length > 0 ? <ImageGallery images={approved} onImageClick={setExpandedImage} /> : null}
			{expandedImage ? <ImageModal image={expandedImage} onClose={() => setExpandedImage(null)} /> : null}
		</div>
	);
}

interface MarkdownImage {
	src: string;
	alt: string;
}

function ImageGallery({ images, onImageClick }: { images: MarkdownImage[]; onImageClick: (image: MarkdownImage) => void }) {
    const evidence = useContext(ImageEvidenceContext);
	return (
		<div className="assistant-image-gallery" aria-label="Travel images">
			{images.map((image) => (
				<button type="button" key={`${image.src}-${image.alt}`} onClick={() => onImageClick(image)}>
					<img src={image.src} alt={image.alt} loading="lazy" /><span className="photo-credit">Photo via {evidence.find((item) => item.finalUrl === image.src)?.provider ?? "search"}</span>
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
    const evidence = useContext(ImageEvidenceContext);
	if (!src || !evidence.some((image) => image.validationStatus === "valid" && image.finalUrl === src && /^https:\/\//i.test(src))) return null;
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
