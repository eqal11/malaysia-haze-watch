// Nominal display-grid footprints. These are NOT observed fire perimeters.
const R=6371008.8,DEG=Math.PI/180;
export function pixelCells(rows,pixelM=375){
  if(!Number.isFinite(pixelM)||pixelM<=0)throw Error('Invalid nominal cell size');
  const cells=new Map();
  for(const row of rows){const [lng,lat]=row;if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>85)throw Error('Invalid footprint coordinates');const x=Math.floor(lng*DEG*R/pixelM),y=Math.floor(lat*DEG*R/pixelM);cells.set(`${x}:${y}`,[x,y]);}
  return [...cells.values()];
}
export function footprintGeometry(rows,union,pixelM=375){
  const cells=pixelCells(rows,pixelM);if(!cells.length)return null;
  // Union on integer grid coordinates first, retaining holes and gaps. No hull,
  // smoothing or bridging between distant detections is applied.
  const polygons=cells.map(([x,y])=>[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]);
  const batches=[];for(let i=0;i<polygons.length;i+=256)batches.push(union(...polygons.slice(i,i+256)));
  const merged=batches.length===1?batches[0]:union(...batches);
  const coordinates=merged.map(p=>p.map(r=>r.map(([x,y])=>[x*pixelM/R/DEG,y*pixelM/R/DEG])));
  return {geometry:{type:'MultiPolygon',coordinates},cell_count:cells.length,nominal_area_km2:cells.length*(pixelM/1000)**2};
}
export function footprintGroups(groups,union,pixelM=375){
  const features=[];
  for(const group of groups){const footprint=footprintGeometry(group.rows,union,pixelM);if(!footprint)continue;features.push({type:'Feature',geometry:footprint.geometry,properties:{id:group.id,event_id:group.event_id??null,class:group.class,kind:group.kind,cell_count:footprint.cell_count,nominal_area_km2:footprint.nominal_area_km2}});}
  return {type:'FeatureCollection',features};
}
