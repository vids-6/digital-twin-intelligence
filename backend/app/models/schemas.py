from pydantic import BaseModel, Field
from typing import Optional, Any
class TriggerRequest(BaseModel): machine_id: str = "M-01"; fault: str = "high_vibration"
class InvestigateRequest(BaseModel): question: str = "Why is the conveyor vibrating excessively and overheating?"; machine_id: Optional[str] = "M-01"; top_k: int = Field(default=4, ge=1, le=10)
class SearchRequest(BaseModel): query: str; top_k: int = Field(default=5, ge=1, le=20)
class EvaluationResult(BaseModel): metrics: dict[str, float]; queries: list[dict[str, Any]]
