import {CONFIG} from './config.js';
import {t,esc} from './i18n.js';
export function createMap(){
  if(!window.L)throw Error('Leaflet CDN unavailable');
  const map=L.map('map',{zoomControl:false,preferCanvas:true,minZoom:4,maxZoom:16,zoomSnap:.25}).fitBounds(CONFIG.bounds,{padding:[22,22]});
  L.control.zoom({position:'topright'}).addTo(map);
  const base=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  let errors=0;base.on('tileerror',()=>{if(++errors===3)message(t('basemap'));});
  map.createPane('raster');map.getPane('raster').style.zIndex=350;
  map.createPane('wind');map.getPane('wind').style.zIndex=440;map.getPane('wind').style.pointerEvents='none';
  document.getElementById('reset').onclick=()=>map.fitBounds(CONFIG.bounds,{padding:[22,22]});
  new ResizeObserver(()=>map.invalidateSize({pan:false})).observe(document.getElementById('map'));
  return map;
}
let timeout;
export function message(text,persistent=false){const e=document.getElementById('map-message');e.textContent=text;e.hidden=!text;clearTimeout(timeout);if(text&&!persistent)timeout=setTimeout(()=>e.hidden=true,11000);}
