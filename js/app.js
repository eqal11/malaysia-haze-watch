import {stationSummary,pipelineEventLabel} from './freshness.js';
import {CONFIG} from './config.js';
import {stateMatches} from './core.js';
import {staticData,modelData,getJSON} from './data.js';
import {districtValues,Layers,hotspotFilter} from './layers.js';
import {createMap,message} from './map.js';
import {Dashboard} from './dashboard.js';
import {setLang,t,lang,time,esc} from './i18n.js';
import {HOUR,malaysiaDate,selectionTime,loadArchive,clearArchiveMemory} from './history.js';
let map,layers,snapshot={},models={},state='',options={...CONFIG.idw},busy=false;
let localHealth=null,localRefreshRunning=false;
const localPreview=['localhost','127.0.0.1','::1'].includes(location.hostname);
let mode='live',selectedTime=null,archive={errors:{}},manifest={days:{}},selectionRevision=0;
const statusText={},layerLabels={districts:'districts',stations:'stations',pm:'pm',ipuGrid:'ipuGrid',hotspots:'hotspots',wind:'wind'},icons={districts:'▧',stations:'◉',pm:'≋',ipuGrid:'▦',hotspots:'♨',wind:'↝'};
const dashboard=new Dashboard((id,center,districtId)=>layers?.focus(id,center,districtId));
function controls(){const root=document.getElementById('layer-controls');root.innerHTML=Object.entries(layerLabels).map(([key,label])=>`<label class="layer-row"><input type="checkbox" data-layer="${key}" ${layers?.active[key]?'checked':''}><span>${t(label)}<small id="layer-status-${key}">${esc(statusText[key]||'')}</small></span><span class="swatch" aria-hidden="true">${icons[key]}</span></label>`).join('');root.querySelectorAll('input').forEach(input=>input.onchange=()=>{if(!layers)return;layers.active[input.dataset.layer]=input.checked;render();});}
function layerStatus(key,value){statusText[key]=value;const e=document.getElementById('layer-status-'+key);if(e)e.textContent=value;}
function selectedIPU(){return mode==='live'?snapshot.ipu?.data:archive.ipu;}
function selectedHotspots(){return mode==='live'?snapshot.hotspots?.data:archive.hotspots;}
function selectedModels(){return mode==='live'?models:archive;}
function sourceStatus(){const metadata=snapshot.meta?.data?.sources||{},historical=mode==='history';const rows=[['ipu','DOE / JAS · IPU'],['hotspots','NASA FIRMS · VIIRS'],['pm','Open-Meteo · CAMS PM2.5'],['wind',historical?'Open-Meteo · historical wind':'Open-Meteo · 10 m wind']];document.getElementById('source-status').innerHTML=rows.map(([key,label])=>{
  if(historical){const data=archive[key],error=archive.errors?.[key],partial=key==='hotspots'&&data&&!data.coverage_complete;return `<div class="source-card"><strong>${label}</strong><span class="status-tag ${!data||partial?'warn':''}">${!data?t(error?'archiveMissing':'loading'):partial?t('partial'):t('archive')}</span><p>${t('selectedTime')}: ${esc(time(selectedTime))}</p>${!data?`<p>${t(error?'archiveMissing':'loading')}</p>`:''}${partial?`<p>${t('archivePartial')}</p>`:''}${data?'<p>Historical data · UTC+8</p>':''}</div>`;}
  const m=models[key]||metadata[key]||{},isModel=key==='pm'||key==='wind',data=isModel?models[key]:snapshot[key]?.data,observed=isModel?m.updated_at:(m.observed_at||data?.updated_at),success=isModel?m.fetchedAt:m.last_success,error=m.error||(!isModel&&snapshot[key]?.error)||m.message;
  const stale=observed&&Date.now()-Date.parse(observed)>CONFIG.staleHours[key]*3600000,unavailable=!data||m.status==='unavailable'||error;
  return `<div class="source-card"><strong>${label}</strong><span class="status-tag ${stale||unavailable?'warn':''}">${stale?t('stale'):unavailable?t('unavailable'):'OK'}</span><p>${t('observed')}: ${esc(time(observed))}<br>${t('lastGood')}: ${esc(time(success))}</p>${error?`<span class="source-error">${esc(error)}</span>`:''}${m.transport?`<p>${esc(m.transport)}</p>`:''}</div>`;
}).join('');}
function freshnessStatus(){
  const historical=mode==='history',doc=selectedIPU(),health=stationSummary(doc?.stations||[],historical?selectedTime+HOUR-1:Date.now()),meta=snapshot.meta?.data?.sources?.ipu,pipe=snapshot.pipeline?.data;
  const awaiting=!historical&&!snapshot.ipu;const panel=document.getElementById('freshness-panel');panel.dataset.state=awaiting?'loading':historical?'archive':health.state;
  document.getElementById('ipu-freshness').textContent=awaiting?t('loading'):historical?`${t('archive')} · ${time(selectedTime)}`:`${t('ipuObserved')}: ${time(health.latest)} · ${t(health.state==='fresh'?'freshConfirmed':health.state==='delayed'?'stale':health.state==='expired'?'expiredReadings':'unavailable')}`;
  document.getElementById('ipu-freshness-detail').textContent=historical?t('archiveIsFixed'):`${t('lastGood')}: ${time(meta?.last_success)}. ${t('pollHint')} ${health.state==='expired'?t('expiryExplanation'):''}`;
  let text=`${t('lastCollector')}: ${t(pipelineEventLabel(pipe?.event))} · ${time(pipe?.finished_at||pipe?.started_at)}. ${t('githubScheduleHint')} ${t('scheduleProof')}: ${time(pipe?.last_scheduled_success)}.`;
  if(localPreview)text=localHealth?.enabled?(localHealth.running?t('collectingNow'):`${t('localAuto')} ${t('nextAttempt')}: ${time(localHealth.next_attempt)}.`):(localHealth?t('localSetupNeeded'):t('checkingCollector'));
  if(localPreview&&localHealth?.error&&localHealth.enabled)text+=' '+t('collectorPartial');
  document.getElementById('collector-status').textContent=text;
  document.getElementById('collect-now').hidden=!localPreview;document.getElementById('collect-now').disabled=!localHealth?.enabled||localHealth.running||localRefreshRunning;
}
async function pollLocal(){
  if(!localPreview)return;
  try{const old=localHealth;localHealth=await getJSON('__local/status');freshnessStatus();if(mode==='live'&&(localHealth.running||old?.running&&!localHealth.running))await refreshLive();}
  catch{localHealth={enabled:false,error:true};freshnessStatus();}
}
async function collectNow(){
  if(!localPreview||localRefreshRunning)return;localRefreshRunning=true;freshnessStatus();
  try{const response=await fetch('__local/refresh',{method:'POST',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();localHealth=await response.json();}
  catch{message(t('collectFailed'));}finally{localRefreshRunning=false;freshnessStatus();}
}
function render(){
  const historical=mode==='history',referenceMs=historical?selectedTime+HOUR-1:Date.now(),ipu=selectedIPU(),hot=selectedHotspots(),modelSources=selectedModels();
  const allStations=ipu?.stations||[],stations=allStations.filter(s=>stateMatches(s.state,state)),temporalOptions={...options,referenceMs};
  let features=(snapshot.districts?.data?.features||[]).filter(f=>stateMatches(f.properties.state,state));
  if(!features.length&&state){const f=snapshot.states?.data?.features.find(f=>stateMatches(f.properties.name,state));if(f)features=[{...f,properties:{...f.properties,state,boundary_note:'Sempadan negeri / wilayah ADM1 digunakan kerana tiada ciri ADM2 dalam keluaran sumber. ADM1 state / territory boundary fallback; not a newly created district.'}}];}
  const districts=districtValues(features,allStations,temporalOptions),filter={state,region:document.getElementById('region').value,hours:Number(document.getElementById('window').value),peatOnly:document.getElementById('peat-only').checked},allHot=hot?.features;
  const hotspots=allHot?hotspotFilter(allHot,filter,referenceMs):null,hot24=allHot?hotspotFilter(allHot,{...filter,hours:24},referenceMs):null,hot48=allHot?hotspotFilter(allHot,{...filter,hours:48},referenceMs):null;
  const pm=modelSources.pm?.points?.filter(p=>stateMatches(p.state,state)),wind=modelSources.wind?.points?.filter(p=>stateMatches(p.state,state));
  const model={districts,stations,hotspots,hot24,hot48,pm,wind,options:temporalOptions,state,hasIPU:!!ipu,history:ipu?.history||[],hotUpdated:hot?.updated_at,referenceMs,historical,hotPartial:historical&&hot&&!hot.coverage_complete};
  const contextMissing=!hot?.land_context&&!historical||hot?.context_error||historical&&allHot?.some(f=>!('on_peat' in f.properties));const health=snapshot.meta?.data?.sources?.land_context,retained=!historical&&(health?.status==='unavailable'||hot?.context_raw_unavailable);document.getElementById('context-status').textContent=(!hot?t('unavailable'):contextMissing?t('contextMissing'):retained?t('contextRetained'):t('contextReady'))+(historical?'':` ${t('lastGood')}: ${time(health?.last_success)}.`);
  layers?.render(model).catch(()=>message(t('unavailable')));dashboard.update(model);sourceStatus();freshnessStatus();document.querySelector('.timeline').classList.toggle('is-history',historical);
  document.getElementById('history-status').textContent=historical?`${t('archive')} · ${time(selectedTime)}${Object.keys(archive.errors||{}).length?' · '+t('partial'):''}`:`${t('live')} · ${time(ipu?.updated_at)}`;
}
function clock(){document.getElementById('clock').textContent=t('deviceClock')+': '+time(new Date().toISOString());document.getElementById('history-date').max=malaysiaDate(Date.now());}
async function refreshLive(){if(busy)return;busy=true;document.getElementById('refresh').disabled=true;
  try{const fresh=await staticData();for(const [key,value] of Object.entries(fresh))snapshot[key]=value.error&&snapshot[key]?.data?{...snapshot[key],error:value.error}:value;
    try{manifest=await getJSON('data/archive/index.json');}catch{manifest={days:{}};}
    const select=document.getElementById('state'),states=snapshot.states?.data?.features||[];select.innerHTML=`<option value="">${t('national')}</option>`+states.map(f=>`<option value="${esc(f.properties.name)}">${esc(f.properties.name)}</option>`).sort().join('');select.value=state;render();
    if(snapshot.grid?.data&&snapshot.states?.data)await Promise.allSettled(['pm','wind'].map(async kind=>{try{models[kind]=await modelData(kind,snapshot.grid.data.points,snapshot.states.data);}catch(e){models[kind]={error:e.message};}render();}));
  }catch{message(t('unavailable'));}finally{busy=false;document.getElementById('refresh').disabled=false;sourceStatus();}
}
async function showHistory(){
  let target;try{target=selectionTime(document.getElementById('history-date').value,document.getElementById('history-hour').value);}catch{message(t('archiveMissing'));return;}if(target>Date.now())return message(t('future'));
  const revision=++selectionRevision;mode='history';selectedTime=target;archive={errors:{}};render();document.getElementById('history-show').disabled=true;document.getElementById('history-status').textContent=t('historyLoading');
  const date=malaysiaDate(target),grid=snapshot.grid?.data?.points;if(!grid?.length){message(t('unavailable'));document.getElementById('history-show').disabled=false;return;}
  const result=await loadArchive(date,target,grid,(key,value,error)=>{if(revision!==selectionRevision)return;if(value)archive[key]=value;if(error)archive.errors[key]=error;render();},manifest);
  if(revision!==selectionRevision)return;archive=result;document.getElementById('history-show').disabled=false;render();
}
setLang('bm');clock();const initial=Date.now()-HOUR;document.getElementById('history-date').value=malaysiaDate(initial);document.getElementById('history-hour').innerHTML=Array.from({length:24},(_,i)=>`<option value="${i}">${String(i).padStart(2,'0')}:00</option>`).join('');document.getElementById('history-hour').value=String(new Date(initial+8*HOUR).getUTCHours());
try{map=createMap();layers=new Layers(map,layerStatus,id=>dashboard.choose(id));}catch{message(t('unavailable')+' · Leaflet CDN',true);}controls();
document.getElementById('language').onclick=()=>{setLang(lang==='bm'?'en':'bm');document.getElementById('language').innerHTML=lang==='bm'?'BM <span>/ EN</span>':'EN <span>/ BM</span>';controls();clock();render();};
document.getElementById('state').onchange=e=>{state=e.target.value;render();if(map){const f=snapshot.states?.data?.features.find(f=>f.properties.name===state);if(f)map.fitBounds(L.geoJSON(f).getBounds(),{padding:[25,25]});else map.fitBounds(CONFIG.bounds);}};
for(const id of ['region','window','peat-only'])document.getElementById(id).onchange=render;
document.getElementById('idw-form').onsubmit=e=>{e.preventDefault();options={power:Number(document.getElementById('power').value),cellKm:Number(document.getElementById('cell').value),radiusKm:Number(document.getElementById('radius').value)};render();};
document.getElementById('collect-now').onclick=collectNow;
document.getElementById('refresh').onclick=async()=>{if(mode==='history'){clearArchiveMemory();try{manifest=await getJSON('data/archive/index.json');}catch{}await showHistory();}else await refreshLive();};document.getElementById('history-form').onsubmit=e=>{e.preventDefault();showHistory();};
document.getElementById('history-live').onclick=()=>{++selectionRevision;mode='live';selectedTime=null;document.getElementById('history-show').disabled=false;render();};
for(const [id,delta] of [['history-prev',-1],['history-next',1]])document.getElementById(id).onclick=()=>{try{const current=selectionTime(document.getElementById('history-date').value,document.getElementById('history-hour').value),next=current+delta*24*HOUR;if(next<Date.parse('2026-01-01T00:00:00+08:00')||next>Date.now())return message(t('future'));document.getElementById('history-date').value=malaysiaDate(next);showHistory();}catch{message(t('archiveMissing'));}};
document.getElementById('locate').onclick=()=>{if(!navigator.geolocation)return message(t('geoFailed'));navigator.geolocation.getCurrentPosition(pos=>{if(!layers)return;const all=selectedIPU()?.stations||[],referenceMs=mode==='history'?selectedTime+HOUR-1:Date.now(),allDistricts=districtValues(snapshot.districts?.data?.features||[],all,{...options,referenceMs});layers.showLocation(pos.coords.latitude,pos.coords.longitude,all,allDistricts);},()=>message(t('geoFailed')),{timeout:12000,maximumAge:60000});};
if(localPreview){pollLocal();setInterval(pollLocal,15000);}
await refreshLive();setInterval(()=>{clock();sourceStatus();freshnessStatus();},60000);setInterval(()=>{if(mode==='live')refreshLive();},CONFIG.refreshMs);


document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mode==='live')refreshLive();});
