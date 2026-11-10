import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {OAuth2Client} from 'google-auth-library';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const random=()=>randomBytes(32).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest('hex');
const cookieName='__Host-pitchpilot';
const flowName='__Host-pitchpilot-oauth';
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')).filter(a=>a.length===2));
const cookieOptions={httpOnly:true,secure:true,sameSite:'lax',path:'/'};
export function createApp({db,clientId='',clientSecret='',origin='https://rep.mattjhagen.xyz',client}={}) {
  const oauth=client || new OAuth2Client(clientId,clientSecret,origin+'/auth/google/callback');
  const configured=Boolean(clientId&&clientSecret);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS logins(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS flows(state TEXT PRIMARY KEY,binding TEXT NOT NULL,verifier TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),body TEXT NOT NULL,version INTEGER NOT NULL);`);
  const app=express();app.disable('x-powered-by');app.use(express.json({limit:'512kb'}));
  app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});next();});
  const cleanup=()=>{const now=Date.now();db.prepare('DELETE FROM flows WHERE expires < ?').run(now);db.prepare('DELETE FROM logins WHERE expires < ?').run(now);};
  app.get('/api/healthz',(_,res)=>res.json({ok:true,configured}));
  const identify=(req,res,next)=>{
    const token=cookies(req)[cookieName];
    const session=token&&db.prepare('SELECT l.*,u.email,u.name FROM logins l JOIN users u ON u.id=l.user_id WHERE token=? AND expires>?').get(hash(token),Date.now());
    req.account=session||null;next();
  };
  app.use(identify);
  app.get('/api/me',(req,res)=>res.json({configured,user:req.account?{id:req.account.user_id,email:req.account.email,name:req.account.name}:null,csrf:req.account?.csrf||null}));
  const mustLogin=(req,res,next)=>req.account?next():res.status(401).json({error:'Sign in required'});
  const csrf=(req,res,next)=>{
    if(req.headers.origin!==origin||req.headers['x-csrf-token']!==req.account.csrf)return res.status(403).json({error:'Request rejected'});
    next();
  };
  app.get('/auth/google',async(req,res)=>{
    if(!configured)return res.status(503).send('Google sign-in has not been configured yet.');
    cleanup();
    if(db.prepare('SELECT count(*) AS n FROM flows').get().n>=1000)return res.status(429).send('Please try again shortly.');
    try{
      const state=random(),binding=random(),nonce=random();
      const {codeVerifier,codeChallenge}=await oauth.generateCodeVerifierAsync();
      db.prepare('INSERT INTO flows VALUES(?,?,?,?,?)').run(hash(state),hash(binding),codeVerifier,nonce,Date.now()+600000);
      res.cookie(flowName,binding,{...cookieOptions,maxAge:600000});
      res.redirect(oauth.generateAuthUrl({scope:['openid','email','profile'],state,nonce,code_challenge:codeChallenge,code_challenge_method:'S256',prompt:'select_account'}));
    }catch{res.status(503).send('Sign-in is temporarily unavailable.');}
  });
  app.get('/auth/google/callback',async(req,res)=>{
    res.clearCookie(flowName,cookieOptions);
    const state=typeof req.query.state==='string'?req.query.state:'';
    const binding=cookies(req)[flowName]||'';
    const flow=db.prepare('SELECT * FROM flows WHERE state=? AND binding=? AND expires>?').get(hash(state),hash(binding),Date.now());
    if(!flow)return res.status(400).send('Sign-in expired or could not be verified. Start again from PitchPilot.');
    db.prepare('DELETE FROM flows WHERE state=?').run(hash(state));
    if(req.query.error)return res.redirect('/?auth_error=cancelled');
    if(typeof req.query.code!=='string')return res.status(400).send('Missing authorization code.');
    try{
      const {tokens}=await oauth.getToken({code:req.query.code,codeVerifier:flow.verifier,redirect_uri:origin+'/auth/google/callback'});
      if(!tokens.id_token)throw Error('No ID token');
      const ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:clientId});
      const p=ticket.getPayload();
      if(!p?.sub||!p.email||!p.email_verified||p.nonce!==flow.nonce)throw Error('Invalid identity');
      db.prepare('INSERT INTO users VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name').run(p.sub,p.email,p.name||p.email);
      const previous=cookies(req)[cookieName];if(previous)db.prepare('DELETE FROM logins WHERE token=?').run(hash(previous));
      const token=random();db.prepare('INSERT INTO logins VALUES(?,?,?,?)').run(hash(token),p.sub,random(),Date.now()+7*86400000);
      res.cookie(cookieName,token,{...cookieOptions,maxAge:7*86400000});res.redirect('/');
    }catch{res.redirect('/?auth_error=failed');}
  });
  app.post('/api/logout',mustLogin,csrf,(req,res)=>{db.prepare('DELETE FROM logins WHERE token=?').run(req.account.token);res.clearCookie(cookieName,cookieOptions);res.json({ok:true});});
  app.get('/api/profile',mustLogin,(req,res)=>{
    const row=db.prepare('SELECT body,version FROM profiles WHERE user_id=?').get(req.account.user_id);
    res.json({profile:row?JSON.parse(row.body):null,version:row?.version||0});
  });
  app.put('/api/profile',mustLogin,csrf,(req,res)=>{
    const {profile,version}=req.body;
    if(!profile||!Number.isSafeInteger(version)||version<0)return res.status(400).json({error:'Invalid profile version'});
    const clean={};
    for(const [key,max] of Object.entries({name:120,title:120,company:120,phone:120,email:254,website:500,poplUrl:500,photo:250000})){
      if(typeof profile[key]!=='string'||profile[key].length>max)return res.status(400).json({error:'Invalid profile field'});
      clean[key]=profile[key];
    }
    for(const key of ['website','poplUrl']){
      if(!clean[key])continue;
      // Drafts can be incomplete; a non-HTTPS URL is never returned as a clickable link.
      if(/[\x00-\x1f]/.test(clean[key]))return res.status(400).json({error:'Invalid link'});
    }
    if(clean.photo && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(clean.photo))return res.status(400).json({error:'Invalid preview image'});
    if(!['iphone','android'].includes(profile.device)||!Number.isInteger(profile.step)||profile.step<0||profile.step>4)return res.status(400).json({error:'Invalid progress'});
    clean.device=profile.device;clean.step=profile.step;
    for(const key of ['installed','cardReady','walletReady']){
      if(typeof profile[key]!=='boolean')return res.status(400).json({error:'Invalid confirmation'});
      clean[key]=profile[key];
    }
    db.exec('BEGIN IMMEDIATE');
    try{
      const current=db.prepare('SELECT version FROM profiles WHERE user_id=?').get(req.account.user_id);
      if((current?.version||0)!==version){db.exec('ROLLBACK');return res.status(409).json({error:'Profile changed on another device. Reload to review it.'});}
      db.prepare('INSERT INTO profiles VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body,version=excluded.version').run(req.account.user_id,JSON.stringify(clean),version+1);
      db.exec('COMMIT');res.json({ok:true,version:version+1});
    }catch(err){db.exec('ROLLBACK');throw err;}
  });
  app.use((err,req,res,next)=>{res.status(err.type==='entity.too.large'?413:400).json({error:'Request could not be processed'});});
  return app;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let credentials={};try{const json=JSON.parse(readFileSync(process.env.GOOGLE_CREDENTIALS||'/home/matt/.config/rep-launch/google-oauth.json','utf8'));credentials=json.web||{};}catch{}
  const dbPath=process.env.DATABASE_PATH||'/home/matt/.local/share/rep-launch/accounts.sqlite';
  mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
  process.umask(0o077);
  const db=new DatabaseSync(dbPath);
  createApp({db,clientId:credentials.client_id||'',clientSecret:credentials.client_secret||'',origin:process.env.PUBLIC_ORIGIN||'https://rep.mattjhagen.xyz'}).listen(Number(process.env.PORT||3023),'127.0.0.1',()=>console.log('Rep Launch accounts listening on loopback'));
}
