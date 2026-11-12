import hashlib, json, re, sqlite3
from pathlib import Path
from typing import Optional
from app.core.config import DATA, SAMPLES, UPLOADS, CHROMA, USE_SENTENCE_TRANSFORMERS
DB=DATA/'knowledge.sqlite3'
_embedder=None; _chroma=None; _collection=None; _embed_status='not initialized'; _vector_status='SQLite fallback'
def _connect():
 c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
 c.execute('CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
 c.execute('CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, document_id TEXT, document_name TEXT, page INTEGER, text TEXT, embedding TEXT)'); c.commit(); return c
def _embed(texts):
 global _embedder,_embed_status
 if USE_SENTENCE_TRANSFORMERS:
  try:
   if _embedder is None:
    from sentence_transformers import SentenceTransformer
    _embedder=SentenceTransformer('all-MiniLM-L6-v2'); _embed_status='Sentence Transformers: all-MiniLM-L6-v2'
   return _embedder.encode(texts,normalize_embeddings=True).tolist()
  except Exception as e: _embed_status='Local hash embedding fallback (model unavailable)'
 else: _embed_status='Local hash embedding fallback (configured)'
 # deterministic signed hashing vector, dependency-free fallback
 out=[]
 for text in texts:
  v=[0.0]*384
  for tok in re.findall(r'[a-z0-9]+',text.lower()):
   h=int(hashlib.sha256(tok.encode()).hexdigest()[:8],16); idx=h%384; v[idx]+=1 if (h>>8)&1 else -1
  norm=sum(x*x for x in v)**.5 or 1; out.append([x/norm for x in v])
 return out
def _init_chroma():
 global _chroma,_collection,_vector_status
 try:
  import chromadb
  _chroma=chromadb.PersistentClient(path=str(CHROMA)); _collection=_chroma.get_or_create_collection('maintenance_knowledge',metadata={'hnsw:space':'cosine'}); _vector_status='ChromaDB persistent vector store'
 except Exception: _vector_status='SQLite persistent vector fallback'
def _extract(path:Path):
 if path.suffix.lower()=='.pdf':
  import fitz
  doc=fitz.open(path); return [(i+1,p.get_text()) for i,p in enumerate(doc)]
 return [(None,path.read_text(encoding='utf-8',errors='ignore'))]
def _chunks(text, size=950, overlap=140):
 words=text.split(); out=[]; cur=[]; n=0
 for w in words:
  cur.append(w); n+=len(w)+1
  if n>=size:
   out.append(' '.join(cur)); cur=cur[-25:]; n=sum(len(x)+1 for x in cur)
 if cur and ' '.join(cur).strip(): out.append(' '.join(cur))
 return out or ([text] if text.strip() else [])
def ingest_file(path:Path, document_id:Optional[str]=None):
 import uuid, datetime
 docid=document_id or hashlib.sha1((path.name+str(path.stat().st_size)).encode()).hexdigest()[:16]
 c=_connect()
 if c.execute('SELECT id FROM documents WHERE id=?',(docid,)).fetchone(): c.close(); return docid
 # Uploads are stored as '<docid>_<original name>' on disk; index and cite them under the original name.
 shown=path.name[len(docid)+1:] if document_id and path.name.startswith(docid+'_') else path.name
 pages=_extract(path); rows=[]
 for page,txt in pages:
  for idx,chunk in enumerate(_chunks(txt)):
   cid=f'{docid}-p{page or 0}-c{idx+1}'; rows.append((cid,docid,shown,page,chunk))
 vectors=_embed([r[4] for r in rows]) if rows else []
 c.execute('INSERT OR IGNORE INTO documents(id,name,kind) VALUES(?,?,?)',(docid,shown,path.suffix.lower().lstrip('.')))
 for r,v in zip(rows,vectors): c.execute('INSERT OR IGNORE INTO chunks(id,document_id,document_name,page,text,embedding) VALUES(?,?,?,?,?,?)',(*r,json.dumps(v)))
 c.commit(); c.close()
 if _collection is None: _init_chroma()
 if _collection is not None and rows:
  try: _collection.upsert(ids=[r[0] for r in rows],documents=[r[4] for r in rows],embeddings=vectors,metadatas=[{'document_id':r[1],'document_name':r[2],'page':r[3] or 0,'chunk_id':r[0]} for r in rows])
  except Exception: pass
 return docid
def ensure_samples():
 for p in sorted(SAMPLES.iterdir()):
  if p.is_file() and p.suffix.lower() in ('.txt','.pdf'):
   try: ingest_file(p)
   except Exception as e: print('Sample index warning:',p.name,e)
def list_documents():
 c=_connect(); docs=[dict(r) for r in c.execute('SELECT d.*,COUNT(ch.id) chunks FROM documents d LEFT JOIN chunks ch ON d.id=ch.document_id GROUP BY d.id ORDER BY d.name')]; c.close(); return docs
def get_document_chunks(docid):
 """Return a document's metadata and its indexed chunks (in ingestion order), or None if unknown."""
 c=_connect(); doc=c.execute('SELECT d.*,COUNT(ch.id) chunks FROM documents d LEFT JOIN chunks ch ON d.id=ch.document_id WHERE d.id=? GROUP BY d.id',(docid,)).fetchone()
 if not doc: c.close(); return None
 rows=[{'chunk_id':r['id'],'page':r['page'],'text':r['text']} for r in c.execute('SELECT id,page,text FROM chunks WHERE document_id=? ORDER BY rowid',(docid,))]; c.close()
 return {'document':dict(doc),'chunks':rows}
def delete_document(docid):
 c=_connect(); row=c.execute('SELECT id FROM documents WHERE id=?',(docid,)).fetchone()
 if not row: c.close(); return False
 ids=[r[0] for r in c.execute('SELECT id FROM chunks WHERE document_id=?',(docid,))]
 c.execute('DELETE FROM chunks WHERE document_id=?',(docid,)); c.execute('DELETE FROM documents WHERE id=?',(docid,)); c.commit(); c.close()
 if _collection is not None and ids:
  try: _collection.delete(ids=ids)
  except Exception: pass
 for p in UPLOADS.glob('*'):
  if p.name.startswith(docid+'_'): p.unlink(missing_ok=True)
 return True
def search(query,top_k=5):
 c=_connect(); rows=[dict(r) for r in c.execute('SELECT * FROM chunks')]; c.close()
 if not rows: return []
 qv=_embed([query])[0]
 # Prefer Chroma's persisted ANN/vector query when available; SQLite cosine search is the offline fallback.
 if _collection is not None:
  try:
   found=_collection.query(query_embeddings=[qv],n_results=min(top_k,len(rows)),include=['documents','metadatas','distances'])
   ids=(found.get('ids') or [[]])[0]; docs=(found.get('documents') or [[]])[0]; metas=(found.get('metadatas') or [[]])[0]; distances=(found.get('distances') or [[]])[0]
   by_id={r['id']:r for r in rows}; results=[]
   for cid,txt,meta,dist in zip(ids,docs,metas,distances):
    base=by_id.get(cid,{})
    results.append({"chunk_id":cid,"document_id":meta.get('document_id',base.get('document_id')),"document_name":meta.get('document_name',base.get('document_name','Unknown source')),"page":meta.get('page',base.get('page')) or None,"text":txt or base.get('text',''),"score":round(1-float(dist),4)})
   if results:return results
  except Exception: pass
 def sim(row):
  v=json.loads(row['embedding']); return sum(a*b for a,b in zip(qv,v))
 results=[]
 for r in rows: results.append({"chunk_id":r['id'],"document_id":r['document_id'],"document_name":r['document_name'],"page":r['page'],"text":r['text'],"score":round(sim(r),4)})
 return sorted(results,key=lambda x:x['score'],reverse=True)[:top_k]
def status():
 c=_connect(); docs=c.execute('SELECT COUNT(*) FROM documents').fetchone()[0]; chunks=c.execute('SELECT COUNT(*) FROM chunks').fetchone()[0]; c.close()
 return {'vector_database':_vector_status,'embedding_model':_embed_status,'documents_indexed':docs,'chunks_indexed':chunks}
_init_chroma()
