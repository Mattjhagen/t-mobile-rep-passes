const prefix='rep-launch-account-v1:';
export const auth={user:null,configured:false,loading:true,status:'Checking account…',busy:false,conflict:false};
let csrf='',version=0,dirty=false,saving=false,timer,read,apply,notify;
const key=()=>prefix+auth.user.id;
function cached(){try{return JSON.parse(localStorage.getItem(key())||'null');}catch{return null;}}
function stash(){try{localStorage.setItem(key(),JSON.stringify({profile:read(),version,dirty}));}catch{auth.status='Device storage is full. Keep this tab open and retry saving.';}}
function update(){notify?.();}
export async function initAccount({getState,applyState,onStatus}){
 read=getState;apply=applyState;notify=onStatus;
 try{
  const r=await fetch('/api/me',{cache:'no-store'});if(!r.ok)throw Error();const me=await r.json();
  auth.configured=me.configured;auth.user=me.user;csrf=me.csrf||'';
  if(!me.user){auth.status=me.configured?'Guest · progress stays in this tab':'Google sign-in is not configured';return;}
  const local=cached();
  if(local){version=local.version;dirty=local.dirty;apply(local.profile);}
  else apply(null);
  try{
   const r=await fetch('/api/profile',{cache:'no-store'});if(!r.ok)throw Error();const cloud=await r.json();
   if(local?.dirty){
    if(version!==cloud.version){auth.conflict=true;auth.status='Another device changed your profile. Your draft is kept here; load the saved version to continue.';return;}
   }else{version=cloud.version;apply(cloud.profile);stash();}
   auth.status=dirty?'Sync pending':'Profile saved to your account';
  }catch{auth.status='Offline · using this account’s cached profile';}
 }catch{auth.status='Offline · guest progress stays in this tab';}
 finally{auth.loading=false;update();if(auth.user&&dirty&&!auth.conflict)void flushProfile();}
}
export function profileChanged(){
 if(!auth.user||auth.loading)return;
 dirty=true;stash();auth.status='Saving your profile…';update();clearTimeout(timer);timer=setTimeout(()=>void flushProfile(),600);
}
export async function flushProfile(){
 clearTimeout(timer);if(!auth.user||auth.loading||saving||!dirty||auth.conflict)return;
 saving=true;auth.busy=true;update();
 try{
  while(dirty){
   const snapshot=JSON.stringify(read());
   const r=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({profile:JSON.parse(snapshot),version})});
   if(r.status===409){auth.conflict=true;throw Error('Another device changed your profile. Your draft is safe here; load the saved version to continue.');}
   if(r.status===401)throw Error('Sign-in expired. Sign in again to sync this draft.');
   if(!r.ok)throw Error('Could not sync. Your draft is kept on this device; retry when connected.');
   version=(await r.json()).version;dirty=JSON.stringify(read())!==snapshot;stash();
  }
  auth.status='Profile saved to your account';
 }catch(e){auth.status=e.message||'Sync pending on this device';}
 finally{saving=false;auth.busy=false;update();}
}
export async function logout(){
 await flushProfile();if(dirty||saving){auth.status='Sync your pending draft before signing out, or sign in again if the session expired.';update();return;}
 const r=await fetch('/api/logout',{method:'POST',headers:{'X-CSRF-Token':csrf}});
 if(r.ok)location.assign('/');else{auth.status='Could not sign out. Check your connection and try again.';update();}
}
export async function loadSaved(){
 if(!auth.user||saving)return;
 if(dirty&&!confirm('Load the version saved to your account? A backup of this device’s draft will be kept locally.'))return;
 try{
  const r=await fetch('/api/profile',{cache:'no-store'});if(!r.ok)throw Error();const cloud=await r.json();
  if(dirty)localStorage.setItem(key()+':backup',JSON.stringify({profile:read(),version}));
  version=cloud.version;dirty=false;auth.conflict=false;apply(cloud.profile);stash();auth.status='Loaded saved account profile';
 }catch{auth.status='Could not load your saved profile. Your draft has been preserved.';}
 update();
}
window.addEventListener('online',()=>void flushProfile());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void flushProfile();});
