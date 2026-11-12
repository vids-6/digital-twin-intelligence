# Digital Twin Intelligence

**Virtual factory monitoring and RAG-assisted incident investigation**

Digital Twin Intelligence is an academic full-stack prototype that simulates an industrial production line. It combines machine telemetry, fault simulation, and a retrieval-augmented generation (RAG) investigator to help explore potential equipment issues using maintenance documents.

> **Demo only:** All machine readings, faults, and production metrics are simulated. No real factory equipment is connected.

## What it does

- Simulates five connected factory machines and updates their telemetry every two seconds.
- Displays machine health, temperature, vibration, pressure, power, and incidents in a React dashboard.
- Lets users inject faults such as overheating, bearing wear, and pressure drops.
- Uploads and searches PDF or TXT maintenance documents.
- Investigates incidents by combining simulated telemetry with retrieved document passages and citations.
- Supports an optional OpenAI-compatible LLM; the investigator also works in retrieval-only mode.
- Includes a small retrieval evaluation demo.

## Tech stack

**Frontend:** React, TypeScript, Vite, Tailwind CSS  
**Backend:** Python, FastAPI, Pydantic, SQLite  
**Retrieval:** ChromaDB, sentence-transformers (or offline hashing fallback), PyMuPDF  
**Testing:** pytest

## Run locally

Requires Python 3.12 and Node.js 20+.

**Backend** — from the project root:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend** — in a second terminal, from the project root:

```bash
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173**. The backend API documentation is available at **http://127.0.0.1:8000/docs**.

For a lightweight offline retrieval mode, set `USE_SENTENCE_TRANSFORMERS=false` in `backend/.env` before starting the backend. Optional LLM settings are `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`. Never commit your `.env` file.

## Current scope

This is a **simulation and research prototype**, not a deployed industrial monitoring or predictive-maintenance system. It uses five fictional maintenance documents, a fixed factory layout, and a small demonstration evaluation set. It does not connect to physical sensors or perform validated equipment failure prediction.

## Project context

Academic team project exploring industrial digital twins, machine monitoring, and document-grounded incident investigation.
