import random, threading, time
from collections import deque
from datetime import datetime, timezone

MACHINE_SEEDS = [
 {"id":"M-01","name":"Conveyor Belt","type":"Material transport","position":0,"base_temp":48,"base_vibration":2.2,"base_pressure":1.8,"power":4.2},
 {"id":"M-02","name":"CNC Cutting Unit","type":"Precision cutting","position":1,"base_temp":62,"base_vibration":1.4,"base_pressure":5.2,"power":8.8},
 {"id":"M-03","name":"Heat Processing Unit","type":"Thermal treatment","position":2,"base_temp":145,"base_vibration":0.8,"base_pressure":2.6,"power":12.4},
 {"id":"M-04","name":"Robotic Assembly Unit","type":"Automated assembly","position":3,"base_temp":54,"base_vibration":1.1,"base_pressure":3.4,"power":7.6},
 {"id":"M-05","name":"Packaging Unit","type":"Product packaging","position":4,"base_temp":43,"base_vibration":1.5,"base_pressure":1.2,"power":3.8},
]
CRITICAL_FAULTS = ('high_vibration', 'bearing_wear', 'overheating')
class FactoryEngine:
 def __init__(self):
  self.lock=threading.RLock(); self.running=True; self.started=time.time(); self.tick=0; self.incident_seq=1
  self.machines={}; self.incidents=[]; self.history={}
  for s in MACHINE_SEEDS:
   self.machines[s['id']]={**s,"temperature":s['base_temp'],"vibration":s['base_vibration'],"pressure":s['base_pressure'],"power_kw":s['power'],"production_count":0,"health":100,"status":"running","fault":None,"last_updated":self.now()}
   self.history[s['id']]=deque(maxlen=120)
  self._sample_all()
 def now(self): return datetime.now(timezone.utc).isoformat()
 def _status(self,m):
  # A non-critical fault (pressure_drop) is a warning until health degrades below 40, matching the incident severity.
  if m['fault'] in CRITICAL_FAULTS or m['health']<40: return 'critical'
  if m['fault'] or m['health']<75 or m['temperature']>m['base_temp']*1.25 or m['vibration']>5: return 'warning'
  return 'running' if self.running else 'paused'
 def _sample_all(self):
  for m in self.machines.values():
   self.history[m['id']].append({"timestamp":self.now(),"temperature":round(m['temperature'],1),"vibration":round(m['vibration'],2),"pressure":round(m['pressure'],2),"power_kw":round(m['power_kw'],2),"production_count":m['production_count'],"health":m['health']})
 def tick_once(self):
  with self.lock:
   self.tick+=1
   for m in self.machines.values():
    if self.running and not m['fault']:
     m['temperature']=max(m['base_temp']*.8,min(m['base_temp']*1.12,m['temperature']+random.uniform(-1.6,1.6)))
     m['vibration']=max(.2,min(4,m['vibration']+random.uniform(-.2,.2)))
     m['pressure']=max(.4,m['base_pressure']+random.uniform(-.15,.15))
     m['power_kw']=max(.5,m['power']+random.uniform(-.3,.3)); m['production_count']+=random.randint(1,3)
     m['health']=min(100,m['health']+0.03)
    elif m['fault']:
     if m['fault'] in ('high_vibration','bearing_wear'): m['vibration']=min(12,m['vibration']+random.uniform(.1,.6)); m['temperature']=min(m['base_temp']*1.8,m['temperature']+random.uniform(.5,2.5)); m['power_kw']=m['power']*1.3
     elif m['fault']=='overheating': m['temperature']=min(m['base_temp']*2,m['temperature']+random.uniform(1,4))
     elif m['fault']=='pressure_drop': m['pressure']=max(.1,m['pressure']-random.uniform(.1,.3))
     m['health']=max(8,m['health']-random.uniform(.3,1.4))
    m['status']=self._status(m); m['last_updated']=self.now()
   self._sample_all()
 def start(self):
  with self.lock: self.running=True
  return self.overview()
 def pause(self):
  with self.lock:
   self.running=False
   for m in self.machines.values(): m['status']=self._status(m)
  return self.overview()
 def trigger(self,machine_id,fault):
  with self.lock:
   if machine_id not in self.machines: raise KeyError(machine_id)
   m=self.machines[machine_id]; m['fault']=fault; m['status']='critical' if fault in CRITICAL_FAULTS else 'warning'; m['health']=min(m['health'],55)
   inc={"id":f"INC-{self.incident_seq:03d}","machine_id":machine_id,"machine_name":m['name'],"severity":"critical" if fault in CRITICAL_FAULTS else 'warning',"title":fault.replace('_',' ').title(),"description":f"Simulated {fault.replace('_',' ')} detected on {m['name']}","timestamp":self.now(),"status":"active"}
   self.incident_seq+=1; self.incidents.insert(0,inc)
   return inc
 def reset_machine(self,machine_id):
  with self.lock:
   if machine_id not in self.machines: raise KeyError(machine_id)
   m=self.machines[machine_id]; s=next(x for x in MACHINE_SEEDS if x['id']==machine_id)
   for k in ('temperature','vibration','pressure','power_kw','health','production_count','fault'): m[k]={'temperature':s['base_temp'],'vibration':s['base_vibration'],'pressure':s['base_pressure'],'power_kw':s['power'],'health':100,'production_count':0,'fault':None}[k]
   m['status']='running' if self.running else 'paused'; m['last_updated']=self.now(); self.incidents=[i for i in self.incidents if i['machine_id']!=machine_id and i['status']=='active']; self._sample_all(); return dict(m)
 def reset(self):
  with self.lock:
   self.running=True; self.incidents=[]; self.tick=0
   for s in MACHINE_SEEDS:
    m=self.machines[s['id']]
    for k,v in [("temperature",s['base_temp']),("vibration",s['base_vibration']),("pressure",s['base_pressure']),("power_kw",s['power']),("health",100),("production_count",0),("fault",None)]: m[k]=v
    m['status']='running'; m['last_updated']=self.now(); self.history[m['id']].clear()
   self._sample_all(); return self.overview()
 def get_machine(self,mid):
  with self.lock:
   if mid not in self.machines: raise KeyError(mid)
   return dict(self.machines[mid])
 def machines_list(self):
  with self.lock: return [dict(m) for m in self.machines.values()]
 def telemetry(self,mid):
  with self.lock:
   if mid not in self.history: raise KeyError(mid)
   return list(self.history[mid])
 def overview(self):
  with self.lock:
   ms=list(self.machines.values()); active=[i for i in self.incidents if i['status']=='active']
   return {"factory_name":"Northstar Virtual Works","running":self.running,"uptime_seconds":int(time.time()-self.started),"machine_count":len(ms),"running_count":sum(m['status']=='running' for m in ms),"warning_count":sum(m['status']=='warning' for m in ms),"critical_count":sum(m['status']=='critical' for m in ms),"average_health":round(sum(m['health'] for m in ms)/len(ms)),"production_count":sum(m['production_count'] for m in ms),"active_incidents":len(active),"incidents":active[:5],"simulated":True,"updated_at":self.now()}
 def get_incidents(self):
  with self.lock: return list(self.incidents)
engine=FactoryEngine()
