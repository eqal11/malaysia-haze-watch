import {stationSummary} from './freshness.js';
import {CONFIG} from './config.js';
import {summarizeContext} from './land-context.js';
import {category,numeric,meanWind,usableStations,stateMatches} from './core.js';
import {t,lang,time,esc} from './i18n.js';
let chartPromise;
export function chartLibrary(){if(!chartPromise)chartPromise=new Promise((resolve,reject)=>{if(window.Chart)return resolve(window.Chart);const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js';script.crossOrigin='anonymous';script.onload=()=>resolve(window.Chart);script.onerror=()=>reject(Error('Chart.js CDN unavailable'));document.head.appendChild(script);});return chartPromise;}
export class Dashboard{
  constructor(onSelect){this.charts={};this.selected=null;this.sort='ipu';this.direction=-1;this.select=onSelect;this.chartVersion=0;
    document.getElementById('search').oninput=()=>this.table();document.getElementById('table-mode').onchange=()=>this.table();
    document.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{this.direction=this.sort===button.dataset.sort?-this.direction:button.dataset.sort==='ipu'?-1:1;this.sort=button.dataset.sort;document.querySelectorAll('[data-sort]').forEach(b=>b.parentElement.removeAttribute('aria-sort'));button.parentElement.setAttribute('aria-sort',this.direction>0?'ascending':'descending');this.table();});
    document.getElementById('station-select').onchange=e=>this.choose(e.target.value);
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){this.chartsVisible=true;this.chartUpdate();observer.disconnect();}},{rootMargin:'250px'});observer.observe(document.getElementById('analytics'));
  }
  choose(id,center,districtId){this.selected=id;document.getElementById('station-select').value=id;this.chartUpdate();this.select?.(id,center,districtId);}
  update(model){this.model=model;const {stations,districts,hot24,wind}=model,valid=usableStations(stations,model.referenceMs??Date.now()),counts=CONFIG.categories.map(c=>valid.filter(s=>category(s.ipu)===c).length),worst=districts.filter(d=>numeric(d.ipu)).sort((a,b)=>b.ipu-a.ipu)[0];
    document.getElementById('worst-value').innerHTML=worst?`${Math.round(worst.ipu)} <small>IPU</small>`:'N/A';
    document.getElementById('worst-detail').textContent=worst?`${worst.properties.name} · ${t(worst.measured?'measured':'estimated')}`:t('unavailable');
    const health=stationSummary(stations,model.referenceMs??Date.now());
    document.getElementById('station-value').textContent=valid.length?valid.length:t(health.stored?'staleShort':'unavailableShort');
    document.getElementById('station-detail').innerHTML=valid.length?CONFIG.categories.map((c,i)=>`<span title="${esc(c[lang])}"><i style="background:${c.color}"></i>${counts[i]} ${esc(c[lang])}</span>`).join(''):(health.stored?`${health.stored} ${t('storedExpired')} ${esc(time(health.latest))}`:t('unavailable'));
    const my=hot24?.filter(f=>f.properties.country==='Malaysia').length,id=hot24?.filter(f=>f.properties.country==='Indonesia').length;
    document.getElementById('hot-value').textContent=hot24?hot24.length.toLocaleString():'N/A';
    document.getElementById('hot-detail').textContent=hot24?`Malaysia ${my} · Indonesia ${id} · ${lang==='bm'?'Lain':'Other'} ${hot24.length-my-id}${model.hotPartial?' · '+t('partial'):''}`:t('unavailable');
    const mean=meanWind(wind||[]);document.getElementById('wind-value').innerHTML=mean?`${mean.speed.toFixed(1)} <small>m/s</small>`:'N/A';
    const direction=mean?['N','NE','E','SE','S','SW','W','NW'][Math.round(mean.from/45)%8]:'';
    document.getElementById('wind-detail').textContent=mean?`${lang==='bm'?'Dari':'From'} ${direction} · ${Math.round(mean.from)}° · ${wind.length} ${lang==='bm'?'titik model':'model points'}`:t('unavailable');
    const west=meanWind((wind||[]).filter(p=>p.lng<106)),east=meanWind((wind||[]).filter(p=>p.lng>108));
    document.getElementById('flow-summary').textContent=[west?`Sumatra → Semenanjung: ${t(west.u>0&&west.v>-.5?'toward':'away')}`:null,east?`Kalimantan → Sarawak: ${t(east.v>0?'toward':'away')}`:null,t('flowNote')].filter(Boolean).join(' · ');
    const select=document.getElementById('station-select');select.innerHTML=stations.length?stations.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join(''):`<option value="">${t('empty')}</option>`;
    if(!stations.some(s=>s.id===this.selected))this.selected=valid.sort((a,b)=>b.ipu-a.ipu)[0]?.id||stations[0]?.id||null;select.value=this.selected||'';
    const context=summarizeContext(model.hotspots),countsContext=context.totals;
    document.getElementById('land-context-summary').textContent=model.hotspots?`${t('peat')}: ${countsContext.peat} · ${t('nonPeat')}: ${countsContext.nonPeat} · ${t('noContext')}: ${countsContext.noContext}`:t('unavailable');
    this.table();if(this.chartsVisible)this.chartUpdate();
  }
  table(){if(!this.model)return;const districtMode=document.getElementById('table-mode').value==='districts',query=document.getElementById('search').value.toLowerCase();
    let rows=(districtMode?this.model.districts:this.model.stations).map(d=>({id:d.properties?.id||d.id,name:d.properties?.name||d.name,state:d.properties?.state||d.state,ipu:d.ipu,measured:districtMode?d.measured:true,updated_at:d.updated_at,stationId:d.station?.id||(!districtMode?d.id:null),center:d.center||{lng:d.lng,lat:d.lat}}));
    rows=rows.filter(d=>(d.name+' '+d.state).toLowerCase().includes(query));rows.sort((a,b)=>this.direction*(this.sort==='name'?a.name.localeCompare(b.name):((numeric(a.ipu)?a.ipu:-Infinity)-(numeric(b.ipu)?b.ipu:-Infinity))));
    const body=document.getElementById('ranking-body');body.innerHTML=rows.slice(0,10).map((r,i)=>{const c=category(r.ipu),stale=(this.model.referenceMs??Date.now())-Date.parse(r.updated_at)>CONFIG.staleHours.ipu*3600000;return `<tr><td><button class="row-select" data-row="${i}">${esc(r.name)}</button><small>${esc(r.state)} · ${esc(time(r.updated_at))}${stale?' · '+t('stale'):''}</small></td><td><span class="value-pill" style="--color:${c?.color||'#b0b8b2'}">${numeric(r.ipu)?Math.round(r.ipu):'N/A'}</span></td><td>${c?esc(c[lang]):t('unavailable')}</td><td><span class="type-badge">${t(r.measured?'measured':'estimated')}</span></td></tr>`;}).join('');
    document.getElementById('table-status').textContent=rows.length?`${Math.min(10,rows.length)} / ${rows.length} · ${t('updated')} MYT`:t('empty');
    body.querySelectorAll('[data-row]').forEach(button=>button.onclick=()=>{const r=rows[Number(button.dataset.row)];if(r.stationId)this.choose(r.stationId,r.center,districtMode?r.id:null);else this.select?.(null,r.center,r.id);});
  }
  async chartUpdate(){if(!this.model||!this.chartsVisible)return;const revision=++this.chartVersion;
    try{await chartLibrary();if(revision!==this.chartVersion)return;const {stations,hot48,history}=this.model,referenceMs=this.model.referenceMs??Date.now(),valid=usableStations(stations,referenceMs);const common={responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#738277',font:{size:9},maxTicksLimit:8}},y:{beginAtZero:true,grid:{color:'#edf1e9'},ticks:{color:'#738277',font:{size:9},precision:0}}}};
      const points=history.filter(h=>h.id===this.selected&&referenceMs-Date.parse(h.time)<=24*3600000&&Date.parse(h.time)<=referenceMs).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
      this.draw('station-chart',points.map(p=>new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(p.time))),points.map(p=>p.ipu),{...common,type:'line',color:'#327b5a'},points.length<2?t('historyEmpty'):'');
      const counts=CONFIG.categories.map(c=>valid.filter(s=>category(s.ipu)===c).length);
      this.draw('category-chart',CONFIG.categories.map(c=>c[lang]),counts,{...common,type:'bar',colors:CONFIG.categories.map(c=>c.color)},valid.length?'':t('empty'));
      const end=Math.floor(referenceMs/3600000)*3600000,starts=Array.from({length:48},(_,i)=>end-(47-i)*3600000),data=starts.map(start=>hot48?.filter(f=>{const v=Date.parse(f.properties.time);return v>=start&&v<start+3600000;}).length||0);
      const coverage=Date.parse(this.model.hotUpdated||'');
      const incomplete=Number.isFinite(coverage)&&referenceMs-coverage>4*3600000;
      this.draw('hotspot-chart',starts.map(v=>new Intl.DateTimeFormat(lang==='bm'?'ms-MY':'en-MY',{timeZone:'Asia/Kuala_Lumpur',day:'2-digit',hour:'2-digit',hour12:false}).format(new Date(v))),data,{...common,type:'bar',color:'#ce8957'},!hot48?t('unavailable'):this.model.hotPartial?t('partial'):incomplete?t('stale'):!hot48.length?t('empty'):'');
      this.contextChart(common);
    }catch{['station-chart','category-chart','hotspot-chart','context-chart'].forEach(id=>document.getElementById(id+'-state').textContent=t('unavailable')+' · Chart.js');}
  }
  contextChart(common){
    const features=this.model.hotspots,{rows}=summarizeContext(features),id='context-chart';
    this.charts[id]?.destroy();
    document.getElementById(id+'-state').textContent=!features?t('unavailable'):!features.length?t('empty'):'';
    document.getElementById('context-chart-wrap').style.height=`${Math.max(280,rows.length*28+65)}px`;
    const labels=rows.map(r=>`${r.admin1||t('noContext')} · ${r.country||t('noContext')}`);
    this.charts[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:[['peat','#356951'],['nonPeat','#c49443'],['noContext','#8d96a5']].map(([key,color])=>({label:t(key),data:rows.map(r=>r[key]),backgroundColor:color}))},options:{...common,indexAxis:'y',plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:12,font:{size:11}}}},scales:{x:{...common.scales.x,stacked:true,beginAtZero:true,ticks:{precision:0}},y:{...common.scales.y,stacked:true,ticks:{autoSkip:false,font:{size:10}}}}}});
    document.getElementById(id).setAttribute('aria-label',rows.map((r,i)=>`${labels[i]}: ${t('peat')} ${r.peat}, ${t('nonPeat')} ${r.nonPeat}, ${t('noContext')} ${r.noContext}`).join('; '));
  }
  draw(id,labels,values,opts,empty){this.charts[id]?.destroy();document.getElementById(id+'-state').textContent=empty;const {type,color,colors,...options}=opts;this.charts[id]=new Chart(document.getElementById(id),{type,data:{labels,datasets:[{label:id==='station-chart'?'IPU':lang==='bm'?'Bilangan':'Count',data:values,borderColor:color||'#327b5a',backgroundColor:colors||color||'#327b5a',borderWidth:type==='line'?2:0,borderRadius:3,pointRadius:2,fill:false,tension:.2}]},options});document.getElementById(id).setAttribute('aria-label',labels.map((l,i)=>`${l}: ${values[i]}`).join('; '));}
}
