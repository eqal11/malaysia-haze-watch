import {CONFIG} from './config.js';
import {stateMatches,numeric,usableStations,distance} from './core.js';
import {staticData,modelData} from './data.js';
import {districtValues,Layers,hotspotFilter} from './layers.js';
import {prepare} from './geometry.js';
import {createMap,message} from './map.js';
import {Dashboard} from './dashboard.js';
import {setLang,t,lang,time,esc} from './i18n.js';

let map,layers,snapshot={},models={},state='',options={...CONFIG.idw},districts=[],busy=false;
const statusText={};
const layerLabels={districts:'districts',stations:'stations',pm:'pm',ipuGrid:'ipuGrid',hotspots:'hotspots',wind:'wind'};
const icons={districts:'▧',stations:'◉',pm:'≋',ipuGrid:'▦',hotspots:'♨',wind:'↝'};
const dashboard=new Dashboard((id,center,districtId)=>layers?.focus(id,center,districtId));
function controls(){const root=document.getElementById('layer-controls');root.innerHTML=Object.entries(layerLabels).map(([key,label])=>`<label class="layer-row"><input type="checkbox" data-layer="${key}" ${layers?.active[key]?'checked':''}><span>${t(label)}<small id="layer-status-${key}">${esc(statusText[key]||'')}</small></span><span class="swatch" aria-hidden="true">${icons[key]}</span></label>`).join('');root.querySelectorAll('input').forEach(input=>input.onchange=()=>{if(!layers)return;layers.active[input.dataset.layer]=input.checked;render();});}
function layerStatus(key,value){statusText[key]=value;const e=document.getElementById('layer-status-'+key);if(e)e.textContent=value;}
function sourceStatus(){const metadata=snapshot.meta?.data?.sources||{};const rows=[['ipu','DOE / JAS · IPU'],['hotspots','NASA FIRMS · VIIRS'],['pm','Open-Meteo · CAMS PM2.5'],['wind','Open-Meteo · 10 m wind']];document.getElementById('source-status').innerHTML=rows.map(([key,label])=>{
  const m=models[key]||metadata[key]||{},isModel=key==='pm'||key==='wind',data=isModel?models[key]:snapshot[key]?.data;
  const observed=isModel?m.updated_at:(m.observed_at||data?.updated_at),success=isModel?m.fetchedAt:m.last_success,error=m.error||(!isModel&&snapshot[key]?.error)||m.message;
  const stale=observed&&Date.now()-Date.parse(observed)>CONFIG.staleHours[key]*3600000,unavailable=!data||m.status==='unavailable'||error;
  return `<div class="source-card"><strong>${label}</strong><span class="status-tag ${stale||unavailable?'warn':''}">${stale?t('stale'):unavailable?t('unavailable'):'OK'}</span><p>${t('observed')}: ${esc(time(observed))}<br>${t('lastGood')}: ${esc(time(success))}</p>${error?`<span class="source-error">${esc(error)}</span>`:''}${m.transport?`<p>${esc(m.transport)}</p>`:''}</div>`;
}).join('');}
function getStateFeatures(){return (snapshot.districts?.data?.features||[]).filter(f=>stateMatches(f.properties.state,state));}
function render(){
  const stations=(snapshot.ipu?.data?.stations||[]).filter(s=>stateMatches(s.state,state));
  const allStations=snapshot.ipu?.data?.stations||[],features=getStateFeatures();districts=districtValues(features,allStations,options);
  const filter={state,region:document.getElementById('region').value,hours:Number(document.getElementById('window').value)},allHot=snapshot.hotspots?.data?.features;
  const hotspots=allHot?hotspotFilter(allHot,filter):null,hot24=allHot?hotspotFilter(allHot,{...filter,hours:24}):null,hot48=allHot?hotspotFilter(allHot,{...filter,hours:48}):null;
  const pm=models.pm?.points?.filter(p=>stateMatches(p.state,state)),wind=models.wind?.points?.filter(p=>stateMatches(p.state,state));
  const model={districts,stations,hotspots,hot24,hot48,pm,wind,options,state,hasIPU:!!snapshot.ipu?.data,history:snapshot.ipu?.data?.history||[],hotUpdated:snapshot.hotspots?.data?.updated_at};
  layers?.render(model).catch(()=>message(t('unavailable')));dashboard.update(model);sourceStatus();
}
function clock(){document.getElementById('clock').textContent=time(new Date().toISOString());}
async function refresh(){if(busy)return;busy=true;document.getElementById('refresh').disabled=true;
  try{
    const fresh=await staticData();
    // Network failure keeps a snapshot already loaded in this session, but surfaces error.
    for(const [key,value] of Object.entries(fresh))snapshot[key]=value.error&&snapshot[key]?.data?{...snapshot[key],error:value.error}:value;
    const select=document.getElementById('state'),states=snapshot.states?.data?.features||[];select.innerHTML=`<option value="">${t('national')}</option>`+states.map(f=>`<option value="${esc(f.properties.name)}">${esc(f.properties.name)}</option>`).sort().join('');select.value=state;
    render();
    if(snapshot.grid?.data&&snapshot.states?.data)await Promise.allSettled(['pm','wind'].map(async kind=>{try{models[kind]=await modelData(kind,snapshot.grid.data.points,snapshot.states.data);}catch(e){models[kind]={error:e.message};}render();}));
  }catch(e){message(t('unavailable'));}
  finally{busy=false;document.getElementById('refresh').disabled=false;sourceStatus();}
}
setLang('bm');clock();
try{map=createMap();layers=new Layers(map,layerStatus,id=>dashboard.choose(id));}catch(e){message(t('unavailable')+' · Leaflet CDN',true);}
controls();
document.getElementById('language').onclick=()=>{setLang(lang==='bm'?'en':'bm');document.getElementById('language').innerHTML=lang==='bm'?'BM <span>/ EN</span>':'EN <span>/ BM</span>';controls();clock();render();};
document.getElementById('state').onchange=e=>{state=e.target.value;render();if(map){const f=snapshot.states?.data?.features.find(f=>f.properties.name===state);if(f)map.fitBounds(L.geoJSON(f).getBounds(),{padding:[25,25]});else map.fitBounds(CONFIG.bounds);}};
for(const id of ['region','window'])document.getElementById(id).onchange=render;
document.getElementById('idw-form').onsubmit=e=>{e.preventDefault();options={power:Number(document.getElementById('power').value),cellKm:Number(document.getElementById('cell').value),radiusKm:Number(document.getElementById('radius').value)};render();};
document.getElementById('refresh').onclick=refresh;
document.getElementById('locate').onclick=()=>{if(!navigator.geolocation)return message(t('geoFailed'));navigator.geolocation.getCurrentPosition(pos=>{if(!layers)return;const all=snapshot.ipu?.data?.stations||[],allDistricts=districtValues(snapshot.districts?.data?.features||[],all,options);layers.showLocation(pos.coords.latitude,pos.coords.longitude,all,allDistricts);},()=>message(t('geoFailed')),{timeout:12000,maximumAge:60000});};
await refresh();setInterval(()=>{clock();sourceStatus();},60000);setInterval(refresh,CONFIG.refreshMs);
