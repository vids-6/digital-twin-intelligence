import httpx
from app.core.config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
from app.rag.knowledge import search

def investigate(question, machine, top_k=4):
    query = f"{question} Machine {machine['name']} telemetry temperature {machine['temperature']} C vibration {machine['vibration']} mm/s pressure {machine['pressure']} health {machine['health']} status {machine['status']}"
    hits = search(query, top_k)
    fact = f"Current simulated telemetry for {machine['name']} ({machine['id']}): temperature {machine['temperature']} °C; vibration {machine['vibration']} mm/s; pressure {machine['pressure']}; health {machine['health']}/100; status {machine['status']}."
    context = "\n\n".join(f"[{i+1}] {h['document_name']} | page {h['page'] or 'n/a'} | chunk {h['chunk_id']}\n{h['text']}" for i, h in enumerate(hits))
    if not hits or max(h['score'] for h in hits) < 0.05:
        evidence = "Retrieved documentation is weak or absent for this question. Do not infer a confirmed root cause; inspect the machine and add relevant maintenance records."
    else:
        evidence = "Retrieved evidence suggests the following documented considerations:\n" + "\n".join(f"- {h['document_name']} (page {h['page'] or 'n/a'}, chunk {h['chunk_id']}): {h['text'][:350]}" for h in hits[:3])
    llm_used = False
    answer = ''
    if LLM_API_KEY:
        prompt = f"You are a cautious maintenance investigator. Separate documented facts from hypotheses, recommend safe diagnostic actions, acknowledge uncertainty, and cite only provided source labels [1] etc. Do not invent citations.\nQUESTION: {question}\nTELEMETRY: {fact}\nRETRIEVED EVIDENCE:\n{context}"
        try:
            r = httpx.post(f'{LLM_BASE_URL}/chat/completions', headers={'Authorization': f'Bearer {LLM_API_KEY}'}, json={'model': LLM_MODEL, 'temperature': 0.2, 'messages': [{'role': 'system', 'content': 'Use only provided evidence for documented claims. Clearly label hypotheses.'}, {'role': 'user', 'content': prompt}]}, timeout=35)
            r.raise_for_status()
            answer = r.json()['choices'][0]['message']['content']
            llm_used = True
        except Exception as e:
            answer = 'LLM request failed; returning retrieval-only evidence report. Backend error: ' + str(e)[:180]
    if not llm_used:
        answer = ("RETRIEVAL-ONLY EVIDENCE REPORT (no LLM generation)\n\n" + fact + "\n\n" + evidence + "\n\nPlausible hypotheses (not confirmed): elevated vibration with rising temperature can be consistent with bearing wear, misalignment, looseness, or lubrication issues if supported by the retrieved maintenance guidance.\n\nRecommended checks: follow site lockout/tagout procedures before inspection; inspect mounting and alignment, check bearing lubrication and wear, verify sensor readings, and compare against the equipment manufacturer's limits. Stop operation and escalate if readings exceed approved safety thresholds.\n\nEvidence limitation: this report does not establish a definitive root cause; verify findings with a qualified technician.")
    return {'question': question, 'machine': machine['id'], 'answer': answer, 'mode': 'llm_generated' if llm_used else 'retrieval_only', 'llm_configured': bool(LLM_API_KEY), 'telemetry': {k: machine[k] for k in ('temperature', 'vibration', 'pressure', 'health', 'status')}, 'sources': [{'citation': f"[{i+1}]", 'document_name': h['document_name'], 'page': h['page'], 'chunk_id': h['chunk_id'], 'score': h['score'], 'excerpt': h['text'][:600]} for i, h in enumerate(hits)], 'evidence_sufficient': bool(hits and max(h['score'] for h in hits) >= 0.05)}
