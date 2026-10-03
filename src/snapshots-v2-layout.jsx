import { Icon } from "@derekurban/design-system";
import React, { useEffect, useState } from "react";
import { api, defaultPrefix, InfoDot, money, plural, Sv2Dialog } from "./snapshots-v2-atoms.jsx";
import { DateAssistant } from "./snapshots-v2-date.jsx";
import { PrefixField } from "./snapshots-v2-accounts.jsx";

const emptyMapping = (inspect) => ({date:null, description:null, amount:null, debit:null, credit:null, balance:null, dateFormat:"", amountMode:"signed", sign:null, currency:"CAD", delimiter:inspect.delimiter});
const complete = m => m && m.date != null && m.description != null && m.dateFormat && [1,-1].includes(m.sign) && (m.amountMode === "signed" ? m.amount != null : m.debit != null && m.credit != null);

export function describeMapping(template) {
  const { headers = [], mapping = {} } = template || {};
  const column = (index) =>
    index == null ? null : headers[index] || `column ${index + 1}`;
  const parts = [`date ${column(mapping.date) || "—"}`];
  parts.push(`description ${column(mapping.description) || "—"}`);
  parts.push(
    mapping.amountMode === "separate"
      ? `out ${column(mapping.debit) || "—"} / in ${column(mapping.credit) || "—"}`
      : `amount ${column(mapping.amount) || "—"}`,
  );
  if (mapping.balance != null) parts.push(`balance ${column(mapping.balance)}`);
  return parts.join(" · ");
}

