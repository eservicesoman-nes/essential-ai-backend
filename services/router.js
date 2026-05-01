<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
  <title>Essential AI v3.0 — Intelligence Platform</title>
  <meta name="description" content="Essential AI — intelligent workspace with 1M context, web search, DALL-E 3, and daily free tier.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    :root{--bg:#0a0a0c;--surface:#111115;--border:#1e1e24;--text:#e8e8ec;--muted:#6b6b7e;--accent:#FF5722;--accent-lo:rgba(255,87,34,0.12);--accent-md:rgba(255,87,34,0.25);--green:#2ecc71;--red:#e74c3c;--blue:#3b82f6;--ui:'Syne',sans-serif;--mono:'DM Mono',monospace;}
    [data-theme="light"]{--bg:#f0f0ea;--surface:#ffffff;--border:#dddde3;--text:#1a1a2e;--muted:#8a8a9e;}
    body{font-family:var(--ui);background:var(--bg);color:var(--text);height:100dvh;display:flex;overflow:hidden;transition:background .3s,color .3s;}

    /* Auth */
    #authScreen{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;align-items:center;justify-content:center;}
    .auth-box{width:min(400px,90vw);background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:40px;}
    .auth-logo{font-size:1.6rem;font-weight:800;margin-bottom:4px;}.auth-logo span{color:var(--accent);}
    .auth-sub{font-family:var(--mono);font-size:.7rem;color:var(--muted);margin-bottom:32px;}
    .auth-tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:24px;}
    .auth-tab{background:none;border:none;color:var(--muted);font-family:var(--ui);font-weight:600;padding:10px 20px;cursor:pointer;}
    .auth-tab.active{color:var(--accent);border-bottom:2px solid var(--accent);}
    .auth-panel{display:none;flex-direction:column;gap:12px;}.auth-panel.active{display:flex;}
    .auth-input{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px 16px;color:var(--text);font-family:var(--mono);font-size:.85rem;outline:none;width:100%;}
    .auth-input:focus{border-color:var(--accent);}
    .auth-btn{background:var(--accent);border:none;border-radius:12px;padding:12px;color:white;font-weight:700;cursor:pointer;font-family:var(--ui);}
    .auth-btn:hover{opacity:.88;}
    .auth-err{font-family:var(--mono);font-size:.7rem;color:var(--red);min-height:18px;}

    /* App layout */
    #app{display:none;width:100%;height:100dvh;overflow:hidden;}
    #app.visible{display:flex;}

    /* Sidebar */
    .sidebar{width:260px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:24px 16px;height:100dvh;overflow:hidden;}
    .logo{font-size:1.3rem;font-weight:800;padding:0 8px;margin-bottom:2px;}.logo span{color:var(--accent);}
    .logo-version{font-family:var(--mono);font-size:.6rem;color:var(--muted);padding:0 8px;margin-bottom:24px;}
    .upgrade-btn{background:linear-gradient(135deg,#FF5722,#FF3D00);border:none;border-radius:40px;padding:10px 16px;color:white;font-family:var(--ui);font-size:.75rem;font-weight:700;cursor:pointer;margin:0 8px 20px;text-align:center;box-shadow:0 2px 8px rgba(255,87,34,.3);}
    .upgrade-btn:hover{opacity:.9;transform:scale(1.02);}
    .nav{display:flex;flex-direction:column;gap:4px;flex:1;}
    .nav-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;cursor:pointer;color:var(--muted);font-size:.85rem;font-weight:600;transition:all .15s;}
    .nav-item:hover{background:var(--accent-lo);color:var(--accent);}
    .nav-item.active{background:var(--accent-lo);color:var(--accent);}
    .nav-icon{font-size:1.1rem;width:24px;flex-shrink:0;}
    .usage-wrap{margin-top:auto;padding:16px 8px 0;border-top:1px solid var(--border);}
    .usage-row{display:flex;justify-content:space-between;font-family:var(--mono);font-size:.6rem;color:var(--muted);margin-bottom:8px;}
    .usage-track{height:3px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:16px;}
    .usage-fill{height:100%;background:var(--accent);border-radius:99px;width:0%;transition:width .4s;}
    .user-row{display:flex;align-items:center;gap:10px;padding-top:12px;}
    .user-av{width:32px;height:32px;background:var(--accent-lo);border:1px solid var(--accent-md);border-radius:50%;display:grid;place-items:center;font-size:.7rem;color:var(--accent);font-weight:700;flex-shrink:0;}
    .user-email{font-family:var(--mono);font-size:.65rem;color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .logout-btn{background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;}
    .logout-btn:hover{color:var(--red);}

    /* Main */
    .main{flex:1;display:flex;flex-direction:column;height:100dvh;overflow:hidden;min-width:0;position:relative;}

    /* Theme toggle */
    .theme-toggle{position:absolute;top:16px;right:20px;background:var(--bg);border:1px solid var(--border);border-radius:50%;width:36px;height:36px;display:grid;place-items:center;cursor:pointer;color:var(--muted);font-size:1rem;z-index:10;}
    .theme-toggle:hover{color:var(--accent);border-color:var(--accent);}

    /* Welcome card */
    .welcome-card{padding:16px 28px;border-bottom:1px solid var(--border);flex-shrink:0;}
    .chat-mode-label{font-family:var(--mono);font-size:.7rem;color:var(--accent);letter-spacing:1px;margin-bottom:10px;}
    .welcome-title{font-size:1.1rem;font-weight:700;margin-bottom:6px;}
    .welcome-title span{color:var(--accent);}
    .features-row{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:10px;}
    .feat-item{font-family:var(--mono);font-size:.6rem;font-weight:700;color:var(--accent);display:flex;align-items:center;gap:4px;}
    .free-tier{font-family:var(--mono);font-size:.6rem;color:var(--muted);}

    /* Messages */
    .messages{flex:1;overflow-y:auto;padding:16px 28px;display:flex;flex-direction:column;gap:14px;min-height:0;}
    .messages::-webkit-scrollbar{width:4px;}
    .messages::-webkit-scrollbar-thumb{background:var(--border);border-radius:10px;}
    .msg{display:flex;gap:12px;animation:fadeIn .2s ease;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    .msg.user{flex-direction:row-reverse;}

    /* EAI Avatar */
    .eai-avatar{width:32px;height:32px;background:#FFFFFF;border:2px solid var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:var(--ui);font-weight:800;font-size:1rem;color:#000000;text-transform:lowercase;}
    .msg-user-av{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:.7rem;font-weight:700;flex-shrink:0;background:rgba(128,128,128,.15);border:1px solid var(--border);}
    .msg-body{max-width:80%;position:relative;}
    .msg-role{font-family:var(--mono);font-size:.6rem;color:var(--muted);margin-bottom:4px;}
    .msg.user .msg-role{text-align:right;}
    .msg-bubble{padding:10px 14px;border-radius:18px;font-size:.85rem;line-height:1.55;word-break:break-word;}
    .msg.user .msg-bubble{background:var(--accent);color:white;border-bottom-right-radius:4px;}
    .msg.ai .msg-bubble{background:var(--bg);border:1px solid var(--border);border-bottom-left-radius:4px;}
    .msg-bubble p{margin-bottom:6px;}
    .msg-bubble ul,.msg-bubble ol{margin:4px 0 6px 18px;}
    .msg-bubble code{background:rgba(128,128,128,.12);padding:2px 5px;border-radius:4px;font-family:monospace;font-size:.82em;}
    .msg-bubble pre{background:#0a0a0e;border:1px solid var(--border);border-radius:8px;padding:10px;overflow-x:auto;margin:8px 0;}
    .msg-bubble a{color:var(--blue);text-decoration:underline;}
    .msg-bubble strong{font-weight:700;}
    .sources-block{margin-top:8px;border-top:1px solid var(--border);padding-top:6px;font-size:.65rem;color:var(--muted);}
    .sources-block a{color:var(--blue);}

    /* Copy button */
    .copy-btn{position:absolute;top:0;right:0;background:var(--accent-lo);border:1px solid var(--accent-md);border-radius:8px;padding:3px 8px;font-size:.58rem;cursor:pointer;color:var(--accent);opacity:0;transition:opacity .2s;font-family:var(--mono);}
    .msg-body:hover .copy-btn{opacity:1;}

    /* Input area */
    .input-area{padding:12px 28px 16px;border-top:1px solid var(--border);flex-shrink:0;}
    .prompt-wrapper{display:flex;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--border);border-radius:60px;padding:5px 5px 5px 18px;transition:border-color .2s;}
    .prompt-wrapper:focus-within{border-color:var(--accent);}
    #messageInput{flex:1;background:none;border:none;outline:none;color:var(--text);font-family:var(--ui);font-size:.85rem;padding:10px 0;min-width:0;}
    #messageInput::placeholder{color:var(--muted);}
    .send-arrow{background:var(--accent);border:none;border-radius:50%;width:38px;height:38px;display:grid;place-items:center;cursor:pointer;color:white;font-size:1.1rem;flex-shrink:0;}
    .send-arrow:disabled{opacity:.4;cursor:not-allowed;}
    .action-buttons{display:flex;justify-content:center;gap:16px;margin-top:10px;}
    .action-btn{background:var(--bg);border:1px solid var(--border);border-radius:40px;padding:7px 28px;font-family:var(--ui);font-size:.72rem;font-weight:600;color:var(--muted);cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s;}
    .action-btn:hover{background:var(--accent-lo);border-color:var(--accent);color:var(--accent);}
    .action-btn.recording{background:rgba(231,76,60,.12);border-color:var(--red);color:var(--red);}
    .status-bar{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-family:var(--mono);font-size:.62rem;color:var(--muted);}
    .status-left{color:var(--green);}
    .status-left::before{content:"● ";}
    .status-left.busy{color:var(--accent);}
    .status-left.busy::before{content:"● ";}
    .status-stats{display:flex;gap:14px;align-items:center;}
    .upgrade-link{color:var(--accent);text-decoration:none;}
    .upgrade-link:hover{text-decoration:underline;}

    /* Typing dots */
    @keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}

    /* Pricing */
    .pricing-wrap{flex:1;overflow-y:auto;padding:32px 28px;min-height:0;}
    .pricing-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:18px;margin-top:32px;}
    .plan-card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px;width:210px;}
    .plan-card.highlight{border-color:var(--accent);box-shadow:0 0 20px var(--accent-lo);}
    .plan-name{font-size:1.1rem;font-weight:700;margin-bottom:8px;}
    .plan-price{font-size:1.7rem;font-weight:800;color:var(--accent);}
    .plan-period{font-size:.65rem;color:var(--muted);margin-bottom:16px;}
    .plan-features{list-style:none;margin-bottom:20px;}
    .plan-features li{padding:5px 0;border-bottom:1px solid var(--border);font-size:.75rem;}
    .plan-btn{background:var(--accent);border:none;border-radius:30px;padding:10px;color:white;font-weight:700;cursor:pointer;width:100%;font-family:var(--ui);font-size:.8rem;}
    .plan-btn:disabled{opacity:.5;cursor:default;}

    /* Mobile */
    @media(max-width:700px){
      .sidebar{width:64px;padding:14px 8px;}
      .logo,.logo-version,.upgrade-btn,.nav-item>span:not(.nav-icon),.usage-wrap,.user-email{display:none;}
      .nav-item{justify-content:center;padding:10px 0;}
      .user-row{justify-content:center;}
      .main{max-width:calc(100% - 64px);}
      .welcome-card,.messages,.input-area{padding-left:14px;padding-right:14px;}
      .features-row{gap:8px;}
      .feat-item{font-size:.55rem;}
      .status-stats{gap:8px;font-size:.55rem;}
      .pricing-grid{flex-direction:column;align-items:center;}
      .plan-card{width:100%;max-width:300px;}
    }
  </style>
</head>
<body>

<div id="authScreen">
  <div class="auth-box">
    <div class="auth-logo">Essential<span>AI</span></div>
    <div class="auth-sub">// intelligence platform v3.0</div>
    <div class="auth-tabs">
      <button class="auth-tab active" id="tabLogin" onclick="switchTab('login')">Sign In</button>
      <button class="auth-tab" id="tabSignup" onclick="switchTab('signup')">Sign Up</button>
    </div>
    <div id="loginPanel" class="auth-panel active">
      <input class="auth-input" id="loginEmail" type="email" placeholder="Email address" autocomplete="email">
      <input class="auth-input" id="loginPassword" type="password" placeholder="Password" autocomplete="current-password">
      <div class="auth-err" id="loginErr"></div>
      <button class="auth-btn" onclick="doLogin()">Sign In →</button>
    </div>
    <div id="signupPanel" class="auth-panel">
      <input class="auth-input" id="signupEmail" type="email" placeholder="Email address" autocomplete="email">
      <input class="auth-input" id="signupPassword" type="password" placeholder="Password (min 6 chars)" autocomplete="new-password">
      <div class="auth-err" id="signupErr"></div>
      <button class="auth-btn" onclick="doSignup()">Create Account →</button>
    </div>
  </div>
</div>

<div id="app">
  <aside class="sidebar">
    <div class="logo">Essential<span>AI</span></div>
    <div class="logo-version">v3.0</div>
    <button class="upgrade-btn" onclick="showPricing()">✨ Upgrade to Pro</button>
    <nav class="nav">
      <div class="nav-item active" data-mode="chat"><span class="nav-icon">💬</span><span>Chat</span></div>
      <div class="nav-item" data-mode="deepcore"><span class="nav-icon">🔬</span><span>Deep Core</span></div>
      <div class="nav-item" data-mode="docs"><span class="nav-icon">📄</span><span>Documents</span></div>
      <div class="nav-item" data-mode="image"><span class="nav-icon">🎨</span><span>Image Gen</span></div>
    </nav>
    <div class="usage-wrap">
      <div class="usage-row"><span>Daily messages</span><span id="usageTxt">0 / 50</span></div>
      <div class="usage-track"><div class="usage-fill" id="usageFill"></div></div>
      <div class="user-row">
        <div class="user-av" id="userInitial">?</div>
        <div class="user-email" id="userEmail">—</div>
        <button class="logout-btn" onclick="doLogout()">✕</button>
      </div>
    </div>
  </aside>

  <main class="main">
    <button class="theme-toggle" id="themeToggle" title="Toggle theme" onclick="toggleTheme()">🌓</button>
    <div id="mainContent" style="display:flex;flex-direction:column;height:100%;overflow:hidden;"></div>
  </main>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script>
// ============================================================
// 🔧 PASTE YOUR SUPABASE PUBLISHABLE KEY BELOW
// ============================================================
const SUPABASE_URL  = 'https://sfpfjjdtczvuxyhjievt.supabase.co';
const SUPABASE_ANON = 'sb_publishable_MH7rnJ7r8_-1TzGXcieNfA_NXoHQZbm';
const API_URL       = 'https://essential-ai-backend.onrender.com';
// ============================================================

const {createClient} = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
let session=null, mode='chat', history=[], busy=false, chatUsed=0, imagesUsed=0, docsUsed=0;
const CHAT_LIMIT = 50;
const IMAGE_LIMIT = 3;
const DOC_LIMIT = 5;
const STORAGE_KEY = 'essentialai_history';

const MODE_LABELS={chat:'CHAT MODE',deepcore:'DEEP CORE MODE',docs:'DOCUMENTS MODE',image:'IMAGE GEN MODE'};
const EAI_AV = `<div class="eai-avatar">e</div>`;

sb.auth.onAuthStateChange((_e,s)=>{session=s; s?showApp(s.user):showAuth();});

function showApp(user){
  document.getElementById('authScreen').style.display='none';
  const app=document.getElementById('app');
  app.style.display='flex'; app.classList.add('visible');
  document.getElementById('userEmail').textContent=user.email;
  document.getElementById('userInitial').textContent=user.email[0].toUpperCase();
  loadHistoryFromStorage();
  showChatInterface();
  loadUsage();
  bindNav();
}
function showAuth(){document.getElementById('app').style.display='none';document.getElementById('authScreen').style.display='flex';}

function switchTab(tab){
  document.getElementById('tabLogin').classList.toggle('active',tab==='login');
  document.getElementById('tabSignup').classList.toggle('active',tab==='signup');
  document.getElementById('loginPanel').classList.toggle('active',tab==='login');
  document.getElementById('signupPanel').classList.toggle('active',tab==='signup');
}
async function doLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const pass=document.getElementById('loginPassword').value;
  const err=document.getElementById('loginErr');
  err.style.color='var(--red)'; err.textContent='';
  if(!email||!pass){err.textContent='Email and password required.';return;}
  const {error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error) err.textContent=error.message;
}
async function doSignup(){
  const email=document.getElementById('signupEmail').value.trim();
  const pass=document.getElementById('signupPassword').value;
  const err=document.getElementById('signupErr');
  err.style.color='var(--red)'; err.textContent='';
  if(!email||!pass){err.textContent='Email and password required.';return;}
  if(pass.length<6){err.textContent='Password must be at least 6 characters.';return;}
  const {error}=await sb.auth.signUp({email,password:pass});
  if(error){err.textContent=error.message;}
  else{err.style.color='var(--green)';err.textContent='✅ Account created! You can now sign in.';}
}
async function doLogout(){history=[];saveHistoryToStorage();await sb.auth.signOut();}

