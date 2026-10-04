import {useEffect,useState} from "react";
import {categoryColors} from "./category-colors.js";
// Ledger state for a page. Errors from an action stay on the page or dialog that caused them until the next
// action; a background refresh never clears them, and the shell banner doesn't repeat them.
export function useWorkspaceLedger(data,run){
 const [state,setState]=useState(null),[error,setError]=useState("");
 useEffect(()=>{let live=true;window.urbanomics.reviewState().then(s=>{if(live)setState(s);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[data]);
 async function act(fn){setError("");return run(async()=>{try{const result=await fn();setState(await window.urbanomics.reviewState());return result;}catch(e){setError(e.message);throw e;}},undefined,{local:true});}
 return {state,records:state?.records||[],entities:categoryColors(state?.entities||[]),error,setError,act};
}
