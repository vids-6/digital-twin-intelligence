from fastapi.testclient import TestClient
from app.main import app
client=TestClient(app)
def test_health():
 r=client.get('/api/health'); assert r.status_code==200 and r.json()['status']=='ok'
def test_factory_has_five_machines():
 r=client.get('/api/machines'); assert r.status_code==200 and len(r.json())==5
 assert [m['id'] for m in r.json()]==['M-01','M-02','M-03','M-04','M-05']
def test_dependencies_chain():
 d=client.get('/api/dependencies').json(); assert len(d['nodes'])==5 and len(d['edges'])==4
def test_investigate_has_mode_and_sources():
 r=client.post('/api/investigate',json={'question':'conveyor vibration','machine_id':'M-01','top_k':2}); assert r.status_code==200
 assert r.json()['mode'] in ('retrieval_only','llm_generated') and 'sources' in r.json()
def test_reset():
 client.post('/api/simulation/trigger',json={'machine_id':'M-01','fault':'high_vibration'})
 r=client.post('/api/machines/M-01/reset'); assert r.status_code==200 and r.json()['health']==100

# --- Added during the redesign -------------------------------------------------
from app.rag.knowledge import ensure_samples
from app.simulation.engine import engine


def test_document_chunks_returns_ordered_chunks():
 ensure_samples()
 docs=client.get('/api/documents').json(); assert docs, 'sample documents should be indexed'
 r=client.get(f"/api/documents/{docs[0]['id']}/chunks"); assert r.status_code==200
 body=r.json(); assert body['document']['id']==docs[0]['id'] and len(body['chunks'])==docs[0]['chunks']
 assert all({'chunk_id','page','text'}<=set(c) for c in body['chunks'])
 assert [c['chunk_id'] for c in body['chunks']]==sorted(c['chunk_id'] for c in body['chunks'])


def test_document_chunks_unknown_is_404():
 assert client.get('/api/documents/does-not-exist/chunks').status_code==404


def test_critical_fault_status_is_critical():
 client.post('/api/simulation/reset')
 client.post('/api/simulation/trigger',json={'machine_id':'M-02','fault':'overheating'})
 engine.tick_once()
 assert client.get('/api/machines/M-02').json()['status']=='critical'
 client.post('/api/simulation/reset')


def test_pressure_drop_is_a_warning_until_health_degrades():
 client.post('/api/simulation/reset')
 inc=client.post('/api/simulation/trigger',json={'machine_id':'M-03','fault':'pressure_drop'}).json()
 assert inc['severity']=='warning'
 engine.tick_once()
 m=client.get('/api/machines/M-03').json()
 assert m['status']=='warning' and m['fault']=='pressure_drop'
 client.post('/api/simulation/reset')


def test_cors_allows_vite_preview_origin():
 r=client.options('/api/health',headers={'Origin':'http://127.0.0.1:4173','Access-Control-Request-Method':'GET'})
 assert r.headers.get('access-control-allow-origin')=='http://127.0.0.1:4173'


def test_uploaded_document_keeps_its_original_name():
 r=client.post('/api/documents/upload',files={'file':('press_manual.txt',b'HYDRAULIC PRESSURE LOSS may indicate seal wear or a leaking fitting.','text/plain')})
 assert r.status_code==200
 try:
  assert r.json()['filename']=='press_manual.txt'
  mine=[d for d in client.get('/api/documents').json() if d['id']==r.json()['document_id']]
  assert mine and mine[0]['name']=='press_manual.txt'
  hits=client.post('/api/knowledge/search',json={'query':'hydraulic seal wear','top_k':3}).json()['results']
  assert hits[0]['document_name']=='press_manual.txt'
 finally:
  client.delete('/api/documents/'+r.json()['document_id'])


def test_upload_rejects_unsupported_type():
 r=client.post('/api/documents/upload',files={'file':('image.png',b'x','image/png')})
 assert r.status_code==400