function toggleTheme(){
  const html=document.documentElement;
  html.setAttribute('data-theme',html.getAttribute('data-theme')==='dark'?'light':'dark');
}

// History persistence
function saveHistoryToStorage(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(history.slice(-50)));}catch(e){}
}
function loadHistoryFromStorage(){
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved) history=JSON.parse(saved);
  }catch(e){history=[];}
}

function bindNav(){
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click',()=>{
      if(item.dataset.mode===mode)return;
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      item.classList.add('active');
      mode=item.dataset.mode;
      showChatInterface();
    });
  });
}

function showChatInterface(){
  const isSearch=(mode==='chat'||mode==='deepcore');
  document.getElementById('mainContent').innerHTML=`
    <div class="welcome-card">
      <div class="chat-mode-label" id="modePill">${MODE_LABELS[mode]}${isSearch?' &nbsp;🌐 Web Search ON':''}</div>
      <div class="welcome-title">Essential<span>AI</span> v3.0</div>
      <div class="features-row">
        <div class="feat-item">💬 Intelligent Chat</div>
        <div class="feat-item">🔬 1M Deep Core AI</div>
        <div class="feat-item">📄 Document Analysis</div>
        <div class="feat-item">🎨 Image Generation</div>
        <div class="feat-item">🎙 Voice Input</div>
        <div class="feat-item">🌐 Web Search</div>
      </div>
      <div class="free-tier">Free tier: 50 messages/day · 3 images/day · 5 document uploads/day</div>
    </div>
    <div class="messages" id="messages"></div>
    <input type="file" id="fileInput" accept=".txt,.md,.json,.csv" style="display:none">
    <div class="input-area">
      <div class="prompt-wrapper">
        <input type="text" id="messageInput" placeholder="${mode==='image'?'Describe the image you want…':'Ask me anything...'}" maxlength="8000" autocomplete="off">
        <button class="send-arrow" id="sendBtn" onclick="sendMessage()">↑</button>
      </div>
      <div class="action-buttons">
        <button class="action-btn" id="attachBtn" onclick="handleAttach()">📎 Attach</button>
        <button class="action-btn" id="voiceBtn" onclick="toggleVoice()">🎙 Voice</button>
      </div>
      <div class="status-bar">
        <span class="status-left" id="statusEl">Ready</span>
        <div class="status-stats">
          <span>💬 <span id="statMsgs">${CHAT_LIMIT-chatUsed}</span> left</span>
          <span>🎨 <span id="statImages">${IMAGE_LIMIT-imagesUsed}</span> images</span>
          <span>📄 <span id="statDocs">${DOC_LIMIT-docsUsed}</span> docs</span>
          <a href="#" class="upgrade-link" onclick="showPricing();return false;">Upgrade</a>
        </div>
      </div>
    </div>`;

  document.getElementById('messageInput').addEventListener('keypress',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
  document.getElementById('fileInput').addEventListener('change',handleFileUpload);

  // Restore history messages
  history.forEach(h=>{
    if(h.role==='user') {
      appendMsg('<div class="msg user"><div class="msg-user-av">U</div><div class="msg-body"><div class="msg-role">You</div><div class="msg-bubble">'+esc(h.content)+'</div></div></div>');
    } else {
      // Check if this is an image message
      if(h.content && h.content.startsWith('![Image](')) {
        const imgMatch = h.content.match(/!\[Image\]\((.*?)\)/);
        if(imgMatch) {
          const imgUrl = imgMatch[1];
          const promptMatch = h.content.match(/Prompt: (.*)/);
          const prompt = promptMatch ? promptMatch[1] : '';
          appendMsg('<div class="msg ai">'+EAI_AV+'<div class="msg-body"><div class="msg-role">Essential AI · DALL-E 3</div><div class="msg-bubble"><img src="'+esc(imgUrl)+'" style="max-width:100%;border-radius:10px;margin-top:6px;"><div style="font-size:.65rem;color:var(--muted);margin-top:6px;">Prompt: '+esc(prompt)+'</div></div></div></div>');
        }
      } else {
        appendMsg('<div class="msg ai">'+EAI_AV+'<div class="msg-body"><div class="msg-role">Essential AI</div><div class="msg-bubble">'+md(h.content)+'</div><button class="copy-btn" onclick="copyMsg(this)">📋 Copy</button></div></div>');
      }
    }
  });
  if(history.length===0) addAiMsg('👋 Hi! I\'m Essential AI. Ask me anything — code, research, documents, or generate images.'+(isSearch?'\n\n🌐 Web search is ON — I have access to live information.':''));
  scrollDown();
}

function showPricing(){
  document.getElementById('mainContent').innerHTML=`
    <div class="pricing-wrap">
      <a href="#" onclick="showChatInterface();return false;" style="color:var(--accent);text-decoration:none;display:inline-block;margin-bottom:24px;">← Back to Chat</a>
      <div style="text-align:center;margin-bottom:8px;"><h1 style="font-size:1.6rem;">Choose Your Plan</h1><p style="color:var(--muted);font-size:.85rem;">Flexible pricing for every need.</p></div>
      <div class="pricing-grid">
        <div class="plan-card"><div class="plan-name">Free</div><div class="plan-price">$0</div><div class="plan-period">forever</div>
          <ul class="plan-features"><li>✅ 50 messages/day</li><li>✅ 3 images/day</li><li>✅ 5 docs/day</li><li>✅ Web search</li><li>✅ Voice input</li></ul>
          <button class="plan-btn" disabled>Current Plan</button>
        </div>
        <div class="plan-card highlight"><div class="plan-name">Pro</div><div class="plan-price">$19</div><div class="plan-period">per month · $190/yr</div>
          <ul class="plan-features"><li>✅ 500 messages/day</li><li>✅ 50 images/day</li><li>✅ 100 docs/day</li><li>✅ Priority search</li><li>✅ Email support</li></ul>
          <button class="plan-btn" onclick="alert('Stripe coming soon!')">Upgrade →</button>
        </div>
        <div class="plan-card"><div class="plan-name">Team</div><div class="plan-price">$79</div><div class="plan-period">per month · $790/yr</div>
          <ul class="plan-features"><li>✅ 2,000 messages/day</li><li>✅ 200 images/day</li><li>✅ 500 docs/day</li><li>✅ Priority support</li><li>✅ Team management</li></ul>
          <button class="plan-btn" onclick="alert('Contact us for early access!')">Contact Sales →</button>
        </div>
        <div class="plan-card"><div class="plan-name">Enterprise</div><div class="plan-price">Custom</div><div class="plan-period">tailored for you</div>
          <ul class="plan-features"><li>✅ Unlimited everything</li><li>✅ SLA guarantee</li><li>✅ SSO / SAML</li><li>✅ Dedicated support</li><li>✅ On-premise</li></ul>
          <button class="plan-btn" onclick="alert('enterprise@essential.ai')">Contact Us →</button>
        </div>
      </div>
    </div>`;
}

// ── File attachment — NO RAW CONTENT SHOWN IN CHAT ──
function handleAttach(){
  if(mode!=='docs'){
    addAiMsg('📎 File attachment works in **Documents mode**. Please switch to 📄 Documents in the sidebar.');
    return;
  }
  document.getElementById('fileInput')?.click();
}

function handleFileUpload(e){
  const file=e.target.files[0]; if(!file)return;
  if(file.size>5*1024*1024){addAiMsg('❌ File too large. Max 5MB.');e.target.value='';return;}
  
  // Show clean message — NO raw content
  addUserMsg(`📎 Attached: ${file.name} (${(file.size/1024).toFixed(1)} KB) — analyzing...`);
  
  const reader=new FileReader();
  reader.onload=async(ev)=>{
    const content=ev.target.result;
    // Send FULL content to backend (including raw for PDFs), but don't display it
    history.push({role:'user', content: 'Please analyze this document: ' + file.name + '\n\nContent:\n' + content});
    saveHistoryToStorage();
    setBusy(true); addTyping();
    try{
      const res=await fetch(API_URL+'/api/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
        body:JSON.stringify({message:'Please analyze this document: ' + file.name + '\n\n' + content, mode:'docs', webSearch:false, history:history.slice(-10)})
      });
      removeTyping();
      if(res.ok){
        const data=await res.json();
        history.push({role:'assistant', content:data.reply});
        saveHistoryToStorage();
        addAiMsg(data.reply);
        // Increment document counter
        docsUsed++;
        updateStatsDisplay();
        loadUsage();
      } else {
        addAiMsg('❌ Could not analyze file.');
      }
    } catch(err){
      removeTyping();
      addAiMsg('❌ Network error.');
    }
    setBusy(false);
  };
  reader.readAsText(file);
  e.target.value='';
}

