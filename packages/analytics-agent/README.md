# Analytics Agent

Interactive data analysis agent powered by LLMs and pandas. Built on [pi-agent-core](../agent) and [pi-ai](../ai).

Load CSV/Excel/JSON/PDF files, run pandas queries, compute statistics, and get AI-powered insights — all from your terminal.

## Prerequisites

- **Node.js** >= 20
- **Python 3** >= 3.10
- An API key for at least one LLM provider (Anthropic, OpenAI, Google, etc.)

## Setup (one-time)

All commands below assume you start from the **monorepo root** (`pi-mono/`).

### Step 1: Install Node dependencies

```bash
# From the monorepo root: pi-mono/
npm install
npm run build
```

### Step 2: Create a Python virtual environment

```bash
# From the monorepo root: pi-mono/
cd packages/analytics-agent
python3 -m venv .venv
```

### Step 3: Install Python packages

```bash
# Still in: pi-mono/packages/analytics-agent/
.venv/bin/pip install pandas numpy openpyxl pdfplumber python-docx
```

### Step 4: Set your API key

Add one of these to your shell profile (`~/.zshrc`, `~/.bashrc`) or export in your terminal:

```bash
# Pick one provider:
export ANTHROPIC_API_KEY=sk-ant-...    # Anthropic (Claude)
export OPENAI_API_KEY=sk-...           # OpenAI (GPT-4o)
export GEMINI_API_KEY=...              # Google (Gemini)
```

The agent auto-detects which provider to use based on which key is set.

## Running the Agent

```bash
# From: pi-mono/packages/analytics-agent/
./run.sh
```

That's it. The agent starts, detects your API key, launches the Python runtime, and opens the interactive TUI.

### Other ways to run

```bash
# Explicit provider and model:
./run.sh --provider anthropic --model claude-sonnet-4-20250514

# Custom Python path (if not using the .venv created above):
./run.sh --python /usr/local/bin/python3

# Show all options:
./run.sh --help
```

## Usage

Once started, you'll see the interactive TUI. Type your analysis request and press Enter.

### Example Session

```
You: Load examples/sales_2024.csv and give me a summary

⚙ load_data examples/sales_2024.csv
  ✓ done
⚙ describe_data sales_2024
  ✓ done

Here's a summary of the sales data:

**Dataset**: 48 rows × 7 columns

**Key findings:**
- Revenue ranges from $9,000 to $90,000 per transaction
- 3 product categories: Laptop, Phone, Tablet
- 4 regions: North, South, East, West
- 3 customer types: Enterprise, SMB, Consumer
- 1 missing value in the revenue column (July Phone/East)

**Revenue by product:**
- Laptop: $1,117,500 (highest)
- Phone: $576,000
- Tablet: $283,500
```

```
You: What are the monthly revenue trends? Which months performed best?

⚙ query_data sales_2024['month'] = pd.to_datetime(sales_2024['date']).dt.month...
  ✓ done

**Monthly Revenue Trends:**

| Month | Revenue    |
|-------|-----------|
| Jan   | $97,500   |
| Feb   | $120,000  |
| ...   |           |
| Dec   | $201,000  |

**Best performing months:** October ($199,500), December ($201,000), November ($141,000)
**Growth:** Revenue grew ~106% from January to December, showing strong year-over-year growth.
```

### Commands

| Command     | Description                        |
|------------|-------------------------------------|
| `/datasets` | List all loaded datasets with schema |
| `/help`     | Show help and tips                  |
| `/quit`     | Exit the agent                      |

### Keyboard Shortcuts

| Key           | Action                              |
|--------------|--------------------------------------|
| Enter         | Submit message                      |
| Shift+Enter   | New line (multi-line input)         |
| Ctrl+C        | Cancel running request              |
| Ctrl+C twice  | Quit                                |

## What The Agent Can Do

### Data Loading
- **CSV, TSV** — `load_data` with auto-delimiter detection
- **Excel** (XLS, XLSX) — with sheet selection
- **JSON, Parquet** — structured data formats
- **PDF** — `read_document` extracts text from PDFs (with page selection)
- **Word** (DOCX) — `read_document` extracts text from Word documents
- **Text files** — via the `read` tool

