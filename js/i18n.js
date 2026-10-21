export let lang='bm';
const strings={
  eyebrow:['PEMANTAUAN ALAM SEKITAR TERBUKA','OPEN ENVIRONMENTAL MONITORING'],
  tagline:['Udara kita. Tanggungjawab bersama.','Our air. Our shared responsibility.'],
  overview:['Gambaran semasa','Current overview'],mapTitle:['Terokai kualiti udara','Explore air quality'],mapSub:['Malaysia · Semenanjung, Sabah & Sarawak','Malaysia · Peninsula, Sabah & Sarawak'],
  national:['Seluruh Malaysia','All Malaysia'],state:['Negeri','State'],location:['Lokasi saya','My location'],reset:['Papar Malaysia','Fit Malaysia'],
  layers:['Lapisan peta','Map layers'],districts:['IPU daerah','District API'],stations:['Stesen JAS','DOE stations'],pm:['PM2.5 · model','PM2.5 · model'],ipuGrid:['IPU · interpolasi','API · interpolation'],hotspots:['Titik panas','Hotspots'],wind:['Angin · 10 m','Wind · 10 m'],
  measured:['Bacaan stesen','Station reading'],estimated:['Anggaran','Estimated'],unavailable:['Data tidak tersedia','Data unavailable'],loading:['Memuatkan…','Loading…'],empty:['Tiada data untuk pilihan ini','No data for this selection'],
  worst:['Daerah IPU tertinggi','Highest district API'],validStations:['Stesen dengan bacaan sah','Stations with valid readings'],hot24:['Titik panas · 24 jam','Hotspots · 24 hours'],windMean:['Purata angin','Average wind'],
  ranking:['Senarai pemantauan','Monitoring list'],search:['Cari stesen atau daerah…','Search station or district…'],name:['Stesen / daerah','Station / district'],value:['IPU','API'],type:['Jenis','Type'],category:['Kategori','Category'],updated:['Dikemas kini','Updated'],
  stationTrend:['Trend IPU · 24 jam','API trend · 24 hours'],distribution:['Taburan kategori stesen','Station category distribution'],hotTrend:['Pengesanan titik panas · 48 jam','Hotspot detections · 48 hours'],historyEmpty:['Sejarah belum mencukupi. Bacaan sebenar dikumpul setiap 30 minit.','Insufficient history. Real readings accumulate every 30 minutes.'],
  controls:['Tetapan interpolasi','Interpolation settings'],power:['Kuasa IDW','IDW power'],cell:['Saiz grid (km)','Grid size (km)'],radius:['Jejari carian (km)','Search radius (km)'],apply:['Kira semula','Recalculate'],
  methodNote:['Anggaran IDW, bukan bacaan tempatan. PM2.5 ialah model CAMS, bukan stesen JAS.','IDW estimates, not local measurements. PM2.5 is a CAMS model, not a DOE station observation.'],
  region:['Wilayah titik panas','Hotspot region'],allRegions:['Semua wilayah','All regions'],window:['Tempoh pengesanan','Detection window'],hours:['jam','hours'],
  sources:['Status sumber data','Data source status'],stale:['Data lama','Stale data'],lastGood:['Kejayaan terakhir','Last successful fetch'],observed:['Masa data','Data time'],never:['Belum tersedia','Never available'],
  footer:['Projek bebas sumber terbuka. Bukan nasihat kesihatan rasmi. Rujuk JAS dan MetMalaysia.','Independent open-source project. Not an official health advisory. Refer to DOE and MetMalaysia.'],
  advice:['Nasihat kesihatan (BM)','Health advice (Malay)'],pollutant:['Pencemar utama','Main pollutant'],unknown:['Tidak dilaporkan','Not reported'],
  layersNote:['Warna pudar = anggaran · kelabu = tiada data','Lighter fill = estimate · grey = no data'],
  riskHigh:['Bahaya','High'],riskMedium:['Sederhana','Moderate'],riskLow:['Rendah','Low'],
  flowNote:['Arah aliran ialah petunjuk angin permukaan, bukan bukti pengangkutan jerebu.','Flow is a surface-wind indicator, not evidence of haze transport.'],
  toward:['Komponen aliran ke Malaysia','Flow component toward Malaysia'],away:['Aliran tidak menghala ke Malaysia','Flow not directed toward Malaysia'],
  analytics:['Analisis','Analytics'],health:['Panduan kesihatan','Health guidance'],healthBody:['Pilih daerah untuk nasihat mengikut IPU. Anggaran tidak menggantikan bacaan stesen.','Select a district for advice by API. Estimates do not replace station observations.'],
  partial:['Liputan terhad','Partial coverage'],basemap:['Peta asas tidak tersedia; lapisan data masih boleh digunakan.','Basemap unavailable; data layers remain usable.'],
  noNearby:['Tiada stesen dalam jejari carian','No station within search radius'],geoFailed:['Lokasi tidak dapat diperoleh. Semak kebenaran pelayar.','Unable to get location. Check browser permissions.'],nearest:['Stesen terdekat','Nearest station'],outside:['Lokasi di luar sempadan Malaysia','Location outside Malaysia'],
  legend:['Petunjuk','Legend'], cv:['Pengesahan silang keluar-satu','Leave-one-out cross-validation'],cvNote:['Nilai IPU stesen; bukan ketepatan PM2.5 model.','Station API values; not model PM2.5 accuracy.'],
  about:['Sumber & metodologi','Sources & methodology'], sourceType:['Sumber nilai','Value source'],home:['Peta & gambaran','Map & overview'],
};
export function t(key){return strings[key]?.[lang==='bm'?0:1]||key;}
export function setLang(value){lang=value;document.documentElement.lang=value==='bm'?'ms':'en';document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));document.querySelectorAll('[data-i18n-placeholder]').forEach(e=>e.placeholder=t(e.dataset.i18nPlaceholder));}
export function time(value){if(!value)return t('never');const d=new Date(value);return Number.isNaN(d.valueOf())?t('never'):new Intl.DateTimeFormat(lang==='bm'?'ms-MY':'en-MY',{timeZone:'Asia/Kuala_Lumpur',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' MYT';}
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
