import React from "react";
import {OrganizeDesk} from "./OrganizeDesk.jsx";
export function OrganizeHub({data,run,onSource,target,onSettings}){
 return <OrganizeDesk data={data} run={run} onSource={onSource} target={target} onSettings={onSettings}/>;
}
