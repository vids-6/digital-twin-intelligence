from app.rag.knowledge import search
DATASET=[
 {'id':'eval-1','query':'conveyor excessive vibration bearing wear alignment','relevant_terms':['conveyor','vibration','bearing'],'description':'Conveyor vibration troubleshooting'},
 {'id':'eval-2','query':'CNC cutting unit spindle temperature lubrication maintenance','relevant_terms':['cnc','spindle','lubrication'],'description':'CNC thermal maintenance'},
 {'id':'eval-3','query':'heat processing furnace temperature calibration overheat','relevant_terms':['heat','temperature','calibration'],'description':'Thermal process checks'},
 {'id':'eval-4','query':'robotic assembly emergency stop sensor safety','relevant_terms':['robot','safety','sensor'],'description':'Robotic cell safety'},
 {'id':'eval-5','query':'packaging conveyor jam inspection preventive maintenance','relevant_terms':['packaging','jam','inspection'],'description':'Packaging line inspection'},
]
def run_evaluation(k=5):
 results=[]; precisions=[]; recalls=[]; rrs=[]; correct=[]; grounded=[]
 for item in DATASET:
  hits=search(item['query'],k); relevant=[]
  for h in hits:
   text=(h['document_name']+' '+h['text']).lower()
   if any(t in text for t in item['relevant_terms']): relevant.append(h)
  p=len(relevant)/k; r=len(relevant)/len(item['relevant_terms']); rank=next((i+1 for i,h in enumerate(hits) if h in relevant),None)
  precisions.append(p); recalls.append(min(1,r)); rrs.append(1/rank if rank else 0)
  citation_ok=bool(hits and all(h.get('document_name') and h.get('chunk_id') for h in hits)); correct.append(1.0 if citation_ok else 0.0)
  grounded.append(len(relevant)/len(hits) if hits else 0.0)
  results.append({'id':item['id'],'query':item['query'],'description':item['description'],'retrieved':len(hits),'relevant_retrieved':len(relevant),'precision_at_k':round(p,3),'recall_at_k':round(min(1,r),3),'reciprocal_rank':round(1/rank if rank else 0,3),'source_correctness':citation_ok,'groundedness_proxy':round(grounded[-1],3),'sources':[{'document_name':h['document_name'],'chunk_id':h['chunk_id'],'page':h['page'],'score':h['score']} for h in hits]})
 n=max(1,len(results)); return {'k':k,'dataset_size':len(results),'metrics':{'precision_at_k':round(sum(precisions)/n,3),'recall_at_k':round(sum(recalls)/n,3),'mean_reciprocal_rank':round(sum(rrs)/n,3),'citation_source_correctness':round(sum(correct)/n,3),'groundedness_proxy':round(sum(grounded)/n,3)},'results':results,'note':'Computed live against the current indexed corpus. Relevance is a lightweight keyword proxy, not expert-labelled ground truth.'}
