"""
Analytics Agent Python Runtime

Persistent subprocess that holds pandas DataFrames in memory.
Communicates with the Node.js host via JSON-over-stdin/stdout.

Protocol:
  -> {"id": "...", "type": "load", "path": "...", "name": "...", ...}
  <- {"id": "...", "ok": true, "schema": [...], "shape": [...], ...}

  -> {"id": "...", "type": "exec", "code": "..."}
  <- {"id": "...", "ok": true, "stdout": "...", "result": "...", ...}

  -> {"id": "...", "type": "describe", "name": "..."}
  <- {"id": "...", "ok": true, "summary": "...", ...}

  -> {"id": "...", "type": "plot", "code": "...", "filename": "..."}
  <- {"id": "...", "ok": true, "image": "base64...", "path": "..."}

  -> {"id": "...", "type": "list"}
  <- {"id": "...", "ok": true, "datasets": [...]}

  -> {"id": "...", "type": "ping"}
  <- {"id": "...", "ok": true}

  -> {"id": "...", "type": "shutdown"}
  <- (process exits)
"""

import sys
import json
import io
import os
import base64
import traceback
import tempfile
from pathlib import Path

import pandas as pd
import numpy as np

# DataFrame registry: name -> DataFrame
_datasets: dict[str, pd.DataFrame] = {}


def _send(response: dict) -> None:
    """Send a JSON response to stdout, followed by a newline."""
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


def _error(request_id: str, message: str) -> None:
    _send({"id": request_id, "ok": False, "error": message})


def _handle_load(msg: dict) -> dict:
    """Load a data file into a named DataFrame."""
    path = msg["path"]
    name = msg.get("name") or Path(path).stem
    sheet = msg.get("sheet")
    encoding = msg.get("encoding", "utf-8")

    ext = Path(path).suffix.lower()

    if ext in (".csv", ".tsv"):
        sep = "\t" if ext == ".tsv" else ","
        df = pd.read_csv(path, sep=sep, encoding=encoding)
    elif ext in (".xls", ".xlsx", ".xlsm"):
        kwargs = {}
        if sheet:
            kwargs["sheet_name"] = sheet
        df = pd.read_excel(path, **kwargs)
    elif ext == ".json":
        df = pd.read_json(path, encoding=encoding)
    elif ext == ".parquet":
        df = pd.read_parquet(path)
    else:
        return {"ok": False, "error": f"Unsupported file format: {ext}"}

    _datasets[name] = df

    # Build schema info
    schema = []
    for col in df.columns:
        schema.append({
            "name": str(col),
            "dtype": str(df[col].dtype),
            "nulls": int(df[col].isna().sum()),
            "unique": int(df[col].nunique()),
        })

    # Sample rows as string table
    sample = df.head(5).to_string(index=False, max_colwidth=50)

    # Memory usage
    mem_bytes = df.memory_usage(deep=True).sum()
    if mem_bytes < 1024 * 1024:
        memory = f"{mem_bytes / 1024:.1f} KB"
    else:
        memory = f"{mem_bytes / (1024 * 1024):.1f} MB"

    return {
        "ok": True,
        "name": name,
        "schema": schema,
        "shape": [df.shape[0], df.shape[1]],
        "sample": sample,
        "memory": memory,
    }


