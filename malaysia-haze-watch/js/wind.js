import {distance} from './core.js';
export function makeWindLayer(map,points){
  const layer=L.layerGroup();let canvas,ctx,frame,last=0,particles=[];
  const nearest=p=>{let best=null,d=Infinity;for(const q of points){const dd=(q.lng-p.lng)**2+(q.lat-p.lat)**2;if(dd<d){d=dd;best=q;}}return d<9?best:null;};
  const reset=()=>{if(!canvas)return;const size=map.getSize(),top=map.containerPointToLayerPoint([0,0]);L.DomUtil.setPosition(canvas,top);canvas.width=size.x;canvas.height=size.y;particles=Array.from({length:Math.min(450,Math.floor(size.x*size.y/2000))},()=>({x:Math.random()*size.x,y:Math.random()*size.y,age:Math.random()*80}));};
  const animate=time=>{
    frame=requestAnimationFrame(animate);if(time-last<40)return;const dt=Math.min(.1,(time-last)/1000||.04);last=time;
    if(document.hidden||map._animatingZoom)return;
    ctx.globalCompositeOperation='destination-in';ctx.fillStyle='rgba(0,0,0,.89)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over';
    for(const p of particles){if(p.age++>85||p.x<0||p.y<0||p.x>canvas.width||p.y>canvas.height){p.x=Math.random()*canvas.width;p.y=Math.random()*canvas.height;p.age=0;continue;}const ll=map.containerPointToLatLng([p.x,p.y]),v=nearest(ll);if(!v)continue;
      const speed=Math.hypot(v.u,v.v),x=p.x+v.u*dt*6,y=p.y-v.v*dt*6;ctx.strokeStyle=speed<2?'#538fa0':speed<5?'#28748e':'#15527b';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(x,y);ctx.stroke();p.x=x;p.y=y;
    }
  };
  layer.on('add',()=>{canvas=L.DomUtil.create('canvas','wind-canvas',map.getPane('wind'));canvas.setAttribute('aria-hidden','true');ctx=canvas.getContext('2d');reset();map.on('moveend resize zoomend',reset);if(!matchMedia('(prefers-reduced-motion: reduce)').matches)frame=requestAnimationFrame(animate);});
  layer.on('remove',()=>{cancelAnimationFrame(frame);map.off('moveend resize zoomend',reset);canvas?.remove();});
  // Static arrows remain useful when animation is disabled for reduced motion.
  for(const p of points){const to=(Math.atan2(p.u,p.v)*180/Math.PI+360)%360;
    L.marker([p.lat,p.lng],{interactive:false,icon:L.divIcon({className:'wind-arrow',html:`<span style="display:block;transform:rotate(${to}deg);color:#296e88;opacity:.7;font-size:17px">↑</span>`,iconSize:[16,16]})}).addTo(layer);
  }
  return layer;
}
