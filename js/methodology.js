import {setLang,lang} from './i18n.js';
const button=document.getElementById('method-language');
function render(value){
  setLang(value);
  button.textContent=value==='bm'?'BM / EN':'EN / BM';
  button.setAttribute('aria-label',value==='bm'?'Switch to English':'Tukar ke Bahasa Melayu');
  document.title=(value==='bm'?'Sumber & metodologi':'Sources & methodology')+' | Malaysia Haze Watch';
}
button.addEventListener('click',()=>render(lang==='bm'?'en':'bm'));
render('bm');