// Voice
function toggleVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){addAiMsg('❌ Voice not supported in this browser. Try Chrome.');return;}
  const btn=document.getElementById('voiceBtn');
  const recognition=new SR();
  recognition.lang='en-US'; recognition.interimResults=false;
  btn?.classList.add('recording');
  setStatus('busy','Listening…');
  recognition.onresult=e=>{
    const t=e.results[0][0].transcript;
    const input=document.getElementById('messageInput');
    if(input){input.value=t;}
    btn?.classList.remove('recording');
    setStatus('ok','Ready');
    sendMessage();
  };
  recognition.onerror=recognition.onend=()=>{btn?.classList.remove('recording');setStatus('ok','Ready');};
  recognition.start();
}

// Send message — IMAGES PERSIST IN HISTORY
async function sendMessage(){
  if(busy||!session)return;
  const input=document.getElementById('messageInput');
  const text=input.value.trim(); if(!text)return;
  input.value='';
  setBusy(true); addUserMsg(text);
  history.push({role:'user',content:text});
  saveHistoryToStorage();
  addTyping();
  try{
    const endpoint=mode==='image'?'/api/image':'/api/chat';
    const useSearch=(mode==='chat'||mode==='deepcore');
    const body=mode==='image'?{prompt:text}:{message:text,mode,webSearch:useSearch,history:history.slice(-10)};
    const res=await fetch(API_URL+endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
      body:JSON.stringify(body)
    });
    removeTyping();
    if(!res.ok){const e=await res.json().catch(()=>({}));addAiMsg('❌ Error: '+(e.error||res.status));setBusy(false);return;}
    const data=await res.json();
    if(mode==='image'){
      // Save image to history for persistence across mode changes
      const imageContent = `![Image](${data.url})\n\nPrompt: ${data.revisedPrompt||text}`;
      history.push({role:'assistant', content: imageContent});
      saveHistoryToStorage();
      addImageMsg(data.url, data.revisedPrompt||text);
      imagesUsed++;
      updateStatsDisplay();
      loadUsage();
    }else{
      history.push({role:'assistant',content:data.reply});
      saveHistoryToStorage();
      addAiMsg(data.reply,data.sources||[]);
      loadUsage();
    }
  }catch(e){removeTyping();console.error(e);addAiMsg('❌ Network error — check your connection.');}
  setBusy(false);
}

