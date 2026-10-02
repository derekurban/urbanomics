import {needsTagging} from '../electron/review/system-tags.mjs';
import { transferLabCandidates } from '../electron/review/transfer-lab-model.mjs';
import { taggable, tagLens } from '../electron/review/tag-model.mjs';

// Compute suggestions over the whole ledger before narrowing the visible queue.
// Otherwise an account/search filter could make an ambiguous pair look unique.
export function attentionQueues(records, settings, dismissed = []) {
  const result = transferLabCandidates(records, settings);
  const edges = result.edges.filter(e => !dismissed.includes(e.incoming.id));
  const reserved = new Set(edges.flatMap(e => [e.incoming.id, e.outgoing.id]));
  const transfers = [...new Map(edges.map(e => [e.incoming.id, e.incoming])).values()];
  const pending = records.filter(r => !r.deleted && taggable(r) && needsTagging(r) && !reserved.has(r.id));
  const income=records.filter(r=>!r.deleted&&r.amountCents>0&&r.review.templateReview!=='accepted'&&!reserved.has(r.id)&&
    (r.review.kind==='unreviewed'||(r.review.kind==='income'&&needsTagging(r))));
  return { edges, transfers, income,
    expenses: pending.filter(r => tagLens(r) === 'expense'), reserved: reserved.size };
}

// Equal path-length spacing on a rounded orbit keeps large collections apart,
// including the narrow ends of a tall phone layout. No hidden pages or layers.
export function ellipseTargets(count, width, height) {
  if (!count) return [];
  const rx=width/2-42,ry=height/2-40,r=Math.min(rx,ry),cx=width/2,cy=height/2;
  const horizontal=2*(rx-r),vertical=2*(ry-r),arc=Math.PI*r/2;
  const segments=[
    [horizontal,t=>({x:cx-rx+r+t*horizontal,y:cy-ry})],
    [arc,t=>({x:cx+rx-r+Math.sin(t*Math.PI/2)*r,y:cy-ry+r-Math.cos(t*Math.PI/2)*r})],
    [vertical,t=>({x:cx+rx,y:cy-ry+r+t*vertical})],
    [arc,t=>({x:cx+rx-r+Math.cos(t*Math.PI/2)*r,y:cy+ry-r+Math.sin(t*Math.PI/2)*r})],
    [horizontal,t=>({x:cx+rx-r-t*horizontal,y:cy+ry})],
    [arc,t=>({x:cx-rx+r-Math.sin(t*Math.PI/2)*r,y:cy+ry-r+Math.cos(t*Math.PI/2)*r})],
    [vertical,t=>({x:cx-rx,y:cy+ry-r-t*vertical})],
    [arc,t=>({x:cx-rx+r-Math.cos(t*Math.PI/2)*r,y:cy-ry+r-Math.sin(t*Math.PI/2)*r})],
  ];
  const perimeter=segments.reduce((n,[length])=>n+length,0);
  return Array.from({length:count},(_,i)=>{
    let distance=(horizontal/2+i*perimeter/count)%perimeter;
    for(const [length,point] of segments){if(length&&distance<=length)return point(distance/length);distance-=length;}
    return {x:cx,y:cy-ry};
  });
}
