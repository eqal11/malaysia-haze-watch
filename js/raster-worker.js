import {idw,crossValidate} from './idw.js';
import {locate,prepare} from './geometry.js';
const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
const inv=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
self.onmessage=({data:d})=>{try{
  const features=prepare(d.features), parts=[];
  for(const b of [[99.3,.7,104.7,7.5],[109.4,.7,119.5,7.5]]){
    const nx=Math.ceil((b[2]-b[0])*111/d.cellKm),ny=Math.ceil((b[3]-b[1])*111/d.cellKm),values=[];
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const lng=b[0]+i/nx*(b[2]-b[0]),lat=inv(merc(b[3])-j/ny*(merc(b[3])-merc(b[1])));values.push(locate([lng,lat],features)?idw({lng,lat},d.samples,d):null);}
    parts.push({bounds:b,nx,ny,values});
  }
  self.postMessage({id:d.id,parts,cv:d.cv?crossValidate(d.samples,d):null});
}catch(e){self.postMessage({id:d.id,error:e.message});}};