function updateStatsDisplay(){
  const statMsgs = document.getElementById('statMsgs');
  const statImages = document.getElementById('statImages');
  const statDocs = document.getElementById('statDocs');
  if(statMsgs) statMsgs.textContent = CHAT_LIMIT - chatUsed;
  if(statImages) statImages.textContent = IMAGE_LIMIT - imagesUsed;
  if(statDocs) statDocs.textContent = DOC_LIMIT - docsUsed;
}

async function loadUsage(){
  if(!session)return;
  try{
    const res=await fetch(API_URL+'/api/usage',{headers:{'Authorization':'Bearer '+session.access_token}});
    if(res.ok){
      const d=await res.json();
      chatUsed=d.chats||0;
      imagesUsed=d.images||0;
      docsUsed=d.docs||0;
      const txt=document.getElementById('usageTxt');
      const fill=document.getElementById('usageFill');
      if(txt) txt.textContent=chatUsed+' / 50';
      if(fill) fill.style.width=Math.min(100,(chatUsed/50)*100)+'%';
      updateStatsDisplay();
    }
  }catch(e){console.warn('Usage fetch failed:',e);}
}

// DOM helpers
function copyMsg(btn){
  const bubble=btn.closest('.msg-body').querySelector('.msg-bubble');
  navigator.clipboard.writeText(bubble.innerText||'');
  btn.textContent='✓ Copied!';
  setTimeout(()=>btn.textContent='📋 Copy',2000);
}

