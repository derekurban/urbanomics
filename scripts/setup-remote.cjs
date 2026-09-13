// Stores connection settings only. Financial records stay in the existing desktop workspace.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {isTailscaleIPv4}=require('../electron/tailscale-auth.cjs');
const executable=process.env.TAILSCALE_EXE || 'C:/Program Files/Tailscale/tailscale.exe';
try {
 const status=JSON.parse(execFileSync(executable,['status','--json'],{encoding:'utf8',windowsHide:true,timeout:10000}));
 const address=status.TailscaleIPs?.find(isTailscaleIPv4),login=status.User?.[status.Self?.UserID]?.LoginName;
 if(status.BackendState!=='Running' || !address || !login)throw Error('Connect this desktop to your personal Tailscale account first.');
 const root=path.resolve(process.env.URBANOMICS_DATA_DIR || path.join(__dirname,'../private/desktop'));
 if(!fs.existsSync(path.join(root,'urbanomics.sqlite')))throw Error('Open the desktop workspace before enabling remote access.');
 const origin=`http://${address}:4174`;
 fs.writeFileSync(path.join(root,'remote-access.json'),JSON.stringify({enabled:true,mode:'direct',origin,port:4174,login,executable},null,2)+'\n');
 console.log(`Remote access configured: ${origin}\nOpen Urbanomics on this desktop, then open this address on your phone with Tailscale connected.`);
}catch(error){console.error(error.message);process.exitCode=1;}
