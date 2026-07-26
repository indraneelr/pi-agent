# Wander Travel Agent

The choice-first travel planner: an AI agent that guides a user through inspiration → places → activities → itinerary. This context covers the user-facing product and the canonical trip state the server owns.

## Language

### Planning model

**Destination**:
A country or broad region the user is heading to (e.g. "Greece", "Japan"). The outermost geographic choice.
_Avoid_: Location, region (as a synonym)

**Place**:
A specific city, island, or area *inside* a destination that the user can select (e.g. "Naxos", "Kyoto"). Places are what the user shortlists in Stage 2.
_Avoid_: Spot, location, stop

**Option**:
A single browsable candidate the agent presents for the user to consider — a place option or an activity option. Options are proposed; they are not yet part of the plan.
_Avoid_: Card (that's the UI rendering of an option), suggestion, choice

**Selection**:
An option the user has chosen. Selections live in the canonical trip state and drive downstream stages.
_Avoid_: Pick, chosen item

**Slot**:
The act of placing a selected place or activity into a specific day of the itinerary.
_Avoid_: Schedule, assign

**Itinerary**:
The day-by-day plan (morning/afternoon/evening blocks) assembled from slotted selections, plus budget.
_Avoid_: Plan (too broad), schedule

### Interaction model

**Canonical trip state**:
The single server-owned source of truth for one trip session — preferences, options presented, selections, and the itinerary. The UI is a view of it; the agent and instant actions both mutate it.
_Avoid_: Session data, trip document

**Instant action**:
A user action that mutates canonical trip state deterministically with **no LLM turn** — select, deselect, remove, slot-into-day, download. Feels instant.
_Avoid_: Quick action (reserve for the button UI), mutation

**Generate action**:
A user action that requires an agent run because content must be produced or reasoned about — more options, more images, reviews, activity research, itinerary draft, budget calculation, redo-after-preference-change.
_Avoid_: Agent action, LLM action
