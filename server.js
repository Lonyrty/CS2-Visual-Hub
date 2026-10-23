require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const Stripe = require('stripe');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const required = ['SESSION_SECRET','OWNER_PASSWORD'];
for (const k of required) if (!process.env[k] || process.env[k].includes('replace_me') || process.env[k].includes('replace_with')) {
  console.error(`Missing or placeholder environment variable: ${k}. Copy .env.example to .env and configure it.`); process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) { console.error('SESSION_SECRET must be at least 32 characters.'); process.exit(1); }
const app = express();
const stripe = process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('replace_me') ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ownerName = (process.env.OWNER_USERNAME || 'lonyrty').toLowerCase();
const currency = (process.env.CURRENCY || 'eur').toLowerCase();
const dbDir = path.join(__dirname, 'data'); fs.mkdirSync(dbDir, {recursive:true});
const db = new Database(path.join(dbDir, 'hub.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, subscription_until INTEGER, lifetime INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS payments (session_id TEXT PRIMARY KEY, username TEXT NOT NULL, plan TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, received_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS friendships (id INTEGER PRIMARY KEY AUTOINCREMENT, from_user TEXT NOT NULL, to_user TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, UNIQUE(from_user,to_user));
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, from_user TEXT NOT NULL, to_user TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);`);
try { db.exec("ALTER TABLE users ADD COLUMN steam_url TEXT NOT NULL DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''"); } catch(e) {}
const owner = db.prepare('SELECT username FROM users WHERE username=?').get(ownerName);
if (!owner) db.prepare('INSERT INTO users(username,password_hash,created_at,lifetime) VALUES(?,?,?,1)').run(ownerName,bcrypt.hashSync(process.env.OWNER_PASSWORD,12),Date.now());
else db.prepare('UPDATE users SET lifetime=1 WHERE username=?').run(ownerName);

// Stripe webhook must receive the unmodified raw body before express.json().
app.post('/webhook', express.raw({type:'application/json'}), (req,res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET.includes('replace_me')) return res.status(503).send('Stripe payments are not configured');
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { console.error('Stripe webhook signature rejected:', e.message); return res.status(400).send('Invalid webhook signature'); }
  const seen = db.prepare('SELECT event_id FROM webhook_events WHERE event_id=?').get(event.id);
  if (seen) return res.json({received:true,duplicate:true});
  const processEvent = db.transaction(() => {
    db.prepare('INSERT INTO webhook_events(event_id,received_at) VALUES(?,?)').run(event.id,Date.now());
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const s = event.data.object;
      if (s.payment_status !== 'paid') return;
      const username = String(s.metadata?.username || '').toLowerCase();
      const plan = String(s.metadata?.plan || '');
      const user = db.prepare('SELECT username,lifetime FROM users WHERE username=?').get(username);
      if (!user || user.lifetime || !['7d','30d','90d','lifetime'].includes(plan)) return;
      const exists = db.prepare('SELECT session_id FROM payments WHERE session_id=?').get(s.id);
      if (exists) return;
      const amount = Number(s.amount_total || 0);
      db.prepare('INSERT INTO payments(session_id,username,plan,amount,currency,status,created_at) VALUES(?,?,?,?,?,?,?)').run(s.id,username,plan,amount,String(s.currency||currency), 'paid', Date.now());
      if (plan === 'lifetime') db.prepare('UPDATE users SET lifetime=1,subscription_until=NULL WHERE username=?').run(username);
      else {
        const days = Number(plan.replace('d',''));
        const u = db.prepare('SELECT subscription_until FROM users WHERE username=?').get(username);
        const start = Math.max(Date.now(), Number(u.subscription_until || 0));
        db.prepare('UPDATE users SET subscription_until=? WHERE username=?').run(start + days*86400000, username);
      }
    }
  });
  try { processEvent(); return res.json({received:true}); }
  catch(e) { console.error('Webhook processing failed:',e); return res.status(500).send('Webhook processing failed'); }
});
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],scriptSrc:["'self'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],formAction:["'self'","https://checkout.stripe.com"],frameAncestors:["'none'"]}}}));
app.use(express.json({limit:'20kb'}));
app.use(session({store:new SQLiteStore({db:'sessions.sqlite',dir:dbDir}),secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*86400000}}));
app.use('/api', rateLimit({windowMs:15*60*1000,limit:100,standardHeaders:true,legacyHeaders:false}));
const authLimit = rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:true,legacyHeaders:false});
function userRow(username){return db.prepare('SELECT username,created_at,subscription_until,lifetime FROM users WHERE username=?').get(username);}
function publicUser(row){return {username:row.username,createdAt:row.created_at,lifetime:!!row.lifetime,subscriptionUntil:row.subscription_until,active:!!row.lifetime || Number(row.subscription_until||0)>Date.now()};}
function auth(req,res,next){if(!req.session.username)return res.status(401).json({error:'Сначала войдите в аккаунт.'});next();}
function ownerOnly(req,res,next){if(req.session.username!==ownerName)return res.status(403).json({error:'Недостаточно прав.'});next();}
app.post('/api/register',authLimit,async(req,res)=>{const username=String(req.body.username||'').trim().toLowerCase();const password=String(req.body.password||'');if(!/^[a-z0-9_-]{3,24}$/.test(username)||password.length<10)return res.status(400).json({error:'Логин: 3–24 символа (a-z, 0-9, _-); пароль минимум 10 символов.'});if(username===ownerName)return res.status(409).json({error:'Этот логин зарезервирован владельцем.'});try{db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)').run(username,await bcrypt.hash(password,12),Date.now());req.session.username=username;res.json({user:publicUser(userRow(username))});}catch(e){res.status(409).json({error:'Такой логин уже занят.'});}});
app.post('/api/login',authLimit,async(req,res)=>{const username=String(req.body.username||'').trim().toLowerCase();const row=db.prepare('SELECT * FROM users WHERE username=?').get(username);if(!row||!await bcrypt.compare(String(req.body.password||''),row.password_hash))return res.status(401).json({error:'Неверный логин или пароль.'});req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Не удалось создать сессию.'});req.session.username=username;res.json({user:publicUser(userRow(username))});});});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>{if(!req.session.username)return res.json({user:null});const row=userRow(req.session.username);if(!row){req.session.destroy(()=>{});return res.json({user:null});}res.json({user:publicUser(row)});});
const plans=[{id:'7d',label:'7 дней',env:'PRICE_7D_CENTS',days:7},{id:'30d',label:'30 дней',env:'PRICE_30D_CENTS',days:30},{id:'90d',label:'90 дней',env:'PRICE_90D_CENTS',days:90},{id:'lifetime',label:'Навсегда',env:'PRICE_LIFETIME_CENTS',days:0}];
app.get('/api/plans',(req,res)=>res.json({plans:plans.filter(p=>Number.isSafeInteger(Number(process.env[p.env]))&&Number(process.env[p.env])>0).map(p=>({id:p.id,label:p.label,amount:Number(process.env[p.env]),currency}))}));
app.post('/api/checkout',auth,async(req,res)=>{if(!stripe)return res.status(503).json({error:'Оплата пока не настроена владельцем.'});const plan=plans.find(p=>p.id===req.body.plan);if(!plan||!Number.isSafeInteger(Number(process.env[plan.env]))||Number(process.env[plan.env])<=0)return res.status(400).json({error:'Этот тариф пока не настроен владельцем.'});const u=userRow(req.session.username);if(u.lifetime)return res.status(400).json({error:'У владельца уже пожизненный доступ.'});try{const checkout=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],line_items:[{price_data:{currency,unit_amount:Number(process.env[plan.env]),product_data:{name:`CS2 Visual Hub — ${plan.label} подписка`}},quantity:1}],client_reference_id:u.username,metadata:{username:u.username,plan:plan.id},success_url:`${baseUrl}/?payment=return&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${baseUrl}/?payment=cancelled`});res.json({url:checkout.url});}catch(e){console.error('Checkout create error:',e.message);res.status(500).json({error:'Не удалось создать платёж. Проверьте настройки Stripe на сервере.'});}});
app.get('/api/payment-status',auth,async(req,res)=>{if(!stripe)return res.status(503).json({error:'Оплата пока не настроена владельцем.'});const id=String(req.query.session_id||'');if(!id.startsWith('cs_'))return res.status(400).json({error:'Некорректная сессия.'});try{const checkout=await stripe.checkout.sessions.retrieve(id);if(checkout.client_reference_id!==req.session.username)return res.status(403).json({error:'Эта оплата принадлежит другому аккаунту.'});const u=userRow(req.session.username);res.json({paymentStatus:checkout.payment_status,subscription:publicUser(u),note:checkout.payment_status==='paid'?'Оплата подтверждена Stripe.':'Платёж ещё обрабатывается; доступ включится после webhook-подтверждения.'});}catch(e){res.status(404).json({error:'Платёжная сессия не найдена.'});}});
// Player directory, public profiles, friend requests and private chat.
app.get('/api/players',auth,(req,res)=>{const q=String(req.query.q||'').trim().toLowerCase().slice(0,24);const rows=q?db.prepare("SELECT username,created_at,subscription_until,lifetime,steam_url,bio FROM users WHERE username LIKE ? AND username<>? ORDER BY username LIMIT 100").all('%'+q+'%',req.session.username):db.prepare("SELECT username,created_at,subscription_until,lifetime,steam_url,bio FROM users WHERE username<>? ORDER BY username LIMIT 100").all(req.session.username);res.json({players:rows.map(r=>({...publicUser(r),steamUrl:r.steam_url||'',bio:r.bio||''}))});});
app.get('/api/profile/:username',auth,(req,res)=>{const name=String(req.params.username||'').toLowerCase();const r=db.prepare('SELECT username,created_at,subscription_until,lifetime,steam_url,bio FROM users WHERE username=?').get(name);if(!r)return res.status(404).json({error:'Игрок не найден.'});const rel=db.prepare('SELECT status,from_user,to_user FROM friendships WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?) ORDER BY id DESC LIMIT 1').get(req.session.username,name,name,req.session.username);res.json({profile:{...publicUser(r),steamUrl:r.steam_url||'',bio:r.bio||''},friendship:rel||null});});
app.patch('/api/profile',auth,(req,res)=>{const bio=String(req.body.bio||'').trim().slice(0,240);let steam='';const raw=String(req.body.steamUrl||'').trim();if(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||!['steamcommunity.com','www.steamcommunity.com'].includes(u.hostname)||!/^\/(id|profiles)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))throw Error();steam=u.toString();}catch{return res.status(400).json({error:'Укажи корректную ссылку Steam Community.'});}}db.prepare('UPDATE users SET steam_url=?,bio=? WHERE username=?').run(steam,bio,req.session.username);res.json({ok:true});});
app.get('/api/friends',auth,(req,res)=>{const me=req.session.username;const friends=db.prepare("SELECT from_user,to_user,created_at FROM friendships WHERE status='accepted' AND (from_user=? OR to_user=?) ORDER BY created_at DESC").all(me,me).map(r=>({username:r.from_user===me?r.to_user:r.from_user,createdAt:r.created_at}));const incoming=db.prepare("SELECT from_user AS username,created_at FROM friendships WHERE to_user=? AND status='pending' ORDER BY created_at DESC").all(me);const outgoing=db.prepare("SELECT to_user AS username,created_at FROM friendships WHERE from_user=? AND status='pending' ORDER BY created_at DESC").all(me);res.json({friends,incoming,outgoing});});
app.post('/api/friends/request',auth,(req,res)=>{const me=req.session.username,target=String(req.body.username||'').toLowerCase();if(target===me)return res.status(400).json({error:'Нельзя добавить самого себя.'});if(!userRow(target))return res.status(404).json({error:'Игрок не найден.'});const existing=db.prepare('SELECT * FROM friendships WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)').get(me,target,target,me);if(existing){if(existing.status==='accepted')return res.status(409).json({error:'Вы уже друзья.'});if(existing.from_user===target&&existing.status==='pending'){db.prepare("UPDATE friendships SET status='accepted' WHERE id=?").run(existing.id);return res.json({status:'accepted'});}return res.status(409).json({error:'Заявка уже существует.'});}db.prepare('INSERT INTO friendships(from_user,to_user,status,created_at) VALUES(?,?,?,?)').run(me,target,'pending',Date.now());res.json({status:'pending'});});
app.post('/api/friends/respond',auth,(req,res)=>{const me=req.session.username,target=String(req.body.username||'').toLowerCase(),accept=!!req.body.accept;const r=db.prepare("SELECT id FROM friendships WHERE from_user=? AND to_user=? AND status='pending'").get(target,me);if(!r)return res.status(404).json({error:'Заявка не найдена.'});if(accept)db.prepare("UPDATE friendships SET status='accepted' WHERE id=?").run(r.id);else db.prepare('DELETE FROM friendships WHERE id=?').run(r.id);res.json({ok:true});});
app.get('/api/chat/:username',auth,(req,res)=>{const me=req.session.username,other=String(req.params.username||'').toLowerCase();const ok=db.prepare("SELECT id FROM friendships WHERE status='accepted' AND ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))").get(me,other,other,me);if(!ok)return res.status(403).json({error:'Чат доступен только друзьям.'});const messages=db.prepare('SELECT id,from_user AS fromUser,to_user AS toUser,body,created_at AS createdAt FROM messages WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?) ORDER BY id DESC LIMIT 100').all(me,other,other,me).reverse();res.json({messages});});
app.post('/api/chat/:username',auth,(req,res)=>{const me=req.session.username,other=String(req.params.username||'').toLowerCase(),body=String(req.body.body||'').trim();if(!body||body.length>1000)return res.status(400).json({error:'Сообщение должно содержать 1–1000 символов.'});const ok=db.prepare("SELECT id FROM friendships WHERE status='accepted' AND ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))").get(me,other,other,me);if(!ok)return res.status(403).json({error:'Чат доступен только друзьям.'});const created=Date.now(),info=db.prepare('INSERT INTO messages(from_user,to_user,body,created_at) VALUES(?,?,?,?)').run(me,other,body,created);res.json({message:{id:info.lastInsertRowid,fromUser:me,toUser:other,body,createdAt:created}});});
app.get('/api/admin/users',auth,ownerOnly,(req,res)=>res.json({users:db.prepare('SELECT username,created_at,subscription_until,lifetime FROM users ORDER BY created_at DESC').all().map(publicUser)}));
app.post('/api/admin/grant',auth,ownerOnly,(req,res)=>{const username=String(req.body.username||'').toLowerCase();const days=Number(req.body.days);const u=userRow(username);if(!u)return res.status(404).json({error:'Пользователь не найден.'});if(username===ownerName)return res.status(400).json({error:'Владелец уже имеет пожизненный доступ.'});if(days===0)db.prepare('UPDATE users SET lifetime=1,subscription_until=NULL WHERE username=?').run(username);else if(![7,30,90,365].includes(days))return res.status(400).json({error:'Недопустимый срок.'});else db.prepare('UPDATE users SET subscription_until=?,lifetime=0 WHERE username=?').run(Math.max(Date.now(),Number(u.subscription_until||0))+days*86400000,username);res.json({user:publicUser(userRow(username))});});
app.get('/api/admin/payments',auth,ownerOnly,(req,res)=>res.json({payments:db.prepare('SELECT session_id,username,plan,amount,currency,status,created_at FROM payments ORDER BY created_at DESC LIMIT 100').all()}));
app.use(express.static(path.join(__dirname,'public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const port=Number(process.env.PORT||3000);app.listen(port,'0.0.0.0',()=>console.log(`CS2 Visual Hub running at ${baseUrl}`));
