import {contextPopup} from './land-context.js';
import {CONFIG} from './config.js';
import {category,distance,numeric,stateMatches,usableStations,risk} from './core.js';
import {idw} from './idw.js';
import {prepare,contains,interiorPoint} from './geometry.js';
import {t,lang,time,esc} from './i18n.js';
export function districtValues(features,stations,options){
  const available=usableStations(stations,options.referenceMs??Date.now());
  return features.map(f=>{
    const local=available.filter(s=>contains([s.lng,s.lat],f.geometry)).sort((a,b)=>b.ipu-a.ipu);
    const center=interiorPoint(f),near=available.filter(s=>distance(s,center)<=options.radiusKm);
    const chosen=local[0],value=chosen?chosen.ipu:idw(center,near.map(s=>({...s,value:s.ipu})),options);
    return {...f,center,ipu:value,measured:!!chosen,station:chosen,contributors:chosen?[chosen]:near,updated_at:chosen?.updated_at||(near.length?near.map(s=>s.updated_at).sort()[0]:null)};
  });
}
function popup(d){const c=category(d.ipu),pollutants=[...new Set(d.contributors?.map(s=>s.pollutant).filter(Boolean)||[])];return `<h3>${esc(d.properties?.name||d.name)}</h3><div class="popup-value">${numeric(d.ipu)?Math.round(d.ipu):'N/A'} <small>IPU</small></div><b>${c?esc(c[lang]):t('unavailable')}</b><p><span class="popup-tag">${d.measured?t('measured'):t('estimated')}</span></p><p class="popup-meta">${t('pollutant')}: ${esc(pollutants.join(', ')||d.pollutant||t('unknown'))}${!d.measured&&pollutants.length?' (stesen sumber / source stations)':''}<br>${t('updated')}: ${esc(time(d.updated_at))}${d.station?'<br>'+esc(d.station.name):''}</p>${c?`<div class="popup-advice"><b>${t('advice')}</b><br>${esc(c.advice)}</div>`:`<p>${t('noNearby')}</p>`}${d.measured&&d.contributors?.length===1?'<p class="popup-meta">Nilai stesen dalam daerah; bukan purata seluruh daerah.</p>':''}${d.properties?.boundary_note?`<p class="popup-meta">${esc(d.properties.boundary_note)}</p>`:''}`;}
export function hotspotFilter(features,{state,region,hours,peatOnly=false},now=Date.now()){
 return features.filter(f=>{const p=f.properties,age=(now-Date.parse(p.time))/3600000;return (!peatOnly||p.on_peat===true)&&age>=0&&age<=hours&&(!region||p.region===region||p.country===region)&&(!state||p.country==='Malaysia'&&stateMatches(p.state,state));});
}
const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
function pmColor(v){const stops=[[0,[210,239,231]],[15,[111,191,173]],[35,[244,208,113]],[75,[219,119,76]],[150,[148,62,102]]];let a=stops[0],b=stops.at(-1);for(let i=1;i<stops.length;i++)if(v<=stops[i][0]){a=stops[i-1];b=stops[i];break;}const w=Math.max(0,Math.min(1,(v-a[0])/(b[0]-a[0])));return a[1].map((n,i)=>Math.round(n+(b[1][i]-n)*w));}
function rasterImage(part,features,kind){
  const {bounds:b,nx,ny,values}=part,scale=5,w=nx*scale,h=ny*scale;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),img=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const gx=x/w*nx,gy=y/h*ny,ix=Math.min(nx-1,Math.floor(gx)),iy=Math.min(ny-1,Math.floor(gy)),fx=gx-ix,fy=gy-iy;
    const vs=[values[iy*(nx+1)+ix],values[iy*(nx+1)+ix+1],values[(iy+1)*(nx+1)+ix],values[(iy+1)*(nx+1)+ix+1]],weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];let sum=0,total=0;
    vs.forEach((v,i)=>{if(numeric(v)){sum+=v*weights[i];total+=weights[i];}});if(!total)continue;const v=sum/total;
    const color=kind==='pm'?pmColor(v):category(v).color.match(/\w\w/g).map(v=>parseInt(v,16)),idx=(y*w+x)*4;img.data.set([...color,180],idx);
  }
  ctx.putImageData(img,0,0);ctx.globalCompositeOperation='destination-in';ctx.fillStyle='#000';ctx.beginPath();
  const project=p=>[(p[0]-b[0])/(b[2]-b[0])*w,(merc(b[3])-merc(p[1]))/(merc(b[3])-merc(b[1]))*h];
  for(const f of features){const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;for(const poly of polys)for(const ring of poly){ring.forEach((p,i)=>{const [x,y]=project(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();}}
  ctx.fill('evenodd');return canvas.toDataURL();
}
export class Layers{
  constructor(map,onStatus,onSelect){this.map=map;this.status=onStatus;this.select=onSelect;this.groups={};this.jobs=0;this.active={districts:true,stations:true,pm:false,ipuGrid:false,hotspots:true,wind:false};this.rasterToken={};}
  clear(key){this.rasterToken[key]=++this.jobs;if(this.groups[key]){this.map.removeLayer(this.groups[key]);delete this.groups[key];}}
  async render(model){if(this.model?.historical!==model.historical||model.historical&&this.model?.referenceMs!==model.referenceMs){this.map.closePopup?.();document.getElementById('cv').textContent=t('unavailable');}this.model=model;const {districts,stations,hotspots,pm,wind,state,options}=model;const referenceMs=model.referenceMs??Date.now();
    for(const key of Object.keys(this.active))if(!this.active[key]){this.clear(key);this.rasterToken[key]=++this.jobs;this.status(key,'');}
    if(this.active.districts){this.clear('districts');if(!districts?.length)this.status('districts',t('unavailable'));else{
      this.groups.districts=L.geoJSON(districts,{style:f=>{const c=category(f.ipu);return {color:'#698578',weight:.65,fillColor:c?.color||'#bfc8c4',fillOpacity:c?(f.measured?.49:.20):.15,dashArray:f.measured?null:'2 2'};},onEachFeature:(f,l)=>{l.bindPopup(popup(f));l.on('mouseover',()=>l.setStyle({weight:2}));l.on('mouseout',()=>l.setStyle({weight:.65}));}}).addTo(this.map);this.status('districts',`${districts.filter(d=>numeric(d.ipu)).length}/${districts.length} · ${t('layersNote')}`);}}
    if(this.active.stations){this.clear('stations');if(!stations?.length)this.status('stations',t('empty'));else{
      this.groups.stations=L.layerGroup(stations.map(s=>{const c=category(s.ipu);const stale=referenceMs-Date.parse(s.updated_at)>CONFIG.stationMaxAgeHours*3600000;return L.circleMarker([s.lat,s.lng],{radius:5.5,color:stale?'#777':'#fff',weight:1.7,fillColor:c?.color||'#a1aaa5',fillOpacity:stale?.35:1}).bindPopup(popup({...s,measured:true,contributors:[s]})+(stale?`<p>${t('stale')}</p>`:'')).on('click',()=>this.select(s.id));})).addTo(this.map);this.status('stations',`${stations.length} · DOE / JAS`);}}
    if(this.active.hotspots){this.clear('hotspots');if(!hotspots)this.status('hotspots',t('unavailable'));else{
      this.groups.hotspots=L.layerGroup(hotspots.map(f=>{const p=f.properties,r=risk(p),color={high:'#ba3e32',medium:'#d58332',low:'#a89958'}[r];return L.circleMarker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{radius:{high:7,medium:4.5,low:3}[r],fillColor:color,color:'#fff',weight:.8,fillOpacity:.85}).bindPopup(`<h3>VIIRS S-NPP · ${t(r==='high'?'riskHigh':r==='medium'?'riskMedium':'riskLow')}</h3><p>${esc(p.country||t('noContext'))} · ${esc(p.region||t('noContext'))}<br>FRP: ${esc(p.frp)} MW<br>Confidence: ${esc(p.confidence)}<br>${esc(time(p.time))}</p>${contextPopup(p)}<p class="popup-meta">NASA FIRMS · ${t('heatOnly')}</p>`);})).addTo(this.map);this.status('hotspots',hotspots.length?`${hotspots.length} · VIIRS S-NPP`:t('empty'));}}
    if(this.active.wind){this.clear('wind');if(!wind?.length)this.status('wind',t('unavailable'));else{try{const token=++this.jobs;this.rasterToken.wind=token;const {makeWindLayer}=await import('./wind.js');if(this.rasterToken.wind!==token||!this.active.wind)return;this.groups.wind=makeWindLayer(this.map,wind).addTo(this.map);this.status('wind',`${wind.length} · ${t('wind')}`);}catch{this.status('wind',t('unavailable'));}}}
    for(const kind of ['pm','ipuGrid'])if(this.active[kind]){
      const samples=kind==='pm'?(pm||[]).filter(p=>numeric(p.value)):usableStations(stations||[],referenceMs).map(s=>({...s,value:s.ipu}));
      this.clear(kind);if(!samples.length||!districts?.length){this.status(kind,t('unavailable'));if(kind==='ipuGrid')document.getElementById('cv').textContent=t('unavailable');continue;}
      this.status(kind,t('loading'));this.compute(kind,samples,districts,options);
    }
    this.legend();
  }
  compute(kind,samples,features,options){
    if(kind==='ipuGrid')document.getElementById('cv').textContent=t('loading');
    const token=++this.jobs;this.rasterToken[kind]=token;
    const worker=new Worker(new URL('./raster-worker.js',import.meta.url),{type:'module'});
    const timeout=setTimeout(()=>{worker.terminate();if(this.rasterToken[kind]===token)this.status(kind,t('unavailable'));},45000);
    const fail=()=>{clearTimeout(timeout);worker.terminate();if(this.rasterToken[kind]===token)this.status(kind,t('unavailable'));};worker.onerror=fail;
    worker.onmessage=({data:d})=>{clearTimeout(timeout);worker.terminate();if(this.rasterToken[kind]!==token||!this.active[kind])return;if(d.error){this.status(kind,t('unavailable'));return;}
      this.groups[kind]=L.layerGroup(d.parts.map(p=>L.imageOverlay(rasterImage(p,features,kind),[[p.bounds[1],p.bounds[0]],[p.bounds[3],p.bounds[2]]],{pane:'raster',interactive:false,opacity:kind==='pm'?.8:.7}))).addTo(this.map);
      const count=d.parts.flatMap(p=>p.values).filter(numeric).length;this.status(kind,count?`${t('estimated')} · ${samples.length} ${kind==='pm'?'CAMS':'JAS'}`:t('noNearby'));
      if(d.cv)document.getElementById('cv').textContent=`${t('cv')} · n=${d.cv.n}/${d.cv.total} · RMSE ${d.cv.rmse?.toFixed(1)??'N/A'} · MAE ${d.cv.mae?.toFixed(1)??'N/A'} IPU. ${t('cvNote')}`;
    };
    worker.postMessage({id:token,samples,features,power:options.power,radiusKm:options.radiusKm,cellKm:options.cellKm,cv:kind==='ipuGrid'});
  }
  legend(){
    const blocks=[];
    if(this.active.districts||this.active.stations||this.active.ipuGrid)blocks.push(`<div class="legend-block"><strong>IPU / API · JAS</strong><div class="legend-keys">${CONFIG.categories.map((c,i)=>`<span class="legend-key"><i style="background:${c.color}"></i>${[0,51,101,201,301][i]}${i===4?'+':'–'+c.max} ${esc(c[lang])}</span>`).join('')}</div><div style="margin-top:6px">${t('layersNote')}</div></div>`);
    if(this.active.hotspots)blocks.push(`<div class="legend-block"><strong>VIIRS · ${t('hotspots')}</strong><div class="legend-keys">${[['riskHigh','#ba3e32'],['riskMedium','#d58332'],['riskLow','#a89958']].map(([k,c])=>`<span class="legend-key"><i style="background:${c}"></i>${t(k)}</span>`).join('')}</div></div>`);
    if(this.active.pm)blocks.push(`<div class="legend-block"><strong>PM2.5 · CAMS model · µg/m³</strong><div style="height:7px;background:linear-gradient(90deg,#d2efe7,#6fbfad,#f4d071,#db774c,#943e66)"></div>0 · 15 · 35 · 75 · 150+</div>`);
    if(this.active.wind)blocks.push(`<div class="legend-block"><strong>${t('wind')} · m/s</strong><div class="legend-keys">${[['#538fa0','0–2'],['#28748e','2–5'],['#15527b','5+']].map(([c,v])=>`<span class="legend-key"><i style="background:${c}"></i>${v}</span>`).join('')}</div></div>`);
    document.getElementById('legend').innerHTML=blocks.join('');document.getElementById('legend').hidden=!blocks.length;
  }
  showLocation(lat,lng,stations,districts){
    this.location?.remove();this.location=L.circleMarker([lat,lng],{color:'#214c7a',radius:8,fillOpacity:1}).addTo(this.map);this.map.setView([lat,lng],9);
    const nearest=stations.filter(s=>numeric(s.ipu)).sort((a,b)=>distance({lat,lng},a)-distance({lat,lng},b))[0],district=districts.find(f=>contains([lng,lat],f.geometry));
    this.location.bindPopup(`<h3>${t('location')}</h3><p>${district?esc(district.properties.name)+' · '+(numeric(district.ipu)?Math.round(district.ipu)+' IPU · '+t(district.measured?'measured':'estimated'):t('unavailable')):t('outside')}</p>${nearest?`<p>${t('nearest')}: ${esc(nearest.name)}<br>${distance({lat,lng},nearest).toFixed(1)} km · ${nearest.ipu} IPU<br>${esc(time(nearest.updated_at))}</p>`:`<p>${t('unavailable')}</p>`}`).openPopup();
  }
  focus(id,center,districtId){
    const district=this.model?.districts?.find(d=>d.properties.id===districtId),station=this.model?.stations?.find(s=>s.id===id),point=center||station||district?.center;
    if(!point)return;
    this.map.setView([point.lat,point.lng],9);
    const d=district||(station?{...station,measured:true,contributors:[station]}:null);
    if(d)L.popup().setLatLng([point.lat,point.lng]).setContent(popup(d)).openOn(this.map);
  }
}
