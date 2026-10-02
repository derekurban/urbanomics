import React,{useState} from 'react';
import {readTheme,saveTheme,resetTheme} from './theme.js';
export function AppearanceWorkspace(){
  const [values,setValues]=useState(readTheme),[notice,setNotice]=useState('');
  return <section className="appearance-workspace"><h2>Appearance</h2><p>One palette for the whole workspace. Account and category colors keep their own meaning.</p>
    <div className="appearance-colors">{Object.entries(values).map(([name,value])=><label key={name}><span>{name[0].toUpperCase()+name.slice(1)}</span><input type="color" aria-label={`Theme ${name}`} value={value} onChange={e=>setValues({...values,[name]:e.target.value})}/><code>{value}</code></label>)}</div>
    <div className="appearance-actions"><button className="primary" onClick={()=>{setValues(saveTheme(values));setNotice('Palette saved on this device.');}}>Apply palette</button><button onClick={()=>{setValues(resetTheme());setNotice('Neutral palette restored.');}}>Restore neutral palette</button><span role="status">{notice}</span></div>
    <p className="muted">Preferences are saved on this device.</p>
  </section>;
}
