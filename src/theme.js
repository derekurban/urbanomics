import defaults from '../electron/theme-config.json';
const key='urbanomics.appearance.v1';
export function readTheme(){
  try{return {...defaults,...valid(JSON.parse(localStorage.getItem(key)||'{}'))};}catch{return {...defaults};}
}
function valid(values){return Object.fromEntries(Object.entries(values||{}).filter(([name,value])=>name in defaults&&/^#[0-9a-f]{6}$/i.test(value)));}
export function applyTheme(values){
  const palette={...defaults,...valid(values)};
  for(const [name,value] of Object.entries(palette))document.documentElement.style.setProperty('--theme-'+name,value);
  return palette;
}
export function saveTheme(values){const palette=applyTheme(values);localStorage.setItem(key,JSON.stringify(palette));return palette;}
export function resetTheme(){localStorage.removeItem(key);return applyTheme(defaults);}
applyTheme(readTheme());
