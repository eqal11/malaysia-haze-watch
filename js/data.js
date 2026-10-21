import {chooseHotspotData} from './land-context.js';
import {CONFIG} from './config.js';
import {validateIPU,numeric,windUV} from './core.js';
import {prepare,locate} from './geometry.js';
export async function getJSON(url){const r=await fetch(url,{signal:AbortSignal.timeout(25000),cache:'no-cache'});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
export function validateStatic(k,d){
  if(k==='ipu')return validateIPU(d);
  if(k==='pipeline'){if(d?.version!==1||typeof d.status!=='string'||typeof d.event!=='string')throw Error('Invalid pipeline metadata');return d;}
  if(k==='meta'){if(d?.version!==1||!d.sources||typeof d.sources!=='object')throw Error('Invalid source metadata');return d;}
  if(k==='grid'){if(d?.version!==1||!Array.isArray(d.points)||!d.points.length||!d.points.every(p=>numeric(p.lng)&&numeric(p.lat)&&p.lng>=98&&p.lng<=120&&p.lat>=0&&p.lat<=8&&typeof p.state==='string'))throw Error('Invalid sampling grid');return d;}
  if(d?.type!=='FeatureCollection'||!Array.isArray(d.features)||d.crs)throw Error('Invalid WGS84 GeoJSON');
  for(const f of d.features){const g=f.geometry,p=f.properties;if(f.type!=='Feature'||!g||!p)throw Error('Invalid feature');
    const coords=g.type==='Point'?[g.coordinates]:g.type==='Polygon'?g.coordinates.flat():g.type==='MultiPolygon'?g.coordinates.flat(2):null;
    if(!coords?.length||!coords.every(c=>Array.isArray(c)&&numeric(c[0])&&numeric(c[1])&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90))throw Error('Invalid longitude/latitude');
    if(k==='hotspots'&&(g.type!=='Point'||typeof p.id!=='string'||!Number.isFinite(Date.parse(p.time))||!numeric(p.frp)||p.frp<0||!['low','nominal','high'].includes(p.confidence)||(p.country!==null&&typeof p.country!=='string')))throw Error('Invalid hotspot schema');
    if(k==='hotspots'&&d.land_context&&(!['on_peat','landcover','country','admin1'].every(key=>key in p)||(p.on_peat!==null&&typeof p.on_peat!=='boolean')||['landcover','country','admin1'].some(key=>p[key]!==null&&typeof p[key]!=='string')))throw Error('Invalid land context schema');
    if(k!=='hotspots'&&(!['Polygon','MultiPolygon'].includes(g.type)||typeof p.name!=='string'))throw Error('Invalid boundary schema');
  }
  return d;
}
async function loadHotspots(){const [raw,attributed]=await Promise.allSettled([getJSON(CONFIG.endpoints.hotspots).then(d=>validateStatic('hotspots',d)),getJSON(CONFIG.endpoints.hotspotsAttributed).then(d=>validateStatic('hotspots',d))]);if(raw.status==='rejected'&&attributed.status==='rejected')throw Error('Hotspot data unavailable');if(raw.status==='rejected')return {...attributed.value,context_raw_unavailable:true};return chooseHotspotData(raw.value,attributed.status==='fulfilled'?attributed.value:null);}
const referenceRequests=new Map();
function loadStatic(k){if(['districts','states','land','grid'].includes(k)){if(!referenceRequests.has(k))referenceRequests.set(k,getJSON(CONFIG.endpoints[k]).then(d=>validateStatic(k,d)).catch(e=>{referenceRequests.delete(k);throw e;}));return referenceRequests.get(k);}return getJSON(CONFIG.endpoints[k]).then(d=>validateStatic(k,d));}
export async function staticData(){const names=['ipu','hotspots','meta','districts','states','land','grid','pipeline'];const results=await Promise.allSettled(names.map(k=>k==='hotspots'?loadHotspots():loadStatic(k)));return Object.fromEntries(results.map((r,i)=>[names[i],r.status==='fulfilled'?{data:r.value}:{error:r.reason.message}]));}
function cached(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
export async function modelData(kind,grid,states){
  const key='mhw-v1-'+kind, old=cached(key);
  if(old&&Date.now()-old.fetchedAt<CONFIG.cacheMs)return {...old,cached:true};
  try{
    const q=new URLSearchParams({latitude:grid.map(p=>p.lat).join(','),longitude:grid.map(p=>p.lng).join(','),current:kind==='pm'?'pm2_5':'wind_speed_10m,wind_direction_10m',timezone:'GMT',timeformat:'unixtime'});
    if(kind==='wind')q.set('wind_speed_unit','ms');else q.set('domains','cams_global');
    const raw=await getJSON(CONFIG.endpoints[kind]+'?'+q),arr=Array.isArray(raw)?raw:[raw];
    if(arr.length!==grid.length)throw Error('Incomplete model response');
    const prepared=prepare(states.features);
    const points=arr.map((r,i)=>{const c=r.current;if(!c||!numeric(c.time))throw Error('Unexpected model schema');
      const point={...grid[i],lng:r.longitude,lat:r.latitude,time:new Date(c.time*1000).toISOString()};
      const parent=locate([point.lng,point.lat],prepared);point.state=parent?.properties.name||grid[i].state;
      if(kind==='pm'){if(c.pm2_5!==null&&(!numeric(c.pm2_5)||c.pm2_5<0))throw Error('Invalid PM2.5');point.value=c.pm2_5;}
      else {if(c.wind_speed_10m===null||c.wind_direction_10m===null)return null;if(!numeric(c.wind_speed_10m)||c.wind_speed_10m<0||!numeric(c.wind_direction_10m))throw Error('Invalid wind');Object.assign(point,windUV(c.wind_speed_10m,c.wind_direction_10m));}
      return point;}).filter(Boolean);
    const valid=points.filter(p=>kind==='pm'?numeric(p.value):numeric(p.u));if(!valid.length)throw Error('No model values');
    const doc={points,fetchedAt:Date.now(),updated_at:new Date(Math.min(...valid.map(p=>Date.parse(p.time)))).toISOString()};
    try{localStorage.setItem(key,JSON.stringify(doc));}catch{/* Cache is optional in private browsing. */}
    return doc;
  }catch(e){if(old)return {...old,error:e.message,cached:true};throw e;}
}
