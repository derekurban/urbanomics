import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import {receipts,transferCases,Practice} from './practice.mjs';
import {DecisionPanel} from './DecisionPanel.jsx';
import './decisions.css';

// Illustrative faces only; no financial service or ledger connection.
const last = receipts.length - 1;
const clamp = (n,min=0,max=last) => Math.max(min,Math.min(max,n));
const amount = n => new Intl.NumberFormat('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n));
const initial = 60;
// Preserve the relative fold / stamp / exit timing in a 750ms sequence.
const envelopeDuration=750;
const envelopeRate=2110/envelopeDuration;

function CardFace({receipt,index}) {
  const [name,method,value,date,account,monogram] = receipt;
  const expense=value<0;
  return <div className={`card-inner ${expense?'expense-face':'income-face'}`}>
    <div className="card-top"><span className="incoming-symbol">{expense?'↗':'↙'}</span><span>{expense?'MONEY SPENT':'MONEY RECEIVED'}</span><time>{date}</time></div>
    <div className="sender"><div className="monogram">{monogram}</div><div><h2>{name}</h2><p>{method}</p></div></div>
    <div className="money"><span className="plus">{expense?'−':'+'}</span><span className="currency-symbol">$</span>{amount(value)}<span className="currency-code">CAD</span></div>
    <div className="card-bottom"><span><i/>{account}</span><span className="card-sequence">{String(index+1).padStart(2,'0')}</span></div>
  </div>;
}

function App() {
  const [selected,setSelected] = useState(initial), [settled,setSettled] = useState(initial);
  const [help,setHelp] = useState(false), [sending,setSending] = useState(null), [ready,setReady] = useState(true);
  const sendingRef = useRef(null), envelope = useRef(null);
  const practice=useRef(new Practice()),filterRef=useRef({flow:'transfers',account:'all',search:''});
  const [notice,setNotice]=useState(''),[panelEpoch,setPanelEpoch]=useState(0);
  const [filters,setFilters]=useState(filterRef.current),[filterPanel,setFilterPanel]=useState(false),[searchDraft,setSearchDraft]=useState('');
  const [filtering,setFiltering]=useState(false);
  const matches=(id,f)=>practice.current.matches(id,f);
  function applyFilters(next){filterRef.current=next;setFilters(next);api.current.filter(next);}

  const queueRef = useRef([...transferCases.keys()]);
  const [queue,setQueue] = useState(queueRef.current);
  const scene = useRef(null), deck = useRef(null), rail = useRef(null), leftRail = useRef(null);
  const cards = useRef([]), ticks = useRef([]), leftTicks = useRef([]), api = useRef(null), helpDialog = useRef(null);

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let x=0,target=0,velocity=0,frame=0,previousTime=0;
    let wheelTimer=0,gesture=null,focused=initial,destroyed=false;
    let cardHeight=270,spread=146;
    const tickGap=21;
    let gap=0,gapVelocity=0,gapIndex=0,transition=null;
    const filterQueue=f=>receipts.map((_,i)=>i).filter(i=>matches(i,f));
    const limit=()=>queueRef.current.length-1;
    const bound=n=>clamp(n,0,limit());
    const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
    function paint() {
      const positionX=x;
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
        card.style.transform=`translate(-50%, -50%) translate3d(0, ${y}px, ${z}px) rotateX(${tilt}deg) scale(${scale})`;
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
        const position=queueRef.current.indexOf(i);
        if(position===-1){card.style.visibility='hidden';return;}
        draw(card,position-x+(position>=gapIndex?gap:0),sendingRef.current===i);
      });
      [ticks.current,leftTicks.current].forEach(list=>list.forEach((tick,i)=>{
        const position=queueRef.current.indexOf(i),offset=position-x+(position>=gapIndex?gap:0),distance=Math.abs(offset);
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
      const dt=Math.min(.032,Math.max(.001,(time-(previousTime||time-16))/1000))*(sendingRef.current!==null?envelopeRate:1);previousTime=time;
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
      if(transition||(sendingRef.current!==null&&!internal)||!queueRef.current.length)return;
      clearTimeout(wheelTimer);gesture=null;scene.current.dataset.dragging='false';
      target=Math.round(bound(index));animate();
    }
    function stop(){cancelAnimationFrame(frame);frame=0;previousTime=0;clearTimeout(wheelTimer);}
    function resistance(n){return n<0?-Math.min(.3,Math.sqrt(-n)*.12):n>limit()?limit()+Math.min(.3,Math.sqrt(n-limit())*.12):n;}
    function onWheel(e){
      if(e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
      e.preventDefault();if(transition||gesture||sendingRef.current!==null)return;
      const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?260:1);
      target=bound(target+clamp(pixels/160,-1.1,1.1));animate();clearTimeout(wheelTimer);
      wheelTimer=setTimeout(()=>go(Math.round(target)),130);
    }
    function onDown(e){
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
      const keys={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1,PageDown:3,PageUp:-3};
      if(e.key in keys){e.preventDefault();go(Math.round(target)+keys[e.key]);}
      else if(e.key==='Home'||e.key==='End'){e.preventDefault();go(e.key==='Home'?0:limit());}
      else if(e.key==='Escape'&&gesture){e.preventDefault();const origin=gesture.origin;gesture=null;go(origin);}
    }
    function measure(){cardHeight=cards.current[0].offsetHeight;spread=cardHeight*.57;paint();}
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
        const elements=[{el:cards.current[id],opacity:1}];
        for(const list of [leftTicks.current,ticks.current]){
          const tick=list[id],railHeight=tick.parentElement.clientHeight;
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
      for(const el of [...cards.current,...leftTicks.current,...ticks.current]){
        el.style.translate='none';el.style.opacity='1';
      }
      scene.current.style.setProperty('--empty-shift','0px');scene.current.style.setProperty('--empty-alpha','1');
    }
    function applyFilterQueue(){
      const {result,destination}=transition;
      queueRef.current=result;setQueue([...result]);
      x=Math.max(0,result.indexOf(destination));target=x;velocity=0;gap=0;gapVelocity=0;
      setSettled(result[x]??null);paint();
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
    api.current={go,filter,replay:()=>{practice.current.reset();setPanelEpoch(n=>n+1);setNotice('Practice reset');filter(filterRef.current);},undo:()=>{const restored=practice.current.undo();if(restored){setPanelEpoch(n=>n+1);const next={flow:restored.flow,account:'all',search:''};filterRef.current=next;setFilters(next);setNotice('Decision undone');filter(next);}},next:d=>go(Math.round(target)+d),complete:(action)=>{

      if(transition||!queueRef.current.length||sendingRef.current!==null||gesture||x!==target||!Number.isInteger(x)||Math.abs(velocity)>=.012)return;
      if(!action||action.id!==queueRef.current[x])return;
      try{setNotice(practice.current.save(action));}catch(error){setNotice(error.message);return;}
      sendingRef.current=queueRef.current[x];setSending(sendingRef.current);paint();
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
    },reveal:()=>{sendingRef.current=null;paint();}};
    measure();
    return()=>{
      destroyed=true;stop();clearFlights();observer.disconnect();
      sceneElement.removeEventListener('wheel',onWheel);sceneElement.removeEventListener('keydown',onKey);motion.removeEventListener('change',motionChange);
      surfaces.forEach(el=>{el.removeEventListener('pointerdown',onDown);el.removeEventListener('pointermove',onMove);el.removeEventListener('pointerup',onUp);el.removeEventListener('pointercancel',onCancel);el.removeEventListener('lostpointercapture',onCancel);});
    };
  },[]);


  useEffect(()=>{if(help)helpDialog.current.showModal();},[help]);
  useLayoutEffect(()=>{
    if(sending===null)return;
    const el=envelope.current,reduced=matchMedia('(prefers-reduced-motion: reduce)');
    // Outside the rail mask, these two markers can leave with the envelope.
    const tickGhosts=['tick-left-','tick-'].map(prefix=>{
      const source=document.getElementById(prefix+sending).querySelector('span');
      const ghost=document.createElement('span');ghost.className='send-tick';ghost.setAttribute('aria-hidden','true');
      ghost.style.background=getComputedStyle(source).backgroundColor;
      document.querySelector('.study').appendChild(ghost);
      return {source,ghost};
    });
    // An inscribed, rotated rectangle gives four real diagonal crease lines.
    // The four original corners are the flaps: no seam artwork is added later.
    const angle=20*Math.PI/180, c=Math.cos(angle), sn=Math.sin(angle);
    const configurePaper=()=>{
      const w=el.offsetWidth,h=el.offsetHeight;
      el.style.setProperty('--paper-radius',getComputedStyle(cards.current[sending]).borderTopLeftRadius);
      tickGhosts.forEach(({source,ghost})=>{
        const box=source.getBoundingClientRect();
        Object.assign(ghost.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});
      });
      const a=(w*c-h*sn)/(c*c-sn*sn),b=(h*c-w*sn)/(c*c-sn*sn);
      const point=(x,y)=>[w/2+x*c-y*sn,h/2+x*sn+y*c];
      const corners=[point(-a/2,-b/2),point(a/2,-b/2),point(a/2,b/2),point(-a/2,b/2)];
      const outside=[[w,0],[w,h],[0,h],[0,0]];
      const polygon=points=>'polygon('+points.map(([x,y])=>`${x/w*100}% ${y/h*100}%`).join(',')+')';
      el.querySelector('.paper-core').style.clipPath=polygon(corners);
      ['top','right','bottom','left'].forEach((side,i)=>{
        const flap=el.querySelector('.paper-'+side), start=corners[i],end=corners[(i+1)%4];
        const points=[start,outside[i],end];
        flap.style.transformOrigin=`${start[0]}px ${start[1]}px`;
        flap.style.setProperty('--crease-x',String((end[0]-start[0])/Math.hypot(end[0]-start[0],end[1]-start[1])));
        flap.style.setProperty('--crease-y',String((end[1]-start[1])/Math.hypot(end[0]-start[0],end[1]-start[1])));
        flap.querySelector('.flap-front').style.clipPath=polygon(points);
        flap.querySelector('.flap-back').style.clipPath=polygon(points);
        const svg=flap.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
        svg.querySelector('polygon').setAttribute('points',points.map(p=>p.join(',')).join(' '));
      });
    };
    configurePaper();
    const paperResize=new ResizeObserver(configurePaper);paperResize.observe(el);
    const animations=[];let cancelled=false;
    const play=(target,frames,options)=>{
      const animation=target.animate(frames,{fill:'forwards',...options});
      if(!reduced.matches)animation.playbackRate=envelopeRate;
      animations.push(animation);return animation.finished;
    };
    async function send(){
      try{
        if(reduced.matches){
          el.dataset.phase='confirmed';
          await Promise.all([el,...tickGhosts.map(({ghost})=>ghost)].map(node=>play(node,[{opacity:1},{opacity:0}],{duration:180}))); 
          api.current.advance(sending);
        }else{
          el.dataset.phase='folding';
          await Promise.all([
            ...[['left',0],['right',70],['bottom',300],['top',520]].map(([side,delay])=>{
              const flap=el.querySelector('.paper-'+side);
              const axis=`${flap.style.getPropertyValue('--crease-x')},${flap.style.getPropertyValue('--crease-y')},0`;
              return play(flap,[{transform:`rotate3d(${axis},0deg)`},{transform:`rotate3d(${axis},-180deg)`}],{duration:460,delay,easing:'cubic-bezier(.4,0,.2,1)'});
            }),
            ...Array.from(el.querySelectorAll('.paper-face .card-inner')).map(face=>play(face,[{opacity:1},{opacity:0}],{duration:330,easing:'ease-out'})),
            play(el.querySelector('.envelope-paper'),[{transform:'rotate(0deg) scale(1)'},{transform:'rotate(-20deg) scale(.78)'}],{duration:980,easing:'cubic-bezier(.4,0,.2,1)'}),
          ]);
          el.dataset.phase='sealed';
          await play(el.querySelector('.envelope-stamp'),[
            {opacity:0,transform:'translate(-50%,-50%) translateZ(4px) scale(1.8) rotate(12deg)',offset:0},
            {opacity:1,transform:'translate(-50%,-50%) translateZ(4px) scale(.92) rotate(20deg)',offset:.62},
            {opacity:1,transform:'translate(-50%,-50%) translateZ(4px) scale(1) rotate(20deg)',offset:1},
          ],{duration:300,easing:'cubic-bezier(.2,.7,.3,1)'});
          await play(el.querySelector('.envelope-paper'),[{transform:'rotate(-20deg) scale(.77)'},{transform:'rotate(-20deg) scale(.78)'}],{duration:180,easing:'ease-out'});
          el.dataset.phase='departing';api.current.advance(sending);
          const exitFrames=[
            {transform:'translateX(0) rotate(0deg)',opacity:1,offset:0},
            {transform:'translateX(-8px) rotate(-2deg)',opacity:1,offset:.15},
            {transform:`translateX(${el.offsetWidth*1.1}px) rotate(9deg)`,opacity:0,offset:1},
          ];
          await Promise.all([el,...tickGhosts.map(({ghost})=>ghost)].map(node=>play(node,exitFrames,{duration:650,easing:'cubic-bezier(.55,0,.35,1)'})));
        }
        if(!cancelled){api.current.reveal();setSending(null);}
      }catch(error){if(!cancelled){api.current.reveal();setSending(null);console.error(error);}}
    }
    send();return()=>{cancelled=true;paperResize.disconnect();tickGhosts.forEach(({ghost})=>ghost.remove());animations.forEach(animation=>animation.cancel());};
  },[sending]);

  function renderRail(side){
    const isLeft=side==='left',prefix=isLeft?'tick-left-':'tick-';
    return <div className={`rail-column rail-${side}`}>
      <span className="rail-caption" aria-hidden="true">INDEX</span>
      <div className="rail" ref={isLeft?leftRail:rail} role="listbox" tabIndex={0} aria-label={`Select a transaction, ${side} index`} aria-activedescendant={`${prefix}${selected}`}>
        <div className="rail-axis" aria-hidden="true"/>
        {receipts.map(([name,,value],i)=><div className="tick" id={`${prefix}${i}`} key={i} ref={el=>(isLeft?leftTicks:ticks).current[i]=el} data-tick-index={i} role="option" aria-selected={i===selected} aria-label={`${i+1}. ${name}, $${amount(value)}`}><span/></div>)}
      </div>
      <span className="rail-position" aria-hidden="true">{filtering?'…':String(queue.indexOf(selected)+1).padStart(2,'0')}</span>
    </div>;
  }
  return <div className="study">
    <header><a className="wordmark" href="/" aria-label="Urbanomics experience notes"><span className="brand-symbol">u</span>urbanomics</a><button className="about" onClick={()=>setHelp(true)} aria-label="About this interaction">i</button></header>
    <main>
      <div className="heading"><div className="eyebrow"><span/> YOUR ATTENTION, WELL SPENT</div><h1>One decision at a time.</h1><p>Validate transfers. Tag what comes in and goes out.</p>
        <div className="filter-row" aria-label="Transaction direction">
          {['transfers','income','expenses'].map(flow=><button key={flow} aria-pressed={filters.flow===flow} disabled={sending!==null} onClick={()=>{if(filters.flow!==flow)applyFilters({...filters,flow});}}>{flow==='transfers'?'Transfers':flow==='income'?'Income':'Expenses'}<span>{receipts.filter((_,i)=>matches(i,{...filters,flow})).length}</span></button>)}
          <button className="more-filters" aria-expanded={filterPanel} onClick={()=>setFilterPanel(!filterPanel)}>Filters{filters.account!=='all'||filters.search?' •':''}</button>
        </div>
        {filterPanel&&<div className="filter-panel"><div className="filter-panel-title">Accounts<button aria-label="Close filters" onClick={()=>setFilterPanel(false)}>×</button></div><div className="account-filters">
          {['all','Everyday account','Savings account','Credit account'].map(account=><button key={account} disabled={sending!==null} aria-pressed={filters.account===account} onClick={()=>{if(filters.account!==account)applyFilters({...filters,account});}}>{account==='all'?'All accounts':account.replace(' account','')}</button>)}
        </div><form onSubmit={e=>{e.preventDefault();applyFilters({...filters,search:searchDraft.trim()});}}><input aria-label="Search transactions" placeholder="Search names or descriptions" value={searchDraft} onChange={e=>setSearchDraft(e.target.value)}/><button disabled={sending!==null}>Apply</button></form><button className="clear-filters" disabled={sending!==null} onClick={()=>{setSearchDraft('');applyFilters({flow:filterRef.current.flow,account:'all',search:''});}}>Clear filters</button></div>}
      </div>
      <div className="scene" ref={scene} data-moving="false" data-transition="idle" data-dragging="false" aria-label="Transaction Rolodex" aria-busy={filtering}>
        {renderRail('left')}
        <div className="deck" ref={deck} role="region" tabIndex={0} aria-label="Transaction cards. Drag vertically, scroll, or use arrow keys." aria-describedby="gesture-hint">
          <div className="deck-glow" aria-hidden="true"/>
          {receipts.map((receipt,i)=><article key={i} ref={el=>cards.current[i]=el} className={`money-card ${receipt[2]<0?'expense-card':''}`} data-card-index={i} aria-hidden={i!==selected}>
            <CardFace receipt={receipt} index={i}/><div className="card-spine" aria-hidden="true"/>
          </article>)}
          {!queue.length&&<div className="empty-stack"><span>✓</span><h2>No cards here.</h2><p>Try another filter, or replay the sample deck.</p><button onClick={()=>api.current.replay()}>Replay cards</button><button onClick={()=>{setSearchDraft('');applyFilters({flow:filterRef.current.flow,account:'all',search:''});}}>Show all</button></div>}
          {sending!==null&&<><div className="send-envelope" ref={envelope} aria-hidden="true">
            <div className="envelope-paper">
              <div className="paper-core paper-face"><CardFace receipt={receipts[sending]} index={sending}/></div>
              {['left','right','bottom','top'].map(side=><div className={`paper-flap paper-${side}`} key={side}>
                <div className="flap-back"><svg preserveAspectRatio="none"><polygon/></svg></div>
                <div className="flap-front paper-face"><CardFace receipt={receipts[sending]} index={sending}/></div>
              </div>)}
              <div className="envelope-stamp"><svg viewBox="0 0 40 40"><path d="m9 20 8 8 14-16"/></svg></div>
            </div>
          </div></>}
        </div>
        {renderRail('right')}
      </div>
      <div className="controls">
        <button onClick={()=>api.current.next(-1)} disabled={queue.indexOf(selected)<=0||sending!==null||filtering} aria-label="Previous card"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg></button>
        <div className="position"><span>{filtering?'…':String(queue.indexOf(selected)+1).padStart(2,'0')}</span><span className="position-divider">/</span><span>{String(queue.length).padStart(2,'0')}</span></div>
        <button className="later-button" onClick={()=>api.current.next(1)} disabled={!ready||sending!==null||queue.indexOf(selected)>=queue.length-1}>Later ↓</button>
        <button onClick={()=>api.current.next(1)} disabled={queue.indexOf(selected)===queue.length-1||sending!==null||filtering||!queue.length} aria-label="Next card"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
      </div>
      <DecisionPanel key={`${filters.flow}:${selected}:${panelEpoch}`} mode={filters.flow} id={queue.includes(selected)?selected:null} ready={ready&&!filtering&&sending===null} busy={filtering||sending!==null} onSave={action=>api.current.complete(action)}/>
      <div className="practice-notice" role="status"><span>{notice||'Practice data · decisions stay in this session'}</span><button onClick={()=>api.current.undo()} disabled={!practice.current.history.length||filtering||sending!==null}>Undo</button><button onClick={()=>api.current.replay()} disabled={filtering||sending!==null}>Reset</button></div>
      <p id="gesture-hint" className="gesture-hint">Drag or scroll the cards<span>·</span>Later keeps it pending</p>
    </main>
    <footer><span>Three focused queues</span><span>Illustrative cards · not connected</span></footer>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{filtering?'Showing matching transactions.':!queue.length?'No matching cards.':sending!==null ? `Folding and sending ${receipts[sending][0]}.` : `Card ${queue.indexOf(settled)+1} of ${queue.length}. ${receipts[settled]?.[0]??''}. ${amount(receipts[settled]?.[2]??0)} Canadian dollars.`}</div>
    {help&&<dialog ref={helpDialog} onCancel={()=>setHelp(false)} onClick={e=>{if(e.target===helpDialog.current)setHelp(false);}}><button className="close" aria-label="Close information" onClick={()=>setHelp(false)}>×</button><div className="eyebrow">ONE MECHANISM</div><h2>A transaction Rolodex.</h2><p>Drag vertically or scroll to move through the cards. Tap a visible card or an index mark to bring it forward. Drag the index to travel quickly.</p><p>The cards and index share a single position. Release to settle on a card. Arrow keys, Home and End work too.</p><p className="muted">Saving a decision folds and sends the card away. Saved tags and transfer decisions update these practice queues. Linked transfers leave both tagging queues. Filters send cards and their matching ticks out to the right in a short cascade, then bring the new cards in from the left. Refresh or Replay cards resets sent samples. This study makes no financial changes.</p></dialog>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
