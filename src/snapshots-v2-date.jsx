import React, { useEffect, useRef, useState } from 'react';
import { api } from './snapshots-v2-atoms.jsx';

const readable = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric', timeZone:'UTC' });

export function DateAssistant({ jobId, column, delimiter, selected, onSelect }) {
  const [result,setResult] = useState(null), [error,setError] = useState('');
  const selectRef = useRef(onSelect), selectedRef = useRef(selected);
  selectRef.current = onSelect; selectedRef.current = selected;
  const key = `${jobId}:${column}:${delimiter}`;
  useEffect(()=>{
    setResult(null);setError('');
    if(column == null)return;
    let active = true;
    const timer = setTimeout(()=>api.detectImportDates(jobId,column,delimiter).then(value=>{
      if(!active)return;
      setResult({key,...value});
      // Only fill an empty choice. Saved mappings and explicit overrides always win.
      if(value.suggested && !selectedRef.current)selectRef.current(value.suggested);
    }).catch(e=>active&&setError(e.message)),160);
    return ()=>{active=false;clearTimeout(timer)};
  },[jobId,column,delimiter,key]);
  if(column == null)return null;
  if(error)return <div className="sv2-date-assist sv2-date-invalid" role="alert">{error}</div>;
  if(!result || result.key!==key)return <div className="sv2-date-assist" role="status">Checking date formats across the file…</div>;
  const possible=result.candidates.filter(c=>result.rowCount>0 && c.validCount===result.rowCount);
  const candidates=possible.length?possible:result.candidates.filter(c=>c.validCount>0);
  const current=result.candidates.find(c=>c.format===selected);
  return <section className={`sv2-date-assist${result.status==='invalid'?' sv2-date-invalid':''}`} aria-label="Date format suggestions">
    <p className="sv2-date-status" role="status">{result.status==='conclusive'
      ? `One format fits all ${result.rowCount.toLocaleString()} rows. Check the example below.`
      : result.status==='ambiguous' ? `${possible.length} formats fit all ${result.rowCount.toLocaleString()} rows. Choose the intended reading.`
      : result.status==='empty' ? 'No transaction dates to check.' : 'No single format reads every row. Check for invalid dates or mixed date orders.'}</p>
    <div className="sv2-date-options">{candidates.map(c=><button type="button" className="sv2-date-option" aria-label={`Use ${c.label}`} aria-pressed={selected===c.format} key={c.format} onClick={()=>onSelect(c.format)}>
      <span className="sv2-date-format">{c.label}</span>
      {c.example && <span className="sv2-date-example">{c.example.raw} → {readable(c.example.date)}</span>}
      {possible.length===0 && <span className="sv2-date-count">{c.validCount} / {result.rowCount} rows fit{c.firstInvalid ? ` · record ${c.firstInvalid.record}: “${c.firstInvalid.raw || '(blank)'}” does not` : ''}</span>}
    </button>)}</div>
    {current?.firstInvalid && <p className="sv2-date-status sv2-date-invalid">Record {current.firstInvalid.record}: “{current.firstInvalid.raw || '(blank)'}” does not fit {current.label}.</p>}
    {!candidates.length && result.rowCount>0 && <p className="sv2-date-status">Record {result.candidates[0].firstInvalid.record}: “{result.candidates[0].firstInvalid.raw || '(blank)'}”. Supported orders: YYYY/MM/DD, MM/DD/YYYY and DD/MM/YYYY, with slashes or dashes.</p>}
  </section>;
}