function addUserMsg(text){appendMsg('<div class="msg user"><div class="msg-user-av">U</div><div class="msg-body"><div class="msg-role">You</div><div class="msg-bubble">'+esc(text)+'</div></div></div>');}

function addAiMsg(text,sources=[]){
  const src=sources.length?'<div class="sources-block">Sources: '+sources.map((s,i)=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+(i+1)+'. '+esc(s.title||s.url)+'</a>').join(' · ')+'</div>':'';
  appendMsg('<div class="msg ai">'+EAI_AV+'<div class="msg-body"><div class="msg-role">Essential AI</div><div class="msg-bubble">'+md(text)+src+'</div><button class="copy-btn" onclick="copyMsg(this)">📋 Copy</button></div></div>');
}

function addImageMsg(url,prompt){
  appendMsg('<div class="msg ai">'+EAI_AV+'<div class="msg-body"><div class="msg-role">Essential AI · DALL-E 3</div><div class="msg-bubble"><img src="'+esc(url)+'" style="max-width:100%;border-radius:10px;margin-top:6px;"><div style="font-size:.65rem;color:var(--muted);margin-top:6px;">Prompt: '+esc(prompt)+'</div></div></div></div>');
}

function addTyping(){
  const el=document.createElement('div'); el.className='msg ai'; el.id='typing';
  el.innerHTML=EAI_AV+'<div class="msg-body"><div class="msg-role">Essential AI</div><div class="msg-bubble"><div style="display:flex;gap:5px;padding:4px 0;"><div style="width:7px;height:7px;background:var(--accent);border-radius:50%;animation:bounce 1.4s infinite;opacity:.4;"></div><div style="width:7px;height:7px;background:var(--accent);border-radius:50%;animation:bounce 1.4s .2s infinite;opacity:.4;"></div><div style="width:7px;height:7px;background:var(--accent);border-radius:50%;animation:bounce 1.4s .4s infinite;opacity:.4;"></div></div></div></div>';
  document.getElementById('messages')?.appendChild(el); scrollDown();
}
function removeTyping(){document.getElementById('typing')?.remove();}
function appendMsg(html){document.getElementById('messages')?.insertAdjacentHTML('beforeend',html);scrollDown();}
function scrollDown(){const c=document.getElementById('messages');if(c)c.scrollTop=c.scrollHeight;}
function setBusy(b){busy=b;const btn=document.getElementById('sendBtn');if(btn)btn.disabled=b;setStatus(b?'busy':'ok',b?'Thinking…':'Ready');}
function setStatus(cls,txt){const el=document.getElementById('statusEl');if(el){el.className='status-left '+(cls==='busy'?'busy':'');el.textContent=txt;}}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function md(s){
  let m=esc(s);
  m=m.replace(/```(\w*)\n?([\s\S]*?)```/g,'<pre><code>$2</code></pre>');
  m=m.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  m=m.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  m=m.replace(/^### (.+)$/gm,'<h3>$1</h3>');
  m=m.replace(/^## (.+)$/gm,'<h2>$1</h2>');
  m=m.replace(/^# (.+)$/gm,'<h1>$1</h1>');
  m=m.replace(/^\* (.+)$/gm,'<li>$1</li>');
  m=m.replace(/(<li>[\s\S]*?<\/li>)/g,'<ul>$1</ul>');
  m=m.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  m=m.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
  return '<p>'+m+'</p>'.replace(/<p>\s*<\/p>/g,'');
}

window.switchTab=switchTab; window.doLogin=doLogin; window.doSignup=doSignup; window.doLogout=doLogout;
window.toggleTheme=toggleTheme; window.showPricing=showPricing; window.showChatInterface=showChatInterface;
window.sendMessage=sendMessage; window.handleAttach=handleAttach; window.toggleVoice=toggleVoice;
window.copyMsg=copyMsg;
</script>
</body>
</html>
