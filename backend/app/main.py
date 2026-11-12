from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import shutil, uuid, threading, time
from app.core.config import UPLOADS, LLM_API_KEY, LLM_MODEL, CORS_ORIGINS
from app.simulation.engine import engine
from app.rag.knowledge import ensure_samples, ingest_file, list_documents, delete_document, get_document_chunks, search, status as knowledge_status
from app.rag.investigator import investigate
from app.evaluation.metrics import DATASET, run_evaluation
from app.models.schemas import TriggerRequest, InvestigateRequest, SearchRequest
app=FastAPI(title='Digital Twin Intelligence API',version='1.0.0',description='Simulated factory, maintenance RAG and evaluation API')
app.add_middleware(CORSMiddleware,allow_origins=CORS_ORIGINS,allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
@app.on_event('startup')
def startup():
 ensure_samples()
 def loop():
  while True: time.sleep(2); engine.tick_once()
 threading.Thread(target=loop,daemon=True).start()
@app.get('/api/health')
def health(): return {'status':'ok','service':'digital-twin-intelligence','simulated_data':True}
@app.get('/api/factory/overview')
def overview(): return engine.overview()
@app.get('/api/machines')
def machines(): return engine.machines_list()
@app.get('/api/machines/{machine_id}')
def machine(machine_id:str):
 try:return engine.get_machine(machine_id)
 except KeyError:raise HTTPException(404,'Machine not found')
@app.get('/api/machines/{machine_id}/telemetry')
def telemetry(machine_id:str):
 try:return engine.telemetry(machine_id)
 except KeyError:raise HTTPException(404,'Machine not found')
@app.get('/api/incidents')
def incidents():return engine.get_incidents()
@app.post('/api/simulation/start')
def start():return engine.start()
@app.post('/api/simulation/pause')
def pause():return engine.pause()
@app.post('/api/simulation/trigger')
def trigger(req:TriggerRequest):
 try:return engine.trigger(req.machine_id,req.fault)
 except KeyError:raise HTTPException(404,'Machine not found')
@app.post('/api/simulation/reset')
def reset():return engine.reset()
@app.post('/api/machines/{machine_id}/reset')
def reset_machine(machine_id:str):
 try:return engine.reset_machine(machine_id)
 except KeyError:raise HTTPException(404,'Machine not found')
@app.post('/api/investigate')
def investigation(req:InvestigateRequest):
 try:m=engine.get_machine(req.machine_id or 'M-01')
 except KeyError:raise HTTPException(404,'Machine not found')
 return investigate(req.question,m,req.top_k)
@app.get('/api/documents')
def documents():return list_documents()
@app.get('/api/documents/{document_id}/chunks')
def document_chunks(document_id:str):
 found=get_document_chunks(document_id)
 if not found:raise HTTPException(404,'Document not found')
 return found
@app.post('/api/documents/upload')
def upload(file:UploadFile=File(...)):
 suffix=Path(file.filename or '').suffix.lower()
 if suffix not in ('.txt','.pdf'):raise HTTPException(400,'Only PDF and TXT files are supported')
 safe=Path(file.filename or 'document'+suffix).name; docid=uuid.uuid4().hex[:16]; dest=UPLOADS/f'{docid}_{safe}'
 try:
  with dest.open('wb') as out:shutil.copyfileobj(file.file,out)
  ingest_file(dest,docid); return {'status':'indexed','document_id':docid,'filename':safe,'documents':list_documents()}
 except Exception as e:
  dest.unlink(missing_ok=True); raise HTTPException(500,f'Could not index document: {str(e)[:250]}')
@app.delete('/api/documents/{document_id}')
def remove_document(document_id:str):
 if not delete_document(document_id):raise HTTPException(404,'Document not found')
 return {'status':'deleted','document_id':document_id}
@app.post('/api/knowledge/search')
def knowledge_search(req:SearchRequest):return {'query':req.query,'results':search(req.query,req.top_k)}
@app.get('/api/dependencies')
def dependencies():
 ms=engine.machines_list(); return {'nodes':[{'id':m['id'],'name':m['name'],'health':m['health'],'status':m['status'],'fault':m['fault']} for m in ms],'edges':[{'source':f'M-0{i}','target':f'M-0{i+1}','label':'feeds'} for i in range(1,5)],'propagation':[{'source':i['machine_id'],'severity':i['severity'],'incident_id':i['id']} for i in engine.get_incidents() if i['status']=='active']}
@app.get('/api/evaluation/dataset')
def dataset():return {'dataset':DATASET,'count':len(DATASET)}
@app.post('/api/evaluation/run')
def evaluation():return run_evaluation()
@app.get('/api/system/status')
def system_status():
 ks=knowledge_status(); return {'backend':'online','vector_database':ks['vector_database'],'embedding_model':ks['embedding_model'],'llm_configured':bool(LLM_API_KEY),'llm_model':LLM_MODEL if LLM_API_KEY else None,'documents_indexed':ks['documents_indexed'],'chunks_indexed':ks['chunks_indexed'],'simulation_running':engine.running,'simulated_data':True}
