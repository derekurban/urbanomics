import React,{useEffect,useMemo,useState} from "react";
import {WorkspaceModal} from "./WorkspaceModal.jsx";
import {CashReceiptEditor} from "./CashReceiptEditor.jsx";
import {InfoDot,monthLabel} from "./snapshots-v2-atoms.jsx";
import {useWorkspaceLedger} from "./workspace-ledger.js";
import {ledgerView,UNGROUPED_TAGS} from "./transactions-model.js";
import {Icon} from "@derekurban/design-system";
import {Alert,Segmented,StatRow} from "./ui.jsx";
import {money,signedMoney,dayLabel,weekdayLabel,rangeLabel,plural} from "./format.js";
import "./transactions-workspace.css";
const emptyReview={kind:"unreviewed",tags:[],groups:[],allocations:[],shares:null};
const blank={month:"",from:"",through:"",account:"",currency:"",flow:"",tag:"",event:"",person:"",status:"",query:"",sort:"date",order:"desc"};
// The ledger keeps its filters for the session, so Back, the sidebar and a trip to Organize come back to them.
// A hand-off from another page (preset, with its own key) replaces them once.
const sessionKey="urbanomics.ledgerFilters.v1";
const readSession=()=>{try{return JSON.parse(sessionStorage.getItem(sessionKey)||"null");}catch{return null;}};
function startingPlace(preset){
 const saved=readSession();
 if(preset?.key&&preset.key!==saved?.presetKey){const {key,...values}=preset;return {filters:{...blank,...values},presetKey:key,more:["tag","event","person","status"].some(k=>values[k]),page:0};}
 return saved?.filters?{...saved,filters:{...blank,...saved.filters}}:{filters:blank,presetKey:"",more:false,page:0};
}
// The all-month ledger. Reading and finding happen here; deciding what a transaction is happens in Organize.
export function TransactionsWorkspace({data,run,busy,onSource,onOrganize,initialMonth="",initialAccount="",preset,snapshot,onCurrent}){
 const {state,records,entities,error,act}=useWorkspaceLedger(data,run);
 const [start]=useState(()=>snapshot?{filters:{...blank,month:initialMonth,account:initialAccount},more:false,page:0}:startingPlace(preset));
 const [filters,setFilters]=useState(start.filters);
 const [page,setPage]=useState(start.page||0),[more,setMore]=useState(start.more),[compact,setCompact]=useState(false),[original,setOriginal]=useState(false),[selected,setSelected]=useState(null),[cash,setCash]=useState(null);
 const sourceRows=useMemo(()=>snapshot?snapshot.transactions.map(r=>({...r,review:emptyReview})):records,[snapshot,records]);
 const live=sourceRows.filter(r=>!r.deleted),currencies=[...new Set(live.map(r=>r.currency))].sort();
 const currency=currencies.includes(filters.currency)?filters.currency:currencies.includes("CAD")?"CAD":currencies[0]||"CAD";
 const model=useMemo(()=>ledgerView(records,entities,{...filters,currency},{snapshot:!!snapshot,sourceRows}),[records,entities,filters,currency,sourceRows,snapshot]);
 useEffect(()=>{if(snapshot)return;try{sessionStorage.setItem(sessionKey,JSON.stringify({filters,presetKey:start.presetKey||readSession()?.presetKey||"",more,page}));}catch{}},[filters,more,page,snapshot]);
 const pages=Math.max(1,Math.ceil(model.rows.length/50)),currentPage=Math.min(page,pages-1),shown=model.rows.slice(currentPage*50,currentPage*50+50);
 const selectedRow=sourceRows.find(r=>r.id===selected);
 const tags=entities.filter(e=>e.kind==="category"),buckets=entities.filter(e=>e.kind==="bucket"),events=entities.filter(e=>e.kind==="group"),people=entities.filter(e=>e.kind==="person");
 const nameOf=id=>entities.find(e=>e.id===id)?.name;
 const change=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPage(0);};
 const sort=key=>{setFilters(f=>({...f,sort:key,order:f.sort===key&&f.order==="desc"?"asc":"desc"}));setPage(0);};
 const organize=row=>{setSelected(null);onOrganize(row?.id);};
 const openSource=row=>{setSelected(null);onSource(row.id);};
 const sortIcon=key=><Icon name={filters.sort===key?(filters.order==="asc"?"arrow-up":"arrow-down"):"arrow-up-down"} size={16}/>;
 const extraFilters=["tag","event","person","status"].filter(k=>filters[k]).length;
 const transfers=filters.flow==="transfer"&&!snapshot;
 // A linked transfer names the other account and any fee or extra, instead of an empty Connections cell.
 const transferText=({row:r,counterpart})=>counterpart?`${r.amountCents<0?"To":"From"} ${counterpart.account}${r.review.transferFeeCents>0?` · ${money(r.review.transferFeeCents,r.currency)} fee`:""}${r.review.transferExcessCents>0?` · ${money(r.review.transferExcessCents,r.currency)} extra`:""}`:"";
 const sharedWith=r=>(r.review.shares||[]).filter(p=>p.id!=="me"&&p.cents>0).map(p=>nameOf(p.id)).filter(Boolean);
 return <section className="ledger-workspace workspace-page">
 <div className="page-heading"><div><h1>Transactions</h1><p>Every account, every month. Open a transaction to see where it came from, or organize it.</p></div><div className="page-heading-actions">{!snapshot&&<button disabled={busy} onClick={()=>setCash({})}><Icon name="plus" size={16}/>Cash received</button>}{!snapshot&&<button onClick={()=>onOrganize()}>Open Organize<Icon name="arrow-right" size={16}/></button>}</div></div>
 {error&&<Alert>{error}</Alert>}
 {snapshot&&<Alert tone="info" title={`Saved snapshot · ${monthLabel(initialMonth)}`} action={<button className="sm" onClick={onCurrent}>Back to current ledger</button>}>This is the file as it was imported, before any organizing. It can't be changed.</Alert>}
 {transfers?<StatRow items={[
  {label:"Transfers",value:model.rows.length.toLocaleString("en-CA")},
  {label:<span className="stat-label-help">Moved between accounts <InfoDot label="About this total">Each linked pair counts once, at the amount that arrived. It isn't money in or out of your accounts.</InfoDot></span>,value:money(model.moved,currency)},
  {label:"Transfer fees",value:money(model.fees,currency),delta:"Counted as money out"},
 ]}/>:<StatRow items={[
  {label:"Transactions",value:model.rows.length.toLocaleString("en-CA")},
  {label:"Money in",value:money(model.moneyIn,currency)},
  {label:"Money out",value:money(model.moneyOut,currency)},
  {label:<span className="stat-label-help">Net {snapshot?"movement":"in your accounts"} <InfoDot label="About these totals">Totals follow the filters, in {currency}. {snapshot?"A snapshot shows the original movements, before organizing.":"Money moved between your own accounts isn't counted; transfer fees and any extra received are. Repayments and cash received are included. This is cash movement, not spending."}</InfoDot></span>,value:signedMoney(model.moneyIn-model.moneyOut,currency)},
 ]}/>}
 <div className="ledger-controls">
  <div className="ledger-toolbar">
   <label className="ledger-search"><Icon name="search" size={16}/><input aria-label="Search transactions" placeholder="Search names, vendors or bank descriptions" value={filters.query} onChange={e=>change("query",e.target.value)}/></label>
   <select aria-label="Transaction month" value={filters.month} onChange={e=>{setFilters(f=>({...f,month:e.target.value,from:"",through:""}));setPage(0);}}><option value="">All months</option>{[...new Set(live.map(r=>r.date.slice(0,7)))].sort().reverse().map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select>
   <select aria-label="Transaction account" value={filters.account} onChange={e=>change("account",e.target.value)}><option value="">All accounts</option>{[...new Map(live.map(r=>[r.accountId||"cash",r.account||"Cash"])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
   {currencies.length>1&&<select aria-label="Transaction currency" value={currency} onChange={e=>change("currency",e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select>}
  </div>
  <div className="ledger-toolbar-bottom">
   <Segmented label="Transaction type" value={filters.flow} onChange={v=>change("flow",v)} options={[{value:"",label:"All"},{value:"income",label:"Money in"},{value:"expense",label:"Money out"},...(!snapshot?[{value:"transfer",label:"Transfers"}]:[])]}/>
   <span className="ledger-bottom-end">{(filters.from||filters.through)&&<button className="sm ledger-range" aria-label={`Showing ${rangeLabel(filters.from||filters.through,filters.through||filters.from)}. Show every date`} onClick={()=>{setFilters(f=>({...f,from:"",through:""}));setPage(0);}}>{rangeLabel(filters.from||filters.through,filters.through||filters.from)}<Icon name="x" size={16}/></button>}
   <button className="sm" aria-expanded={more} onClick={()=>setMore(v=>!v)}><Icon name="sliders-horizontal" size={16}/>{more?"Hide filters":extraFilters?`More filters · ${extraFilters}`:"More filters"}</button></span>
  </div>
  {more&&<div className="ledger-extra">{!snapshot&&<><label>Tag<select aria-label="Filter by tag" value={filters.tag} onChange={e=>change("tag",e.target.value)}><option value="">All tags</option>{buckets.length>0&&<optgroup label="Categories">{buckets.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}<option value={UNGROUPED_TAGS}>Ungrouped tags</option></optgroup>}<optgroup label="Tags">{tags.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</optgroup></select></label>{[["event","Event","All events",events],["person","Person","All people",people]].map(([key,label,all,list])=><label key={key}>{label}<select aria-label={"Filter by "+label.toLowerCase()} value={filters[key]} onChange={e=>change(key,e.target.value)}><option value="">{all}</option>{list.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>)}<label>Status<select aria-label="Transaction status" value={filters.status} onChange={e=>change("status",e.target.value)}><option value="">Any</option><option value="attention">Unsorted</option><option value="deductions">Repaid or applied</option><option value="shared">Shared with someone</option></select></label></>}<div className="ledger-display"><label><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/>Compact rows</label><label><input type="checkbox" checked={original} onChange={e=>setOriginal(e.target.checked)}/>Show bank text</label></div><button className="sm ghost" onClick={()=>{setFilters(f=>({...f,query:"",month:"",from:"",through:"",account:"",flow:"",tag:"",event:"",person:"",status:""}));setPage(0);}}>Clear filters</button></div>}
 </div>
 <div className={"ledger-table-wrap "+(compact?"is-compact":"")}><table className="ledger-table"><thead><tr>{[["date","Date"],["description","Transaction"]].map(([key,label])=><th key={key} aria-sort={filters.sort===key?(filters.order==="asc"?"ascending":"descending"):"none"}><button onClick={()=>sort(key)}>{label}{sortIcon(key)}</button></th>)}<th>Account</th><th>Connections</th><th aria-sort={filters.sort==="amount"?(filters.order==="asc"?"ascending":"descending"):"none"}><button onClick={()=>sort("amount")}>Amount{sortIcon("amount")}</button></th></tr></thead><tbody>{shown.map((item)=>{const {row:r,flow,tags:rowTags,events:rowEvents,deducted,allocated,needsAttention}=item;return <tr key={r.id}><td><time dateTime={r.date}>{dayLabel(r.date)}</time></td><td><button className="ledger-name" onClick={()=>setSelected(r.id)}>{r.description||"Transaction"}</button>{original&&r.originalDescription&&<small>{r.originalDescription}</small>}<div className="ledger-labels"><span className="ledger-phone-meta"><time dateTime={r.date}>{dayLabel(r.date,{year:false})}</time> · {r.account||"Cash"}</span>{flow==="transfer"?<><span className="ledger-transfer-word">Transfer</span>{item.counterpart&&<span className="ledger-transfer-to">{transferText(item)}</span>}</>:snapshot?null:<>{rowTags.slice(0,3).map((tag,i)=><span key={i}>{tag}</span>)}{rowTags.length>3&&<span>+{rowTags.length-3}</span>}{needsAttention&&<span className="ledger-attention">Unsorted</span>}</>}</div></td><td><span className="ledger-account"><i style={{background:r.color||"var(--data-neutral)"}}/>{r.account||"Cash"}</span></td><td><div className="ledger-connections">{item.counterpart&&<span>{transferText(item)}</span>}{rowEvents.map((name,i)=><span key={i}>{name}</span>)}{deducted>0&&<span>{money(deducted,r.currency)} repaid</span>}{allocated>0&&<span>{money(allocated,r.currency)} applied</span>}{sharedWith(r).length>0&&<span>Shared with {sharedWith(r).join(", ")}</span>}{!item.counterpart&&!rowEvents.length&&!deducted&&!allocated&&!sharedWith(r).length&&<small aria-label="None">—</small>}</div></td><td className="ledger-amount">{signedMoney(r.amountCents,r.currency)}</td></tr>;})}</tbody></table>{!shown.length&&<div className="empty-state"><h2>{!state&&!snapshot?"Loading transactions…":live.length?"No transactions match.":"Your ledger starts with a bank export."}</h2><p>{live.length?"Change or clear the filters to see more.":"Add CSV files in Snapshots and they appear here."}</p></div>}</div>
 <div className="ledger-pagination"><span>{model.rows.length?`${(currentPage*50+1).toLocaleString("en-CA")}–${Math.min((currentPage+1)*50,model.rows.length).toLocaleString("en-CA")} of ${model.rows.length.toLocaleString("en-CA")}`:"None"}</span><div><button className="sm" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><Icon name="chevron-left" size={16}/>Previous</button><span>Page {currentPage+1} of {pages}</span><button className="sm" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Next<Icon name="chevron-right" size={16}/></button></div></div>
 {selectedRow&&<WorkspaceModal className="ledger-detail-dialog" title={selectedRow.description||"Transaction"} onClose={()=>setSelected(null)} footer={<>{!selectedRow.manual&&<span className="footer-start"><button onClick={()=>openSource(selectedRow)}><Icon name="file-text" size={16}/>Original record</button></span>}{!snapshot&&selectedRow.manual&&<span className="footer-start"><button onClick={()=>{setCash(selectedRow);setSelected(null);}}><Icon name="pencil" size={16}/>Edit cash receipt</button></span>}<button onClick={()=>setSelected(null)}>Close</button>{!snapshot&&<button className="primary" onClick={()=>organize(selectedRow)}>Organize transaction<Icon name="arrow-right" size={16}/></button>}</>}>
  <div className="ledger-detail-summary"><span>{weekdayLabel(selectedRow.date)} · {selectedRow.account||"Cash"}</span><strong className="tabular">{signedMoney(selectedRow.amountCents,selectedRow.currency)}</strong></div>
  {snapshot?<p className="form-help">Saved snapshots keep the bank's original rows only. Tags, people and events live in the current ledger.</p>:<dl className="ledger-detail-facts">
   <div><dt>Tags</dt><dd>{(()=>{const real=selectedRow.tagsAutomatic?[]:selectedRow.review.tags;return real.map(t=>`${nameOf(t.id)||"Tag"}${real.length>1?" "+money(t.cents,selectedRow.currency):""}`).join(", ")||"Not sorted yet";})()}</dd></div>
   <div><dt>Events</dt><dd>{selectedRow.review.groups.map(id=>nameOf(id)||"Event").join(", ")||"None"}</dd></div>
   <div><dt>Shared with</dt><dd>{sharedWith(selectedRow).join(", ")||"Just you"}</dd></div>
   <div><dt>Person</dt><dd>{nameOf(selectedRow.review.personId)||nameOf(selectedRow.review.assignedPersonId)||"None"}</dd></div>
  </dl>}
 </WorkspaceModal>}
 {cash&&<CashReceiptEditor row={cash.id?cash:null} act={act} error={error} onClose={()=>setCash(null)} onSaved={id=>{setCash(null);onOrganize(id);}}/>}
 </section>;
}
