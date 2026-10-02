// Measure the settled card once; animate toward fixed endpoints rather than
// chasing a receipt whose grid track is still resizing underneath the hero.
const parts={title:'.ex-receipt-title',amount:'.ex-receipt-main b',account:'.ex-receipt-meta span',date:'.ex-receipt-meta time',dot:'.ex-receipt-meta i'};
const capture=node=>({box:node.getBoundingClientRect(),fontSize:parseFloat(getComputedStyle(node).fontSize)});
export function captureTransferTile(tile,id){
 const selectors={title:'strong',amount:'b',account:'.ex-candidate-account',date:'time',dot:'i'};
 return {id,box:tile.getBoundingClientRect(),background:getComputedStyle(tile).backgroundColor,
   parts:Object.fromEntries(Object.entries(selectors).map(([key,selector])=>[key,capture(tile.querySelector(selector))]))};
}
export function animateTransferHero(root,target,source,onFinish){
 const duration=280,easing='cubic-bezier(.2,.7,.3,1)',animations=[];
 root.dataset.hero='true';target.parentElement.classList.add('ex-hero-settled');
 const measure=root.cloneNode(true);measure.classList.add('ex-hero-measure');root.parentElement.appendChild(measure);
 const measuredRoot=measure.getBoundingClientRect(),destination=measure.querySelector('.ex-receipt.from'),dest=destination.getBoundingClientRect();
 const local=r=>({x:r.x-measuredRoot.x,y:r.y-measuredRoot.y,width:r.width,height:r.height});
 const end=local(dest),origin=root.getBoundingClientRect();
 const start={x:source.box.x-origin.x,y:source.box.y-origin.y,width:source.box.width,height:source.box.height};
 const hero=document.createElement('div');hero.className='ex-transfer-hero';hero.setAttribute('aria-hidden','true');
 const play=(node,frames)=>{const animation=node.animate(frames,{duration,easing,fill:'both'});animations.push(animation);return animation;};
 const measuredStyle=getComputedStyle(destination),background=measuredStyle.backgroundColor,border=measuredStyle.borderLeftColor;
 const nodes=Object.entries(parts).map(([key,selector])=>{
   const original=destination.querySelector(selector),node=original.cloneNode(true),style=getComputedStyle(original),to=local(original.getBoundingClientRect());
   if(key==='account'){
     const dot=original.querySelector('i');to.x+=dot.offsetWidth+parseFloat(style.gap);to.width-=dot.offsetWidth+parseFloat(style.gap);node.querySelector('i')?.remove();
   }
   node.className='ex-hero-part ex-hero-'+key;
   Object.assign(node.style,{left:to.x-end.x+'px',top:to.y-end.y+'px',width:to.width+'px',height:to.height+'px',fontSize:style.fontSize,fontFamily:style.fontFamily,fontWeight:style.fontWeight,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,color:style.color,transformOrigin:'0 0'});
   if(key==='dot')node.style.background=style.backgroundColor;
   hero.appendChild(node);
   return {node,key,to,fontSize:parseFloat(style.fontSize)};
 });
 const close=destination.querySelector('.ex-remove').cloneNode(true);close.disabled=true;close.tabIndex=-1;close.className='ex-hero-close';hero.appendChild(close);
 measure.remove();root.appendChild(hero);target.style.visibility='hidden';
 Object.assign(hero.style,{left:end.x+'px',top:end.y+'px',width:end.width+'px',height:end.height+'px',borderColor:'transparent',borderLeftColor:border});
 const flight=play(hero,[{left:start.x+'px',top:start.y+'px',width:start.width+'px',height:start.height+'px',background:source.background,borderLeftWidth:'1px'},
   {left:end.x+'px',top:end.y+'px',width:end.width+'px',height:end.height+'px',background,borderLeftWidth:'3px'}]);
 for(const {node,key,to,fontSize} of nodes){
   const from=source.parts[key],dx=from.box.x-source.box.x-(to.x-end.x),dy=from.box.y-source.box.y-(to.y-end.y),scale=key==='dot'?from.box.width/to.width:from.fontSize/fontSize;
   play(node,[{transform:`translate(${dx}px,${dy}px) scale(${scale})`},{transform:'translate(0,0) scale(1)'}]);
   const currency=node.querySelector('small');if(currency)play(currency,[{opacity:0,offset:0},{opacity:0,offset:.65},{opacity:1,offset:1}]);
 }
 play(close,[{opacity:0,offset:0},{opacity:0,offset:.65},{opacity:1,offset:1}]);
 let cancelled=false;
 const cleanup=()=>{cancelled=true;animations.forEach(a=>a.cancel());hero.remove();target.style.visibility='';delete root.dataset.hero;};
 flight.finished.then(()=>{if(!cancelled){cleanup();onFinish();}}).catch(()=>{});
 return cleanup;
}