export function PreviewTable({ rows, rowCount, caption }) {
  if (!rows?.length)
    return <p className="sv2-quiet">No rows could be read from this file yet.</p>;
  return (
    <div className="sv2-preview">
      <table>
        <caption>
          {caption ||
            `First ${plural(Math.min(rows.length, 8), "row", "rows")} as they will be recorded`}
          {rowCount ? ` · ${plural(rowCount, "row", "rows")} in the file` : ""}
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Description</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row, index) => (
            <tr key={index}>
              <td className="sv2-preview-date">{row.date || "—"}</td>
              <td className="sv2-preview-text">{row.description || "—"}</td>
              <td
                className={`sv2-preview-amount ${row.amountCents >= 0 ? "sv2-in" : "sv2-out"}`}
              >
                {money(row.amountCents, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LayoutEditor({ job, template, busy, run, onApplied, onCancelEdit }) {
  const [inspect,setInspect]=useState(null), [loadError,setLoadError]=useState("");
  const [name,setName]=useState(""), [pattern,setPattern]=useState(""), [mapping,setMapping]=useState(null), [manual,setManual]=useState(false);
  const [preview,setPreview]=useState(null), [previewError,setPreviewError]=useState(""), [checking,setChecking]=useState(false);
  useEffect(()=>{
    let active=true;setInspect(null);setLoadError("");setPreview(null);
    api.inspectImport(job.id).then(result=>{
      if(!active)return;
      const saved=template || result.templates.find(t=>t.id===result.templateId);
      setInspect(result);setMapping(saved?{...saved.mapping}:emptyMapping(result));
      setName(saved?.name || "");setPattern(saved?.prefixRegex ?? defaultPrefix(job.filename));
      setManual(!!template || !result.schema);
    }).catch(e=>active&&setLoadError(e.message));
    return ()=>{active=false};
  },[job.id,job.schema,template?.id,template?.version]);
  useEffect(()=>{
    setPreviewError("");setChecking(false);
    if(!inspect || !complete(mapping)){setPreview(null);return;}
    let active=true;setChecking(true);
    const timer=setTimeout(()=>api.previewImportLayout(job.id,{name:name.trim()||"Preview",prefixRegex:pattern,headers:inspect.headers,mapping}).then(result=>{
      if(active){setPreview(result);setChecking(false);}
    }).catch(e=>{if(active){setPreview(null);setPreviewError(e.message);setChecking(false)}}),250);
    return ()=>{active=false;clearTimeout(timer)};
  },[job.id,inspect,mapping,pattern,name]);
  if(loadError)return <p className="sv2-error" role="alert">{loadError}</p>;
  if(!inspect || !mapping)return <p role="status">Reading file…</p>;
  const headers=inspect.headers, sample=inspect.sample?.[0]||[];
  const change=patch=>{setChecking(true);setMapping(current=>({...current,...patch}));};
  const column=(key,label,optional=false)=><label className="sv2-field" key={key}><span>{label}{optional&&<em>optional</em>}</span>
    <select aria-label={label} value={mapping[key]??""} onChange={e=>change({[key]:e.target.value===""?null:Number(e.target.value),...(key==='date'?{dateFormat:''}:{})})}>
      <option value="">{optional?"None":"Choose column"}</option>
      {headers.map((h,i)=><option key={i} value={i}>{h}</option>)}
    </select><small className="sv2-field-sample" title={sample[mapping[key]]}>{mapping[key]==null?"—":sample[mapping[key]]||"Empty in first row"}</small></label>;
  const save=async()=>{
    const values={name:name.trim(),prefixRegex:pattern,headers,mapping,...(template?{id:template.id,version:template.version}:{})};
    const result=await run(()=>api.saveImportLayout(job.id,values),`Layout “${values.name}” saved.`);
    if(result!==false)onApplied?.(result);
  };
  const matched=!job.schema&&!!inspect.templateId&&!template&&!manual;
  const recognized=!!job.schema&&inspect.schema&&!manual;
  const current=inspect.templates.find(t=>t.id===inspect.templateId);
  const apply=(id,message)=>async()=>{const done=await run(()=>api.applyImportLayout(job.id,id),message);if(done!==false)onApplied?.(done)};
  return <div className="sv2-editor sv2-compact-editor">
    {matched?<>
      <div className="sv2-recognized-line"><span className="sv2-badge">{current?.name || "Saved layout"}</span><span className="sv2-quiet">This filename matches a saved layout.</span></div>
      <PreviewTable rows={inspect.preview?.slice(0,3)} rowCount={inspect.rowCount} caption="First rows as they will be recorded"/>
      <footer className="sv2-editor-foot"><button type="button" className="sv2-inline" onClick={()=>setManual(true)}>Map columns instead</button><button type="button" className="primary" disabled={busy} onClick={apply(inspect.templateId,"Layout applied.")}>Use this layout</button></footer>
    </>:recognized?<>
      <div className="sv2-recognized-line"><span className="sv2-badge sv2-badge-ok"><Icon name="check" size={13}/> {current?.name || "Saved layout"}</span><span className="sv2-quiet">Read the same way as before.</span><button type="button" className="sv2-inline" onClick={()=>setManual(true)}>Change</button></div>
      <PreviewTable rows={inspect.preview?.slice(0,3)} rowCount={inspect.rowCount} caption="First rows as they will be recorded"/>
    </>:<>
      {inspect.error && inspect.error!=="Choose a saved layout or map this file." && <p className="sv2-error" role="alert">{inspect.error}</p>}
      {!template && inspect.templates.length>0 && <div className="sv2-layout-reuse"><span className="sv2-quiet">Use a saved layout</span><div className="sv2-chiprow">{inspect.templates.map(t=><button type="button" key={t.id} disabled={busy} onClick={apply(t.id,`Read with “${t.name}”.`)}>{t.name}</button>)}</div></div>}
      <div className="sv2-mapping-heading"><h4>Columns</h4><div className="sv2-choices" aria-label="Amount format">
        <button type="button" aria-pressed={mapping.amountMode==='signed'} onClick={()=>change({amountMode:'signed',sign:null})}>One amount column</button>
        <button type="button" aria-pressed={mapping.amountMode==='separate'} onClick={()=>change({amountMode:'separate',sign:1})}>Money out / money in</button>
      </div></div>
      <div className="sv2-compact-map">{column('date','Date')}{column('description','Description')}{mapping.amountMode==='signed'?column('amount','Amount'):<>{column('debit','Money out')}{column('credit','Money in')}</>}</div>
      <div className="sv2-reading-options">
        <label className="sv2-field"><span>Date order</span><select aria-label="Date order" value={mapping.dateFormat} onChange={e=>change({dateFormat:e.target.value})}><option value="">Choose order</option><option value="ymd">Year / Month / Day</option><option value="mdy">Month / Day / Year</option><option value="dmy">Day / Month / Year</option></select></label>
        {mapping.amountMode==='signed'&&<label className="sv2-field"><span>Positive amounts are</span><select aria-label="Positive amounts are" value={mapping.sign??""} onChange={e=>change({sign:e.target.value?Number(e.target.value):null})}><option value="">Choose</option><option value="1">Money in</option><option value="-1">Money out</option></select></label>}
        <label className="sv2-field"><span>Currency</span><select aria-label="Currency" value={mapping.currency} onChange={e=>change({currency:e.target.value})}>{['CAD','USD','EUR','GBP'].map(c=><option key={c}>{c}</option>)}</select></label>
      </div>
      <DateAssistant jobId={job.id} column={mapping.date} delimiter={mapping.delimiter} selected={mapping.dateFormat} onSelect={dateFormat=>change({dateFormat})}/>
      <details className="sv2-layout-extra"><summary>Balance column {mapping.balance!=null?'· included':'· optional'}</summary>{column('balance','Balance',true)}</details>
      <section className="sv2-layout-preview" aria-label="File preview" aria-live="polite">
        <div className="sv2-live-head"><h4>{preview?'Transaction preview':'File preview'}</h4><span className="sv2-quiet">{checking?'Checking…':preview?'All rows validated': 'First 3 rows'}</span></div>
        {previewError&&<p className="sv2-error" role="alert">{previewError}</p>}
        {preview?<PreviewTable rows={preview.preview.slice(0,3)} rowCount={preview.rowCount}/>:<div className="sv2-raw-scroll"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{inspect.sample.slice(0,3).map((row,i)=><tr key={i}>{row.map((value,j)=><td key={j}>{value||'—'}</td>)}</tr>)}</tbody></table></div>}
      </section>
      <div className="sv2-layout-identity">
        <label className="sv2-field"><span>Save this layout as</span><input value={name} maxLength={80} placeholder="e.g. Everyday export" onChange={e=>setName(e.target.value)}/></label>
        <PrefixField job={job} pattern={pattern} onChange={setPattern} target="layout" compact/>
      </div>
      <footer className="sv2-editor-foot"><span className="sv2-quiet sv2-editor-note">Remembered for next time <InfoDot label="Saving a layout">The layout is remembered for next time. Files whose names match its rule are read this way automatically; leave the rule blank to choose by hand. Files already imported are not changed.</InfoDot></span>
        {template&&<button type="button" className="sv2-inline" onClick={onCancelEdit}>Cancel</button>}
        <button type="button" className="primary" disabled={busy||checking||!name.trim()||!preview||!!previewError} onClick={save}>{template?'Update layout':'Save layout'}</button>
      </footer>
    </>}
  </div>;
}

export function LayoutLibrary({ jobs, onEdit, onClose }) {
  const [templates, setTemplates] = useState(null),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [working, setWorking] = useState(false),
    [confirm, setConfirm] = useState(null),
    [example, setExample] = useState(jobs[0]?.id || "");
  const load = () =>
    api
      .importLayouts()
      .then((list) => {
        setTemplates(list || []);
        setError("");
      })
      .catch((issue) => setError(issue.message));
  useEffect(() => {
    load();
  }, []);
  const remove = async (template) => {
    setWorking(true);
    setError("");
    try {
      await api.removeImportLayout(template.id, template.version);
      setNote(`“${template.name}” removed.`);
      setConfirm(null);
      await load();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <Sv2Dialog title="Saved layouts" onClose={onClose} wide>
      <p>
        A layout remembers how a file's columns are read. Its filename rule picks
        it for future files.
      </p>
      {error && (
        <p className="sv2-error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="sv2-note" role="status">
          {note}
        </p>
      )}
      {!templates ? (
        <p className="sv2-quiet">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="sv2-quiet">
          No layouts yet. Map a file's columns and save it here.
        </p>
      ) : (
        <ul className="sv2-template-list">
          {templates.map((template) => (
            <li key={`${template.id}:${template.version}`}>
              <div className="sv2-template-head">
                <strong>{template.name}</strong>
                <span className="sv2-quiet">v{template.version}</span>
              </div>
              <p className="sv2-template-map">{describeMapping(template)}</p>
              <p className="sv2-quiet sv2-template-headers">
                {template.prefixRegex || "Manual selection"}
              </p>
              {confirm === template.id ? (
                <div className="sv2-confirm" role="group">
                  <span>
                    Remove “{template.name}”? Files already imported are not
                    changed.
                  </span>
                  <button
                    type="button"
                    className="danger"
                    disabled={working}
                    onClick={() => remove(template)}
                  >
                    Remove layout
                  </button>
                  <button type="button" onClick={() => setConfirm(null)}>
                    Keep it
                  </button>
                </div>
              ) : (
                <div className="sv2-template-actions">
                  {jobs.length > 0 ? (
                    <>
                      <label className="sv2-field sv2-field-inline">
                        <span>Edit using</span>
                        <select
                          value={example}
                          onChange={(event) => setExample(event.target.value)}
                        >
                          {jobs.map((job) => (
                            <option key={job.id} value={job.id}>
                              {job.filename}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => onEdit(template, example)}
                      >
                        Edit layout
                      </button>
                    </>
                  ) : (
                    <p className="sv2-quiet">
                      Add an example file to edit this layout and see the result
                      before saving.
                    </p>
                  )}
                  <button
                    type="button"
                    className="sv2-inline"
                    onClick={() => {
                      setNote("");
                      setConfirm(template.id);
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sv2Dialog>
  );
}