def _handle_describe(msg: dict) -> dict:
    """Return statistical summary of a named DataFrame."""
    name = msg["name"]
    columns = msg.get("columns")

    if name not in _datasets:
        return {"ok": False, "error": f"Dataset '{name}' not found. Loaded: {list(_datasets.keys())}"}

    df = _datasets[name]
    if columns:
        missing = [c for c in columns if c not in df.columns]
        if missing:
            return {"ok": False, "error": f"Columns not found: {missing}. Available: {list(df.columns)}"}
        df = df[columns]

    # Statistical summary
    buf = io.StringIO()
    buf.write("=== Shape ===\n")
    buf.write(f"{df.shape[0]} rows × {df.shape[1]} columns\n\n")

    buf.write("=== Data Types ===\n")
    buf.write(df.dtypes.to_string())
    buf.write("\n\n")

    buf.write("=== Statistical Summary ===\n")
    buf.write(df.describe(include="all").to_string())
    buf.write("\n\n")

    buf.write("=== Null Counts ===\n")
    null_counts = df.isna().sum()
    null_pct = (df.isna().sum() / len(df) * 100).round(1)
    null_df = pd.DataFrame({"nulls": null_counts, "pct": null_pct})
    null_df = null_df[null_df["nulls"] > 0]
    if len(null_df) > 0:
        buf.write(null_df.to_string())
    else:
        buf.write("No null values")
    buf.write("\n\n")

    buf.write("=== Unique Value Counts ===\n")
    buf.write(df.nunique().to_string())
    buf.write("\n")

    # Correlations for numeric columns
    numeric_cols = df.select_dtypes(include=[np.number])
    correlations = None
    if len(numeric_cols.columns) >= 2:
        corr = numeric_cols.corr()
        correlations = corr.to_string()

    return {
        "ok": True,
        "summary": buf.getvalue(),
        "nulls": {str(k): int(v) for k, v in df.isna().sum().items() if v > 0},
        "correlations": correlations,
    }


def _handle_exec(msg: dict) -> dict:
    """Execute arbitrary Python/pandas code."""
    code = msg["code"]

    # Capture stdout
    old_stdout = sys.stdout
    captured = io.StringIO()
    sys.stdout = captured

    # Build execution namespace with all datasets + common imports
    namespace = {
        "pd": pd,
        "np": np,
        **_datasets,
    }

    result_repr = None
    result_type = None

    try:
        # Try exec first (for statements), then eval (for expressions)
        try:
            # Compile to detect if it's an expression
            compiled = compile(code, "<query>", "eval")
            result = eval(compiled, namespace)
        except SyntaxError:
            exec(code, namespace)
            result = None

        # Check if any new DataFrames were created and register them
        for key, value in namespace.items():
            if isinstance(value, pd.DataFrame) and key not in ("pd", "np") and not key.startswith("_"):
                _datasets[key] = value

        # Format result
        if result is not None:
            if isinstance(result, pd.DataFrame):
                result_repr = result.head(20).to_string(max_colwidth=60)
                result_type = "dataframe"
                if len(result) > 20:
                    result_repr += f"\n\n... ({len(result)} rows total, showing first 20)"
            elif isinstance(result, pd.Series):
                result_repr = result.head(20).to_string()
                result_type = "series"
                if len(result) > 20:
                    result_repr += f"\n\n... ({len(result)} items total, showing first 20)"
            else:
                result_repr = repr(result)
                result_type = type(result).__name__

    finally:
        sys.stdout = old_stdout

    stdout = captured.getvalue()

    return {
        "ok": True,
        "stdout": stdout,
        "result": result_repr,
        "result_type": result_type,
    }


