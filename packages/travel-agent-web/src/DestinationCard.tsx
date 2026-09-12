import { createContext, useContext, useId, useState } from "react";
import type { DestinationCardsBlock, PlannerAction } from "./api.js";
import { getRenderableDestinationImages } from "./render-safety.js";

export interface ActionFeedback { action: PlannerAction; status: "busy" | "done" | "error"; message: string }
export const PlannerActionContext = createContext<{ feedback: ActionFeedback | null; run: (action: PlannerAction) => void }>({ feedback: null, run: () => {} });

export function DestinationCard({ card, selected, disabled, onSelect }: {
	card: DestinationCardsBlock["data"]["cards"][number]; selected: boolean; disabled: boolean; onSelect: () => void;
}) {
	const { feedback, run } = useContext(PlannerActionContext);
	const [index, setIndex] = useState(0);
	const [reviewsOpen, setReviewsOpen] = useState(false);
	const [failedUrls, setFailedUrls] = useState<string[]>([]);
	const reviewId = useId();
	const images = getRenderableDestinationImages(card);
	const currentIndex = Math.min(index, Math.max(0, images.length - 1));
	const image = images[currentIndex];
	const localFeedback = feedback && feedback.action.type !== "activities" && feedback.action.destinationName === card.name ? feedback : null;
	const reviews = card.reviews;
	return <article className={selected ? "destination-card selected" : "destination-card"} aria-label={card.name}>
		<div className="card-header"><h4>{card.name}</h4>{selected ? <span>Selected</span> : null}</div>
		<p>{card.summary}</p>
		{card.whyItFits ? <small>Fit: {card.whyItFits}</small> : null}
		{card.tradeoff ? <small>Trade-off: {card.tradeoff}</small> : null}
		{card.seasonality ? <small>Season: {card.seasonality}</small> : null}
		{image ? <section className="destination-carousel" aria-label={`${card.name} photos`} aria-roledescription="carousel">
			<figure>{failedUrls.includes(image.finalUrl) ? <div className="image-placeholder">This photo is unavailable. Try the next photo.</div> : <img src={image.finalUrl} alt={`${card.name}, photo ${currentIndex + 1}`} onError={() => setFailedUrls((urls) => [...urls, image.finalUrl])} />}
				<figcaption><a href={/^https:\/\//i.test(image.source ?? "") ? image.source : image.finalUrl} target="_blank" rel="noreferrer">Photo source · {image.provider}</a></figcaption>
			</figure>
			<div className="carousel-controls"><button type="button" aria-label={`Previous photo of ${card.name}`} disabled={images.length < 2} onClick={() => setIndex((currentIndex + images.length - 1) % images.length)}>Previous</button><span aria-live="polite">{currentIndex + 1} / {images.length}</span><button type="button" aria-label={`Next photo of ${card.name}`} disabled={images.length < 2} onClick={() => setIndex((currentIndex + 1) % images.length)}>Next</button></div>
		</section> : <small>No photos yet. Select “See images” to find photos.</small>}
		<div className="card-actions">
			<button type="button" onClick={onSelect} disabled={disabled}>{selected ? "Remove" : "Select place"}</button>
			<button type="button" disabled={disabled} onClick={() => run({ type: "images", destinationName: card.name })}>{localFeedback?.status === "busy" && localFeedback.action.type === "images" ? "Finding photos…" : images.length ? "See more images" : "See images"}</button>
			<button type="button" aria-expanded={reviewsOpen} aria-controls={reviewId} onClick={() => { setReviewsOpen(!reviewsOpen); if (!reviewsOpen && !reviews?.researchedAt && !disabled) run({ type: "reviews", destinationName: card.name }); }}>Reviews {reviewsOpen ? "−" : "+"}</button>
		</div>
		{localFeedback?.action.type === "images" ? <p role="status" className="card-feedback">{localFeedback.status === "busy" ? <span className="spinner" /> : null}{localFeedback.message}</p> : null}
		{reviewsOpen ? <section id={reviewId} className="destination-reviews" aria-label={`${card.name} reviews`}>
			{localFeedback?.action.type === "reviews" ? <p role="status" className="card-feedback">{localFeedback.status === "busy" ? <span className="spinner" /> : null}{localFeedback.message}</p> : null}
			<div className="review-ratings">{(["google", "tripadvisor"] as const).map((provider) => {
				const rating = reviews?.providerRatings?.find((entry) => entry.provider === provider && Number.isFinite(entry.rating) && entry.rating >= 0 && entry.rating <= 5);
				return <div key={provider}><strong>{provider === "google" ? "Google" : "Tripadvisor"}</strong>{rating && /^https:\/\//i.test(rating.sourceUrl) ? <><div className="star-rating" aria-label={`${rating.rating} out of 5 stars`}><span className="rating-stars" aria-hidden="true">★★★★★<span style={{ width: `${rating.rating * 20}%` }}>★★★★★</span></span> {rating.rating.toFixed(1)} / 5</div><a href={rating.sourceUrl} target="_blank" rel="noreferrer">{rating.reviewCount !== undefined ? `${rating.reviewCount.toLocaleString()} reviews` : "View rating source"}</a></> : <small>Rating unavailable — not verified</small>}</div>;
			})}</div>
			{reviews?.reviewSummary ? <p>{reviews.reviewSummary}</p> : null}
			<div className="review-themes">{(["pros", "cons"] as const).map((kind) => <div key={kind}><h5>{kind === "pros" ? "Pros" : "Cons"}</h5>{reviews?.[kind]?.length ? <ul>{reviews[kind]?.map((text) => <li key={text}>{text}</li>)}</ul> : <p>No sourced {kind} available yet.</p>}</div>)}</div>
			{reviews?.sources?.length ? <p className="review-sources">Sources: {reviews.sources.filter((url) => /^https?:\/\//i.test(url)).map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer">Source {i + 1} </a>)}</p> : null}
			<button type="button" disabled={disabled} onClick={() => run({ type: "reviews", destinationName: card.name })}>{reviews?.researchedAt ? "Refresh reviews" : "Retry reviews"}</button>
		</section> : null}
	</article>;
}