### Analysis
- **Statistical summaries** — `describe_data` gives shape, types, stats, nulls, correlations
- **Pandas queries** — `query_data` runs arbitrary Python/pandas code
- **Grouping, filtering, pivoting** — any pandas operation
- **Joins** — merge multiple datasets
- **Missing data analysis** — null detection and handling

### Document Analysis
- **PDF reports** — extract text, summarize, find key numbers
- **Word documents** — read contracts, proposals, reports
- **Page selection** — read specific pages from large PDFs (e.g., "pages 1-5")

### File Operations
- **grep** — search through text/log files
- **find** — discover files by pattern
- **ls** — list directory contents
- **write** — save reports, transformed data
- **bash** — run shell commands

## Architecture

```
┌─────────────────────────────────────────────┐
│ Interactive TUI (src/modes/interactive.ts)  │
│  Editor, Markdown renderer, Tool display    │
├─────────────────────────────────────────────┤
│ Agent Session (src/core/sdk.ts)             │
│  Agent loop, tool execution, streaming      │
├─────────────────────────────────────────────┤
│ Analytics Tools                              │
│  load_data │ describe_data │ query_data     │
├─────────────────────────────────────────────┤
│ Python Runtime (src/python/runtime.py)      │
│  Persistent subprocess, DataFrame registry  │
│  pandas, numpy, openpyxl                    │
├─────────────────────────────────────────────┤
│ pi-agent-core    │    pi-ai    │   pi-tui   │
│ (agent loop)     │  (LLM API)  │   (TUI)    │
└─────────────────────────────────────────────┘
```

## SDK Usage

Use the analytics agent programmatically:

```typescript
import { createAnalyticsSession } from "@mariozechner/pi-analytics-agent";
import { getModel } from "@mariozechner/pi-ai";

const session = await createAnalyticsSession({
  model: getModel("anthropic", "claude-sonnet-4-20250514"),
  apiKey: process.env.ANTHROPIC_API_KEY,
  pythonOptions: { pythonPath: ".venv/bin/python3" },
});

// Subscribe to streaming events
session.agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

// Send a prompt
await session.agent.prompt("Load data.csv and find the top 10 customers by revenue");

// Clean up
await session.shutdown();
```

## CLI Options

```
analytics-agent [options]

Options:
  --provider, -p <name>   LLM provider (anthropic, openai, google, etc.)
  --model, -m <id>        Model ID
  --python <path>         Path to Python 3 with pandas
  --help, -h              Show help

Environment Variables:
  ANTHROPIC_API_KEY        Anthropic
  OPENAI_API_KEY           OpenAI
  GEMINI_API_KEY           Google Gemini
  GROQ_API_KEY             Groq
  XAI_API_KEY              xAI
  OPENROUTER_API_KEY       OpenRouter
  ANALYTICS_PYTHON_PATH    Default Python path
```

## Troubleshooting

**"No LLM provider detected"**
You haven't set an API key. Run `export ANTHROPIC_API_KEY=sk-ant-...` (or another provider) in your terminal.

**"Python runtime exited with code 1"**
Pandas is not installed in the Python environment. Make sure you ran:
```bash
cd packages/analytics-agent
.venv/bin/pip install pandas numpy openpyxl pdfplumber python-docx
```

**"Failed to start Python runtime"**
The `.venv` doesn't exist or the Python path is wrong. Recreate it:
```bash
cd packages/analytics-agent
python3 -m venv .venv
.venv/bin/pip install pandas numpy openpyxl pdfplumber python-docx
```

**"Failed to resolve entry for package"** (when running tests)
The monorepo packages need to be built first:
```bash
# From pi-mono/ root:
npm run build
```

## Development

```bash
# All commands from: pi-mono/packages/analytics-agent/

# Run tests (25 tests across 4 files)
npx vitest --run

# Run the agent from source
./run.sh

# Build (for npm packaging)
npm run build
```

## Roadmap

- [x] Phase 1: Python runtime + load_data + describe_data + query_data
- [x] Phase 2 (partial): `read_document` tool (PDF/DOCX text extraction)
- [x] Phase 4: Interactive TUI mode
- [ ] Phase 2: `visualize` tool (matplotlib/seaborn charts rendered inline)
- [ ] Phase 3: Analytics-aware compaction (dataset tracking instead of file tracking)
- [ ] Phase 5: Extension system for domain-specific analysis plugins

## License

MIT
