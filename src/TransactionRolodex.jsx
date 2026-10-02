import React, {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import './experimental-roll.css';
const WINDOW_RADIUS=8;
const windowIds=(queue,position,pinned=null)=>{
 const center=Math.round(position),ids=queue.slice(Math.max(0,center-WINDOW_RADIUS),center+WINDOW_RADIUS+1);
 if(pinned!==null&&!ids.includes(pinned))ids.push(pinned);
 return ids;
};
const clamp=(n,min=0,max=Infinity)=>Math.max(min,Math.min(max,n));
// Bottom then top folds (400ms), a seal (100ms), then departure (250ms).

// The approved motion study, with stable ledger IDs and no finance or sample state.
export function TransactionRolodex({items, renderCard, controller, onFocus, onSent, disabled}) {
  const registry=useRef([]), indexById=useRef(new Map()), registeredItems=useRef(null), latest=useRef(null),root=useRef(null);
  if(registeredItems.current!==items){registeredItems.current=items;for(const item of items){let i=indexById.current.get(item.id);if(i===undefined){i=registry.current.length;indexById.current.set(item.id,i);}registry.current[i]=item;}}
  latest.current={items,onFocus,onSent,disabled};
  const initial=indexById.current.get(items[0]?.id)??-1;
  const [selected,setSelected]=useState(initial),[settled,setSettled]=useState(initial);
  const [sending,setSending]=useState(null),[ready,setReady]=useState(false),[filtering,setFiltering]=useState(false);
  const sendSnapshot=useRef(null),saveResult=useRef(Promise.resolve(true));
  const sendingRef=useRef(null),envelope=useRef(null),queueRef=useRef(null);
  if(queueRef.current===null)queueRef.current=items.map(r=>indexById.current.get(r.id));
  const [queue,setQueue]=useState(queueRef.current);
  const [mountedIds,setMountedIds]=useState(()=>windowIds(queueRef.current,0));
  const mountedIdsRef=useRef(mountedIds);
  // Keep ledger IDs/drafts independent of the small set of mounted faces.
  function mountWindow(position,synchronous=false){
    const next=windowIds(queueRef.current,position,sendingRef.current),old=mountedIdsRef.current;
    if(next.length===old.length&&next.every((id,i)=>id===old[i]))return;
    mountedIdsRef.current=next;
    if(synchronous)flushSync(()=>setMountedIds(next));else setMountedIds(next);
  }
  const scene=useRef(null),deck=useRef(null),rail=useRef(null),leftRail=useRef(null);
  const cards=useRef(new Map()),ticks=useRef(new Map()),leftTicks=useRef(new Map()),api=useRef(null);
  const signature=useMemo(()=>JSON.stringify(items.map(r=>r.id)),[items]);
  
  const lastSignature=useRef(signature);
  useEffect(()=>{if(!disabled&&lastSignature.current!==signature){lastSignature.current=signature;api.current?.filter();}},[signature,disabled]);
  useEffect(()=>{latest.current.onFocus?.(queue.includes(selected)?registry.current[selected]:null,ready&&!filtering&&sending===null);},[selected,ready,filtering,sending,queue]);
  useLayoutEffect(()=>{api.current?.measure();},[mountedIds]);
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let x=0,target=0,velocity=0,frame=0,previousTime=0;
    let wheelTimer=0,gesture=null,focused=initial,destroyed=false;
    let cardHeight=270,spread=146,cardTop=0,cardLeft=0;
    const tickGap=21;
    let gap=0,gapVelocity=0,gapIndex=0,transition=null;
    const filterQueue=()=>latest.current.items.map(r=>indexById.current.get(r.id));
    let positionedQueue=null,positions=new Map();
    const limit=()=>queueRef.current.length-1;
    const bound=n=>clamp(n,0,limit());
    const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
    function paint(updateWindow=true) {
      if(destroyed||!scene.current)return;
      const positionX=x;
      if(positionedQueue!==queueRef.current){positionedQueue=queueRef.current;positions=new Map(positionedQueue.map((id,i)=>[id,i]));}
      if(updateWindow)mountWindow(x);
      const nearest = queueRef.current[Math.round(bound(x))]??null;
      if(nearest!==focused){focused=nearest;setSelected(nearest);}
      scene.current.dataset.position=x.toFixed(4);
      scene.current.dataset.gap=gap.toFixed(4);
      setReady(!transition && queueRef.current.length>0 && gap===0 && !gesture && x===target && Number.isInteger(x) && Math.abs(velocity)<.012);
      const phase=positionX-Math.floor(positionX), handoff=Math.sin(Math.PI*phase);
      const rearSpread=spread+cardHeight*.47*handoff;
      function draw(card,d,hidden=false){
        const distance=Math.abs(d),direction=Math.sign(d);
        // Preserve the approved monotone path, rounded folds and spring timing.
        let y=direction*(distance<=1 ? spread*(1-Math.pow(1-distance,4)) : (1-.6*handoff)*rearSpread);
        const foldProgress=clamp((distance-.5)/.5,0,1);
        const extraFold=8*foldProgress*foldProgress*(3-2*foldProgress);
        let tilt=motion.matches?0:-direction*(Math.min(43,distance*43)+extraFold);
        let z=motion.matches?0:-Math.min(distance,5)*94;
        let scale=distance<=1?1-.06*distance:.94*Math.max(0,2-distance);
        // A resting face is normal, pixel-aligned text, not a scaled GPU texture.
        const resting=distance===0 && !gesture && !transition;
        card.style.left=cardLeft+'px';card.style.top=cardTop+'px';
        card.style.transform=resting?'none':`translate3d(0, ${y}px, ${z}px) rotateX(${tilt}deg) scale(${scale})`;
        card.style.willChange=resting?'auto':'transform';
        card.style.backfaceVisibility=resting?'visible':'hidden';
        card.style.zIndex=String(100-Math.round(distance*12));
        card.style.visibility=scale===0||hidden?'hidden':'visible';
        const focusDistance=clamp((distance-.25)/.75,0,1);
        const softness=focusDistance*focusDistance*(3-2*focusDistance);
        // Solid backing + wash gives 70% apparent opacity without rear-card ghosts.
        card.style.setProperty('--softness',String(softness));
        card.style.setProperty('--shade-strength','.3');
        const blur=2*softness;
        card.style.filter=blur===0?'none':`blur(${blur}px)`;
      }
      cards.current.forEach((card,i)=>{
        if(!card)return;
        const position=positions.get(i)??-1;
        if(position===-1){card.style.visibility='hidden';return;}
        draw(card,position-x+(position>=gapIndex?gap:0),sendingRef.current===i);
      });
      [ticks.current,leftTicks.current].forEach(list=>list.forEach((tick,i)=>{
        if(!tick)return;
        const position=positions.get(i)??-1,offset=position-x+(position>=gapIndex?gap:0),distance=Math.abs(offset);
        tick.style.visibility=position===-1||sendingRef.current===i?'hidden':'visible';
        tick.style.transform=`translateY(${offset*tickGap}px)`;
        tick.style.setProperty('--tick-width',`${7+23*Math.exp(-distance*distance/5.5)}px`);
        tick.style.setProperty('--tick-alpha',String(.19+.81*Math.exp(-distance*distance/1.4)));
        tick.style.opacity=String(clamp((6.1-distance)/1.2,0,1));
        tick.style.pointerEvents=distance>5.8?'none':'auto';
      }));
    }
    function step(time) {
      frame=0;if(destroyed)return;
      if(transition){
        const elapsed=time-transition.started;
        let complete=true;
        for(const item of transition.items){
          const t=clamp((elapsed-item.delay)/transition.duration,0,1),ease=smooth(t);
          complete&&=t===1;
          const arriving=transition.phase==='in';
          item.shift=arriving?-transition.distance*Math.pow(1-t,3):item.fromShift+(transition.distance-item.fromShift)*ease;
          item.alpha=arriving?ease:item.fromAlpha*(1-ease);
          applyFlight(item);
        }
        const emptyT=smooth(clamp(elapsed/transition.duration,0,1));
        scene.current.style.setProperty('--empty-shift',`${transition.phase==='in'?-transition.distance*(1-emptyT):transition.distance*emptyT}px`);
        scene.current.style.setProperty('--empty-alpha',String(transition.phase==='in'?emptyT:1-emptyT));
        if(!transition.items.length)complete=elapsed>=transition.duration;
        if(complete){
          if(transition.phase==='out'){
            // Every departing card and tick is invisible before the queue changes.
            applyFilterQueue();
            transition.phase='in';transition.started=time;transition.duration=220;
            transition.items=captureFlights(true);
            scene.current.dataset.transition='in';
            scene.current.style.setProperty('--empty-shift',`${-transition.distance}px`);
            scene.current.style.setProperty('--empty-alpha','0');
          }else{finishFilter();return;}
        }
        frame=requestAnimationFrame(step);return;
      }
      const dt=Math.min(.032,Math.max(.001,(time-(previousTime||time-16))/1000));previousTime=time;
      const omega=16.5,offset=x-target,next=velocity+omega*offset,decay=Math.exp(-omega*dt);
      x=target+(offset+next*dt)*decay;velocity=(velocity-omega*next*dt)*decay;
      const gapNext=gapVelocity+omega*gap;
      gap=(gap+gapNext*dt)*decay;gapVelocity=(gapVelocity-omega*gapNext*dt)*decay;
      if(Math.abs(x-target)<.0008&&Math.abs(velocity)<.012&&gap<.0008&&Math.abs(gapVelocity)<.012){
        x=target;velocity=0;gap=0;gapVelocity=0;previousTime=0;scene.current.dataset.moving='false';
        if(Number.isInteger(target))setSettled(queueRef.current[target]??null);
      }else frame=requestAnimationFrame(step);
      paint();
    }
    function animate(){
      scene.current.dataset.moving='true';setReady(false);
      if(motion.matches){x=target;velocity=0;gap=0;gapVelocity=0;paint();scene.current.dataset.moving='false';if(Number.isInteger(target))setSettled(queueRef.current[target]??null);return;}
      if(!frame){previousTime=performance.now();frame=requestAnimationFrame(step);}
    }
    function go(index,internal=false){
      if((latest.current.disabled&&!internal)||transition||(sendingRef.current!==null&&!internal)||!queueRef.current.length)return;
      clearTimeout(wheelTimer);gesture=null;scene.current.dataset.dragging='false';
      target=Math.round(bound(index));animate();
    }
    function stop(){cancelAnimationFrame(frame);frame=0;previousTime=0;clearTimeout(wheelTimer);}
    function resistance(n){return n<0?-Math.min(.3,Math.sqrt(-n)*.12):n>limit()?limit()+Math.min(.3,Math.sqrt(n-limit())*.12):n;}
    function onWheel(e){
      if(e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.target.closest('[data-roll-control]'))return;
      e.preventDefault();if(latest.current.disabled||transition||gesture||sendingRef.current!==null)return;
      const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?260:1);
      target=bound(target+clamp(pixels/160,-1.1,1.1));animate();clearTimeout(wheelTimer);
      wheelTimer=setTimeout(()=>go(Math.round(target)),130);
    }
    function onDown(e){
      if(e.target.closest('button, input, select, label, [data-roll-control], [draggable=true]') || latest.current.disabled)return;
      if(!e.isPrimary||e.button!==0||transition||!queueRef.current.length||sendingRef.current!==null)return;
      stop();const element=e.currentTarget,isRail=element===rail.current||element===leftRail.current;
      gesture={id:e.pointerId,origin:x,y:e.clientY,lastY:e.clientY,time:performance.now(),speed:0,priorVelocity:velocity,moved:false,rail:isRail,element,clicked:Number(e.target.closest('[data-card-index], [data-tick-index]')?.dataset[isRail?'tickIndex':'cardIndex'])};
      element.setPointerCapture(e.pointerId);scene.current.dataset.dragging='true';setReady(false);velocity=0;target=x;
    }
    function onMove(e){
      const g=gesture;if(!g||g.id!==e.pointerId)return;
      const dy=e.clientY-g.y;if(!g.moved&&Math.abs(dy)<5)return;g.moved=true;
      const stride=g.rail?tickGap:Math.max(90,spread*.86),now=performance.now(),dt=Math.max(8,now-g.time);
      const speed=-(e.clientY-g.lastY)/stride/dt*1000;
      g.speed=g.speed*.3+speed*.7;g.lastY=e.clientY;g.time=now;
      x=resistance(g.origin-dy/stride);target=x;paint();
    }
    function onUp(e,cancelled=false){
      const g=gesture;if(!g||g.id!==e.pointerId)return;
      gesture=null;scene.current.dataset.dragging='false';
      if(g.element.hasPointerCapture(e.pointerId))g.element.releasePointerCapture(e.pointerId);
      if(cancelled){go(g.origin);return;}
      if(!g.moved){velocity=g.priorVelocity;go(Number.isFinite(g.clicked)&&queueRef.current.includes(g.clicked)?queueRef.current.indexOf(g.clicked):Math.round(x));return;}
      const speed=performance.now()-g.time>100||g.rail||motion.matches?0:clamp(g.speed,-12,12);
      velocity=speed;go(x+speed*.12);
    }
    function onCancel(e){onUp(e,true);}
    function onKey(e){
      if(latest.current.disabled||e.target.closest('button,input'))return;
      const keys={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1,PageDown:3,PageUp:-3};
      if(e.key in keys){e.preventDefault();go(Math.round(target)+keys[e.key]);}
      else if(e.key==='Home'||e.key==='End'){e.preventDefault();go(e.key==='Home'?0:limit());}
      else if(e.key==='Escape'&&gesture){e.preventDefault();const origin=gesture.origin;gesture=null;go(origin);}
    }
    function measure(){
      cardHeight=cards.current.values().next().value?.offsetHeight || 240;spread=cardHeight*.57;
      const box=deck.current.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
      cardLeft=Math.round(box.left*ratio)/ratio-box.left;
      cardTop=Math.round((box.top+(box.height-cardHeight)/2)*ratio)/ratio-box.top;
      paint();
    }
    const observer=new ResizeObserver(measure);observer.observe(deck.current);
    const surfaces=[deck.current,rail.current,leftRail.current];
    surfaces.forEach(el=>{
      el.addEventListener('pointerdown',onDown);el.addEventListener('pointermove',onMove);el.addEventListener('pointerup',onUp);
      el.addEventListener('pointercancel',onCancel);el.addEventListener('lostpointercapture',onCancel);
    });
    const sceneElement=scene.current;
    sceneElement.addEventListener('wheel',onWheel,{passive:false});sceneElement.addEventListener('keydown',onKey);
    const motionChange=()=>{if(transition&&motion.matches){stop();finishFilter();}else go(Math.round(target),true);};motion.addEventListener('change',motionChange);
    // A short top-to-bottom cascade; each card and its two marks share a delay.
    const flightDelay=offset=>offset< -1?clamp(offset+6,0,5)*5:offset<=1?25+(offset+1)*42:109+clamp(offset-1,0,5)*5;
    function applyFlight(item){
      for(const {el,opacity} of item.elements){
        el.style.translate=`${item.shift}px 0`;
        el.style.opacity=String(item.alpha*opacity);
      }
    }
    function captureFlights(arriving=false,prior=[]){
      const items=[];
      queueRef.current.forEach((id,position)=>{
        const offset=position-x;if(Math.abs(offset)>6.1)return;
        const previous=prior.find(item=>item.id===id);
        const card=cards.current.get(id);
        const elements=card?[{el:card,opacity:1}]:[];
        for(const list of [leftTicks.current,ticks.current]){
          const tick=list.get(id);if(!tick)continue;const railHeight=tick.parentElement.clientHeight;
          // Preserve the rail's vertical feather while allowing marks to fly sideways.
          const edge=clamp((railHeight/2-Math.abs(offset*tickGap))/(railHeight*.12),0,1);
          elements.push({el:tick,opacity:clamp((6.1-Math.abs(offset))/1.2,0,1)*edge});
        }
        const shift=arriving?-transition.distance:previous?.shift??0;
        const alpha=arriving?0:previous?.alpha??1;
        const item={id,elements,delay:flightDelay(offset),fromShift:shift,fromAlpha:alpha,shift,alpha};
        items.push(item);applyFlight(item);
      });
      return items;
    }
    function clearFlights(){
      if(!scene.current)return;
      for(const el of [...cards.current.values(),...leftTicks.current.values(),...ticks.current.values()]){
        if(!el)continue;el.style.translate='none';el.style.opacity='1';
      }
      scene.current.style.setProperty('--empty-shift','0px');scene.current.style.setProperty('--empty-alpha','1');
    }
    function applyFilterQueue(){
      const {result,destination}=transition;
      queueRef.current=result;setQueue([...result]);
      x=Math.max(0,result.indexOf(destination));target=x;velocity=0;gap=0;gapVelocity=0;
      // The entry flight needs real destination nodes in this animation frame.
      mountWindow(x,!motion.matches);setSettled(result[x]??null);paint();
    }
    function finishFilter(){
      if(transition.phase==='out')applyFilterQueue();
      transition=null;setFiltering(false);clearFlights();
      scene.current.dataset.transition='idle';scene.current.dataset.moving='false';paint();
    }
    function filter(f){
      if(sendingRef.current!==null)return;
      const current=queueRef.current[Math.round(bound(x))]??null;
      const result=filterQueue(f),destination=result.includes(current)?current:result[0]??null;
      if(!transition && result.length===queueRef.current.length && result.every((id,i)=>id===queueRef.current[i])){paint();latest.current.onFocus?.(registry.current[current]||null,true);return;}
      if(transition?.phase==='out'){
        // Rapid choices update the pending queue without restarting the exit.
        transition.result=result;transition.destination=destination;return;
      }
      stop();gesture=null;scene.current.dataset.dragging='false';
      const prior=transition?.items??[];
      transition={result,destination,phase:'out',started:performance.now(),duration:160,items:[],
        distance:Math.min(210,scene.current.clientWidth*.5)};
      transition.items=captureFlights(false,prior);
      setFiltering(true);scene.current.dataset.transition='out';scene.current.dataset.moving='true';setReady(false);
      if(motion.matches){finishFilter();return;}
      frame=requestAnimationFrame(step);
    }
    api.current={go,filter,next:d=>go(Math.round(target)+d),complete:(id,result=Promise.resolve(true))=>{
      if(transition||!queueRef.current.length||sendingRef.current!==null||gesture||x!==target||!Number.isInteger(x))return false;
      if(registry.current[queueRef.current[x]]?.id!==id)return false;
      const source=cards.current.get(queueRef.current[x]);
      sendSnapshot.current={face:source.querySelector('.card-inner').cloneNode(true),left:source.style.left,top:source.style.top,
        scrolls:[...source.querySelectorAll('.card-inner, .card-inner *')].map(node=>[node.scrollLeft,node.scrollTop])};
      saveResult.current=result;
      sendingRef.current=queueRef.current[x];setSending(sendingRef.current);return true;
    },advance:id=>{
      const index=queueRef.current.indexOf(id);
      const nextQueue=queueRef.current.filter(item=>item!==id);
      if(!nextQueue.length){
        queueRef.current=[];x=0;target=0;gap=0;
      }else{
        queueRef.current=nextQueue;
        gapIndex=index;
        gap=index<nextQueue.length?1:0;
        gapVelocity=0;
        target=Math.min(x,limit());
      }
      setQueue([...queueRef.current]);animate();
    },measure,mask:paint,reveal:()=>{sendingRef.current=null;paint();}};
    controller.current=api.current;
    measure();
    return()=>{
      destroyed=true;controller.current=null;stop();clearFlights();observer.disconnect();
      sceneElement.removeEventListener('wheel',onWheel);sceneElement.removeEventListener('keydown',onKey);motion.removeEventListener('change',motionChange);
      surfaces.forEach(el=>{el.removeEventListener('pointerdown',onDown);el.removeEventListener('pointermove',onMove);el.removeEventListener('pointerup',onUp);el.removeEventListener('pointercancel',onCancel);el.removeEventListener('lostpointercapture',onCancel);});
    };
  },[]);



  useLayoutEffect(()=>{
    if(sending===null)return;
    const el=envelope.current,reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const snapshot=sendSnapshot.current;
    el.style.left=snapshot.left;el.style.top=snapshot.top;
    for(const face of el.querySelectorAll('.paper-face')){
      const content=snapshot.face.cloneNode(true);face.appendChild(content);
      [content,...content.querySelectorAll('*')].forEach((node,i)=>{node.scrollLeft=snapshot.scrolls[i]?.[0]||0;node.scrollTop=snapshot.scrolls[i]?.[1]||0;});
    }
    // Outside the rail mask, these two markers can leave with the envelope.
    const tickGhosts=['tick-left-','tick-'].map(prefix=>{
      const source=root.current.querySelector(`[data-rail-id="${prefix+sending}"]`).querySelector('span');
      const ghost=document.createElement('span');ghost.className='send-tick';ghost.setAttribute('aria-hidden','true');
      ghost.style.background=getComputedStyle(source).backgroundColor;
      root.current.appendChild(ghost);
      return {source,ghost};
    });
    // Two horizontal creases: bottom first, top second. Their reflected paper
    // overlaps between 50% and 56%, leaving a visible seam on the bottom flap.
    const configurePaper=()=>{
      const w=el.offsetWidth,h=el.offsetHeight;
      el.style.setProperty('--paper-radius',getComputedStyle(cards.current.get(sending)).borderTopLeftRadius);
      tickGhosts.forEach(({source,ghost})=>{
        const box=source.getBoundingClientRect();
        Object.assign(ghost.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});
      });
      el.querySelector('.paper-core').style.clipPath='inset(28% 0 25% 0)';
      el.style.setProperty('--sheet-height',h+'px');
      for(const [side,start,length,crease] of [['bottom',.75,.25,'top'],['top',0,.28,'bottom']]){
        const flap=el.querySelector('.paper-'+side);
        Object.assign(flap.style,{top:h*start+'px',height:h*length+'px',transformOrigin:'50% '+crease});
        const front=flap.querySelector('.flap-front');
        front.style.backgroundSize=`${w}px ${h}px`;front.style.backgroundPosition=`0 ${-h*start}px`;
        const content=front.querySelector('.card-inner');
        content.style.height=h+'px';content.style.position='absolute';content.style.top=-h*start+'px';content.style.width='100%';
      }
    };
    configurePaper();api.current.mask();
    const paperResize=new ResizeObserver(configurePaper);paperResize.observe(el);
    const animations=[];let cancelled=false;
    const play=(target,frames,options)=>{
      const animation=target.animate(frames,{fill:'forwards',...options});
      animations.push(animation);return animation.finished;
    };
    async function send(){
      try{
        if(reduced.matches){
          el.dataset.phase='saving';
          const accepted=await saveResult.current;
          if(cancelled)return;
          if(!accepted){api.current.reveal();setSending(null);latest.current.onSent?.();return;}
          el.dataset.phase='confirmed';
          await Promise.all([el,...tickGhosts.map(({ghost})=>ghost)].map(node=>play(node,[{opacity:1},{opacity:0}],{duration:180}))); 
          api.current.advance(sending);
        }else{
          el.dataset.phase='folding';
          await Promise.all([
            ...[['bottom',0,250,180],['top',150,250,-180]].map(([side,delay,duration,angle])=>{
              const flap=el.querySelector('.paper-'+side);
              return play(flap,[{transform:`translateZ(${side==='top'?2:1}px) rotateX(0deg)`},{transform:`translateZ(${side==='top'?2:1}px) rotateX(${angle}deg)`}],{duration,delay,easing:'cubic-bezier(.4,0,.2,1)'});
            }),
            ...Array.from(el.querySelectorAll('.paper-face .card-inner')).map(face=>play(face,[{opacity:1},{opacity:0}],{duration:150,easing:'ease-out'})),
            play(el.querySelector('.envelope-paper'),[{transform:'scale(1)'},{transform:'scale(.97)'}],{duration:400,easing:'cubic-bezier(.4,0,.2,1)'}),
            play(el.querySelector('.paper-core'),[
              {opacity:1,offset:0},
              {opacity:1,offset:.8},
              {opacity:0,offset:1},
            ],{duration:400}),
          ]);
          el.dataset.phase='saving';
          const accepted=await saveResult.current;
          if(cancelled)return;
          if(!accepted){
            el.dataset.phase='restoring';
            const folds=[...animations];
            await Promise.all(folds.map(animation=>{animation.playbackRate=-2.5;animation.play();return animation.finished;}));
            if(!cancelled){api.current.reveal();setSending(null);latest.current.onSent?.();}
            return;
          }
          el.dataset.phase='sealed';
          await play(el.querySelector('.envelope-stamp'),[
            {opacity:0,transform:'translate(-50%,-50%) translateZ(4px) scale(1.25) rotate(0deg)',offset:0},
            {opacity:1,transform:'translate(-50%,-50%) translateZ(4px) scale(1) rotate(0deg)',offset:1},
          ],{duration:100,easing:'cubic-bezier(.2,.7,.3,1)'});
          el.dataset.phase='departing';api.current.advance(sending);
          const exitFrames=[
            {transform:'translateX(0) rotate(0deg)',opacity:1,offset:0},
            {transform:`translate(${el.offsetWidth*1.1}px,-16px) rotate(6deg)`,opacity:0,offset:1},
          ];
          await Promise.all([el,...tickGhosts.map(({ghost})=>ghost)].map(node=>play(node,exitFrames,{duration:250,easing:'cubic-bezier(.4,0,.6,1)'})));
        }
        if(!cancelled){api.current.reveal();setSending(null);latest.current.onSent?.();}
      }catch(error){if(!cancelled){api.current.reveal();setSending(null);latest.current.onSent?.();console.error(error);}}
    }
    send();return()=>{cancelled=true;paperResize.disconnect();tickGhosts.forEach(({ghost})=>ghost.remove());animations.forEach(animation=>animation.cancel());};
  },[sending]);

  function renderRail(side){
    const left=side==='left', prefix=left?'tick-left-':'tick-';
    return <div className={`rail-column rail-${side}`}><span className="rail-caption">INDEX</span>
      <div className="rail" ref={left?leftRail:rail} role="listbox" tabIndex={0} aria-label={`${side} transaction index`}>
        {mountedIds.map(i=><div className="tick" key={registry.current[i].id} data-rail-id={prefix+i} ref={el=>{const refs=(left?leftTicks:ticks).current;if(el)refs.set(i,el);else refs.delete(i);}} data-tick-index={i} role="option" aria-hidden={!queue.includes(i)} aria-selected={i===selected} aria-label={registry.current[i].description} aria-posinset={queue.indexOf(i)+1} aria-setsize={queue.length}><span/></div>)}
      </div><span className="rail-position">{queue.indexOf(selected)+1}</span></div>;
  }
  const face=i=>renderCard(registry.current[i],i===selected && sending===null);
  return <div className="experimental-roll" ref={root}>
    <div className="scene" ref={scene} data-moving="false" data-transition="idle" aria-label="Transaction Rolodex">
      {renderRail('left')}<div className="deck" ref={deck} tabIndex={0} role="region" aria-label="Transaction cards. Scroll or use arrow keys.">
      {mountedIds.map(i=><article key={registry.current[i].id} ref={el=>{if(el)cards.current.set(i,el);else cards.current.delete(i);}} className={`money-card ${registry.current[i].amountCents<0?'expense-card':''}`} data-card-index={i} aria-hidden={i!==selected} inert={i!==selected || disabled || !ready ? true : undefined}>
        {face(i)}<div className="card-spine"/></article>)}
      {!queue.length&&<div className="empty-stack"><span>✓</span><h2>All clear here.</h2><p>Switch queues or change your filters.</p></div>}
      {sending!==null&&<div className="send-envelope" ref={envelope} aria-hidden="true"><div className="envelope-paper">
        <div className="paper-core paper-face"/>
        {['bottom','top'].map(side=><div className={`paper-flap paper-${side}`} key={side}><div className="flap-back"/><div className="flap-front paper-face"/></div>)}
        <div className="envelope-stamp"><svg viewBox="0 0 40 40"><path d="m9 20 8 8 14-16"/></svg></div>
      </div></div>}
      </div>{renderRail('right')}
    </div><div className="controls">
      <button onClick={()=>api.current.next(-1)} disabled={disabled||filtering||sending!==null||queue.indexOf(selected)<=0} aria-label="Previous card">↑</button>
      <div className="position">{queue.length?queue.indexOf(selected)+1:0} / {queue.length}</div>
      <button onClick={()=>api.current.next(1)} disabled={disabled||filtering||sending!==null||queue.indexOf(selected)>=queue.length-1||!queue.length} aria-label="Next card">↓</button>
    </div><p className="gesture-hint">Scroll to browse · skipped cards stay pending</p>
    <span className="sr-only" role="status">{sending!==null?'Saving decision…':registry.current[settled]?.description}</span>
  </div>;
}
