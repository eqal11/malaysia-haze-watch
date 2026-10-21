import {distance,numeric} from './core.js';
export function idw(point,samples,{power=2,radiusKm=200}={}){
  if(!numeric(power)||power<=0||!numeric(radiusKm)||radiusKm<=0)throw Error('Invalid IDW parameters');
  let total=0,weight=0,exact=[];
  for(const s of samples){if(!numeric(s.value)||s.value<0||!numeric(s.lat)||!numeric(s.lng))continue;const d=distance(point,s);if(d<1e-6){exact.push(s.value);continue;}if(d<=radiusKm){const w=1/d**power;total+=w*s.value;weight+=w;}}
  if(exact.length)return exact.reduce((a,b)=>a+b,0)/exact.length;
  return weight?total/weight:null;
}
export function crossValidate(samples,options){let sq=0,abs=0,n=0;for(let i=0;i<samples.length;i++){const predicted=idw(samples[i],samples.filter((_,j)=>j!==i),options);if(predicted!==null&&numeric(samples[i].value)){const e=predicted-samples[i].value;sq+=e*e;abs+=Math.abs(e);n++;}}return {n,total:samples.length,rmse:n?Math.sqrt(sq/n):null,mae:n?abs/n:null};}
