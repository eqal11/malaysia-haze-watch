export const CONFIG = Object.freeze({
  bounds: [[0.7,99.3],[7.5,119.5]],
  refreshMs: 5*60*1000, cacheMs:60*60*1000,
  staleHours: {ipu:3,hotspots:4,pm:6,wind:3},
  stationMaxAgeHours:6,
  idw:{power:2,cellKm:15,radiusKm:200},
  risk:{highFrp:50,mediumFrp:10,highConfidence:'high',mediumConfidence:'nominal'},
  endpoints:{ipu:'data/ipu.json',hotspots:'data/hotspots.geojson',hotspotsAttributed:'data/hotspots_attributed.geojson',meta:'data/meta.json',pipeline:'data/pipeline.json',
    districts:'data/boundaries/districts.geojson',states:'data/boundaries/states.geojson',
    land:'data/boundaries/malaysia.geojson',grid:'data/sampling-grid.json',
    pm:'https://air-quality-api.open-meteo.com/v1/air-quality',wind:'https://api.open-meteo.com/v1/forecast'},
  categories:[
    {max:50,bm:'Baik',en:'Good',color:'#1688df',advice:'Kualiti udara baik. Aktiviti luar boleh diteruskan.'},
    {max:100,bm:'Sederhana',en:'Moderate',color:'#32a65c',advice:'Individu yang sensitif perlu mengurangkan aktiviti luar jika mengalami gejala.'},
    {max:200,bm:'Tidak Sihat',en:'Unhealthy',color:'#f4ce32',advice:'Kurangkan aktiviti lasak di luar, terutama kanak-kanak, warga emas dan individu berpenyakit pernafasan.'},
    {max:300,bm:'Sangat Tidak Sihat',en:'Very unhealthy',color:'#ee8232',advice:'Elakkan aktiviti lasak di luar. Golongan berisiko digalakkan berada di dalam bangunan.'},
    {max:Infinity,bm:'Berbahaya',en:'Hazardous',color:'#d94551',advice:'Elakkan aktiviti luar. Ikuti nasihat semasa Jabatan Alam Sekitar dan pihak kesihatan.'}
  ]
});
