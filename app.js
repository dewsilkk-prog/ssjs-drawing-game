const $=id=>document.getElementById(id);const names=['치이카와','모몽가','우사기','하치와레','쿠리만쥬','랏코','시사','카니'];let avatar=0,nick='',me='',code='',state=null,secret='',socket=null,draw=false,last=null,color='#34312f',brush=6,tool='pen',notice='',lastChatAt=0;
function show(id){for(const s of document.querySelectorAll('main>section'))s.classList.toggle('hidden',s.id!==id)}
function msg(t){alert(t)}
function send(obj){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(obj))}
function connect(){return new Promise((resolve,reject)=>{if(socket?.readyState===WebSocket.OPEN)return resolve();socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);socket.onopen=resolve;socket.onerror=()=>reject(new Error('서버 연결에 실패했어'));socket.onclose=()=>{if(state)msg('서버 연결이 끊겼어. 새로고침해서 다시 입장해줘!')};socket.onmessage=e=>{let m=JSON.parse(e.data);if(m.type==='error')msg(m.text);if(m.type==='joined'){me=m.id;code=m.code;history.replaceState(null,'',`/?room=${code}`)}if(m.type==='state'){const old=state;state=m;if(old?.round!==m.round||old?.status!==m.status){notice=''}render();paintAll(m.strokes)}if(m.type==='secret'){secret=m.word;render()}if(m.type==='chat')addMessage(m.nick,m.text);if(m.type==='chatHistory'){const el=$('messages');el.replaceChildren();for(const item of m.items||[])addMessage(item.nick,item.text)}if(m.type==='notice'){notice=m.text;render()}if(m.type==='draw')paintStroke(m.stroke)}})}
$('enterBtn').onclick=()=>show('profile');$('backBtn').onclick=()=>show('home');
names.forEach((name,i)=>{const b=document.createElement('button');b.className='avatar'+(i===0?' selected':'');const img=document.createElement('img');img.src=`/avatars/${i}.png`;img.alt=name;b.append(img,document.createTextNode(name));b.onclick=()=>{avatar=i;document.querySelectorAll('.avatar').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')};$('avatars').append(b)});
$('joinBtn').onclick=async()=>{nick=$('nickname').value.trim();if(!nick)return msg('닉네임을 입력해줘!');$('joinBtn').disabled=true;try{await connect();send({type:'join',nick,avatar,code:new URLSearchParams(location.search).get('room')||''})}catch(e){msg(e.message)}finally{$('joinBtn').disabled=false}};
$('startBtn').onclick=()=>send({type:'start'});$('copyBtn').onclick=async()=>{const url=`${location.origin}/?room=${code}`;try{await navigator.clipboard.writeText(url);msg('초대 링크 복사 완료! 친구에게 보내줘!')}catch{prompt('이 링크를 복사해줘!',url)}};
function playerCards(id){const el=$(id);el.replaceChildren();for(const p of state.players){const card=document.createElement('div');card.className='player'+(p.id===state.drawer?' drawer':'');const img=document.createElement('img');img.src=`/avatars/${p.avatar}.png`;const txt=document.createElement('span');txt.textContent=`${p.id===state.drawer?'🖍 ':''}${p.nick}${p.id===me?' (나)':''} · ${p.score}점`;card.append(img,txt);el.append(card)}}
function render(){if(!state)return;if(state.status==='lobby'){show('lobby');$('roomcode').textContent=state.code;$('startBtn').classList.toggle('hidden',state.host!==me);$('startBtn').disabled=state.players.length<2;playerCards('lobbyplayers');return}show('game');playerCards('gameplayers');const drawer=state.drawer===me;const current=state.status==='playing';$('round').textContent=`🎨 ${state.round}라운드 · ${state.category} · ${state.bonus?'🌟 보너스 문제 20점':'일반 문제 10점'}`;$('role').textContent=`지금 그림 그리는 사람: ${state.players.find(p=>p.id===state.drawer)?.nick||'연결 중'}`;$('secret').textContent=state.status==='reveal'?`정답: ${state.answer}`:drawer?`나만 보는 제시어: ${secret||'잠시만...'}`:'제시어: 🔒 비공개';$('notice').textContent=state.status==='reveal'?(notice||'정답 공개! 잠시 후 다음 사람 차례야'):notice;$('drawtools').classList.toggle('hidden',!drawer||!current);$('chatinput').disabled=drawer||!current;$('sendBtn').disabled=drawer||!current;$('board').style.cursor=drawer&&current?'crosshair':'default';if(!drawer)secret=''}
setInterval(()=>{if(!state||state.status==='lobby')return;const n=Math.max(0,Math.ceil((state.endsAt-Date.now())/1000));$('timer').textContent=state.status==='reveal'?`정답 공개 ${n}초`:`⏱ ${n}초`},200);
function addMessage(who,text){const p=document.createElement('p');const b=document.createElement('strong');b.textContent=who+': ';p.append(b,document.createTextNode(text));$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight}
// Korean IME safe chat: never submit while the last syllable is still composing.
let chatComposing=false,chatPending=false,lastCompositionEnd=0;
const chatInput=$('chatinput');
chatInput.addEventListener('compositionstart',()=>{chatComposing=true});
chatInput.addEventListener('compositionend',()=>{chatComposing=false;lastCompositionEnd=performance.now()});
function chat(){
 if(chatPending||chatComposing)return;
 chatPending=true;
 // Blurring commits any pending Hangul composition before reading and clearing.
 chatInput.blur();
 setTimeout(()=>{
  chatPending=false;
  if(chatComposing)return;
  const text=chatInput.value.trim();
  if(!text||Date.now()-lastChatAt<180)return;
  lastChatAt=Date.now();
  chatInput.value='';
  send({type:'chat',text});
 },0);
}
$('sendBtn').addEventListener('click',chat);
chatInput.addEventListener('keydown',e=>{
 if(e.key!=='Enter')return;
 // Prevent the browser from both committing the final Hangul syllable
 // and submitting the same Enter key as a separate message.
 e.preventDefault();
 if(e.isComposing||e.keyCode===229||chatComposing||performance.now()-lastCompositionEnd<120)return;
 chat();
});
const canvas=$('board'),ctx=canvas.getContext('2d');ctx.lineCap='round';ctx.lineJoin='round';function clear(){ctx.fillStyle='white';ctx.fillRect(0,0,720,500)}function paintStroke(s){if(s.kind==='clear'){clear();return}if(s.kind==='fill'){floodFill(Math.round(s.x),Math.round(s.y),s.color);return}ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.beginPath();ctx.moveTo(s.px,s.py);ctx.lineTo(s.x,s.y);ctx.stroke()}function paintAll(strokes){clear();for(const s of strokes||[])paintStroke(s)}function pos(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(720,(e.clientX-r.left)*720/r.width)),y:Math.max(0,Math.min(500,(e.clientY-r.top)*500/r.height))}}function canDraw(){return state?.status==='playing'&&state.drawer===me}canvas.onpointerdown=e=>{if(!canDraw())return;const p=pos(e);if(tool==='fill'){const stroke={kind:'fill',x:p.x,y:p.y,color};paintStroke(stroke);send({type:'stroke',stroke});return}draw=true;canvas.setPointerCapture(e.pointerId);last=p};canvas.onpointermove=e=>{if(!draw||!canDraw())return;const p=pos(e);const stroke={kind:'line',px:last.x,py:last.y,x:p.x,y:p.y,color,width:brush};paintStroke(stroke);send({type:'stroke',stroke});last=p};canvas.onpointerup=canvas.onpointercancel=()=>{draw=false;last=null};
const colors=['#34312f','#f25f5c','#ffad42','#ffe16b','#65bd7b','#6cb7ef','#ae8bd9','#ffffff'];function selectColor(c){color=c;document.querySelectorAll('.swatch').forEach(b=>b.classList.toggle('active',b.dataset.color===c))}for(const c of colors){const b=document.createElement('button');b.className='swatch';b.dataset.color=c;b.style.background=c;b.onclick=()=>selectColor(c);$('colors').append(b)}selectColor(color);document.querySelectorAll('[data-brush]').forEach(b=>b.onclick=()=>{brush=+b.dataset.brush;tool='pen';updateToolButtons()});$('fillBtn').onclick=()=>{tool=tool==='fill'?'pen':'fill';updateToolButtons()};function updateToolButtons(){document.querySelectorAll('[data-brush]').forEach(b=>b.classList.toggle('chosen',tool==='pen'&&brush===+b.dataset.brush));$('fillBtn').classList.toggle('chosen',tool==='fill')}updateToolButtons();$('eraseBtn').onclick=()=>{tool='pen';selectColor('#ffffff');updateToolButtons()};$('clearBtn').onclick=()=>send({type:'stroke',stroke:{kind:'clear'}});clear();

// 색상 경계가 이어진 영역만 채우는 페인트통 (캔버스 720×500)
function floodFill(x,y,hex){
 const w=canvas.width,h=canvas.height;if(x<0||y<0||x>=w||y>=h)return;
 const img=ctx.getImageData(0,0,w,h),d=img.data,start=(y*w+x)*4;
 const target=[d[start],d[start+1],d[start+2],d[start+3]];
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 if(target[0]===rgb[0]&&target[1]===rgb[1]&&target[2]===rgb[2]&&target[3]===255)return;
 const seen=new Uint8Array(w*h),stack=[y*w+x];let count=0;
 while(stack.length){const idx=stack.pop();if(seen[idx])continue;seen[idx]=1;const o=idx*4;
 if(Math.abs(d[o]-target[0])>12||Math.abs(d[o+1]-target[1])>12||Math.abs(d[o+2]-target[2])>12||Math.abs(d[o+3]-target[3])>12)continue;
 d[o]=rgb[0];d[o+1]=rgb[1];d[o+2]=rgb[2];d[o+3]=255;count++;
 const xx=idx%w;if(xx>0)stack.push(idx-1);if(xx<w-1)stack.push(idx+1);if(idx>=w)stack.push(idx-w);if(idx<w*(h-1))stack.push(idx+w);
 }ctx.putImageData(img,0,0);
}
