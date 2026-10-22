import {footprintGroups} from './footprints.js';
// Pinned MIT library, loaded only when footprints are enabled. No API key.
self.onmessage=async({data})=>{try{const clipping=(await import('https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/+esm')).default;const result=footprintGroups(data.groups,clipping.union,data.pixelM);self.postMessage({result});}catch{self.postMessage({error:'Footprint calculation unavailable'});}};
