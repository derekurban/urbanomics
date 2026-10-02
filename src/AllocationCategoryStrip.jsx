import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import { Icon } from "@derekurban/design-system";

export function AllocationCategoryStrip({groups, selected, disabled, onTag, children}) {
  const [open,setOpen]=useState(null), timer=useRef(), rail=useRef(), menu=useRef(), trigger=useRef();
  const close=()=>{clearTimeout(timer.current);setOpen(null);};
  const delay=()=>{clearTimeout(timer.current);timer.current=setTimeout(()=>setOpen(null),160);};
  const show=(group,el,keyboard=false)=>{clearTimeout(timer.current);trigger.current=el;const box=el.getBoundingClientRect(),below=innerHeight-box.bottom-18,above=box.top-18,wanted=Math.min(320,group.tags.length*42+52),up=below<Math.min(wanted,160)&&above>below,height=Math.min(wanted,Math.max(80,up?above:below));setOpen({group,left:Math.max(12,Math.min(box.left,innerWidth-292)),top:up?box.top-height-6:box.bottom+6,height,keyboard});};
  useEffect(()=>{const resize=()=>setOpen(null);window.addEventListener('resize',resize);return()=>{clearTimeout(timer.current);window.removeEventListener('resize',resize);};},[]);
  useEffect(()=>{if(open?.keyboard)menu.current?.querySelector('button')?.focus();},[open?.group.id,open?.keyboard]);
  useEffect(()=>{if(!open)return;const dismiss=e=>{if(!menu.current?.contains(e.target)&&!rail.current?.contains(e.target))close();};const key=e=>{if(e.key==='Escape'){e.preventDefault();close();trigger.current?.focus();}};const scroll=e=>{if(!menu.current?.contains(e.target))close();};window.addEventListener('scroll',scroll,true);document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',key);return()=>{window.removeEventListener('scroll',scroll,true);document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',key);};},[open]);
  return <div className="allocation-category-strip" ref={rail}>
    <div className="allocation-category-wrap" aria-label="Tag categories">
      {children}{groups.map(group=><button key={group.id} disabled={disabled} className={'allocation-category '+(open?.group.id===group.id?'is-open':'')} aria-label={'Category '+group.name} aria-haspopup="menu" aria-expanded={open?.group.id===group.id} onPointerEnter={e=>!disabled&&show(group,e.currentTarget)} onPointerLeave={delay} onClick={e=>show(group,e.currentTarget)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();show(group,e.currentTarget,true);}}}><i style={{background:group.color}}/>{group.name}<svg className="allocation-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></button>)}
      {!groups.length&&<span className="allocation-empty-categories">Add tags in Settings to get started.</span>}
    </div>
    {open&&createPortal(<div ref={menu} className="allocation-category-menu" role="menu" aria-label={open.group.name+' tags'} style={{left:open.left,top:open.top,maxHeight:open.height}} onPointerEnter={()=>clearTimeout(timer.current)} onPointerLeave={delay} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))close();}} onKeyDown={e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...menu.current.querySelectorAll('button')],index=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}}}>
      <small>{open.group.name}</small>{open.group.tags.map(tag=><button role="menuitemcheckbox" aria-label={tag.name} aria-checked={selected.includes(tag.id)} key={tag.id} onClick={()=>{onTag(tag);close();trigger.current?.focus();}}><i style={{background:tag.color}}/><span>{tag.name}</span><b><Icon name={selected.includes(tag.id)?'check':'plus'} size={14}/></b></button>)}{!open.group.tags.length&&<p>No tags in this category yet.</p>}
    </div>,document.body)}
  </div>;
}
