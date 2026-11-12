from pathlib import Path
import os
from dotenv import load_dotenv
# ChromaDB would otherwise try to send anonymous usage telemetry; keep this local demo fully offline-friendly.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
DATA = ROOT / "data"
SAMPLES = DATA / "sample_documents"
UPLOADS = DATA / "uploads"
CHROMA = DATA / "chroma"
for p in (DATA, SAMPLES, UPLOADS, CHROMA): p.mkdir(parents=True, exist_ok=True)
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
USE_SENTENCE_TRANSFORMERS = os.getenv("USE_SENTENCE_TRANSFORMERS", "true").lower() == "true"
# Browser origins allowed to call the API. Defaults cover the Vite dev server (5173) and `vite preview` (4173).
_DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()]
