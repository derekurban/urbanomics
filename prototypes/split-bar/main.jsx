import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TOTAL,tags,definition,sum,initial,add,remove,boundary,amount,evenly} from './model.mjs';
import './style.css';
const money=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n/100);
function Amount({part,onChange,onRemove}){
 const [value,setValue]=useState(null);const cancelled=useRef(false);
 const commit=()=>{if(cancelled.current){cancelled.current=false;setValue(null);return;}if(value!==null&&/^\d+(\.\d{0,2})?$/.test(value))onChange(Math.round(Number(value)*100));setValue(null);};
 return <label className="amount"><span>$</span><input aria-label={`Amount for ${definition(part.id).name}`} inputMode="decimal" value={value??(part.cents/100).toFixed(2)} onChange={e=>setValue(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){cancelled.current=true;e.currentTarget.blur();}}}/>{onRemove&&<button type="button" aria-label={`Remove ${definition(part.id).name}`} onClick={onRemove}>×</button>}</label>;
}
function App(){
 const [parts,setParts]=useState(initial),[variant,setVariant]=useState('inline'),[step,setStep]=useState(100),[history,setHistory]=useState([]),[dragging,setDragging]=useState(-1),[notice,setNotice]=useState(''),[saved,setSaved]=useState(false);
 const track=useRef(null),drag=useRef(null),current=useRef(parts);current.current=parts;
 function update(next,remember=true){const previous=current.current.map(p=>({...p}));if(remember)setHistory(h=>[...h.slice(-29),previous]);current.current=next;setParts(next);setSaved(false);setNotice('');}
 function preset(type){update(type==='single'?initial():type==='two'?[{id:'groceries',cents:7200},{id:'home',cents:5660},{id:'other',cents:0}]:[{id:'groceries',cents:4400},{id:'home',cents:3100},{id:'dining',cents:2400},{id:'personal',cents:2000},{id:'gifts',cents:960},{id:'other',cents:0}]);}
 const compact=variant!=='rail'&&variant!=='ribbon';
 const descriptions={rail:'The original rail, for comparison.',inline:'A single row per tag: name, amount and remove. Everything within reach.',grid:'Small fixed-width cells keep five or six tags easy to scan.',strip:'Amounts above, color below. One continuous editing surface.'};
 const labels=parts.filter(p=>p.id!=='other'||p.cents>0||parts.length===1);
 const geometry=parts.map((p,i)=>({id:p.id,start:sum(parts.slice(0,i))/TOTAL*100,end:sum(parts.slice(0,i+1))/TOTAL*100}));
 const handles=geometry.slice(0,-1).map((g,i,all)=>({...g,lane:all.slice(0,i).filter(h=>Math.abs(h.end-g.end)<5).length%3}));
 function start(e,i){e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);const rect=track.current.getBoundingClientRect();drag.current={i,rect,parts:current.current.map(p=>({...p})),x:e.clientX,absolute:sum(current.current.slice(0,i+1))};setHistory(h=>[...h.slice(-29),current.current.map(p=>({...p}))]);setDragging(i);setSaved(false);}
 function move(e){if(!drag.current)return;const d=drag.current;update(boundary(d.parts,d.i,d.absolute+(e.clientX-d.x)/d.rect.width*TOTAL,step),false);}
 function end(){drag.current=null;setDragging(-1);}
 const bar=<div className="bar-zone">
  <div ref={track} className="track" aria-label="Allocation bar">
   <div className="segments">{parts.map(p=><div key={p.id} className="segment" style={{width:`${p.cents/TOTAL*100}%`,'--color':definition(p.id).color}}>{variant==='ribbon'&&p.cents/TOTAL>.08&&<span>{Math.round(p.cents/TOTAL*100)}<small>%</small></span>}</div>)}</div>
   {handles.map((g,i)=><button key={g.id} className={`divider ${dragging===i?'is-dragging':''}`} style={{left:`${g.end}%`,'--lane':g.lane}} role="slider" aria-label={`Split after ${definition(g.id).name}`} aria-valuemin={sum(parts.slice(0,i))} aria-valuemax={sum(parts.slice(0,i+2))} aria-valuenow={sum(parts.slice(0,i+1))} aria-valuetext={`${definition(g.id).name} ${money(parts[i].cents)}; ${definition(parts[i+1].id).name} ${money(parts[i+1].cents)}`} onPointerDown={e=>start(e,i)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={e=>{const val=sum(parts.slice(0,i+1));let target;if(e.key==='ArrowLeft'||e.key==='ArrowDown')target=val-step*(e.shiftKey?10:1);if(e.key==='ArrowRight'||e.key==='ArrowUp')target=val+step*(e.shiftKey?10:1);if(e.key==='Home')target=sum(parts.slice(0,i));if(e.key==='End')target=sum(parts.slice(0,i+2));if(target!==undefined){e.preventDefault();update(boundary(parts,i,target,step));}}}><i/><i/><span className="grip-tooltip">{money(parts[i].cents)}</span></button>)}
  </div>
  <div className="scale"><span>0</span><span>{parts.at(-1).cents===0&&parts.length>1?'Pull the end tab left to leave a remainder in Other':`${Math.round(parts.at(-1).cents/TOTAL*100)}% in Other`}</span><span>{money(TOTAL)}</span></div>
 </div>;
 const editors=<div className="labels" style={{'--count':labels.length}}>{labels.map(p=><div key={p.id} className="tag-editor" style={{'--color':definition(p.id).color,'--dark':definition(p.id).dark}}><div className="label-heading"><i/><strong>{definition(p.id).name}</strong>{p.id==='other'&&<span className="auto">Auto</span>}</div><Amount part={p} onChange={cents=>update(amount(parts,p.id,cents))} onRemove={p.id!=='other'?()=>{update(remove(parts,p.id));setNotice(`${definition(p.id).name} moved to Other`);}:undefined}/></div>)}</div>;
 return <main>
  <header className="page-head"><a className="wordmark" href="#">urbanomics<span>.</span></a><span className="study-label">INTERACTION STUDY <b>03</b></span><span className="sample-dot">Sample data only</span></header>
  <section className="intro"><div><p className="eyebrow">ONE AMOUNT. A FEW PLACES.</p><h1>A split you can feel.</h1><p>Choose a tag. Pull a divider. Give every dollar a place.</p></div><div className="variants" aria-label="Design variant">{[['inline','Inline'],['grid','Mini grid'],['strip','Integrated'],['rail','Original rail']].map(([id,name])=><button key={id} aria-pressed={variant===id} onClick={()=>setVariant(id)}>{name}</button>)}</div></section>
  <p className="variant-description">{descriptions[variant]}</p>
  <article className={`transaction ${compact?'compact':''} ${variant} ${dragging>=0?'dragging':''}`}>
   <header className="receipt"><div className="receipt-icon">↗</div><div><small>EXPENSE · SAMPLE TRANSACTION</small><h2>Market & home</h2><p>Everyday account <span>·</span> September 18</p></div><div className="receipt-total"><strong>{money(TOTAL)}</strong><small>CAD</small></div></header>
   <div className="workspace">
   <div className="allocation-heading"><h3>Where did it go?</h3><div className="precision"><span>Snap to</span><button aria-pressed={step===100} onClick={()=>setStep(100)}>$1</button><button aria-pressed={step===1} onClick={()=>setStep(1)}>$0.01</button></div></div>
   <section className="allocation" aria-label="Split editor">
    {(variant==='ribbon'||variant==='strip')&&editors}{bar}{variant!=='ribbon'&&variant!=='strip'&&editors}
   </section>
   <div className="allocation-tools"><span className="balanced"><i>✓</i> {compact?'Balanced':`${money(sum(parts))} accounted for`}</span><button disabled={parts.length<3} onClick={()=>update(evenly(parts))}>Split evenly</button><button disabled={!history.length} onClick={()=>{const previous=history.at(-1);setHistory(h=>h.slice(0,-1));update(previous,false);}}>↶ Undo</button></div>
   <section className="tag-picker"><div><h3>Add a tag</h3><small>Everything stays on this card.</small></div><div className="choices">{tags.filter(t=>t.id!=='other').map(t=><button key={t.id} aria-pressed={parts.some(p=>p.id===t.id)} disabled={parts.some(p=>p.id===t.id)} onClick={()=>update(add(parts,t.id))} style={{'--color':t.color}}><i/>{t.name}<span>{parts.some(p=>p.id===t.id)?'✓':'+'}</span></button>)}</div></section>
   <footer><p role="status">{notice||(compact?'Drag a divider · Edit an amount · × returns it to Other':'Amounts and × controls live with the bar. No separate split screen.')}</p><button className={`save ${saved?'saved':''}`} onClick={()=>{setSaved(true);setNotice('Sample split saved for this preview. No app data was changed.');}}>{saved?'Split saved ✓':compact?'Save split':'Try saving this split'}<span>↗</span></button></footer>
   </div>
  </article>
  <section className="trial-controls"><div><span>START WITH</span><button onClick={()=>preset('single')}>One tag · 100%</button><button onClick={()=>preset('two')}>Two tags</button><button onClick={()=>preset('many')}>Five tags</button></div><p>Drag tabs or use arrow keys. Remove a tag to return its amount to Other.</p></section>
  <div className="design-notes"><div><b>01</b><h3>One tag, the whole amount</h3><p>The end tab is still movable. Pull it left and a gray Other section grows into the space.</p></div><div><b>02</b><h3>More tags, more dividers</h3><p>A new tag takes the Other remainder first. Without a remainder, it shares the largest section.</p></div><div><b>03</b><h3>Small slices stay usable</h3><p>Labels keep room for amounts and remove controls, even when a segment is only a cent wide.</p></div></div>
  <div className="footnote">Disposable prototype · Refresh to reset · Same split in every design</div>
 </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
