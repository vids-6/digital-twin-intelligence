// Shapes mirror the FastAPI responses (see backend/app/main.py and the modules it calls).

export type MachineStatus = 'running' | 'warning' | 'critical' | 'paused';
export type Severity = 'warning' | 'critical';
export type FaultKind = 'high_vibration' | 'overheating' | 'pressure_drop' | 'bearing_wear';

export interface Machine {
  id: string;
  name: string;
  type: string;
  position: number; // 0-based stage in the line
  base_temp: number;
  base_vibration: number;
  base_pressure: number;
  power: number; // baseline kW
  temperature: number;
  vibration: number;
  pressure: number;
  power_kw: number;
  production_count: number;
  health: number;
  status: MachineStatus;
  fault: string | null;
  last_updated: string;
}

export interface Sample {
  timestamp: string;
  temperature: number;
  vibration: number;
  pressure: number;
  power_kw: number;
  production_count: number;
  health: number;
}

export interface Incident {
  id: string;
  machine_id: string;
  machine_name: string;
  severity: Severity;
  title: string;
  description: string;
  timestamp: string;
  status: string;
}

export interface Overview {
  factory_name: string;
  running: boolean;
  uptime_seconds: number;
  machine_count: number;
  running_count: number;
  warning_count: number;
  critical_count: number;
  average_health: number;
  production_count: number;
  active_incidents: number;
  incidents: Incident[];
  simulated: boolean;
  updated_at: string;
}

export interface SystemStatus {
  backend: string;
  vector_database: string;
  embedding_model: string;
  llm_configured: boolean;
  llm_model: string | null;
  documents_indexed: number;
  chunks_indexed: number;
  simulation_running: boolean;
  simulated_data: boolean;
}

export interface Doc {
  id: string;
  name: string;
  kind: string;
  created_at: string;
  chunks: number;
}

export interface Chunk {
  chunk_id: string;
  page: number | null;
  text: string;
}

export interface DocumentChunks {
  document: Doc;
  chunks: Chunk[];
}

export interface SearchHit {
  chunk_id: string;
  document_id: string;
  document_name: string;
  page: number | null;
  text: string;
  score: number;
}

export interface Dependencies {
  nodes: { id: string; name: string; health: number; status: MachineStatus; fault: string | null }[];
  edges: { source: string; target: string; label: string }[];
  propagation: { source: string; severity: Severity; incident_id: string }[];
}

export interface InvestigationSource {
  citation: string;
  document_name: string;
  page: number | null;
  chunk_id: string;
  score: number;
  excerpt: string;
}

export interface Investigation {
  question: string;
  machine: string;
  answer: string;
  mode: 'retrieval_only' | 'llm_generated';
  llm_configured: boolean;
  telemetry: { temperature: number; vibration: number; pressure: number; health: number; status: MachineStatus };
  sources: InvestigationSource[];
  evidence_sufficient: boolean;
}

/** A stored report plus the context the browser captured when it was run. */
export interface CaseReport {
  key: string;
  ref: string; // RPT-001, numbered per browser session
  at: string; // ISO time the report finished
  machineName: string;
  topK: number;
  incidents: Incident[]; // active incidents for the machine at run time
  baseline: Pick<Machine, 'base_temp' | 'base_vibration' | 'base_pressure' | 'fault'>;
  result: Investigation;
}

export interface EvalSource {
  document_name: string;
  chunk_id: string;
  page: number | null;
  score: number;
}

export interface EvalQueryResult {
  id: string;
  query: string;
  description: string;
  retrieved: number;
  relevant_retrieved: number;
  precision_at_k: number;
  recall_at_k: number;
  reciprocal_rank: number;
  source_correctness: boolean;
  groundedness_proxy: number;
  sources: EvalSource[];
}

export interface EvalRun {
  k: number;
  dataset_size: number;
  metrics: {
    precision_at_k: number;
    recall_at_k: number;
    mean_reciprocal_rank: number;
    citation_source_correctness: number;
    groundedness_proxy: number;
  };
  results: EvalQueryResult[];
  note: string;
}

export interface EvalDatasetItem {
  id: string;
  query: string;
  relevant_terms: string[];
  description: string;
}

export interface EvalStoredRun {
  key: string;
  at: string;
  chunksIndexed: number | null;
  documentsIndexed: number | null;
  run: EvalRun;
}
