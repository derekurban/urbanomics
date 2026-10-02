import React,{useState} from 'react';
import {SegmentedControl} from '@derekurban/design-system';
import {readColorMode,saveColorMode} from './theme.js';
export function AppearanceWorkspace(){
  const [mode,setMode]=useState(readColorMode);
  return <section className="appearance-workspace"><h2>Appearance</h2><p>Colors, type and spacing come from the design system. Choose light, dark, or follow your computer's setting.</p>
    <div className="du-host"><SegmentedControl label="Color mode" value={mode} onChange={value=>setMode(saveColorMode(value))} options={[{value:'light',label:'Light'},{value:'dark',label:'Dark'},{value:'system',label:'System'}]}/></div>
    <p className="appearance-note">Saved on this device. Account and category colors keep their own meaning in every mode.</p>
  </section>;
}
