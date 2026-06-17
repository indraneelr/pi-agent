import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "@copilotkit/react-ui/styles.css";
import "./styles.css";

window.addEventListener("error", (event) => {
	console.error("[travel-agent-web] Unhandled UI error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
	console.error("[travel-agent-web] Unhandled promise rejection", event.reason);
});

const root = document.getElementById("root");

if (!root) {
	throw new Error("Missing #root element");
}

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