def _handle_plot(msg: dict) -> dict:
    """Execute matplotlib/seaborn code and return the chart as base64."""
    try:
        import matplotlib
        matplotlib.use("Agg")  # Non-interactive backend
        import matplotlib.pyplot as plt
    except ImportError:
        return {"ok": False, "error": "matplotlib is not installed. Run: pip install matplotlib"}

    code = msg["code"]
    filename = msg.get("filename")

    # Build namespace
    namespace = {
        "pd": pd,
        "np": np,
        "plt": plt,
        **_datasets,
    }

    try:
        import seaborn as sns
        namespace["sns"] = sns
    except ImportError:
        pass

    # Close any existing figures
    plt.close("all")

    exec(code, namespace)

    # Save to temp file or specified path
    if filename:
        save_path = filename
    else:
        fd, save_path = tempfile.mkstemp(suffix=".png", prefix="analytics-chart-")
        os.close(fd)

    plt.savefig(save_path, dpi=150, bbox_inches="tight")

    # Read as base64
    with open(save_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("ascii")

    plt.close("all")

    return {
        "ok": True,
        "image": image_b64,
        "path": save_path,
    }


def _handle_list(msg: dict) -> dict:
    """List all loaded datasets."""
    datasets = []
    for name, df in _datasets.items():
        mem = int(df.memory_usage(deep=True).sum())
        datasets.append({
            "name": name,
            "shape": [int(df.shape[0]), int(df.shape[1])],
            "columns": [str(c) for c in df.columns[:20]],
            "memory_bytes": mem,
        })
    return {"ok": True, "datasets": datasets}


def _handle_read_document(msg: dict) -> dict:
    """Extract text from PDF, DOCX, or plain text files."""
    path = msg["path"]
    pages_spec = msg.get("pages")  # e.g. "1-5" or "3" or "1,3,5"
    ext = Path(path).suffix.lower()

    if ext == ".pdf":
        try:
            import pdfplumber
        except ImportError:
            return {"ok": False, "error": "pdfplumber is not installed. Run: pip install pdfplumber"}

        with pdfplumber.open(path) as pdf:
            total_pages = len(pdf.pages)
            page_indices = _parse_page_spec(pages_spec, total_pages)

            text_parts = []
            for i in page_indices:
                page = pdf.pages[i]
                page_text = page.extract_text() or ""
                text_parts.append(f"--- Page {i + 1} ---\n{page_text}")

            text = "\n\n".join(text_parts)
            word_count = len(text.split())

            return {
                "ok": True,
                "text": text,
                "metadata": {
                    "format": "pdf",
                    "total_pages": total_pages,
                    "pages_read": len(page_indices),
                    "word_count": word_count,
                },
            }

    elif ext in (".docx",):
        try:
            import docx
        except ImportError:
            return {"ok": False, "error": "python-docx is not installed. Run: pip install python-docx"}

        doc = docx.Document(path)
        paragraphs = [p.text for p in doc.paragraphs]
        text = "\n".join(paragraphs)
        word_count = len(text.split())

        return {
            "ok": True,
            "text": text,
            "metadata": {
                "format": "docx",
                "paragraphs": len(paragraphs),
                "word_count": word_count,
            },
        }

    elif ext in (".txt", ".md", ".log", ".csv", ".tsv", ".json"):
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
        word_count = len(text.split())
        return {
            "ok": True,
            "text": text,
            "metadata": {
                "format": ext.lstrip("."),
                "word_count": word_count,
                "char_count": len(text),
            },
        }

    else:
        return {"ok": False, "error": f"Unsupported document format: {ext}. Supported: .pdf, .docx, .txt, .md, .log"}


def _parse_page_spec(spec: str | None, total: int) -> list[int]:
    """Parse a page specification like '1-5', '3', '1,3,5' into 0-indexed page indices."""
    if not spec:
        return list(range(total))

    indices = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            start_s, end_s = part.split("-", 1)
            start = max(1, int(start_s.strip()))
            end = min(total, int(end_s.strip()))
            for i in range(start - 1, end):
                indices.add(i)
        else:
            page = int(part) - 1  # convert to 0-indexed
            if 0 <= page < total:
                indices.add(page)

    return sorted(indices)


HANDLERS = {
    "load": _handle_load,
    "describe": _handle_describe,
    "exec": _handle_exec,
    "plot": _handle_plot,
    "list": _handle_list,
    "read_document": _handle_read_document,
}


def main() -> None:
    """Main event loop: read JSON commands from stdin, write responses to stdout."""
    # Signal readiness
    _send({"type": "ready"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            _send({"ok": False, "error": f"Invalid JSON: {e}"})
            continue

        request_id = msg.get("id", "")
        msg_type = msg.get("type", "")

        if msg_type == "ping":
            _send({"id": request_id, "ok": True})
            continue

        if msg_type == "shutdown":
            _send({"id": request_id, "ok": True})
            sys.exit(0)

        handler = HANDLERS.get(msg_type)
        if not handler:
            _error(request_id, f"Unknown command type: {msg_type}")
            continue

        try:
            result = handler(msg)
            result["id"] = request_id
            _send(result)
        except Exception:
            _error(request_id, traceback.format_exc())


if __name__ == "__main__":
    main()
