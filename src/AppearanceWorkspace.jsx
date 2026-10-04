import React,{useState} from 'react';
import {Segmented} from './ui.jsx';
import {readColorMode,saveColorMode} from './theme.js';
export function AppearanceWorkspace(){
  const [mode,setMode]=useState(readColorMode);
  return <section className="appearance-workspace"><p>Choose light or dark, or follow your computer's setting.</p>
    <Segmented size="md" label="Color mode" value={mode} onChange={value=>setMode(saveColorMode(value))} options={[{value:'light',label:'Light'},{value:'dark',label:'Dark'},{value:'system',label:'System'}]}/>
    <p className="appearance-note">Saved on this device. Account, tag and event colors keep their meaning in every mode.</p>
  </section>;
}
