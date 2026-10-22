import {t} from './i18n.js';
let capabilitiesPromise,capabilitiesAt=0;
export function utcDays(now=Date.now()){const end=new Date(now).toISOString().slice(0,10);return Array.from({length:7},(_,i)=>new Date(Date.parse(end+'T00:00:00Z')-(6-i)*86400000).toISOString().slice(0,10));}
export function timeInDomains(date,intervals){return intervals.some(v=>{const [a,b]=v.split('/');return date>=a.slice(0,10)&&date<=(b||a).slice(0,10);});}
async function capabilities(config){
  if(Date.now()-capabilitiesAt>300000)capabilitiesPromise=null;
  if(!capabilitiesPromise){capabilitiesAt=Date.now();capabilitiesPromise=fetch(config.capabilities,{signal:AbortSignal.timeout(20000)}).then(r=>{if(!r.ok)throw Error();return r.text();}).then(text=>{
    const xml=new DOMParser().parseFromString(text,'application/xml');const layer=[...xml.getElementsByTagNameNS('*','Layer')].find(el=>[...el.children].some(c=>c.localName==='Identifier'&&c.textContent===config.layer));
    if(!layer||!layer.textContent.includes(config.matrix))throw Error('GIBS layer unavailable');
    return [...layer.getElementsByTagNameNS('*','Dimension')].flatMap(d=>[...d.getElementsByTagNameNS('*','Value')].map(v=>v.textContent));
  }).catch(error=>{capabilitiesPromise=null;throw error;});}
  return capabilitiesPromise;
}
export class Satellite{
  constructor(map,config){this.map=map;this.config=config;this.version=0;this.state='off';this.count={};map.createPane('satellite');map.getPane('satellite').style.zIndex=390;map.getPane('satellite').style.pointerEvents='none';const days=utcDays(),date=document.getElementById('imagery-date');date.min=days[0];date.max=days.at(-1);date.value=days.at(-2);document.getElementById('imagery-toggle').onchange=()=>this.update();date.onchange=()=>this.update();document.getElementById('imagery-opacity').oninput=e=>{this.layer?.setOpacity(Number(e.target.value));document.getElementById('imagery-opacity-value').textContent=Math.round(Number(e.target.value)*100)+'%';};}
  label(){const days=utcDays(),field=document.getElementById('imagery-date');field.min=days[0];field.max=days.at(-1);document.getElementById('imagery-status').textContent=t('imagery_'+this.state)+(this.state==='ready'&&this.count.blank?' · '+t('imagery_partial'):'');}
  async update(){
    const revision=++this.version;this.layer?.remove();this.layer=null;
    if(!document.getElementById('imagery-toggle').checked){this.state='off';this.label();return;}
    const date=document.getElementById('imagery-date').value;if(!utcDays().includes(date)){this.state='invalid';this.label();return;}
    this.state='loading';this.label();this.count={ok:0,blank:0,error:0};
    try{const times=await capabilities(this.config);if(revision!==this.version)return;if(!timeInDomains(date,times)){this.state='empty';this.label();return;}
      const layer=L.tileLayer(this.config.url.replace('{date}',date),{pane:'satellite',tileSize:this.config.tile_size,minZoom:0,maxNativeZoom:this.config.max_native_zoom,maxZoom:16,bounds:[[-5,95],[8,120]],noWrap:true,crossOrigin:'anonymous',opacity:Number(document.getElementById('imagery-opacity').value),attribution:'Imagery: NASA GIBS / EOSDIS, Suomi NPP VIIRS, UTC day'});
      layer.on('loading',()=>{if(revision!==this.version)return;this.count={ok:0,blank:0,error:0};this.state='loading';this.label();});
      layer.on('tileload',event=>{if(revision!==this.version)return;try{const c=document.createElement('canvas');c.width=c.height=32;const context=c.getContext('2d',{willReadFrequently:true});context.drawImage(event.tile,0,0,32,32);const pixels=context.getImageData(0,0,32,32).data;let visible=false;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]&&(pixels[i]>3||pixels[i+1]>3||pixels[i+2]>3)){visible=true;break;}if(visible)this.count.ok++;else this.count.blank++;}catch{this.count.error++;}});
      layer.on('tileerror',()=>{if(revision===this.version)this.count.error++;});
      layer.on('load',()=>{if(revision!==this.version)return;this.state=this.count.ok?'ready':this.count.error?'error':'empty';this.label();});
      this.layer=layer;layer.addTo(this.map);
    }catch{if(revision===this.version){this.state='error';this.label();}}
  }
}
