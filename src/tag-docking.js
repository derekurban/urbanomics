import {useLayoutEffect,useRef} from 'react';

// Measure only the active card on a selection change, never the whole Rolodex.
export function useTagDocking(root,disabled,selection){
 const pending=useRef(null),running=useRef([]);
 const clear=()=>{for(const finish of running.current)finish();running.current=[];};
 const capture=(id,focus)=>{
  clear();const before=new Map();
  root.current?.querySelectorAll('[data-tag-tile]').forEach(node=>before.set(node.dataset.tagTile,{rect:node.getBoundingClientRect(),node}));
  pending.current={id,focus,before};
 };
 useLayoutEffect(()=>{
  if(disabled){pending.current=null;clear();return;}
  const change=pending.current;if(!change)return;pending.current=null;
  const nodes=[...root.current.querySelectorAll('[data-tag-tile]')],target=nodes.find(n=>n.dataset.tagTile===change.id);
  target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  const focusTarget=()=>{if(change.focus)(target?.matches('button,input')?target:target?.querySelector('button,input'))?.focus({preventScroll:true});};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){focusTarget();return;}
  for(const node of nodes){
   const old=change.before.get(node.dataset.tagTile);if(!old)continue;
   const end=node.getBoundingClientRect(),start=old.rect;
   if(node.dataset.tagTile!==change.id){
    if(old.node!==node||Math.abs(start.x-end.x)+Math.abs(start.y-end.y)<1)continue;
    const a=node.animate([{transform:`translate(${start.x-end.x}px,${start.y-end.y}px)`},{transform:'none'}],{duration:260,easing:'cubic-bezier(.2,.75,.25,1)'});
    running.current.push(()=>a.cancel());continue;
   }
   const hero=document.createElement('div');hero.className='ct-tag-flight';hero.setAttribute('aria-hidden','true');
   const color=getComputedStyle(node).getPropertyValue('--tag-color');
   hero.style.setProperty('--tag-color',color);
   const dot=document.createElement('i'),label=document.createElement('span');label.textContent=node.dataset.tagName;hero.append(dot,label);
   Object.assign(hero.style,{left:`${end.x}px`,top:`${end.y}px`,width:`${end.width}px`,height:`${end.height}px`});
   document.body.append(hero);node.style.visibility='hidden';
   const a=hero.animate([{transform:`translate(${start.x-end.x}px,${start.y-end.y}px)`,width:`${start.width}px`,height:`${start.height}px`},{transform:'none',width:`${end.width}px`,height:`${end.height}px`}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
   let finished=false;const finish=(restoreFocus=false)=>{if(finished)return;finished=true;node.style.visibility='';hero.remove();a.cancel();if(restoreFocus)focusTarget();};
   running.current.push(()=>finish());a.onfinish=()=>finish(true);
  }
 },[selection,disabled]);
 useLayoutEffect(()=>()=>{pending.current=null;clear();},[]);
 return capture;
}
