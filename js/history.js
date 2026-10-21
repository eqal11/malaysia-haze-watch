import {getJSON} from './data.js';
import {numeric,windUV,validStation} from './core.js';
export const HOUR=3600000;
export function malaysiaDate(ms){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));}
export function selectionTime(date,hour){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'2026-01-01'||!Number.isInteger(Number(hour))||Number(hour)<0||Number(hour)>23)throw Error('Invalid archive date/hour');const stamp=Date.parse(`${date}T${String(hour).padStart(2,'0')}:00:00+08:00`);if(!Number.isFinite(stamp)||malaysiaDate(stamp)!==date)throw Error('Invalid archive date');return stamp;}
export function unpackIPU(d){
  const records=d.format==='daily-ipu-v1'?d.readings.map(([id,epoch,ipu,pollutant])=>({id,...d.stations[id],ipu,pollutant,updated_at:new Date(epoch*1000).toISOString()})):d.records;
  if(!Array.isArray(records)||!records.every(validStation))throw Error('Invalid IPU archive schema');return records;
}
export function unpackHotspots(d){
  if(d.format!=='daily-firms-v1')return d;
  return {type:'FeatureCollection',source:d.source,context_version:d.context_version,coverage_start:new Date(d.coverage_start*1000).toISOString(),coverage_end:new Date(d.coverage_end*1000).toISOString(),features:d.readings.map(([lng,lat,epoch,confidence,frp,country,region,state,sensor,on_peat=null,landcover=null,admin1=null])=>{const time=new Date(epoch*1000).toISOString();if(!numeric(lng)||!numeric(lat)||Math.abs(lng)>180||Math.abs(lat)>90||!numeric(frp)||frp<0||!['low','nominal','high'].includes(confidence))throw Error('Invalid archived FIRMS reading');return {type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{id:`${sensor}:${lng}:${lat}:${time}`,time,confidence,frp,country,region,state,sensor,on_peat,landcover,admin1}};})};
}
export function hourStations(records,target){
  const byId=new Map();for(const r of records||[]){const ms=Date.parse(r.updated_at);if(!Number.isFinite(ms)||Math.floor(ms/HOUR)!==Math.floor(target/HOUR))continue;const old=byId.get(r.id);if(!old||Date.parse(old.updated_at)<ms)byId.set(r.id,r);}return [...byId.values()];
}
export function historyRows(records){return (records||[]).filter(r=>numeric(r.ipu)).map(r=>({id:r.id,time:r.updated_at,ipu:r.ipu,state:r.state}));}
export function modelHour(raw,grid,kind,target){
  const arr=Array.isArray(raw)?raw:[raw];if(arr.length!==grid.length)throw Error('Incomplete historical model response');
  const points=arr.map((r,i)=>{const h=r.hourly;if(!h||!Array.isArray(h.time))throw Error('Invalid historical model schema');const idx=h.time.findIndex(v=>v*1000===target);if(idx<0)return null;const p={...grid[i],lng:r.longitude,lat:r.latitude,time:new Date(target).toISOString()};
    if(!numeric(p.lng)||!numeric(p.lat))throw Error('Invalid historical model location');
    if(kind==='pm'){const v=h.pm2_5?.[idx];if(!numeric(v)||v<0)return null;p.value=v;}
    else{const speed=h.wind_speed_10m?.[idx],direction=h.wind_direction_10m?.[idx];if(!numeric(speed)||speed<0||!numeric(direction))return null;Object.assign(p,windUV(speed,direction));}return p;
  }).filter(Boolean);
  if(!points.length)throw Error('No model data for selected hour');return {points,updated_at:new Date(target).toISOString(),fetchedAt:Date.now(),historical:true};
}
const memory=new Map();
export function clearArchiveMemory(){for(const key of memory.keys())if(key.startsWith('data/archive/'))memory.delete(key);}
export async function archiveJSON(url,ttl=300000){const old=memory.get(url);if(old&&Date.now()-old.at<ttl)return old.promise;const promise=getJSON(url);memory.set(url,{at:Date.now(),promise});try{return await promise;}catch(e){if(memory.get(url)?.promise===promise)memory.delete(url);throw e;}}
export async function historicalModel(kind,date,target,grid){
  const endpoint=kind==='pm'?'https://air-quality-api.open-meteo.com/v1/air-quality':'https://archive-api.open-meteo.com/v1/archive';
  const query=new URLSearchParams({latitude:grid.map(p=>p.lat).join(','),longitude:grid.map(p=>p.lng).join(','),hourly:kind==='pm'?'pm2_5':'wind_speed_10m,wind_direction_10m',start_date:date,end_date:date,timezone:'Asia/Kuala_Lumpur',timeformat:'unixtime'});
  if(kind==='pm')query.set('domains','cams_global');else query.set('wind_speed_unit','ms');
  const url=endpoint+'?'+query,key='mhw-history-v1-'+kind+'-'+date+'-'+grid.map(p=>p.lng+','+p.lat).join(';'),ttl=Date.now()-target<7*86400000?HOUR:7*86400000;let raw;
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Date.now()-saved.savedAt<ttl)raw=saved.data;}catch{}
  if(!raw){raw=await archiveJSON(url,ttl);try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data:raw}));}catch{}}
  return modelHour(raw,grid,kind,target);
}
export async function loadArchive(date,target,grid,onSource,manifest){
  const previous=malaysiaDate(target-24*HOUR),base='data/archive/';
  const result={ipu:null,hotspots:null,pm:null,wind:null,errors:{}};
  async function file(kind,day){const entry=manifest?.days?.[day]?.[kind];if(!entry?.path)throw Error('No '+kind+' archive for '+day);if(!entry.path.startsWith('archive/'+kind+'/')||entry.path.includes('..'))throw Error('Invalid archive path');const d=await archiveJSON('data/'+entry.path);return kind==='ipu'?{...d,records:unpackIPU(d)}:unpackHotspots(d);}
  const missing=(key,error)=>{result.errors[key]=error.message||String(error);onSource?.(key,null,result.errors[key]);};
  await Promise.allSettled([
    (async()=>{try{const d=await file('ipu',date);if(d.version!==1||d.date!==date||!Array.isArray(d.records))throw Error('Invalid IPU archive');let prev=[];try{prev=(await file('ipu',previous)).records||[];}catch{}
      const stations=hourStations(d.records,target);if(!stations.length)throw Error('No DOE observations archived for selected hour');result.ipu={version:1,stations,history:historyRows([...prev,...d.records]),updated_at:new Date(target).toISOString()};onSource?.('ipu',result.ipu);
    }catch(e){missing('ipu',e);}})(),
    (async()=>{try{
      // Both UTC+8 calendar days are needed for complete 24/48-hour trailing filters.
      const files=[date,malaysiaDate(target-24*HOUR),malaysiaDate(target-48*HOUR)];const docs=await Promise.all(files.map(day=>file('hotspots',day).catch(()=>null)));
      if(!docs[0])throw Error('No FIRMS archive for selected date');
      const byId=new Map();for(const d of docs.filter(Boolean)){if(d.type!=='FeatureCollection'||!Array.isArray(d.features))throw Error('Invalid FIRMS archive');for(const f of d.features){if(f.geometry?.type!=='Point'||!Number.isFinite(Date.parse(f.properties?.time)))throw Error('Invalid archived detection');byId.set(f.properties.id,f);}}
      const requiredStart=target+HOUR-48*HOUR,requiredEnd=target+HOUR,intervals=docs.filter(Boolean).map(d=>[Date.parse(d.coverage_start),Date.parse(d.coverage_end)]).filter(b=>b.every(Number.isFinite)).sort((a,b)=>a[0]-b[0]);
      let cursor=requiredStart;for(const [start,end] of intervals){if(start>cursor)break;if(end>cursor)cursor=end;}
      result.hotspots={type:'FeatureCollection',features:[...byId.values()],updated_at:new Date(target).toISOString(),coverage_complete:cursor>=requiredEnd,source:docs[0].source,context_error:docs.filter(Boolean).some(d=>!d.context_version)?'missing':null};onSource?.('hotspots',result.hotspots);
    }catch(e){missing('hotspots',e);}})(),
    ...['pm','wind'].map(async kind=>{try{result[kind]=await historicalModel(kind,date,target,grid);onSource?.(kind,result[kind]);}catch(e){missing(kind,e);}})
  ]);return result;
}
