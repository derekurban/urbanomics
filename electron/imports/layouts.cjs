const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {parse}=require('csv-parse/sync');
const {parseCalendarDate:date,detectDateFormats}=require('./date-formats.cjs');
const {prefixPattern}=require('./account-rules.cjs');
const {parseExport,cents,hash}=require('./parsers.cjs');
function table(bytes,delimiter=','){
 if(!bytes.length||bytes.length>20*1024*1024)throw Error('Choose a nonempty CSV up to 20 MiB.');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Save this CSV as UTF-8.');}
 let rows;try{rows=parse(text,{bom:true,delimiter,relax_column_count:false});}catch{throw Error('Malformed CSV. Check the separator, quoting and column counts.');}
 const headers=rows.shift()?.map(s=>s.trim());if(!headers?.length||headers.some(s=>!s)||new Set(headers).size!==headers.length)throw Error('Column headers must be present and unique.');
 return {headers,rows};
}
function validate(values){
 if(!values||typeof values.name!=='string'||!values.name.trim()||values.name.length>80)throw Error('Give this input template a name (up to 80 characters).');
 const prefixRegex=values.prefixRegex??'';prefixPattern(prefixRegex);
 const h=values.headers,m=values.mapping;
 if(!Array.isArray(h)||!h.length||h.length>100||h.some(s=>typeof s!=='string'||!s.trim()||s.length>200)||new Set(h).size!==h.length)throw Error('Use unique column headers.');
 if(!m||!['ymd','mdy','dmy'].includes(m.dateFormat)||!['signed','separate'].includes(m.amountMode)||![1,-1].includes(m.sign)||!['CAD','USD','EUR','GBP'].includes(m.currency)||![',',';','\t'].includes(m.delimiter))throw Error('Choose the date format, amount direction, currency and separator.');
 const required=['date','description',...(m.amountMode==='signed'?['amount']:['debit','credit'])];
 const fields=[...required,...(m.balance!==null&&m.balance!==undefined&&m.balance!==''?['balance']:[])];
 if(fields.some(k=>!Number.isInteger(m[k])||m[k]<0||m[k]>=h.length)||new Set(fields.map(k=>m[k])).size!==fields.length)throw Error('Map each required field to a different column.');
 return {name:values.name.trim(),prefixRegex:prefixRegex.trim(),headers:h,mapping:Object.fromEntries([...fields.map(k=>[k,m[k]]),...['dateFormat','amountMode','sign','currency','delimiter'].map(k=>[k,m[k]])])};
}
function customParse(bytes,template){const {headers,mapping:m}=validate(template),t=table(bytes,m.delimiter);if(JSON.stringify(headers)!==JSON.stringify(t.headers))throw Error('Headers do not match this input template.');
 const rows=t.rows.map((raw,i)=>{try{const day=date(raw[m.date],m.dateFormat),description=raw[m.description].trim();if(!description)throw Error('Missing description.');let amount;
 if(m.amountMode==='signed')amount=cents(raw[m.amount])*m.sign;else{const out=cents(raw[m.debit],true),incoming=cents(raw[m.credit],true);if(out<0||incoming<0||out&&incoming)throw Error('Use nonnegative money-in/out values, with only one side populated.');if(!raw[m.debit].trim()&&!raw[m.credit].trim())throw Error('Missing amount.');amount=(incoming-out)*m.sign;}
 const balance=m.balance===undefined?null:cents(raw[m.balance]);const fingerprint=hash(JSON.stringify([day,'',description,'','',amount,balance,m.currency]));return {record:i+2,date:day,month:day.slice(0,7),time:'',description,type:'',holder:'',amountCents:amount,balanceCents:balance,currency:m.currency,fingerprint,raw};}catch(e){throw Error(`Record ${i+2}: ${e.message}`);}});
 const schema='custom:'+template.id;return {schema,header:headers,rows,canonicalHash:hash(JSON.stringify([schema,rows.map(r=>r.fingerprint).sort()])),hash:hash(bytes)};
}
class ImportLayouts{
 constructor(store){this.store=store;this.db=store.db;}
 list(){return this.db.prepare('SELECT * FROM import_layouts ORDER BY name,id').all().map(r=>({...r,headers:JSON.parse(r.headers),mapping:JSON.parse(r.mapping)}));}
 get(id){const t=this.list().find(t=>t.id===id);if(!t)throw Error('Input template no longer exists.');return t;}
 bytes(id){const job=this.store.job(id),bytes=fs.readFileSync(path.join(this.store.root,'archive/sources',job.source_hash+'.csv'));if(hash(bytes)!==job.source_hash)throw Error('Original archive integrity check failed.');return {job,bytes};}
 parse(bytes,filename='',{allowBuiltin=false}={}){const sourceHash=hash(bytes),binding=this.db.prepare('SELECT definition FROM source_layouts WHERE source_hash=?').get(sourceHash);if(binding)return customParse(bytes,JSON.parse(binding.definition));
 const original=this.db.prepare("SELECT schema FROM sources WHERE hash=?").get(sourceHash);if(["eq","pc","simplii"].includes(original?.schema))return parseExport(bytes);

 const matches=this.list().filter(t=>{const pattern=prefixPattern(t.prefixRegex||'');return pattern?.test(filename);});
 if(matches.length>1)throw Error('Multiple layouts match this filename: '+matches.map(t=>t.name).join(', ')+'. Choose a layout.');
 if(matches.length===1)return {...customParse(bytes,matches[0]),template:matches[0]};
 if(allowBuiltin)return parseExport(bytes);
 throw Error('Choose a saved layout or map this file.');
 }
 bind(sourceHash,template){this.db.prepare('INSERT OR IGNORE INTO source_layouts VALUES (?,?,?)').run(sourceHash,template.id,JSON.stringify(template));}
 inspect(id){const {job,bytes}=this.bytes(id);let parsed,error;try{parsed=this.parse(bytes,job.filename);}catch(e){error=e.message;}
 let t;for(const delimiter of [',',';','\t']){try{const candidate=table(bytes,delimiter);if(!t||candidate.headers.length>t.headers.length)t={...candidate,delimiter};}catch{}}
 if(!t)throw Error('Cannot read this CSV. Use UTF-8 with a header row and consistent columns.');
 return {id,filename:job.filename,schema:parsed?.schema||null,headers:t.headers,delimiter:t.delimiter,sample:t.rows.slice(0,24),rowCount:parsed?.rows.length??t.rows.length,preview:parsed?.rows.slice(0,5)||[],error,templateId:parsed?.schema?.startsWith('custom:')?parsed.schema.slice(7):null,templates:this.list(),accounts:this.db.prepare("SELECT * FROM accounts WHERE deletedAt IS NULL ORDER BY name").all()};
 }
 detectDates(id,column,delimiter=','){
  if(![',',';','\t'].includes(delimiter))throw Error('Choose a valid CSV separator.');
  const {bytes}=this.bytes(id),data=table(bytes,delimiter);
  if(!Number.isInteger(column)||column<0||column>=data.headers.length)throw Error('Choose a date column.');
  return detectDateFormats(data.rows,column);
 }
 preview(id,values){const {bytes}=this.bytes(id),t={...validate(values),id:values.id||'preview'},p=customParse(bytes,t);return {schema:p.schema,rowCount:p.rows.length,preview:p.rows.slice(0,5)};}
 save(jobId,values){const v=validate(values),id=values.id||randomUUID();this.preview(jobId,{...v,id});return this.store.review.atomic(()=>{let version=1;if(values.id){const old=this.get(id);if(old.version!==values.version)throw Error('Input template changed. Reload it.');version=old.version+1;this.db.prepare('UPDATE import_layouts SET name=?,headers=?,mapping=?,version=?,prefixRegex=? WHERE id=?').run(v.name,JSON.stringify(v.headers),JSON.stringify(v.mapping),version,v.prefixRegex,id);}else this.db.prepare('INSERT INTO import_layouts (id,name,headers,mapping,version,prefixRegex) VALUES (?,?,?,?,?,?)').run(id,v.name,JSON.stringify(v.headers),JSON.stringify(v.mapping),version,v.prefixRegex);
 this.apply(jobId,id);return {...v,id,version};});}
 apply(jobId,id){const {job,bytes}=this.bytes(jobId);if(!['error','routing','queued','overlap'].includes(job.status))throw Error('Only pending uploads can change layout.');if(this.db.prepare('SELECT 1 FROM imports WHERE source_hash=?').get(job.source_hash))throw Error('An imported original cannot be reinterpreted.');const template=this.get(id),parsed=customParse(bytes,template);this.db.prepare('INSERT INTO source_layouts VALUES (?,?,?) ON CONFLICT(source_hash) DO UPDATE SET template_id=excluded.template_id,definition=excluded.definition').run(job.source_hash,id,JSON.stringify(template));this.db.prepare('UPDATE sources SET schema=?,canonical=? WHERE hash=?').run(parsed.schema,parsed.canonicalHash,job.source_hash);const choices=this.store.routingChoices(job.source_hash,job.filename,parsed.schema),accountId=choices.length===1?choices[0].id:null;this.db.prepare('UPDATE jobs SET status=?,error=NULL,account_id=? WHERE id=?').run(accountId?'queued':'routing',accountId,jobId);return {schema:parsed.schema};}
 remove(id,version){return this.store.review.atomic(()=>{const old=this.get(id);if(old.version!==version)throw Error('Input template changed. Reload it.');
 if(this.db.prepare('SELECT 1 FROM source_layouts sl JOIN imports i ON i.source_hash=sl.source_hash WHERE sl.template_id=?').get(id)||this.db.prepare('SELECT 1 FROM accounts WHERE schema=?').get('custom:'+id)||this.db.prepare('SELECT 1 FROM account_import_layouts WHERE schema=?').get('custom:'+id))throw Error('This template is used by an account or imported source and must be kept.');
 for(const source of this.db.prepare('SELECT source_hash FROM source_layouts WHERE template_id=?').all(id)){
 this.db.prepare('UPDATE sources SET schema=NULL,canonical=NULL WHERE hash=?').run(source.source_hash);
 this.db.prepare("UPDATE jobs SET account_id=NULL,status='error',error='Input template removed. Choose a layout.' WHERE source_hash=? AND status NOT IN ('complete','dismissed')").run(source.source_hash);
 }
 this.db.prepare('DELETE FROM source_layouts WHERE template_id=?').run(id);this.db.prepare('DELETE FROM import_layouts WHERE id=?').run(id);
 });}
}
module.exports={ImportLayouts,customParse,validate,table};
