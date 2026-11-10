import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createApp} from './server.mjs';
test('Google flow, private onboarding profiles, version conflicts, CSRF, replay, and logout',async()=>{
 const db=new DatabaseSync(':memory:');let nonce='';
 const client={generateCodeVerifierAsync:async()=>({codeVerifier:'test-verifier',codeChallenge:'challenge'}),generateAuthUrl:args=>{nonce=args.nonce;return 'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams(args);},getToken:async({code})=>({tokens:{id_token:code}}),verifyIdToken:async({idToken})=>({getPayload:()=>({sub:idToken,email:idToken+'@example.com',email_verified:true,name:idToken,nonce})})};
 const server=createApp({db,clientId:'test',clientSecret:'test-secret',client}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
 async function login(name){const start=await request('/auth/google');const flowCookie=start.headers.get('set-cookie').split(';')[0];const state=new URL(start.headers.get('location')).searchParams.get('state');const path='/auth/google/callback?'+new URLSearchParams({state,code:name});const r=await request(path,{headers:{Cookie:flowCookie}});assert.equal(r.status,302);const cookie=r.headers.get('set-cookie').split(/, (?=__Host-)/).find(c=>c.startsWith('__Host-pitchpilot=')).split(';')[0];const me=await (await request('/api/me',{headers:{Cookie:cookie}})).json();assert.equal(me.user.id,name);assert.equal((await request(path,{headers:{Cookie:flowCookie}})).status,400,'OAuth state must be one-use');return {cookie,csrf:me.csrf};}
 try{
  assert.equal((await request('/api/profile')).status,401);
  const a=await login('alice'),b=await login('bob');
  const profile={name:'Alice',title:'Rep',company:'Example',phone:'555-555-0123',email:'alice@example.com',website:'',photo:'',device:'iphone',poplUrl:'',step:1,installed:false,cardReady:false,walletReady:false};
  const write=(u,p,version=0)=>request('/api/profile',{method:'PUT',headers:{Cookie:u.cookie,Origin:'https://rep.mattjhagen.xyz','Content-Type':'application/json','X-CSRF-Token':u.csrf},body:JSON.stringify({profile:p,version})});
  assert.equal((await write(a,profile)).status,200);
  assert.deepEqual((await (await request('/api/profile',{headers:{Cookie:b.cookie}})).json()),{profile:null,version:0},'Bob cannot read Alice profile');
  assert.equal((await write(b,{...profile,name:'Bob'})).status,200);
  const aData=await (await request('/api/profile',{headers:{Cookie:a.cookie}})).json();assert.equal(aData.profile.name,'Alice');assert.equal(aData.version,1);
  assert.equal((await write(a,{...profile,name:'Wrong stale edit'},0)).status,409,'stale device cannot overwrite saved profile');
  assert.equal((await write(a,{...profile,step:99},1)).status,400);
  assert.equal((await request('/api/profile',{method:'PUT',headers:{Cookie:a.cookie,Origin:'https://evil.example','Content-Type':'application/json','X-CSRF-Token':a.csrf},body:JSON.stringify({profile,version:1})})).status,403);
  assert.equal((await request('/api/logout',{method:'POST',headers:{Cookie:a.cookie,Origin:'https://rep.mattjhagen.xyz','X-CSRF-Token':a.csrf}})).status,200);
  assert.equal((await request('/api/profile',{headers:{Cookie:a.cookie}})).status,401);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
