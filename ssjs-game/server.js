import express from 'express';
import {createServer} from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
const app=express();app.use(express.static('public'));const server=createServer(app);const wss=new WebSocketServer({server,path:'/ws'});
const rooms=new Map();
const bank=JSON.parse(readFileSync(new URL('./wordbank.json',import.meta.url),'utf8'));
const words=Object.entries(bank).flatMap(([category,list])=>list.map(word=>({category,word})));
function shuffledDeck(){const deck=words.map((_,i)=>i);for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}return deck}
const send=(ws,obj)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj))};
const broadcast=(room,obj)=>{for(const p of room.players)send(p.ws,obj)};
const norm=s=>s.normalize('NFKC').replace(/\s/g,'').toLocaleLowerCase('ko');
const publicPlayers=r=>r.players.map(p=>({id:p.id,nick:p.nick,avatar:p.avatar,score:p.score}));
function sync(r){broadcast(r,{type:'state',code:r.code,host:r.host,players:publicPlayers(r),status:r.status,round:r.round,drawer:r.drawer,category:r.category,endsAt:r.endsAt,answer:r.status==='reveal'?r.answer:null,strokes:r.strokes});if(r.status==='playing'){let d=r.players.find(p=>p.id===r.drawer);send(d?.ws,{type:'secret',word:r.answer})}}
function resetTimer(r){if(r.timer)clearTimeout(r.timer);r.timer=null}
function reveal(r,message){if(r.status!=='playing')return;resetTimer(r);r.status='reveal';r.endsAt=Date.now()+4500;broadcast(r,{type:'notice',text:message});sync(r);r.timer=setTimeout(()=>{r.timer=null;if(r.players.length>=2)nextRound(r);else{r.status='lobby';sync(r)}},4500)}
function nextRound(r){resetTimer(r);if(r.players.length<2){r.status='lobby';sync(r);return}r.round++;r.drawerIndex=(r.drawerIndex+1)%r.players.length;r.drawer=r.players[r.drawerIndex].id;if(!r.deck?.length){r.deck=shuffledDeck();if(r.answer&&words[r.deck[r.deck.length-1]].word===r.answer&&r.deck.length>1){[r.deck[0],r.deck[r.deck.length-1]]=[r.deck[r.deck.length-1],r.deck[0]]}}let item=words[r.deck.pop()];r.answer=item.word;r.category=item.category;r.strokes=[];r.status='playing';r.endsAt=Date.now()+60000;sync(r);r.timer=setTimeout(()=>reveal(r,'⏰ 60초 종료!'),60000)}
function leave(ws){let r=rooms.get(ws.room);if(!r)return;const old=r.players.length;r.players=r.players.filter(p=>p.ws!==ws);if(old===r.players.length)return;if(!r.players.length){resetTimer(r);rooms.delete(r.code);return}if(r.host===ws.pid)r.host=r.players[0].id;if(r.status==='playing'&&r.drawer===ws.pid){resetTimer(r);r.drawerIndex=Math.max(-1,r.players.findIndex(p=>p.id===ws.pid)-1);nextRound(r)}else if(r.status!=='lobby'&&r.players.length<2){resetTimer(r);r.status='lobby';r.answer='';sync(r)}else{r.drawerIndex=Math.max(-1,r.players.findIndex(p=>p.id===r.drawer));sync(r)}ws.room=null}
function code(){let s;do{s=randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(s));return s}
function error(ws,msg){send(ws,{type:'error',text:msg})}
wss.on('connection',ws=>{ws.pid=randomUUID();ws.lastStroke=0;ws.on('message',raw=>{if(raw.length>6000)return;let m;try{m=JSON.parse(raw)}catch{return}if(!m||typeof m.type!=='string')return;
if(m.type==='join'){leave(ws);const nick=String(m.nick||'').trim().slice(0,12);if(!nick)return error(ws,'닉네임을 입력해줘!');const avatar=Number(m.avatar);if(!Number.isInteger(avatar)||avatar<0||avatar>7)return;let r;if(m.code){r=rooms.get(String(m.code).toUpperCase());if(!r)return error(ws,'없는 방이야. 링크를 확인해줘!')}else{r={code:code(),players:[],host:ws.pid,status:'lobby',round:0,drawer:null,drawerIndex:-1,answer:'',category:'',endsAt:0,strokes:[],timer:null,deck:shuffledDeck()};rooms.set(r.code,r)}if(r.players.length>=12)return error(ws,'이 방은 최대 12명까지 입장할 수 있어!');ws.room=r.code;r.players.push({id:ws.pid,ws,nick,avatar,score:0});send(ws,{type:'joined',id:ws.pid,code:r.code});sync(r);return}
let r=rooms.get(ws.room);if(!r)return;if(m.type==='start'){if(ws.pid!==r.host||r.status!=='lobby')return;if(r.players.length<2)return error(ws,'최소 2명이 있어야 시작할 수 있어!');r.round=0;r.drawerIndex=-1;r.deck=shuffledDeck();r.players.forEach(p=>p.score=0);nextRound(r)}
if(m.type==='stroke'){if(r.status!=='playing'||r.drawer!==ws.pid)return;const s=m.stroke;if(!s||!['line','clear','fill'].includes(s.kind))return;if(s.kind==='clear'){r.strokes=[];broadcast(r,{type:'draw',stroke:{kind:'clear'}});return}if(s.kind==='fill'){if(![s.x,s.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=720)||!/^#[0-9a-fA-F]{6}$/.test(s.color))return;const stroke={kind:'fill',x:s.x,y:s.y,color:s.color};r.strokes.push(stroke);broadcast(r,{type:'draw',stroke});return}const vals=[s.x,s.y,s.px,s.py,s.width];if(!vals.every(v=>typeof v==='number'&&Number.isFinite(v))||vals.slice(0,4).some(v=>v<0||v>720)||s.width<1||s.width>40||!/^#[0-9a-fA-F]{6}$/.test(s.color))return;const stroke={kind:'line',x:s.x,y:s.y,px:s.px,py:s.py,width:s.width,color:s.color};if(r.strokes.length>20000)r.strokes.shift();r.strokes.push(stroke);broadcast(r,{type:'draw',stroke})}
if(m.type==='chat'){if(r.status!=='playing'||r.drawer===ws.pid)return;const text=String(m.text||'').trim().slice(0,70);if(!text)return;const p=r.players.find(p=>p.id===ws.pid);if(!p)return;if(norm(text)===norm(r.answer)){p.score+=Math.max(10,Math.ceil((r.endsAt-Date.now())/1000));reveal(r,`🎉 ${p.nick} 정답!`)}else broadcast(r,{type:'chat',nick:p.nick,text})}
});ws.on('close',()=>leave(ws))});
setInterval(()=>{for(const r of rooms.values()){if(r.status==='lobby'&&r.players.length===0){resetTimer(r);rooms.delete(r.code)}}},60000).unref();
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Game ready'));
