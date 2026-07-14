// ═══════════════════════════════════════════════════════════════════════
// Workley - Dashboards (talent + client)
// ─────────────────────────────────────────────────────────────────────
// One shell, two role-aware experiences. Loaded as a classic script AFTER
// app.js (shares its global scope: USER, TALENT, CATEGORIES, _esc, IC,
// loadSavedProfileIntoUser, _getProfileData, signOut …) and BEFORE the
// firebase-config module, which calls renderDashboard() once auth resolves.
//
// Security notes:
//  • Auth/verification guard lives in app.js (onFirebaseAuthChanged) - it
//    redirects unauthenticated or unverified sessions away before we paint.
//  • Every dynamic value injected into HTML is passed through _esc().
//  • No network calls, no Firestore writes, no PII logged. All figures are
//    derived locally from the user's own saved profile + a per-user seed,
//    so they're stable across reloads (no flickering fake data).
// ═══════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  if(!document.getElementById('dashboardPage')) return;

  // ─── Deterministic per-user RNG (stable figures, not random each load) ───
  function hashStr(s){ s=String(s||'workley'); let h=2166136261>>>0;
    for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
    return h>>>0; }
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296; }; }
  let RAND = mulberry32(1);
  function rint(min,max){ return Math.floor(RAND()*(max-min+1))+min; }
  function pick(arr){ return arr[Math.floor(RAND()*arr.length)]; }
  function pickN(arr,n){ const a=arr.slice(); const out=[];
    while(a.length && out.length<n){ out.push(a.splice(Math.floor(RAND()*a.length),1)[0]); } return out; }

  // ─── Small helpers ───
  const esc = (typeof _esc==='function') ? _esc : (s=>String(s||''));
  function money(n){ return 'R'+Number(Math.round(n)).toLocaleString('en-ZA'); }
  function firstName(name){ return String(name||'there').trim().split(/\s+/)[0] || 'there'; }
  function reduceMotion(){ return window.matchMedia('(prefers-reduced-motion:reduce)').matches; }
  const FIELD_NAMES = (typeof PROFILE_CATEGORIES!=='undefined') ? PROFILE_CATEGORIES : {};
  const SKILLS_BY_FIELD = (function(){
    const m={}; if(typeof CATEGORIES!=='undefined'){ CATEGORIES.forEach(c=>{ m[c.id]=c.skills||[]; }); } return m;
  })();

  // ─── Icon set (inline SVG, stroke=currentColor) ───
  const I = {
    grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
    briefcase:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>',
    doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',
    people:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>',
    bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4z"/></svg>',
    star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 7 7 .5-5.5 4.5 2 7L12 17l-6.5 4 2-7L2 9.5 9 9z"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></svg>',
    cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    arrowUp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/></svg>',
    logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 014-9 11.5 11.5 0 018-2 11.5 11.5 0 01-2 8 22 22 0 01-9 4z"/><path d="M9 12H4s.55-3.03 2-4 5 0 5 0M12 15v5s3.03-.55 4-2 0-5 0-5"/></svg>',
    handshake:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l2 2a1 1 0 001.4 0l3.6-3.6"/><path d="M2 9l4-4 5 1 4 4"/><path d="M22 9l-4-4-3 1"/><path d="M2 9v6l3 3 3-3 2 2"/></svg>',
    target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
    clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    video:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    archive:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8"/><path d="M10 12h4"/></svg>',
    x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
  };

  // ─── State ───
  let DASH = null;   // { u, p, role, name, avatar }
  let VIEW = 'overview';
  let _notifSeen = 0; // ms timestamp - notifications at or before this are "seen"
  // Entrance animations should play only on a fresh view (initial render or a
  // nav change) - NOT on the silent repaints that lazy-loaded data triggers,
  // which is what caused the "double-load" flicker.
  let _animateNext = true;

  // ─── Jobs & proposals caches (Firestore-backed; null = not loaded yet) ───
  let JOBS = null;          // open jobs for talent to browse/apply
  let MY_JOBS = null;       // a client's own posts
  let MY_PROPOSALS = null;  // a talent's sent applications
  let CLIENT_PROPS = null;  // applications received by a client
  let _loadingJobs=false, _loadingMyJobs=false, _loadingMyProps=false, _loadingClientProps=false;
  function _uid(){ return (window.firebaseUser&&window.firebaseUser.uid) || (DASH&&DASH.u&&DASH.u.uid) || null; }

  // ─── Messaging state (real-time, Firestore-backed) ───
  let CONVOS = null;        // my conversation list (null = not loaded)
  let _convoUnsub = null;   // conversations listener
  let _msgUnsub = null;     // active-thread messages listener
  let _activeCid = null;    // open conversation id
  let MSGS = [];            // messages in the active thread
  let _msgLoading = false;  // active thread still loading
  let _replyInfo = {};      // otherUid → { avgMins, count } cache for reply-time
  let _pendingChat = null;  // {uid,name,role} queued before convo loads / deep link
  let _sending = false;     // composer in-flight guard
  let _editingMid = null;   // message id being edited (composer is in edit mode)
  let _pendingFiles = [];   // File objects queued in the composer (sent as ONE message)
  let _hbTimer = null;      // presence heartbeat interval
  let _presencePoll = null; // convo-list presence refresh interval
  let _presenceUnsub = null;// active thread partner's live presence listener
  let _presenceCache = {};  // uid → lastActive Date (for online dot + last seen)

  // ─── Notification seen-state (persisted to localStorage) ───
  function _loadNotifSeen(){ try{ const s=localStorage.getItem('workley_notif_seen'); if(s) _notifSeen=parseInt(s)||0; }catch(e){} }
  function _saveNotifSeen(ts){ _notifSeen=ts; try{ localStorage.setItem('workley_notif_seen',String(ts)); }catch(e){} }

  // NOTE: cb fires ONLY after a fresh load - never on the already-loaded path,
  // otherwise paintMain → ensureX(repaint) → paintMain would loop forever.
  function ensureJobs(cb){
    if(JOBS!=null || _loadingJobs) return; _loadingJobs=true;
    (window.firebaseDB?window.firebaseDB.listJobs(60):Promise.resolve([]))
      .then(j=>{ JOBS=j||[]; }).catch(()=>{ JOBS=[]; }).then(()=>{ _loadingJobs=false; cb&&cb(); });
  }
  function ensureMyJobs(cb){
    if(MY_JOBS!=null || _loadingMyJobs) return; _loadingMyJobs=true;
    const uid=_uid();
    (window.firebaseDB&&uid?window.firebaseDB.myJobs(uid):Promise.resolve([]))
      .then(j=>{ MY_JOBS=j||[]; }).catch(()=>{ MY_JOBS=[]; }).then(()=>{ _loadingMyJobs=false; cb&&cb(); });
  }
  function ensureMyProposals(cb){
    if(MY_PROPOSALS!=null || _loadingMyProps) return; _loadingMyProps=true;
    const uid=_uid();
    (window.firebaseDB&&uid?window.firebaseDB.myProposals(uid):Promise.resolve([]))
      .then(p=>{ MY_PROPOSALS=p||[]; }).catch(()=>{ MY_PROPOSALS=[]; }).then(()=>{ _loadingMyProps=false; cb&&cb(); });
  }
  function ensureClientProps(cb){
    if(CLIENT_PROPS!=null || _loadingClientProps) return; _loadingClientProps=true;
    const uid=_uid();
    (window.firebaseDB&&uid?window.firebaseDB.proposalsForClient(uid):Promise.resolve([]))
      .then(p=>{ CLIENT_PROPS=p||[]; }).catch(()=>{ CLIENT_PROPS=[]; }).then(()=>{ _loadingClientProps=false; cb&&cb(); });
  }

  // ─── Projects (client) + invitations (talent) caches ───
  let PROJECTS = null;            // client's own projects
  let MY_INVITES = null;          // talent's project invitations
  const PROJECT_MEMBERS = {};     // projectId -> members[] (null/undefined = not loaded)
  const _loadingMembers = {};
  let _loadingProjects=false, _loadingInvites=false;
  let _activeProject = null;      // projectId currently open in the detail view

  function ensureProjects(cb){
    if(PROJECTS!=null || _loadingProjects) return; _loadingProjects=true;
    const uid=_uid();
    (window.firebaseDB&&uid?window.firebaseDB.listProjects(uid):Promise.resolve([]))
      .then(p=>{ PROJECTS=p||[]; }).catch(()=>{ PROJECTS=[]; }).then(()=>{ _loadingProjects=false; cb&&cb(); });
  }
  function ensureInvites(cb){
    if(MY_INVITES!=null || _loadingInvites) return; _loadingInvites=true;
    const uid=_uid();
    (window.firebaseDB&&uid?window.firebaseDB.listMyInvites(uid):Promise.resolve([]))
      .then(p=>{ MY_INVITES=p||[]; }).catch(()=>{ MY_INVITES=[]; }).then(()=>{ _loadingInvites=false; cb&&cb(); });
  }
  // Reviews this talent has received (client → talent), for the Jobs history + ratings.
  let REVIEWS_ME=null, _loadingRevMe=false;
  function ensureMyReviews(cb){
    if(REVIEWS_ME!=null || _loadingRevMe) return; _loadingRevMe=true;
    const uid=_uid();
    (window.firebaseDB&&uid&&window.firebaseDB.getReviews?window.firebaseDB.getReviews(uid):Promise.resolve([]))
      .then(r=>{ REVIEWS_ME=r||[]; }).catch(()=>{ REVIEWS_ME=[]; }).then(()=>{ _loadingRevMe=false; cb&&cb(); });
  }
  function ensureProjectMembers(projectId, cb){
    if(!projectId || PROJECT_MEMBERS[projectId]!=null || _loadingMembers[projectId]) return;
    _loadingMembers[projectId]=true;
    const uid=_uid();
    (window.firebaseDB&&uid?window.firebaseDB.listProjectMembers(uid,projectId):Promise.resolve([]))
      .then(m=>{ PROJECT_MEMBERS[projectId]=m||[]; }).catch(()=>{ PROJECT_MEMBERS[projectId]=[]; })
      .then(()=>{ _loadingMembers[projectId]=false; cb&&cb(); });
  }
  // Force a fresh reload of a project's members + the projects list, then repaint.
  function reloadProjectData(projectId){
    PROJECTS=null;
    if(projectId) PROJECT_MEMBERS[projectId]=null;
    ensureProjects(()=>paintMain());
    if(projectId) ensureProjectMembers(projectId, ()=>paintMain());
  }
  function timeAgo(d){
    if(!(d instanceof Date)) return '';
    const s=Math.floor((Date.now()-d.getTime())/1000);
    if(s<60) return 'just now';
    const m=Math.floor(s/60); if(m<60) return m+'m ago';
    const h=Math.floor(m/60); if(h<24) return h+'h ago';
    const days=Math.floor(h/24); if(days<7) return days+'d ago';
    const w=Math.floor(days/7); if(w<5) return w+'w ago';
    return d.toLocaleDateString('en-ZA',{day:'numeric',month:'short'});
  }
  // Jobs/proposals were created or changed elsewhere (e.g. Post-a-job modal).
  document.addEventListener('workley:jobsChanged', ()=>{ JOBS=null; MY_JOBS=null; CLIENT_PROPS=null; PROJECTS=null; if(DASH){ paintMain(); refreshNotifs(); } });

  // ════════════════════════════════ ENTRY ════════════════════════════════
  // Override the stub renderDashboard() defined in app.js. app.js calls it
  // (by global identifier) from onFirebaseAuthChanged once the session lands.
  const _profileUsable = p => !!(p && (p.completedAt || p.partial || (p.skills&&p.skills.length) || (p.needs&&p.needs.length) || p.description || p.bio));

  window.renderDashboard = function(fbUser){
    if(typeof loadSavedProfileIntoUser==='function'){ try{ loadSavedProfileIntoUser(); }catch(e){} }
    const u = (typeof USER!=='undefined') ? USER : null;
    if(!u) return; // app.js guard handles the redirect

    let p = u.profileData;
    if(!p && typeof _getProfileData==='function'){ try{ p = _getProfileData(); }catch(e){ p=null; } }
    if(_profileUsable(p)){ _paintDashboard(fbUser, u, p); return; }

    // No usable profile cached locally. Don't bounce to onboarding yet: a returning
    // user on a fresh session/device may have a real profile in Firestore that just
    // isn't cached. Fetch it first so login lands on the dashboard, not a flash of
    // onboarding → profile page. Only truly new users go to onboarding.
    const uid = (fbUser&&fbUser.uid) || (window.firebaseUser&&window.firebaseUser.uid) || null;
    const toOnboarding = role => { location.href = 'onboarding.html?role='+encodeURIComponent(role||u.role||'talent'); };
    if(uid && window.firebaseDB && window.firebaseDB.getProfile){
      window.firebaseDB.getProfile(uid).then(cloud=>{
        if(_profileUsable(cloud)){
          try{ localStorage.setItem('workley_profile_'+uid, JSON.stringify(cloud)); }catch(e){}
          if(typeof loadSavedProfileIntoUser==='function'){ try{ loadSavedProfileIntoUser(); }catch(e){} }
          _paintDashboard(fbUser, (typeof USER!=='undefined'&&USER)||u, ((typeof USER!=='undefined'&&USER&&USER.profileData)||cloud));
        } else {
          toOnboarding(cloud&&cloud.role);
        }
      }).catch(()=> toOnboarding());
    } else {
      toOnboarding();
    }
  };

  function _paintDashboard(fbUser, u, p){
    const uid = (fbUser&&fbUser.uid) || (window.firebaseUser&&window.firebaseUser.uid) || u.email || 'workley';
    RAND = mulberry32(hashStr(uid));   // reseed → stable per-user figures
    DASH = {
      u, p,
      role: (p.role||u.role||'talent'),
      name: u.name || firstName(u.email),
      avatar: u.avatar || p.avatar || null
    };
    paintShell();
    paintNav();
    paintMain();
    // Base history entry for the dashboard so Back navigates views, then exits cleanly.
    try{ history.replaceState({dashView: VIEW||'overview'}, '', '#'+(VIEW||'overview')); }catch(e){}
    wireViewNav();
    maybeShowDesktopTip();
    startConversationsListener();
    startPresence();
    consumePendingChat();
  }

  // ─── Presence: heartbeat my own online status + read partners' last-seen ───
  function startPresence(){
    const beat=()=>{ const uid=_uid(); if(uid && window.firebaseDB && window.firebaseDB.heartbeat) window.firebaseDB.heartbeat(uid); };
    beat();
    if(_hbTimer) clearInterval(_hbTimer);
    _hbTimer=setInterval(beat, 45000);
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ beat(); if(VIEW==='messages') refreshConvoPresence(); } });
    window.addEventListener('focus', beat);
    window.addEventListener('online', beat);
    if(_presencePoll) clearInterval(_presencePoll);
    _presencePoll=setInterval(()=>{ if(!document.hidden && VIEW==='messages') refreshConvoPresence(); }, 45000);
  }
  // Pull each conversation partner's presence once (for the convo-list dots).
  function refreshConvoPresence(){
    if(!window.firebaseDB || !window.firebaseDB.getPresence || !CONVOS) return;
    const me=_uid();
    CONVOS.forEach(c=>{ const o=otherOf(c); if(!o||!o.uid||o.uid===me) return;
      window.firebaseDB.getPresence(o.uid).then(at=>{ _presenceCache[o.uid]=at; }); });
    setTimeout(()=>{ if(VIEW==='messages') paintMain(); }, 700);
  }
  // Online if active within 60s; otherwise a friendly "last seen …".
  function presenceState(at){
    if(!at) return { online:false, text:'' };
    const t=new Date(at).getTime();
    if(Date.now()-t <= 60000) return { online:true, text:'Online' };
    return { online:false, text:'last seen '+lastSeenText(new Date(t)) };
  }
  function lastSeenText(d){
    const today=new Date(); today.setHours(0,0,0,0);
    const md=new Date(d); md.setHours(0,0,0,0);
    const days=Math.round((today-md)/864e5);
    const time=d.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
    if(days<=0) return 'today at '+time;
    if(days===1) return 'yesterday at '+time;
    if(days<7) return DOW[d.getDay()]+' at '+time;
    return d.getDate()+' '+MONTHS[d.getMonth()];
  }

  // ─── Chat partner profiles: open profile / preview photo from a thread ───
  // Cached so list avatars + the quick-view popover show real photos.
  let _partnerCache = {};
  let _paintMsgPending = false;
  function paintMsgSoon(){ if(_paintMsgPending) return; _paintMsgPending=true; setTimeout(()=>{ _paintMsgPending=false; if(VIEW==='messages') paintMain(); }, 300); }
  function cachePartner(uid, p){
    if(!uid) return;
    _partnerCache[uid] = { loaded:true,
      avatar:(p&&p.avatar)||null,
      name:(p&&(p.displayName||p.orgName))||null,
      role:(p&&p.role)||'talent',
      headline:(p&&(p.headline||p.title||p.field||p.uni))||'' };
  }
  function ensurePartner(uid, after){
    if(!uid) return;
    const c=_partnerCache[uid];
    if(c && c.loaded){ if(after) after(c); return; }
    if(c && c.loading) return;
    if(!window.firebaseDB || !window.firebaseDB.getProfile){ return; }
    _partnerCache[uid]={ loading:true };
    window.firebaseDB.getProfile(uid).then(p=>{ cachePartner(uid, p); if(after) after(_partnerCache[uid]); })
      .catch(()=>{ _partnerCache[uid]={ loaded:true, avatar:null, role:'talent' }; });
  }
  // Once per session, warm the cache so conversation-list avatars show photos.
  function prefetchPartners(){
    if(!CONVOS) return; const me=_uid();
    CONVOS.forEach(c=>{ const o=otherOf(c); if(o&&o.uid&&o.uid!==me) ensurePartner(o.uid, paintMsgSoon); });
  }
  // Avatar inner HTML: real photo if we have it, otherwise initials.
  function partnerAvatar(uid, name){
    const c=_partnerCache[uid];
    return (c && c.avatar) ? `<img src="${esc(c.avatar)}" alt="">` : esc(_initialsOf(name));
  }
  // Open a partner's full profile (role-aware; reuses the app.js modals).
  window.dashViewProfileUid = function(uid, role){
    if(!uid) return;
    if(role==='client'){ if(window.openClientProfile) window.openClientProfile(uid); }
    else { if(window.openProfile) window.openProfile(uid); }
  };
  window.dashViewProfile = function(){ const o=otherOf(currentConvo()); if(o) dashViewProfileUid(o.uid, o.role); };
  // Enlarge a partner's profile photo in the shared lightbox.
  window.dashPeekPhoto = function(uid){
    const c=_partnerCache[uid]||{};
    let name=c.name; if(!name){ const cv=(CONVOS||[]).find(x=>{const o=otherOf(x);return o&&o.uid===uid;}); if(cv){ const o=otherOf(cv); name=o&&o.name; } }
    if(window.openPhotoLightbox) window.openPhotoLightbox(c.avatar||'', name||'Member', _initialsOf(name||'?'));
  };
  // Quick-view popover from the conversation LIST (does NOT open the chat).
  window.dashPeekConvo = function(cid, ev){
    if(ev){ try{ ev.stopPropagation(); }catch(e){} }
    const c=(CONVOS||[]).find(x=>x.id===cid); if(!c) return;
    const o=otherOf(c); if(!o) return;
    renderPeekCard(cid, o);
    ensurePartner(o.uid, ()=>{ const m=document.getElementById('modal'); if(m && m.querySelector('.dash-peekcard')) renderPeekCard(cid, o); });
  };
  function renderPeekCard(cid, o){
    const modal=document.getElementById('modal'); if(!modal) return;
    const pc=_partnerCache[o.uid]||{};
    const pres=presenceState(_presenceCache[o.uid]);
    const roleLabel=(o.role==='client')?'Client':'ICT Talent';
    const avatar = pc.avatar ? `<img src="${esc(pc.avatar)}" alt="">` : esc(_initialsOf(o.name));
    modal.classList.remove('auth-modal');
    modal.innerHTML=`
      <div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="dash-peekcard">
        <button class="dash-peekcard-av${pres.online?' is-online':''}" onclick="dashPeekPhoto('${o.uid}')" title="View photo" aria-label="View photo">${avatar}</button>
        <h3>${esc(o.name||'Member')}</h3>
        <div class="dash-peekcard-sub">${esc(roleLabel)}${pc.headline?' · '+esc(pc.headline):''}</div>
        ${pres.text?`<div class="dash-peekcard-pres"><span class="pres-dot${pres.online?' on':''}"></span>${esc(pres.text)}</div>`:''}
        <div class="dash-peekcard-acts">
          <button class="btn btn-outline btn-sm" onclick="dashViewProfileUid('${o.uid}','${o.role==='client'?'client':'talent'}')">View profile</button>
          <button class="btn btn-primary btn-sm" onclick="closeModal();dashSelectConvo('${cid}')">Open chat</button>
        </div>
      </div>`;
    if(window.showOverlay) window.showOverlay();
  }

  // One-time nudge (mobile only) to use Workley on a larger screen. Shares its
  // localStorage key with onboarding, so the suggestion appears just once total.
  window.dismissDesktopTip = function(){ const t=document.getElementById('desktopTip'); if(t) t.hidden=true; try{ localStorage.setItem('workley_desktop_tip','1'); }catch(e){} };
  function maybeShowDesktopTip(){
    try{
      if(localStorage.getItem('workley_desktop_tip')) return;
      if(!window.matchMedia || !window.matchMedia('(max-width: 820px)').matches) return;
      const t=document.getElementById('desktopTip');
      if(t){ t.hidden=false; localStorage.setItem('workley_desktop_tip','1'); }
    }catch(e){}
  }

  // ─── Live conversation list (powers the nav unread badge, notifications,
  //     and the Messages view). Starts once per session. ───
  function startConversationsListener(){
    if(_convoUnsub) return;
    const uid = _uid();
    if(!window.firebaseDB || !window.firebaseDB.listenConversations || !uid) return;
    _convoUnsub = window.firebaseDB.listenConversations(uid, list=>{
      CONVOS = list || [];
      paintNav();          // refresh unread badge
      refreshNotifs();     // refresh notifications dropdown
      prefetchPartners();  // warm partner avatars for the list + quick-view
      if(VIEW==='messages'){ refreshConvoPresence(); paintMain(); }  // live-update the messages view
    });
  }
  // A "Message" button elsewhere (profile modal / catalog) can queue a chat to
  // open via sessionStorage; consume it once the dashboard is live.
  function consumePendingChat(){
    try {
      const raw = sessionStorage.getItem('workley_open_chat');
      if(raw){ sessionStorage.removeItem('workley_open_chat'); const c = JSON.parse(raw); if(c && c.uid) openChatWith(c); }
    } catch(e){}
  }

  // ════════════════════════════════ SHELL ════════════════════════════════
  function paintShell(){
    const root = document.getElementById('dashMount');
    if(!root) return;
    const isClient = DASH.role==='client';
    const display = isClient ? (DASH.p.orgName||DASH.name) : DASH.name;
    const roleLabel = isClient ? 'Client' : 'ICT Talent';
    root.innerHTML = `
      <button class="dash-scrim" id="dashScrim" aria-label="Close menu" hidden></button>
      <aside class="dash-side" id="dashSide" aria-label="Dashboard navigation">
        <a class="dash-brand" href="index.html" aria-label="Workley home">
          <span class="dot"><span class="dot-bg"></span><span class="dot-txt">W</span></span>
          <span class="dash-brand-name">Workley</span>
        </a>
        <nav class="dash-nav" id="dashNav" aria-label="Primary"></nav>
        <div class="dash-side-foot">
          <a class="dash-nav-item" href="profile.html">${I.user}<span>My profile</span></a>
          <button class="dash-nav-item" onclick="dashSignOut()">${I.logout}<span>Sign out</span></button>
        </div>
      </aside>

      <div class="dash-main" id="dashMain">
        <header class="dash-top">
          <button class="dash-burger" id="dashBurger" aria-label="Open menu" aria-expanded="false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <div class="dash-greet">
            <div class="dg-eyebrow">${greeting()}, ${esc(firstName(DASH.name))} 👋</div>
            <h1 id="dashViewTitle">Dashboard</h1>
          </div>
          <div class="dash-top-actions">
            <div class="dash-searchbox">${I.search}<input type="search" placeholder="${isClient?'Search talent or jobs…':'Search jobs or skills…'}" aria-label="Search" id="dashSearch"></div>
            <button class="dash-iconbtn" id="dashBellBtn" aria-label="Notifications">${I.bell}<span class="dash-dot" id="dashBellDot" hidden></span></button>
            <button class="dash-avatar" id="dashAvatarBtn" aria-label="Open menu" aria-expanded="false" title="${esc(display)}">
              ${DASH.avatar ? `<img src="${esc(DASH.avatar)}" alt="">` : `<span>${esc((typeof initials==='function')?initials(display):(display[0]||'U'))}</span>`}
            </button>
          </div>
          <div class="dash-notif" id="dashNotif" hidden></div>
          <div class="dash-accountmenu" id="dashAccountMenu" hidden></div>
        </header>
        <div class="dash-desktop-tip" id="desktopTip" role="note" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          <span>For the best experience, use Workley on a desktop or laptop.</span>
          <button type="button" class="dash-tip-x" onclick="dismissDesktopTip()" aria-label="Dismiss">&times;</button>
        </div>
        <div class="dash-content" id="dashContent" tabindex="-1"></div>
      </div>`;

    // Wire shell interactions
    const burger = document.getElementById('dashBurger');
    const side   = document.getElementById('dashSide');
    const scrim  = document.getElementById('dashScrim');
    const avatarBtn = document.getElementById('dashAvatarBtn');
    const open = ()=>{ side.classList.add('open'); scrim.hidden=false; burger.setAttribute('aria-expanded','true'); if(avatarBtn) avatarBtn.setAttribute('aria-expanded','true'); };
    const close= ()=>{ side.classList.remove('open'); scrim.hidden=true; burger.setAttribute('aria-expanded','false'); if(avatarBtn) avatarBtn.setAttribute('aria-expanded','false'); };
    window._dashCloseSide = close;
    const toggleSide = ()=> side.classList.contains('open')?close():open();
    burger.addEventListener('click', toggleSide);
    // The topbar profile picture surfaces the side-menu options (not the profile
    // page). On mobile it opens the slide-in strip; on wider screens the strip is
    // already visible, so it opens a dropdown of the same options instead.
    const accountMenu = document.getElementById('dashAccountMenu');
    const closeAccountMenu = ()=>{ if(accountMenu) accountMenu.hidden=true; if(avatarBtn) avatarBtn.setAttribute('aria-expanded','false'); };
    window.dashCloseAccountMenu = closeAccountMenu;
    if(avatarBtn) avatarBtn.addEventListener('click', e=>{
      e.stopPropagation();
      const isMobile = window.matchMedia && window.matchMedia('(max-width:760px)').matches;
      if(isMobile){ closeAccountMenu(); toggleSide(); return; }
      if(!accountMenu) return;
      if(accountMenu.hidden){ const nf=document.getElementById('dashNotif'); if(nf) nf.hidden=true; accountMenu.innerHTML = renderAccountMenu(); accountMenu.hidden=false; avatarBtn.setAttribute('aria-expanded','true'); }
      else { closeAccountMenu(); }
    });
    document.addEventListener('click', e=>{ if(accountMenu && !accountMenu.hidden && !accountMenu.contains(e.target) && !avatarBtn.contains(e.target)) closeAccountMenu(); });
    scrim.addEventListener('click', close);

    // Notifications dropdown
    const bell = document.getElementById('dashBellBtn');
    const notif = document.getElementById('dashNotif');
    notif.innerHTML = renderNotifications();
    bell.addEventListener('click', e=>{
      e.stopPropagation();
      const opening = notif.hidden;
      notif.hidden = !notif.hidden;
      if(opening){
        // Mark all current notifications as seen
        const items = buildNotifications();
        const newest = items.reduce((mx,n)=>Math.max(mx,n.ts),0);
        _saveNotifSeen(Math.max(_notifSeen, newest || Date.now()));
        const dot = document.getElementById('dashBellDot'); if(dot) dot.hidden=true;
        // Re-render panel without unread highlights
        notif.innerHTML = renderNotifications();
      }
    });
    document.addEventListener('click', e=>{ if(!notif.hidden && !notif.contains(e.target) && e.target!==bell) notif.hidden=true; });

    // Search → jump to the relevant find view
    const search = document.getElementById('dashSearch');
    search.addEventListener('keydown', e=>{ if(e.key==='Enter'){ setView(isClient?'talent':'findwork'); } });
  }

  function greeting(){ const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }

  // The primary navigation items (shared by the sidebar + the avatar dropdown).
  function navItems(){
    return (DASH.role==='client') ? [
      ['overview','Overview',I.grid],
      ['talent','Find talent',I.search],
      ['jobs','My jobs',I.briefcase],
      ['projects','Projects',I.folder],
      ['meetings','Meetings',I.video],
      ['messages','Chats',I.chat]
    ] : [
      ['overview','Overview',I.grid],
      ['findwork','Find work',I.search],
      ['proposals','Jobs',I.briefcase],
      ['invites','Invitations',I.handshake],
      ['meetings','Meetings',I.video],
      ['messages','Chats',I.chat]
    ];
  }
  // The avatar dropdown: the same "side menu options" (nav + profile + sign out),
  // surfaced from the top-right profile picture. Used on wider screens where the
  // sidebar strip is always visible (so toggling the strip would do nothing).
  function renderAccountMenu(){
    const isClient = DASH.role==='client';
    const display = isClient ? (DASH.p.orgName||DASH.name) : DASH.name;
    const roleLabel = isClient ? 'Client' : 'ICT Talent';
    const ava = DASH.avatar ? `<img src="${esc(DASH.avatar)}" alt="">` : `<span>${esc((typeof initials==='function')?initials(display):(display[0]||'U'))}</span>`;
    const unread = unreadMessages();
    const navHtml = navItems().map(([v,label,ic])=>`
      <button class="dash-am-item ${v===VIEW?'active':''}" onclick="dashSetView('${v}');dashCloseAccountMenu()">
        ${ic}<span>${label}</span>${(v==='messages' && unread>0)?`<em class="dash-nav-badge">${unread}</em>`:''}
      </button>`).join('');
    return `
      <div class="dash-am-head">
        <span class="dash-am-ava">${ava}</span>
        <div class="dash-am-id"><strong>${esc(display)}</strong><span>${esc(roleLabel)}</span></div>
      </div>
      <div class="dash-am-sec">${navHtml}</div>
      <div class="dash-am-foot">
        <a class="dash-am-item" href="profile.html">${I.user}<span>My profile</span></a>
        <button class="dash-am-item danger" onclick="dashSignOut()">${I.logout}<span>Sign out</span></button>
      </div>`;
  }
  function paintNav(){
    const nav = document.getElementById('dashNav');
    if(!nav) return;
    const items = navItems();
    const unread = unreadMessages();   // real count (0 until messaging ships)
    nav.innerHTML = items.map(([v,label,ic])=>`
      <button class="dash-nav-item ${v===VIEW?'active':''}" data-view="${v}" ${v===VIEW?'aria-current="page"':''} onclick="dashSetView('${v}')">
        ${ic}<span>${label}</span>${(v==='messages' && unread>0)?`<em class="dash-nav-badge">${unread}</em>`:''}
      </button>`).join('');
  }
  // Real unread message count across all my conversations.
  function unreadMessages(){
    const me=_uid(); if(!me || !CONVOS) return 0;
    // Count CHATS that have new messages, not the total number of messages.
    return CONVOS.reduce((n,c)=> n + (((Number(c.unread && c.unread[me])||0) > 0) ? 1 : 0), 0);
  }

  function setView(v, fromPop){
    // Leaving Messages → detach the active thread listener (conversations list stays live).
    if(VIEW==='messages' && v!=='messages') detachThread();
    VIEW=v; _animateNext=true; paintNav(); paintMain();
    const c=document.getElementById('dashContent'); if(c){ c.scrollTop=0; c.focus({preventScroll:true}); }
    const m=document.getElementById('dashMain'); if(m) m.scrollTop=0;
    if(window._dashCloseSide) window._dashCloseSide();
    // Hardware/browser Back should move between dashboard views (not jump out to
    // the profile page). Each view switch pushes a history entry; popstate restores it.
    if(!fromPop){ try{ history.pushState({dashView:v}, '', '#'+v); }catch(e){} }
  }
  // Wire Back/Forward once: restore the view from history state while on the dashboard.
  let _viewNavWired=false;
  function wireViewNav(){
    if(_viewNavWired) return; _viewNavWired=true;
    window.addEventListener('popstate', e=>{
      if(!document.getElementById('dashboardPage')) return;
      const v = e.state && e.state.dashView;
      if(v && v!==VIEW){ setView(v, true); }
    });
  }
  window.dashSetView = setView;
  window.dashSignOut = function(){ if(typeof signOut==='function') signOut(); else location.href='index.html'; };

  // ══════════════════════ PROJECT MANAGEMENT ══════════════════════
  // (reuses the existing FIELD_NAMES map = PROFILE_CATEGORIES)
  function fieldName(f){ return FIELD_NAMES[f] || f || ''; }
  function statusLabel(s){ return s==='grad' ? 'Graduate' : s==='student' ? 'Student' : (s || '-'); }
  function studentAvatar(m){ return m.studentAvatar ? `<img src="${esc(m.studentAvatar)}" alt="">` : `<span>${esc(_initialsOf(m.studentName))}</span>`; }
  function projBadge(status){
    return status==='complete' ? '<span class="proj-badge done">Complete</span>'
      : status==='archived' ? '<span class="proj-badge arch">Archived</span>'
      : '<span class="proj-badge live">Ongoing</span>';
  }
  // Unread messages from a specific student (powers the per-member chat badge).
  function unreadFrom(studentUid){
    const me=_uid(); if(!me || !CONVOS || !window.firebaseDB) return 0;
    const cid = window.firebaseDB.conversationId(me, studentUid);
    const c = CONVOS.find(x=>x.id===cid);
    return c ? (Number(c.unread && c.unread[me]) || 0) : 0;
  }
  function _toLocalInput(d){ if(!(d instanceof Date) || isNaN(d)) return ''; const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

  // ── Client: projects list ──
  function viewProjects(){
    if(PROJECTS==null) return loadingBlock();
    const active = PROJECTS.filter(p=>p.status!=='archived');
    const archived = PROJECTS.filter(p=>p.status==='archived');
    const card = (p)=>`<button class="proj-card" data-reveal onclick="dashOpenProject('${p.id}')">
      <div class="proj-card-top"><h3>${esc(p.title)}</h3>${projBadge(p.status)}</div>
      <p class="proj-card-desc">${esc(p.description) || '<span class="dash-muted">No description.</span>'}</p>
      <div class="proj-card-foot"><span class="proj-open">${I.folder} Open project</span><span class="dash-muted">${timeAgo(p.createdAt)}</span></div>
    </button>`;
    let html = `<div class="proj-head" data-reveal>
      <div><h2 class="proj-h2">Your projects</h2><p class="proj-subtitle">Manage projects, invite students, schedule meetings and track onboarding &amp; payments.</p></div>
      <button class="btn btn-primary" onclick="dashNewProject()">${I.plus} New project</button>
    </div>`;
    if(!active.length){
      html += `<div class="proj-empty" data-reveal>${I.folder}<h3>No projects yet</h3><p>Create a project, then invite students from your talent catalog.</p><button class="btn btn-primary" onclick="dashNewProject()">${I.plus} Create your first project</button></div>`;
    } else {
      html += `<div class="proj-grid">${active.map(card).join('')}</div>`;
    }
    if(archived.length){
      html += `<div class="proj-arch-head" data-reveal>${I.archive}<span>Archived projects (${archived.length})</span></div><div class="proj-grid proj-grid-arch">${archived.map(card).join('')}</div>`;
    }
    return html;
  }

  // ── Client: a single project ──
  function memberCardSimple(m, kind, proj){
    const sub = kind==='pending' ? 'Waiting for response' : 'Declined the invite';
    return `<div class="proj-member ${kind}">
      <button class="proj-ava" onclick="dashFloatStudent('${proj.id}','${m.studentUid}',event)" title="View profile">${studentAvatar(m)}</button>
      <div class="proj-member-main"><div class="proj-member-name">${esc(m.studentName)}</div><div class="proj-member-sub">${sub}</div></div>
      <button class="proj-mini-btn" title="Remove from project" onclick="dashRemoveMember('${proj.id}','${m.studentUid}')">${I.x}</button>
    </div>`;
  }
  function memberCardAccepted(m, proj){
    const unread = unreadFrom(m.studentUid);
    const onboarded = m.memberState==='onboarded';
    const clientSigned = !!m.clientSignedAt;
    const talentSigned = !!m.talentSignedAt;
    const awaitingTalent = clientSigned && !talentSigned && !onboarded && m.memberState!=='dismissed';
    // Payment status ONLY shows for onboarded talent.
    const paidBadge = onboarded ? (m.paid ? '<span class="proj-paid yes">Paid</span>' : '<span class="proj-paid no">Unpaid</span>') : '';
    const meeting = m.meetingAt
      ? `<div class="proj-meet">${I.cal}<span>${m.meetingAt.toLocaleString('en-ZA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>${m.meetingPlatform?` · ${esc(m.meetingPlatform)}`:''}${m.meetingLink?` · <a href="${esc(m.meetingLink)}" target="_blank" rel="noopener noreferrer">join</a>`:''}</div>`
      : '';
    const first = esc((m.studentName||'the talent').split(' ')[0]);
    let stateRow;
    if(m.memberState==='cancelled') stateRow = `<span class="proj-state cancelled">${I.x} Cancelled${m.cancelledBy==='client'?' by you':m.cancelledBy==='talent'?' by '+first:''}</span><button class="proj-textbtn" onclick="dashViewCancellation('${proj.id}','${m.studentUid}')">Details</button>`;
    else if(onboarded) stateRow = `<span class="proj-state onboarded">${I.check} Onboarded</span><button class="proj-textbtn" onclick="dashViewContract('${proj.id}','${m.studentUid}')">Contract</button><button class="proj-textbtn danger" onclick="dashCancelEngagement('${proj.id}','${m.studentUid}')">Cancel</button>`;
    else if(m.memberState==='dismissed') stateRow = `<span class="proj-state dismissed">Dismissed</span><button class="proj-textbtn" onclick="dashSetMemberActive('${proj.id}','${m.studentUid}')">Undo</button>`;
    else if(awaitingTalent) stateRow = `<span class="proj-state pending">${I.clock} Awaiting ${first}'s signature</span><button class="proj-textbtn" onclick="dashViewContract('${proj.id}','${m.studentUid}')">View</button><button class="proj-textbtn danger" onclick="dashCancelEngagement('${proj.id}','${m.studentUid}')">Cancel</button>`;
    else stateRow = `<button class="btn btn-primary btn-sm" onclick="dashSignContractClient('${proj.id}','${m.studentUid}')">${I.check} Onboard</button><button class="btn btn-outline btn-sm" onclick="dashDismiss('${proj.id}','${m.studentUid}')">Dismiss</button>`;
    return `<div class="proj-member accepted ${m.memberState}${awaitingTalent?' awaiting':''}">
      <button class="proj-ava" onclick="dashFloatStudent('${proj.id}','${m.studentUid}',event)" title="View profile">${studentAvatar(m)}</button>
      <div class="proj-member-main">
        <div class="proj-member-name">${esc(m.studentName)} ${paidBadge}</div>
        <div class="proj-member-sub">${esc(statusLabel(m.studentStatus))}${m.studentField?' · '+esc(fieldName(m.studentField)):''}</div>
        ${meeting}
      </div>
      <div class="proj-member-actions">
        <button class="proj-mini-btn ${unread?'has-unread':''}" title="Message" onclick="dashMsgMember('${proj.id}','${m.studentUid}')">${I.chat}${unread?`<em class="proj-unread">${unread}</em>`:''}</button>
        ${m.memberState==='cancelled' ? '' : `<button class="proj-mini-btn" title="Schedule meeting" onclick="dashScheduleMeeting('${proj.id}','${m.studentUid}')">${I.video}</button>`}
        ${onboarded ? `<button class="proj-mini-btn" title="${m.paid?'Mark unpaid':'Mark paid'}" onclick="dashTogglePaid('${proj.id}','${m.studentUid}',${m.paid?'false':'true'})">${I.money}</button>${m.paid ? `<button class="proj-mini-btn" title="Leave or edit a review" onclick="dashReviewMember('${proj.id}','${m.studentUid}')">${I.star}</button>` : ''}` : ''}
      </div>
      <div class="proj-member-state">${stateRow}</div>
    </div>`;
  }
  function groupBlock(label, list, render, emptyMsg, proj){
    return `<div class="proj-group" data-reveal>
      <div class="proj-group-head">${esc(label)} <em>${list.length}</em></div>
      ${list.length ? `<div class="proj-member-list">${list.map(m=>render(m,proj)).join('')}</div>` : `<div class="proj-group-empty">${esc(emptyMsg)}</div>`}
    </div>`;
  }
  // Archived project: a read-only "receipt" of who was on it when it closed.
  function inviteLabel(s){ return s==='accepted' ? 'Accepted the invite' : (s==='declined' ? 'Declined the invite' : 'Was invited'); }
  function archivedReceiptsBlock(proj){
    const r = proj.receipts || [];
    const closed = proj.closedAt ? ` on ${proj.closedAt.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}` : '';
    const head = `<div class="proj-arch-note" data-reveal>${I.archive}<div><strong>This project is archived${closed}.</strong><span>The talent below were on it when it closed. Reopen the project to invite talent again.</span></div></div>`;
    if(!r.length) return head + `<div class="proj-group-empty" data-reveal>No talent were on this project.</div>`;
    const rows = r.map(rc=>{
      const ava = rc.studentAvatar ? `<img src="${esc(rc.studentAvatar)}" alt="">` : `<span>${esc(_initialsOf(rc.studentName))}</span>`;
      const onb = rc.onboardedAt
        ? `<span class="proj-state onboarded">${I.check} Onboarded ${rc.onboardedAt.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}</span>`
        : `<span class="proj-receipt-sub">${esc(inviteLabel(rc.inviteStatus))}</span>`;
      return `<div class="proj-member receipt">
        <div class="proj-ava static">${ava}</div>
        <div class="proj-member-main">
          <div class="proj-member-name">${esc(rc.studentName)} ${rc.paid?'<span class="proj-paid yes">Paid</span>':''}</div>
          <div class="proj-member-sub">${rc.studentField?esc(fieldName(rc.studentField)):'ICT talent'}</div>
          ${onb}
        </div>
      </div>`;
    }).join('');
    return head + `<div class="proj-group" data-reveal><div class="proj-group-head">Receipts <em>${r.length}</em></div><div class="proj-member-list">${rows}</div></div>`;
  }
  function viewProjectDetail(projectId){
    const back = `<button class="dash-back" onclick="dashSetView('projects')">${I.back}<span>Projects</span></button>`;
    if(PROJECTS==null) return `<div class="proj-detail">${back}${loadingBlock()}</div>`;
    const proj = (PROJECTS||[]).find(p=>p.id===projectId);
    if(!proj) return `<div class="proj-detail">${back}<div class="proj-empty">${I.folder}<h3>Project not found</h3></div></div>`;
    let controls;
    if(proj.status==='ongoing') controls = `<button class="btn btn-outline btn-sm" onclick="dashSetProjectStatus('${proj.id}','complete')">${I.check} Mark complete</button><button class="btn btn-outline btn-sm" onclick="dashConfirmCloseProject('${proj.id}')">${I.archive} Close &amp; archive</button>`;
    else if(proj.status==='complete') controls = `<button class="btn btn-outline btn-sm" onclick="dashSetProjectStatus('${proj.id}','ongoing')">Reopen</button><button class="btn btn-outline btn-sm" onclick="dashConfirmCloseProject('${proj.id}')">${I.archive} Close &amp; archive</button>`;
    else controls = `<button class="btn btn-outline btn-sm" onclick="dashReopenProject('${proj.id}')">Reopen project</button>`;
    controls += `<button class="btn btn-danger btn-sm" onclick="dashConfirmDeleteProject('${proj.id}')">${I.trash} Delete</button>`;
    const members = PROJECT_MEMBERS[projectId];
    let body;
    if(proj.status==='archived'){ body = archivedReceiptsBlock(proj); }
    else if(members==null){ body = loadingBlock(); }
    else {
      const accepted = members.filter(m=>m.inviteStatus==='accepted');
      const pending  = members.filter(m=>m.inviteStatus==='pending');
      const declined = members.filter(m=>m.inviteStatus==='declined');
      // Only onboarded talent can be paid (payment status is gated on onboarding).
      const unpaid = accepted.filter(m=>m.memberState==='onboarded' && !m.paid);
      const payAll = unpaid.length ? `<button class="btn btn-outline btn-sm" onclick="dashPayAll('${proj.id}')">${I.money} Pay all unpaid (${unpaid.length})</button>` : '';
      body = `<div class="proj-members-bar" data-reveal>
          <button class="btn btn-primary btn-sm" onclick="dashOpenInvite('${proj.id}')">${I.plus} Invite student</button>${payAll}
        </div>
        ${groupBlock('Accepted', accepted, memberCardAccepted, 'No students have accepted yet.', proj)}
        ${groupBlock('Waiting for response', pending, (m,p)=>memberCardSimple(m,'pending',p), 'No pending invites.', proj)}
        ${groupBlock('Declined', declined, (m,p)=>memberCardSimple(m,'declined',p), 'No declined invites.', proj)}`;
    }
    return `<div class="proj-detail">
      ${back}
      <div class="proj-detail-head" data-reveal>
        <div class="proj-detail-title"><h2 class="proj-h2">${esc(proj.title)}</h2>${projBadge(proj.status)}</div>
        <div class="proj-detail-actions">${controls}</div>
      </div>
      <p class="proj-detail-desc" data-reveal>${esc(proj.description) || '<span class="dash-muted">No description.</span>'}</p>
      ${body}
    </div>`;
  }

  // ── Talent: my invitations ──
  function viewInvites(){
    if(MY_INVITES==null) return loadingBlock();
    const list = MY_INVITES;
    if(!list.length) return `<div class="proj-empty" data-reveal>${I.handshake}<h3>No invitations yet</h3><p>When a client invites you to a project, it'll show up here.</p></div>`;
    const card = (m,i)=>{
      const onboarded = m.memberState==='onboarded';
      const cancelled = m.memberState==='cancelled';
      const needsSign = m.inviteStatus==='accepted' && !onboarded && !cancelled && !!m.clientSignedAt && !m.talentSignedAt;
      let action;
      if(cancelled) action = `<span class="proj-badge arch">Cancelled${m.cancelledBy==='talent'?' by you':''}</span> <button class="proj-textbtn" onclick="dashViewCancellation('${m.projectId}','${m.studentUid}')">Details</button>`;
      else if(m.inviteStatus==='pending') action = `<div class="proj-inv-actions"><button class="btn btn-primary btn-sm" onclick="dashRespondInvite(${i},true)">Accept</button><button class="btn btn-outline btn-sm" onclick="dashRespondInvite(${i},false)">Decline</button></div>`;
      else if(needsSign) action = `<div class="contract-prompt"><div class="cp-txt"><strong>${I.check} Action needed: sign your Service Agreement</strong><span>${esc((m.clientName||'The client').split(' ')[0])} has signed. Counter-sign to complete your onboarding - you're not obligated to work until then.</span></div><button class="btn btn-primary btn-sm" onclick="dashSignContractTalent(${i})">Review &amp; sign</button></div><div class="cancel-inline"><button class="proj-textbtn danger" onclick="dashCancelEngagementTalent('${m.projectId}')">Can't take this on? Cancel the engagement</button></div>`;
      else if(m.inviteStatus==='accepted') action = onboarded ? '' : `<span class="proj-badge done">Accepted</span>`;
      else action = `<span class="proj-badge arch">Declined</span>`;
      const meeting = (m.meetingAt && !cancelled) ? `<div class="proj-meet">${I.cal}<span>Meeting: ${m.meetingAt.toLocaleString('en-ZA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>${m.meetingPlatform?` · ${esc(m.meetingPlatform)}`:''}${m.meetingLink?` · <a href="${esc(m.meetingLink)}" target="_blank" rel="noopener noreferrer">join</a>`:''}</div>` : '';
      const onb = onboarded ? `<span class="proj-state onboarded">${I.check} Onboarded</span>` : (cancelled ? `<span class="proj-state cancelled">${I.x} Cancelled</span>` : '');
      return `<div class="proj-inv-card${needsSign?' needs-sign':''}${cancelled?' cancelled':''}" data-reveal>
        <div class="proj-inv-top"><h3>${esc(m.projectTitle)||'Project'}</h3>${onb}</div>
        <div class="proj-inv-client">From ${m.clientUid?`<button type="button" class="dash-clientlink" onclick="openClientProfile('${m.clientUid}')"><strong>${esc(m.clientName)}</strong></button>`:`<strong>${esc(m.clientName)}</strong>`}</div>
        <p class="proj-inv-desc">${esc(m.projectDescription) || '<span class="dash-muted">No description.</span>'}</p>
        ${meeting}${action}
      </div>`;
    };
    return `<div class="proj-head" data-reveal><div><h2 class="proj-h2">Project invitations</h2><p class="proj-subtitle">Clients who'd like you on their project.</p></div></div>
      <div class="proj-inv-grid">${list.map(card).join('')}</div>`;
  }

  // ── Meetings (both roles). The client schedules/edits; talent is read-only. ──
  function viewMeetings(role){
    const head = `<div class="proj-head" data-reveal><div><h2 class="proj-h2">Meetings</h2><p class="proj-subtitle">${role==='client'?'Schedule and manage online meetings with the talent you have accepted.':'Your scheduled meetings with clients. Join from here when it is time.'}</p></div></div>`;
    let list = [];
    if(role==='client'){
      if(PROJECTS==null) return head + loadingBlock();
      const activeProjects = (PROJECTS||[]).filter(p=>p.status!=='archived');
      if(activeProjects.some(p=>PROJECT_MEMBERS[p.id]==null)) return head + loadingBlock();
      activeProjects.forEach(p=>{
        (PROJECT_MEMBERS[p.id]||[]).forEach(m=>{ if(m.meetingAt && m.inviteStatus!=='declined' && m.memberState!=='cancelled') list.push(Object.assign({}, m, {projectId:p.id, projectTitle:p.title})); });
      });
    } else {
      if(MY_INVITES==null) return head + loadingBlock();
      (MY_INVITES||[]).forEach(m=>{ if(m.meetingAt && m.memberState!=='cancelled') list.push(m); });
    }
    list.sort((a,b)=> (a.meetingAt?a.meetingAt.getTime():0) - (b.meetingAt?b.meetingAt.getTime():0));
    if(!list.length){
      return head + `<div class="proj-empty" data-reveal>${I.video}<h3>No meetings yet</h3><p>${role==='client'?'Accept a job applicant or invite talent, then schedule a meeting - it will appear here for both of you.':'When a client schedules a meeting with you, it will show up here.'}</p></div>`;
    }
    const now=Date.now();
    const card = (m)=>{
      const when = m.meetingAt.toLocaleString('en-ZA',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      const past = m.meetingAt.getTime() < now;
      const platform = m.meetingPlatform ? `<span class="mtg-plat">${esc(m.meetingPlatform)}</span>` : '';
      const who = role==='client' ? esc(m.studentName||'Talent') : esc(m.clientName||'Client');
      const proj = esc(m.projectTitle||'Project');
      const join = m.meetingLink ? `<a class="btn btn-primary btn-sm" href="${esc(m.meetingLink)}" target="_blank" rel="noopener noreferrer">${I.video} Join</a>` : '';
      const actions = role==='client'
        ? `${join}<button class="btn btn-outline btn-sm" onclick="dashScheduleMeeting('${m.projectId}','${m.studentUid}')">Edit</button>`
        : (join || `<span class="dash-muted" style="font-size:.8rem">Link shared closer to the time</span>`);
      return `<div class="mtg-card${past?' past':''}" data-reveal>
        <div class="mtg-when">${I.cal}<div><strong>${esc(when)}</strong>${past?'<span class="mtg-past">Past</span>':''}</div></div>
        <div class="mtg-main">
          <div class="mtg-title">${proj} ${platform}</div>
          <div class="mtg-with">${role==='client'?'With':'From'} <strong>${who}</strong></div>
        </div>
        <div class="mtg-acts">${actions}</div>
      </div>`;
    };
    return head + `<div class="mtg-list">${list.map(card).join('')}</div>`;
  }

  // ── Floating student profile card (click a member's photo) ──
  window.dashFloatStudent = function(projectId, studentUid, ev){
    if(ev){ try{ ev.stopPropagation(); }catch(e){} }
    const m = (PROJECT_MEMBERS[projectId]||[]).find(x=>x.studentUid===studentUid);
    if(!m) return;
    let layer = document.getElementById('floatStudentLayer');
    if(!layer){ layer=document.createElement('div'); layer.id='floatStudentLayer'; layer.className='float-student-layer'; layer.addEventListener('click', e=>{ if(e.target===layer) dashCloseFloat(); }); document.body.appendChild(layer); }
    const contact = m.studentEmail || m.studentPhone || 'Shared once they accept';
    const photo = m.studentAvatar ? `<img src="${esc(m.studentAvatar)}" alt="">` : `<span>${esc(_initialsOf(m.studentName))}</span>`;
    const mailIc = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
    layer.innerHTML = `<div class="float-student-card" role="dialog" aria-modal="true">
      <button class="float-student-x" onclick="dashCloseFloat()" aria-label="Close">×</button>
      <div class="float-student-ava">${photo}</div>
      <div class="float-student-name">${esc(m.studentName)}</div>
      <div class="float-student-status">${esc(statusLabel(m.studentStatus))}${m.studentField?' · '+esc(fieldName(m.studentField)):''}</div>
      <div class="float-student-row">${mailIc}<span>${esc(contact)}</span></div>
      <button class="btn btn-primary btn-sm float-student-view" onclick="dashCloseFloat();dashViewStudentProfile('${m.studentUid}')">View full profile →</button>
    </div>`;
    document.body.style.overflow='hidden';
    void layer.offsetWidth; layer.classList.add('show');
  };
  window.dashCloseFloat = function(){ const l=document.getElementById('floatStudentLayer'); if(!l) return; l.classList.remove('show'); setTimeout(()=>{ const ov=document.getElementById('overlay'); if(!ov||!ov.classList.contains('show')) document.body.style.overflow=''; }, 200); };
  window.dashViewStudentProfile = function(uid){ if(typeof openProfile==='function') openProfile(uid); };

  // ── Celebration when a student is onboarded ──
  function celebrateOnboard(name, msg){
    let el = document.getElementById('celebrateLayer'); if(el) el.remove();
    el = document.createElement('div'); el.id='celebrateLayer'; el.className='celebrate-layer';
    const colors=['#3D6BF0','#2247B5','#22c55e','#f59e0b','#ec4899','#06b6d4'];
    let confetti=''; for(let i=0;i<46;i++){ const c=colors[i%colors.length]; const left=(Math.random()*100).toFixed(1); const delay=(Math.random()*0.35).toFixed(2); const dur=(1.5+Math.random()*1.3).toFixed(2); confetti+=`<i style="left:${left}%;background:${c};animation-delay:${delay}s;animation-duration:${dur}s"></i>`; }
    el.innerHTML = `<div class="celebrate-confetti">${confetti}</div><div class="celebrate-badge"><span class="celebrate-check">${I.check}</span><div><strong>Onboarded!</strong><span>${esc(msg || (name + ' has joined the project 🎉'))}</span></div></div>`;
    document.body.appendChild(el);
    void el.offsetWidth; el.classList.add('show');
    setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>{ if(el.parentNode) el.remove(); }, 450); }, 2600);
  }

  // ── Project actions ──
  window.dashOpenProject = function(id){ _activeProject=id; ensureProjectMembers(id); setView('projectdetail'); };
  window.dashMsgMember = function(projectId, studentUid){ const m=(PROJECT_MEMBERS[projectId]||[]).find(x=>x.studentUid===studentUid); if(m) openChatWith({uid:m.studentUid,name:m.studentName,role:'talent'}); };
  window.dashSetProjectStatus = function(id, status){ const uid=_uid(); if(!window.firebaseDB) return; window.firebaseDB.updateProjectStatus(uid,id,status).then(ok=>{ if(ok){ PROJECTS=null; ensureProjects(()=>paintMain()); toast('Project updated', status==='archived'?'Moved to archived projects.':status==='complete'?'Marked complete.':'Project is ongoing.'); } }); };
  window.dashSetMemberActive = function(projectId, studentUid){ const uid=_uid(); window.firebaseDB.updateMemberState(uid,projectId,studentUid,'active').then(ok=>{ if(ok){ PROJECT_MEMBERS[projectId]=null; ensureProjectMembers(projectId,()=>paintMain()); } }); };
  // ── Standard Service Agreement signing (both parties → onboarded) ──
  const CONTRACT_POINTS = [
    'Workley is an intermediary - this agreement is between the client and the talent; Workley is not a party.',
    'The talent works as an independent contractor, not an employee.',
    'The talent has no obligation to begin work until onboarding is complete (both parties have signed).',
    'Project scope, price and deadlines are agreed separately, in writing, between the parties.',
    'Payments are made directly (there is no escrow) and recorded on the platform as paid or unpaid.',
    'Confidentiality applies; deliverables are assigned to the client on full payment.',
    'Each party handles its own taxes; disputes go to messaging first, then mediation/arbitration under South African law.'
  ];
  function contractSignModal(opts){
    const list = CONTRACT_POINTS.map(p=>`<li>${esc(p)}</li>`).join('');
    const note = opts.role==='client'
      ? `Once you sign, ${esc(opts.otherName||'the talent')} will be asked to counter-sign. Onboarding completes only when both of you have signed.`
      : `${esc(opts.otherName||'The client')} has signed. Sign to complete your onboarding - you are not obligated to do any work until this is done.`;
    const lead = opts.role==='client' ? ('Onboarding '+esc(opts.otherName||'')) : ('Onboarded by '+esc(opts.otherName||''));
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `
      <div class="modal-head"><div><h3 style="font-size:1.2rem">Sign the Service Agreement</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">${lead}${opts.projectTitle?' · '+esc(opts.projectTitle):''}</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="contract-note">${note}</div>
        <p style="font-size:.85rem;color:var(--muted);margin:0 0 8px">Key terms of Workley's standard <a href="service-agreement.html" target="_blank" rel="noopener">Service Agreement</a>:</p>
        <ul class="contract-points">${list}</ul>
        <div class="form-field" style="margin-top:14px"><label for="sigName">Type your full name to sign</label><input id="sigName" type="text" placeholder="Your full name" autocomplete="name"></div>
        <label class="check-row" style="margin-top:8px"><input type="checkbox" id="sigAgree"> <span>I have read and agree to the <a href="service-agreement.html" target="_blank" rel="noopener">Service Agreement</a>, and I understand my electronic signature is legally binding.</span></label>
        <button class="btn btn-primary btn-block btn-lg" style="margin-top:16px" id="sigBtn">${I.check} Sign agreement</button>
      </div>`;
    showOverlay();
    setTimeout(()=>{ const i=document.getElementById('sigName'); if(i) i.focus(); },120);
    const btn=document.getElementById('sigBtn');
    if(btn) btn.onclick=function(){
      const name=((document.getElementById('sigName')||{}).value||'').trim();
      const agree=(document.getElementById('sigAgree')||{}).checked;
      if(name.length<2){ toast('Enter your name','Type your full name to sign.'); return; }
      if(!agree){ toast('Please agree','Tick the box to confirm you agree to the Service Agreement.'); return; }
      this.disabled=true; this.textContent='Signing…';
      opts.onSubmit(name);
    };
  }
  // Client signs first (initiates onboarding). Does NOT onboard on its own.
  window.dashSignContractClient = function(projectId, studentUid){
    const uid=_uid(); const m=(PROJECT_MEMBERS[projectId]||[]).find(x=>x.studentUid===studentUid);
    const proj=(PROJECTS||[]).find(p=>p.id===projectId);
    contractSignModal({ role:'client', otherName:(m&&m.studentName)||'the talent', projectTitle:(proj&&proj.title)||'',
      onSubmit:(name)=>{ window.firebaseDB.clientSignContract(uid, projectId, studentUid, name).then(ok=>{ closeModal();
        if(ok){ PROJECT_MEMBERS[projectId]=null; ensureProjectMembers(projectId,()=>paintMain()); toast('Agreement signed', 'We\'ve asked '+((m&&m.studentName)||'the talent')+' to counter-sign. Onboarding completes once they do.'); }
        else toast('Couldn\'t sign','Please try again.'); }); } });
  };
  // Talent counter-signs → onboarding completes.
  window.dashSignContractTalent = function(i){
    const m=(MY_INVITES||[])[i]; if(!m) return;
    contractSignModal({ role:'talent', otherName:m.clientName||'the client', projectTitle:m.projectTitle||'',
      onSubmit:(name)=>{ window.firebaseDB.talentSignContract(m, name).then(ok=>{ closeModal();
        if(ok){ MY_INVITES=null; ensureInvites(()=>paintMain()); celebrateOnboard('', 'You\'ve joined the project 🎉'); toast('You\'re onboarded! 🎉','Both parties have signed the Service Agreement. You can now begin the work.'); }
        else toast('Couldn\'t sign','Please try again in a moment.'); }); } });
  };
  // Read-only view of the signing status.
  window.dashViewContract = function(projectId, studentUid){
    const m=(PROJECT_MEMBERS[projectId]||[]).find(x=>x.studentUid===studentUid); if(!m) return;
    const row=(label, at, name)=> `<div class="contract-sig-row"><span class="csr-label">${esc(label)}</span>${at?`<span class="csr-done">${I.check} Signed${name?' · '+esc(name):''}<small>${new Date(at).toLocaleString('en-ZA',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small></span>`:'<span class="csr-pending">Not signed yet</span>'}</div>`;
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `
      <div class="modal-head"><div><h3 style="font-size:1.2rem">Service Agreement</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">${esc(m.studentName||'Talent')}</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="contract-sigs">
          ${row('Client (you)', m.clientSignedAt, m.clientSignerName)}
          ${row('Talent', m.talentSignedAt, m.talentSignerName)}
        </div>
        <p style="font-size:.85rem;color:var(--muted);margin-top:14px">Read the full <a href="service-agreement.html" target="_blank" rel="noopener">Standard Service Agreement</a>.</p>
        <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="closeModal()">Close</button>
      </div>`;
    showOverlay();
  };
  window.dashDismiss = function(projectId, studentUid){ const uid=_uid(); window.firebaseDB.updateMemberState(uid,projectId,studentUid,'dismissed').then(ok=>{ if(ok){ PROJECT_MEMBERS[projectId]=null; ensureProjectMembers(projectId,()=>paintMain()); toast('Student dismissed',''); } }); };

  // ── Engagement cancellation (self-service; policy: cancellation.html) ──
  // Deliberately quiet UI: cancelling is always available but never promoted.
  // The flow is: consequences + reason + "I understand" → one-time SMS code to
  // the account's verified phone → only then is the engagement cancelled.
  // Keys must stay in sync with the cancelReason enum in firestore.rules.
  const CANCEL_REASONS = [
    ['scope',        'Scope or requirements changed'],
    ['budget',       'Budget changed'],
    ['timeline',     'The timeline no longer works'],
    ['unresponsive', 'The other party is unresponsive'],
    ['quality',      'The engagement is not working out'],
    ['workload',     'No longer have the capacity'],
    ['personal',     'Personal or unforeseen circumstances'],
    ['other',        'Other']
  ];
  function cancelReasonLabel(key){ const r=CANCEL_REASONS.find(x=>x[0]===key); return r ? r[1] : 'Other'; }
  let _cancelCtx = null;   // { m, role, reason, note, verify } for the in-flight flow

  window.dashCancelEngagement = function(projectId, studentUid){
    const m=(PROJECT_MEMBERS[projectId]||[]).find(x=>x.studentUid===studentUid); if(!m) return;
    cancelModalStep1(Object.assign({}, m, { clientUid:_uid(), projectId }), 'client');
  };
  window.dashCancelEngagementTalent = function(projectId){
    const m=(MY_INVITES||[]).find(x=>x.projectId===projectId); if(!m) return;
    if(!m.clientUid){ toast('Not available','Please refresh and try again.'); return; }
    cancelModalStep1(m, 'talent');
  };
  function cancelModalStep1(m, role){
    _cancelCtx = { m, role, reason:'', note:'', verify:null };
    const other = role==='client' ? (m.studentName||'the talent') : (m.clientName||'the client');
    const first = esc(other.split(' ')[0]);
    const title = m.jobTitle || m.projectTitle || 'this engagement';
    const onboarded = m.memberState==='onboarded';
    const points = role==='client'
      ? (onboarded
          ? ['Work '+first+' has properly done so far must still be paid for.',
             'Work not yet done falls away - deliverables you\'ve paid for are yours.',
             first+' is notified immediately and stops working.',
             'This can\'t be undone. To work together again, send a new invite.']
          : ['No payment is due - onboarding was never completed.',
             first+' is notified immediately.',
             'This can\'t be undone. To work together again, send a new invite.'])
      : (onboarded
          ? ['You stay entitled to payment for work you\'ve properly done so far.',
             'Hand over any work the client has already paid for.',
             first+' is notified immediately.',
             'This can\'t be undone - the client would need to re-invite you.']
          : ['You\'re not obligated to any work - onboarding was never completed.',
             first+' is notified immediately.',
             'This can\'t be undone - the client would need to re-invite you.']);
    const opts = CANCEL_REASONS.map(r=>`<option value="${r[0]}">${esc(r[1])}</option>`).join('');
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `
      <div class="modal-head"><div><h3 style="font-size:1.2rem">Cancel this engagement?</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">${esc(title)} · with ${esc(other)}</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="contract-note">Before you continue, here's what cancelling means (<a href="cancellation.html" target="_blank" rel="noopener">Cancellation Policy</a>):</div>
        <ul class="contract-points">${points.map(p=>`<li>${p}</li>`).join('')}</ul>
        <div class="form-field" style="margin-top:14px"><label for="ceReason">Reason for cancelling</label>
          <select id="ceReason"><option value="" selected disabled>Select a reason…</option>${opts}</select></div>
        <div class="form-field" style="margin-top:12px"><label for="ceNote">Add a note for ${first} <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
          <textarea id="ceNote" rows="2" maxlength="500" placeholder="Anything that helps ${first} understand"></textarea></div>
        <label class="check-row" style="margin-top:10px"><input type="checkbox" id="ceAgree"> <span>I understand the consequences above and that this cancellation is final and recorded.</span></label>
        <div class="auth-error" id="ceErr"></div>
        <button class="btn btn-primary btn-block btn-lg" style="margin-top:14px" onclick="closeModal()">Keep the engagement</button>
        <button class="btn btn-outline btn-block cancel-danger-btn" style="margin-top:10px" onclick="dashCancelContinue()">Continue to cancellation</button>
      </div>`;
    showOverlay();
  }
  window.dashCancelContinue = function(){
    const reason=(document.getElementById('ceReason')||{}).value||'';
    const note=((document.getElementById('ceNote')||{}).value||'').trim();
    const agree=(document.getElementById('ceAgree')||{}).checked;
    const err=(t)=>{ const e=document.getElementById('ceErr'); if(e){ e.textContent=t; e.style.display='block'; } };
    if(!_cancelCtx) return;
    if(!reason){ err('Please select a reason for cancelling.'); return; }
    if(!agree){ err('Please confirm you understand the consequences.'); return; }
    _cancelCtx.reason=reason; _cancelCtx.note=note;
    cancelModalStep2();
    dashCancelSendCode();
  };
  function cancelModalStep2(){
    document.getElementById('modal').innerHTML = `
      <div class="modal-head"><div><h3 style="font-size:1.2rem">Confirm it's you</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">For your security, cancelling requires SMS verification.</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <p style="font-size:.9rem;color:var(--ink-soft);margin:0 0 14px" id="ceSmsMsg">Sending a one-time code to your verified phone…</p>
        <div class="form-field" id="ce-code"><label for="ceCode">6-digit code</label><input id="ceCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••"></div>
        <div class="auth-error" id="ceErr2"></div>
        <button class="btn btn-danger btn-block btn-lg" style="margin-top:14px" id="ceConfirmBtn" onclick="dashCancelConfirm()">Verify &amp; cancel engagement</button>
        <div class="auth-switch">Didn't get it? <button onclick="dashCancelSendCode()">Resend code</button></div>
        <button class="btn btn-outline btn-block" style="margin-top:10px" onclick="closeModal()">Keep the engagement</button>
      </div>`;
    setTimeout(()=>{ const i=document.getElementById('ceCode'); if(i) i.focus(); },120);
  }
  function _ceSmsErr(err){
    const el=document.getElementById('ceErr2'); if(!el) return;
    const code=(err&&err.code)||'';
    let msg;
    if(code==='workley/no-phone') msg='Your account has no verified phone number. Email hello@workley.co.za from your account email and we\'ll verify you another way.';
    else if(code==='auth/requires-recent-login') msg='For security, please log out, log back in, and try again.';
    else msg=(typeof smsErrorMessage==='function' && smsErrorMessage(err)) || 'Couldn\'t send the code. Please try again shortly.';
    el.textContent=msg; el.style.display='block';
  }
  window.dashCancelSendCode = function(){
    if(!_cancelCtx) return;
    if(!window.firebaseAuth || !window.firebaseAuth.startSmsVerify){ _ceSmsErr({}); return; }
    if(typeof ensureRecaptchaContainer==='function') ensureRecaptchaContainer();
    if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha();
    const msgEl=document.getElementById('ceSmsMsg');
    window.firebaseAuth.startSmsVerify().then(v=>{
      _cancelCtx.verify=v;
      const p=String(v.phone||''); const masked=p? (p.slice(0,3)+'•••••'+p.slice(-3)) : 'your phone';
      if(msgEl) msgEl.innerHTML='We sent a 6-digit code by SMS to <strong>'+esc(masked)+'</strong>. Enter it below to confirm the cancellation.';
    }).catch(err=>{
      if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha();
      if(msgEl) msgEl.textContent='We couldn\'t send the code.';
      _ceSmsErr(err);
    });
  };
  window.dashCancelConfirm = function(){
    if(!_cancelCtx) return;
    const inp=document.getElementById('ceCode');
    const code=(inp?inp.value:'').trim();
    const errEl=document.getElementById('ceErr2');
    const fail=(t)=>{ const b=document.getElementById('ceConfirmBtn'); if(b){ b.disabled=false; b.innerHTML='Verify &amp; cancel engagement'; } if(errEl){ errEl.textContent=t; errEl.style.display='block'; } };
    if(!/^\d{6}$/.test(code)){ const f=document.getElementById('ce-code'); if(f) f.classList.add('err'); return; }
    const f=document.getElementById('ce-code'); if(f) f.classList.remove('err');
    if(!_cancelCtx.verify){ fail('The code hasn\'t been sent yet - tap "Resend code".'); return; }
    const btn=document.getElementById('ceConfirmBtn'); if(btn){ btn.disabled=true; btn.textContent='Verifying…'; }
    const ctx=_cancelCtx;
    ctx.verify.confirm(code)
      .then(()=> window.firebaseDB.cancelEngagement(ctx.m, ctx.role, ctx.reason, ctx.note))
      .then(ok=>{
        if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha();
        if(!ok){ fail('Verified, but the cancellation couldn\'t be saved. Please try again.'); return; }
        _cancelCtx=null; closeModal();
        const other = ctx.role==='client' ? (ctx.m.studentName||'The talent') : (ctx.m.clientName||'The client');
        toast('Engagement cancelled', other.split(' ')[0]+' has been notified. The record is kept for both of you.');
        if(ctx.role==='client'){ PROJECT_MEMBERS[ctx.m.projectId]=null; ensureProjectMembers(ctx.m.projectId,()=>paintMain()); }
        else { MY_INVITES=null; ensureInvites(()=>paintMain()); }
      })
      .catch(err=>{
        const c=(err&&err.code)||'';
        if(c==='auth/invalid-verification-code') fail('That code is incorrect. Please try again.');
        else if(c==='auth/code-expired') fail('That code expired. Tap "Resend code" for a new one.');
        else fail((typeof smsErrorMessage==='function' && smsErrorMessage(err)) || 'Verification failed. Please resend a new code.');
      });
  };
  // Read-only view of a cancellation record (both parties can see who/when/why).
  window.dashViewCancellation = function(projectId, studentUid){
    let m=null, meClient=false;
    if(PROJECT_MEMBERS[projectId]){ m=(PROJECT_MEMBERS[projectId]||[]).find(x=>x.studentUid===studentUid); meClient=!!m; }
    if(!m) m=(MY_INVITES||[]).find(x=>x.projectId===projectId);
    if(!m || m.memberState!=='cancelled') return;
    const byMe = (m.cancelledBy==='client' && meClient) || (m.cancelledBy==='talent' && !meClient);
    const who = byMe ? 'You' : (m.cancelledBy==='client' ? (m.clientName||'The client') : (m.studentName||'The talent'));
    const when = m.cancelledAt ? m.cancelledAt.toLocaleString('en-ZA',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `
      <div class="modal-head"><div><h3 style="font-size:1.2rem">Cancelled engagement</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">${esc(m.jobTitle||m.projectTitle||'Engagement')}</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="contract-sigs">
          <div class="contract-sig-row"><span class="csr-label">Cancelled by</span><span class="csr-done">${esc(who)}${when?`<small>${esc(when)}</small>`:''}</span></div>
          <div class="contract-sig-row"><span class="csr-label">Reason</span><span class="csr-done">${esc(cancelReasonLabel(m.cancelReason))}</span></div>
          ${m.cancelNote?`<div class="contract-sig-row"><span class="csr-label">Note</span><span class="csr-done">${esc(m.cancelNote)}</span></div>`:''}
        </div>
        <p style="font-size:.85rem;color:var(--muted);margin-top:14px">Work properly done before cancellation must still be paid for. See the <a href="cancellation.html" target="_blank" rel="noopener">Cancellation Policy</a>.</p>
        <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="closeModal()">Close</button>
      </div>`;
    showOverlay();
  };

  window.dashTogglePaid = function(projectId, studentUid, paid){ const uid=_uid(); window.firebaseDB.setMemberPaid(uid,projectId,studentUid, paid===true||paid==='true').then(ok=>{ if(ok){ PROJECT_MEMBERS[projectId]=null; ensureProjectMembers(projectId,()=>paintMain()); } }); };
  window.dashPayAll = function(projectId){ const uid=_uid(); const list=(PROJECT_MEMBERS[projectId]||[]).filter(m=>m.inviteStatus==='accepted'&&m.memberState==='onboarded'&&!m.paid); if(!list.length) return; Promise.all(list.map(m=>window.firebaseDB.setMemberPaid(uid,projectId,m.studentUid,true))).then(()=>{ PROJECT_MEMBERS[projectId]=null; ensureProjectMembers(projectId,()=>paintMain()); toast('Marked as paid','Real payment integration is coming soon.'); }); };
  window.dashRemoveMember = function(projectId, studentUid){ const uid=_uid(); window.firebaseDB.removeMember(uid,projectId,studentUid).then(ok=>{ if(ok){ PROJECT_MEMBERS[projectId]=null; ensureProjectMembers(projectId,()=>paintMain()); } }); };
  // Review a talent you've PAID (the only place reviews can be started).
  window.dashReviewMember = function(projectId, studentUid){
    const m=(PROJECT_MEMBERS[projectId]||[]).find(x=>x.studentUid===studentUid);
    if(!m || !m.paid){ dashToast('Not yet','You can review talent once they\'re marked paid.'); return; }
    if(typeof openReviewModal==='function') openReviewModal(m.studentUid, m.studentName);
    else dashToast('Unavailable','Please refresh and try again.');
  };
  window.dashNewProject = function(){
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `<div class="modal-head"><div><h3 style="font-size:1.2rem">New project</h3></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="form-field"><label for="npTitle">Project title</label><input id="npTitle" type="text" placeholder="e.g. Mobile app redesign" maxlength="140"></div>
        <div class="form-field" style="margin-top:14px"><label for="npDesc">Description</label><textarea id="npDesc" rows="4" placeholder="What's the project about? What will the students work on?" maxlength="3000"></textarea></div>
        <div class="auth-error" id="npErr"></div>
        <button class="btn btn-primary btn-block btn-lg" id="npBtn" onclick="dashCreateProject()">Create project</button>
      </div>`;
    showOverlay(); setTimeout(()=>{const e=document.getElementById('npTitle');if(e)e.focus();},80);
  };
  window.dashCreateProject = function(){
    const t=(document.getElementById('npTitle')||{}).value||''; const d=(document.getElementById('npDesc')||{}).value||'';
    if(!t.trim()){ const e=document.getElementById('npErr'); if(e){e.textContent='Please add a project title.';e.style.display='block';} return; }
    const uid=_uid(); const btn=document.getElementById('npBtn'); if(btn){btn.disabled=true;btn.textContent='Creating…';}
    window.firebaseDB.createProject(uid,(DASH&&DASH.name)||'Client',{title:t.trim(),description:d.trim()}).then(id=>{
      closeModal();
      if(id){ PROJECTS=null; _activeProject=id; ensureProjectMembers(id); setView('projectdetail'); ensureProjects(()=>paintMain()); toast('Project created','Now invite students to it.'); }
      else toast('Couldn\'t create project','Please try again.');
    });
  };
  window.dashConfirmDeleteProject = function(id){
    const p=(PROJECTS||[]).find(x=>x.id===id);
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `<div class="modal-head"><div><h3 style="font-size:1.2rem">Delete project?</h3></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body"><p style="color:var(--ink-soft)">Deleting <strong>${esc(p?p.title:'this project')}</strong> erases all of its data - invited students, meetings and payment status. This can't be undone.</p>
        <button class="btn btn-danger btn-block btn-lg" style="margin-top:16px" onclick="dashDeleteProject('${id}')">Yes, delete project</button>
        <button class="btn btn-outline btn-block" style="margin-top:10px" onclick="closeModal()">Cancel</button>
      </div>`;
    showOverlay();
  };
  window.dashDeleteProject = function(id){ const uid=_uid(); window.firebaseDB.deleteProject(uid,id).then(ok=>{ closeModal(); if(ok){ PROJECTS=null; delete PROJECT_MEMBERS[id]; setView('projects'); ensureProjects(()=>paintMain()); toast('Project deleted','All its data has been removed.'); } else toast('Couldn\'t delete','Please try again.'); }); };
  window.dashConfirmCloseProject = function(id){
    const p=(PROJECTS||[]).find(x=>x.id===id);
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `<div class="modal-head"><div><h3 style="font-size:1.2rem">Close &amp; archive project?</h3></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body"><p style="color:var(--ink-soft)">Closing <strong>${esc(p?p.title:'this project')}</strong> removes all invited talent from it and moves it to your archives. A receipt of who was on the project - including each person's onboarded date - is kept. You can reopen or delete it later.</p>
        <button class="btn btn-primary btn-block btn-lg" style="margin-top:16px" onclick="dashCloseProject('${id}')">${I.archive} Close &amp; archive</button>
        <button class="btn btn-outline btn-block" style="margin-top:10px" onclick="closeModal()">Cancel</button>
      </div>`;
    showOverlay();
  };
  window.dashCloseProject = function(id){ const uid=_uid(); window.firebaseDB.closeProject(uid,id).then(ok=>{ closeModal(); if(ok){ PROJECTS=null; delete PROJECT_MEMBERS[id]; ensureProjects(()=>paintMain()); toast('Project archived','Talent removed; a receipt was saved to your archives.'); } else toast('Couldn\'t close','Please try again.'); }); };
  window.dashReopenProject = function(id){ const uid=_uid(); window.firebaseDB.reopenProject(uid,id).then(ok=>{ if(ok){ PROJECTS=null; PROJECT_MEMBERS[id]=null; ensureProjects(()=>paintMain()); toast('Project reopened','It\'s ongoing again - you can invite talent freshly.'); } else toast('Couldn\'t reopen','Please try again.'); }); };
  window.dashOpenInvite = function(projectId){
    const proj=(PROJECTS||[]).find(p=>p.id===projectId);
    if(proj && proj.status==='archived'){ toast('Project archived','Reopen this project to invite talent again.'); return; }
    // Already-invited talent can't be re-invited - UNLESS the project is complete
    // (a fresh round) or was closed+reopened (members were cleared on close).
    const allowReinvite = proj && proj.status==='complete';
    const pool = (typeof TALENT!=='undefined' && TALENT) ? TALENT : [];
    const already = {}; if(!allowReinvite){ (PROJECT_MEMBERS[projectId]||[]).forEach(m=>{ already[m.studentUid]=true; }); }
    const rows = pool.filter(t=>!already[t.id]).map(t=>`<div class="inv-row">
        <div class="inv-row-ava">${t.avatar?`<img src="${esc(t.avatar)}" alt="">`:`<span>${esc(t.initials||_initialsOf(t.name))}</span>`}</div>
        <div class="inv-row-main"><div class="inv-row-name">${esc(t.name)}${t.username?` <span class="uname-pill">@${esc(t.username)}</span>`:''}</div><div class="inv-row-sub">${esc(t.uni||fieldName(t.cat)||'ICT talent')}</div></div>
        <button class="btn btn-primary btn-sm" onclick="dashInviteStudent('${projectId}','${t.id}')">Invite</button>
      </div>`).join('');
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `<div class="modal-head"><div><h3 style="font-size:1.2rem">Invite students</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">Pick talent to invite to this project.</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <input type="text" class="inv-search" id="invSearch" placeholder="Search by name, @username or skill…" oninput="dashFilterInvite(this.value)">
        <div class="inv-list" id="invList">${rows||'<div class="dash-muted" style="padding:22px;text-align:center">No talent available to invite yet. Talent appears here as students join Workley.</div>'}</div>
      </div>`;
    showOverlay();
  };
  window.dashFilterInvite = function(q){ q=(q||'').toLowerCase(); document.querySelectorAll('#invList .inv-row').forEach(r=>{ r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none'; }); };
  window.dashInviteStudent = function(projectId, studentUid){
    const proj=(PROJECTS||[]).find(p=>p.id===projectId);
    // Block a duplicate invite while the project is ongoing (re-invite is only
    // allowed once it's complete, or after a close+reopen clears the members).
    if(proj && proj.status!=='complete'){
      const existing=(PROJECT_MEMBERS[projectId]||[]).find(x=>x.studentUid===studentUid);
      if(existing){ toast('Already invited', (existing.studentName||'This student')+' is already on this project.'); return; }
    }
    const t=(typeof getTalentById==='function')?getTalentById(studentUid):null;
    const student={ uid:studentUid, name:(t&&t.name)||'Student', field:(t&&t.cat)||'', status:(t&&t.grad)||'', avatar:(t&&t.avatar)||'' };
    const uid=_uid();
    window.firebaseDB.inviteToProject(uid, projectId, proj, student).then(ok=>{ if(ok){ PROJECT_MEMBERS[projectId]=null; ensureProjectMembers(projectId,()=>paintMain()); toast('Invitation sent',(student.name||'The student')+' has been invited.'); closeModal(); } else toast('Couldn\'t invite','Please try again.'); });
  };
  window.dashScheduleMeeting = function(projectId, studentUid){
    const m=(PROJECT_MEMBERS[projectId]||[]).find(x=>x.studentUid===studentUid);
    const curAt = (m&&m.meetingAt) ? _toLocalInput(m.meetingAt) : '';
    const curLink = (m&&m.meetingLink) ? m.meetingLink : '';
    const curPlat = (m&&m.meetingPlatform) ? m.meetingPlatform : '';
    const plats=['Google Meet','Zoom','Microsoft Teams','Skype','Other'];
    const platOpts = '<option value="">Select a platform…</option>'+plats.map(pl=>`<option value="${esc(pl)}"${curPlat===pl?' selected':''}>${esc(pl)}</option>`).join('');
    const editing = !!(curAt||curLink||curPlat);
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `<div class="modal-head"><div><h3 style="font-size:1.2rem">${editing?'Edit meeting':'Schedule a meeting'}</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">with ${esc(m?m.studentName:'this student')}</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <div class="form-field"><label for="mtAt">Date &amp; time</label><input id="mtAt" type="datetime-local" value="${esc(curAt)}"></div>
        <div class="form-field" style="margin-top:14px"><label for="mtPlat">Platform</label><select id="mtPlat">${platOpts}</select></div>
        <div class="form-field" style="margin-top:14px"><label for="mtLink">Meeting link <span style="font-weight:400;color:var(--muted);font-size:.78rem">(the join URL)</span></label><input id="mtLink" type="url" placeholder="https://meet.google.com/…" value="${esc(curLink)}"></div>
        <button class="btn btn-primary btn-block btn-lg" style="margin-top:16px" onclick="dashSaveMeeting('${projectId}','${studentUid}')">${editing?'Save changes':'Save meeting'}</button>
        ${editing?`<button class="btn btn-outline btn-block" style="margin-top:10px" onclick="dashClearMeeting('${projectId}','${studentUid}')">Cancel meeting</button>`:''}
      </div>`;
    showOverlay();
    setTimeout(()=>{ const i=document.getElementById('mtAt'); if(i) i.focus(); },120);
  };
  window.dashSaveMeeting = function(projectId, studentUid){
    const at=(document.getElementById('mtAt')||{}).value||'';
    const link=(document.getElementById('mtLink')||{}).value||'';
    const platform=(document.getElementById('mtPlat')||{}).value||'';
    if(!at){ toast('Pick a date','Choose a date and time for the meeting.'); return; }
    const uid=_uid();
    window.firebaseDB.setMemberMeeting(uid,projectId,studentUid,{at:at||null,link,platform}).then(ok=>{ closeModal(); if(ok){ PROJECT_MEMBERS[projectId]=null; ensureProjectMembers(projectId,()=>paintMain()); toast('Meeting saved','The talent has been notified and can see it in their Meetings.'); } else toast('Couldn\'t save','Please try again.'); });
  };
  window.dashClearMeeting = function(projectId, studentUid){ const uid=_uid(); window.firebaseDB.setMemberMeeting(uid,projectId,studentUid,{at:null,link:''}).then(ok=>{ closeModal(); if(ok){ PROJECT_MEMBERS[projectId]=null; ensureProjectMembers(projectId,()=>paintMain()); } }); };
  window.dashRespondInvite = function(i, accept){
    const m=(MY_INVITES||[])[i]; if(!m) return;
    let phone=''; try{ phone=localStorage.getItem('workley_signup_phone_'+(((window.firebaseUser&&window.firebaseUser.email)||'').toLowerCase()))||''; }catch(e){}
    const contact={ email:(window.firebaseUser&&window.firebaseUser.email)||'', phone };
    window.firebaseDB.respondToInvite(m, accept, contact).then(ok=>{ if(ok){ MY_INVITES=null; ensureInvites(()=>paintMain()); toast(accept?'Invitation accepted':'Invitation declined', accept?'The client can now see your contact and message you.':''); } else toast('Couldn\'t respond','Please try again.'); });
  };

  // Subtle account/danger zone, pinned to the bottom of the overview only so
  // it isn't constantly in users' faces. Deletion runs through app.js's
  // confirmDeleteAccount() (identity re-auth required before the account goes).
  function dangerZoneHtml(){
    return `
      <section class="dash-danger" data-reveal>
        <div class="dash-danger-info">
          <h3>${I.trash||''} Delete account</h3>
          <p>Permanently delete your Workley account and remove your profile from the platform. You'll be asked to confirm your identity first. This can't be undone.</p>
        </div>
        <button class="dash-danger-btn" onclick="confirmDeleteAccount()">Delete account</button>
      </section>`;
  }

  function paintMain(){
    const c = document.getElementById('dashContent');
    const titleEl = document.getElementById('dashViewTitle');
    if(!c) return;
    const titles = { overview:'Dashboard', findwork:'Find work', proposals:'My proposals',
      talent:'Find talent', jobs:'My jobs', messages:'Chats', projects:'Projects', projectdetail:'Project', invites:'Invitations',
      meetings:'Meetings',
      'analytics-views':'Profile views', 'analytics-earnings':'Earnings', 'analytics-proposals':'Application pipeline',
      'jobapplicants':'Applicants', 'clientproposals':'Proposals received' };
    if(titleEl) titleEl.textContent = titles[VIEW]||'Dashboard';

    let html;
    if(VIEW==='analytics-views')          html = analyticsViews();
    else if(VIEW==='analytics-earnings')  html = analyticsEarnings();
    else if(VIEW==='analytics-proposals') html = analyticsProposals();
    else if(DASH.role==='client'){
      if(VIEW==='talent')           html = viewFindTalent();
      else if(VIEW==='jobs')        html = viewMyJobs();
      else if(VIEW==='jobapplicants')html = viewJobApplicants();
      else if(VIEW==='clientproposals')html = viewClientProposals();
      else if(VIEW==='projects')    html = viewProjects();
      else if(VIEW==='projectdetail')html = viewProjectDetail(_activeProject);
      else if(VIEW==='meetings')    html = viewMeetings('client');
      else if(VIEW==='messages')    html = viewMessages('client');
      else                          html = clientOverview();
    } else {
      if(VIEW==='findwork')    html = viewFindWork();
      else if(VIEW==='proposals')html = viewProposals();
      else if(VIEW==='invites') html = viewInvites();
      else if(VIEW==='meetings')html = viewMeetings('talent');
      else if(VIEW==='messages')html = viewMessages('talent');
      else                     html = talentOverview();
    }
    c.innerHTML = html + (VIEW==='overview' ? dangerZoneHtml() : '');
    if(_animateNext){ runReveal(c); _animateNext=false; }
    else { c.querySelectorAll('.dash-ring-prog').forEach(ci=>{ const off=ci.getAttribute('data-off'); if(off!=null) ci.style.strokeDashoffset=off; }); }
    initCharts(c);
    refreshNotifs();
    if(VIEW==='messages') afterMessagesPaint();

    // ── Lazy-load real data the active view needs, then repaint once ──
    const repaint = ()=>{ paintMain(); };
    if(DASH.role==='talent'){
      if((VIEW==='overview' || VIEW==='analytics-views') && !ANALYTICS.loaded) ensureViewAnalytics(repaint);
      if(VIEW==='overview' || VIEW==='findwork') ensureJobs(repaint);
      if(VIEW==='overview' || VIEW==='proposals' || VIEW==='analytics-proposals') ensureMyProposals(repaint);
      if(VIEW==='proposals'){ ensureMyReviews(repaint); }
      // Invites power both the Invitations view AND the overview's invitation notification.
      if(VIEW==='overview' || VIEW==='invites' || VIEW==='proposals' || VIEW==='analytics-views' || VIEW==='meetings') ensureInvites(repaint);
    } else { // client
      if(VIEW==='overview' || VIEW==='jobs' || VIEW==='jobapplicants') ensureMyJobs(repaint);
      if(VIEW==='overview' || VIEW==='jobs' || VIEW==='jobapplicants' || VIEW==='clientproposals') ensureClientProps(repaint);
      if(VIEW==='projects' || VIEW==='projectdetail') ensureProjects(repaint);
      // Prefetch every project's members while the list is on screen, so opening
      // any project is instant (not a fresh fetch on first open). ensureProjectMembers
      // de-dupes, so this is cheap and runs at most once per project.
      if(VIEW==='projects' && PROJECTS){ PROJECTS.forEach(p=>ensureProjectMembers(p.id)); }
      if(VIEW==='projectdetail' && _activeProject) ensureProjectMembers(_activeProject, repaint);
      // Meetings view aggregates members across every project.
      if(VIEW==='meetings'){ ensureProjects(()=>{ if(PROJECTS) PROJECTS.forEach(p=>ensureProjectMembers(p.id, repaint)); }); }
    }
    if(DASH.role==='talent' && VIEW==='invites') ensureInvites(repaint);
  }
  // Repaint when the shared talent cache finishes loading (real recommendations).
  document.addEventListener('workley:talentLoaded', ()=>{ if(DASH){ paintMain(); refreshNotifs(); } });

  // ─── Reveal animation (staggered fade-up) ───
  function runReveal(scope){
    if(reduceMotion()) return;
    const els = scope.querySelectorAll('[data-reveal]');
    els.forEach((el,i)=>{ el.style.animationDelay=(Math.min(i,12)*55)+'ms'; el.classList.add('dash-reveal'); });
    // Animate chart bars + rings after paint
    requestAnimationFrame(()=>{
      scope.querySelectorAll('.dash-ring-prog').forEach(c=>{
        const off=c.getAttribute('data-off'); if(off!=null) c.style.strokeDashoffset=off;
      });
    });
  }

  // ════════════════════════ PROFILE STRENGTH ════════════════════════
  function profileStrength(){
    const p=DASH.p; const items=[];
    if(DASH.role==='client'){
      items.push(['About / description', !!(p.description&&p.description.trim())]);
      items.push(['Hiring interests', !!(p.needs&&p.needs.length)]);
      items.push(['Organisation name', !!(p.orgName&&p.orgName.trim())]);
      items.push(['Industry', !!(p.industry&&p.industry.trim())]);
      items.push(['Location', !!(p.location&&p.location.trim())]);
      items.push(['Hiring timeline', !!p.timing]);
      items.push(['Profile photo', !!(p.avatar)]);  // the photo clients actually see, not the Google auth photoURL
    } else {
      items.push(['Short bio', !!(p.bio&&p.bio.trim())]);
      items.push(['3+ skills', !!(p.skills&&p.skills.length>=3)]);
      items.push(['Education', !!(p.university&&p.university.trim())]);
      items.push(['Title & rate', !!(p.title&&p.rate)]);
      items.push(['Soft skills', !!(p.softSkills&&p.softSkills.length>=3)]);
      items.push(['Hobbies & interests', !!(p.hobbies&&p.hobbies.trim())]);
      items.push(['Profile photo', !!(p.avatar)]);  // the photo clients actually see, not the Google auth photoURL
    }
    const done = items.filter(i=>i[1]).length;
    const pct = Math.round((done/items.length)*100);
    return { pct, items, done, total:items.length };
  }

  // SVG donut ring; animates from empty to pct after mount.
  function ring(pct, size, label){
    size = size||120; const r=(size/2)-9; const C=2*Math.PI*r;
    const off = C*(1-pct/100);
    return `<div class="dash-ring" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--blue-50)" stroke-width="9"/>
        <circle class="dash-ring-prog" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--blue)" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${reduceMotion()?off.toFixed(1):C.toFixed(1)}" data-off="${off.toFixed(1)}"
          transform="rotate(-90 ${size/2} ${size/2})"/>
      </svg>
      <div class="dash-ring-c"><strong>${pct}%</strong>${label?`<span>${esc(label)}</span>`:''}</div>
    </div>`;
  }

  // Animated bar chart. values:[{label,value}], money flag for tooltip.
  function barChart(values, opts){
    opts=opts||{}; const max=Math.max(1,...values.map(v=>v.value));
    return `<div class="dash-chart" role="img" aria-label="${esc(opts.aria||'Bar chart')}">
      ${values.map((v,i)=>{
        const h=Math.max(4,Math.round((v.value/max)*100));
        const val = opts.money?money(v.value):v.value;
        return `<div class="dash-chart-col">
          <div class="dash-chart-track"><div class="dash-bar ${v.hi?'hi':''}" style="height:${h}%;animation-delay:${i*60}ms" title="${esc(v.label)}: ${esc(val)}"></div></div>
          <span class="dash-chart-x">${esc(v.label)}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ════════════════════════ KPI CARD ════════════════════════
  // opts: { trend, tone, view (clickable → analytics view), badge }
  function kpi(icon, value, label, opts){
    opts = opts || {};
    const trend = opts.trend;
    const corner = (trend!=null)
      ? `<span class="dash-kpi-trend ${trend>=0?'up':'down'}">${I.arrowUp}${Math.abs(trend)}%</span>`
      : (opts.badge ? `<span class="dash-kpi-badge">${esc(opts.badge)}</span>` : '');
    const isLink = !!opts.view;
    const tag = isLink ? 'button' : 'div';
    const act = isLink ? `onclick="dashSetView('${opts.view}')" aria-label="${esc(label)} - view details"` : '';
    return `<${tag} class="dash-kpi ${opts.tone||''} ${isLink?'is-link':''}" ${act} data-reveal>
      <div class="dash-kpi-top"><span class="dash-kpi-ic">${icon}</span>${corner}</div>
      <div class="dash-kpi-val">${esc(value)}</div>
      <div class="dash-kpi-lbl">${esc(label)}${isLink?' <span class="dash-kpi-arrow">→</span>':''}</div>
    </${tag}>`;
  }

  function sectionHead(title, sub, actionLabel, actionView){
    return `<div class="dash-sec-head">
      <div><h2>${esc(title)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div>
      ${actionLabel?`<button class="dash-link" onclick="dashSetView('${actionView}')">${esc(actionLabel)} →</button>`:''}
    </div>`;
  }

  // ════════════════════════ NOTIFICATIONS (real) ════════════════════════
  // Builds a list of notification objects from real loaded data caches.
  // Each item: { icon, title, body, ts (ms, 0 = static/no timestamp) }
  function buildNotifications(){
    if(!DASH) return [];
    const isClient = DASH.role==='client';
    const me = _uid();
    const items = [];

    // New messages (real, from the live conversation list) - both roles.
    if(CONVOS && CONVOS.length){
      const unreadCv = CONVOS.filter(c=> c.lastSender && c.lastSender!==me && Number(c.unread&&c.unread[me])>0)
        .sort((a,b)=> ((b.lastAt?b.lastAt.getTime():0) - (a.lastAt?a.lastAt.getTime():0)));
      if(unreadCv.length===1){
        const c=unreadCv[0], other=otherOf(c);
        const ts = c.lastAt && c.lastAt.getTime()>0 ? c.lastAt.getTime() : 0;
        items.push({ icon:I.chat, title:'New message', body:(other?other.name:'Someone')+': '+(c.lastText||'sent you a message'), ts, cid:c.id });
      } else if(unreadCv.length>1){
        const ts = unreadCv[0].lastAt && unreadCv[0].lastAt.getTime()>0 ? unreadCv[0].lastAt.getTime() : 0;
        items.push({ icon:I.chat, title:unreadCv.length+' new messages', body:'You have new messages across '+unreadCv.length+' chats.', ts, view:'messages' });
      }
    }

    if(isClient){
      // New applications to review - aggregated into one notification.
      if(CLIENT_PROPS && CLIENT_PROPS.length){
        const fresh = CLIENT_PROPS.filter(p=>p.status==='submitted').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
        if(fresh.length===1){
          const p=fresh[0]; const ts = p.createdAt instanceof Date ? p.createdAt.getTime() : 0;
          items.push({ icon:I.doc, title:'New application received', body:(p.talentName||'A candidate')+' applied to "'+(p.jobTitle||'your job')+'"', ts, view:'clientproposals' });
        } else if(fresh.length>1){
          const ts = fresh[0].createdAt instanceof Date ? fresh[0].createdAt.getTime() : 0;
          items.push({ icon:I.doc, title:fresh.length+' new applications', body:fresh.length+' applications are waiting for your review.', ts, view:'clientproposals' });
        }
      }
      // Open job posts - aggregated.
      if(MY_JOBS && MY_JOBS.length){
        const open = MY_JOBS.filter(j=>j.status==='open').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
        if(open.length===1){
          const j=open[0]; const ts = j.createdAt instanceof Date ? j.createdAt.getTime() : 0;
          items.push({ icon:I.briefcase, title:'Job post is live', body:'"'+(j.title||'Job')+'" is accepting applications', ts, view:'jobs' });
        } else if(open.length>1){
          const ts = open[0].createdAt instanceof Date ? open[0].createdAt.getTime() : 0;
          items.push({ icon:I.briefcase, title:open.length+' job posts are live', body:open.length+' of your jobs are accepting applications.', ts, view:'jobs' });
        }
      }
      // Profile strength nudge if < 60%
      const ps = profileStrength();
      if(ps.pct < 60){
        const missing = ps.items.filter(i=>!i[1]).map(i=>i[0]).slice(0,2).join(', ');
        items.push({ icon:I.rocket, title:'Complete your profile', body:'Build trust with talent. Still missing: '+missing+'.', ts:0, href:'profile.html' });
      }
      // A talent cancelled an engagement (best-effort: scans the project members
      // already loaded this session; the project card itself always shows it).
      const cxl=[];
      Object.keys(PROJECT_MEMBERS||{}).forEach(pid=>{ (PROJECT_MEMBERS[pid]||[]).forEach(m=>{ if(m.memberState==='cancelled' && m.cancelledBy==='talent') cxl.push(m); }); });
      if(cxl.length){
        cxl.sort((a,b)=>{ const ta=a.cancelledAt, tb=b.cancelledAt; return (tb instanceof Date?tb.getTime():0)-(ta instanceof Date?ta.getTime():0); });
        const ts=(cxl[0].cancelledAt instanceof Date)?cxl[0].cancelledAt.getTime():Date.now();
        items.push({ icon:I.x, title: cxl.length===1?'Engagement cancelled':cxl.length+' engagements cancelled',
          body: cxl.length===1 ? ((cxl[0].studentName||'A talent')+' cancelled "'+(cxl[0].jobTitle||cxl[0].projectTitle||'an engagement')+'". Work already done must still be settled.') : (cxl.length+' talent cancelled engagements. Open Projects for details.'),
          ts, view:'projects' });
      }
      // No jobs yet - post nudge
      if(MY_JOBS && MY_JOBS.length===0){
        items.push({ icon:I.plus, title:'Post your first job', body:'Post a job to start receiving applications from verified ICT talent.', ts:0, act:'openJob()' });
      } else if(!MY_JOBS){
        items.push({ icon:I.rocket, title:'Welcome to Workley', body:'Post jobs, review proposals and hire verified ICT talent here.', ts:0 });
      }
    } else {
      // Profile views - ALL aggregated into one notification (not one per view).
      if(ANALYTICS.loaded && ANALYTICS.raw.length){
        const n = ANALYTICS.raw.length;
        const ts = ANALYTICS.raw.reduce((mx,v)=>Math.max(mx, v.at instanceof Date ? v.at.getTime() : 0), 0);
        items.push({ icon:I.eye, title:'Your profile was viewed',
          body: n===1 ? 'Someone viewed your profile.' : (n+' people have viewed your profile.'),
          ts, view:'analytics-views' });
      }
      // Pending project invitations → tap goes to the Invitations section.
      if(MY_INVITES && MY_INVITES.length){
        const pending = MY_INVITES.filter(m=>m.inviteStatus==='pending');
        if(pending.length){
          const ts = (pending[0].invitedAt instanceof Date) ? pending[0].invitedAt.getTime() : Date.now();
          items.push({ icon:I.handshake, title:pending.length+' new invitation'+(pending.length===1?'':'s'),
            body:'A client invited you to a project. Tap to review and respond.', ts, view:'invites' });
        }
      }
      // Service Agreement waiting for the talent's signature (client has signed).
      if(MY_INVITES && MY_INVITES.length){
        const toSign = MY_INVITES.filter(m=>m.inviteStatus==='accepted' && m.memberState!=='onboarded' && m.memberState!=='cancelled' && m.clientSignedAt && !m.talentSignedAt)
          .sort((a,b)=>{ const ta=a.clientSignedAt, tb=b.clientSignedAt; return (tb instanceof Date?tb.getTime():0)-(ta instanceof Date?ta.getTime():0); });
        if(toSign.length){
          const ts = (toSign[0].clientSignedAt instanceof Date) ? toSign[0].clientSignedAt.getTime() : Date.now();
          items.push({ icon:I.check, title:'Sign your Service Agreement',
            body:(toSign.length===1?((toSign[0].clientName||'A client')+' has signed. Counter-sign to be onboarded.'):(toSign.length+' agreements are waiting for your signature.')), ts, view:'invites' });
        }
      }
      // A client cancelled an engagement with you.
      if(MY_INVITES && MY_INVITES.length){
        const cxl = MY_INVITES.filter(m=>m.memberState==='cancelled' && m.cancelledBy==='client')
          .sort((a,b)=>{ const ta=a.cancelledAt, tb=b.cancelledAt; return (tb instanceof Date?tb.getTime():0)-(ta instanceof Date?ta.getTime():0); });
        if(cxl.length){
          const ts=(cxl[0].cancelledAt instanceof Date)?cxl[0].cancelledAt.getTime():Date.now();
          items.push({ icon:I.x, title: cxl.length===1?'Engagement cancelled':cxl.length+' engagements cancelled',
            body: cxl.length===1 ? ((cxl[0].clientName||'A client')+' cancelled "'+(cxl[0].jobTitle||cxl[0].projectTitle||'an engagement')+'". Work you\'ve already done must still be paid for.') : ('Clients cancelled '+cxl.length+' engagements. See your Jobs section for details.'),
            ts, view:'proposals' });
        }
      }
      // Meetings a client has scheduled / updated (talent-facing). meetingUpdatedAt
      // bumps on every edit, so an edited meeting re-surfaces as unseen.
      if(MY_INVITES && MY_INVITES.length){
        const mtgs = MY_INVITES.filter(m=>m.meetingAt)
          .sort((a,b)=>{ const ta=(a.meetingUpdatedAt||a.meetingAt), tb=(b.meetingUpdatedAt||b.meetingAt); return (tb instanceof Date?tb.getTime():0)-(ta instanceof Date?ta.getTime():0); });
        if(mtgs.length===1){
          const m=mtgs[0]; const tD=(m.meetingUpdatedAt||m.meetingAt); const ts=tD instanceof Date?tD.getTime():0;
          const when=m.meetingAt.toLocaleString('en-ZA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
          items.push({ icon:I.video, title:'Meeting scheduled', body:(m.clientName||'A client')+' set a meeting for '+when+'. Tap to view the details.', ts, view:'meetings' });
        } else if(mtgs.length>1){
          const tD=(mtgs[0].meetingUpdatedAt||mtgs[0].meetingAt); const ts=tD instanceof Date?tD.getTime():0;
          items.push({ icon:I.video, title:mtgs.length+' meetings scheduled', body:'You have '+mtgs.length+' meetings with clients. Tap to view them.', ts, view:'meetings' });
        }
      }
      // Application updates - one specific message if a single update, else aggregated.
      if(MY_PROPOSALS && MY_PROPOSALS.length){
        const updated = MY_PROPOSALS.filter(p=>p.status!=='submitted')
          .sort((a,b)=>{ const ta=(a.respondedAt||a.createdAt), tb=(b.respondedAt||b.createdAt); return (tb instanceof Date?tb.getTime():0)-(ta instanceof Date?ta.getTime():0); });
        if(updated.length===1){
          const p=updated[0]; const tD=(p.respondedAt instanceof Date)?p.respondedAt:p.createdAt; const ts=tD instanceof Date?tD.getTime():0;
          let title='Application update', body, icon=I.briefcase;
          if(p.status==='accepted'){ title='You got the job! 🎉'; icon=I.check; body='You\'ve been accepted for "'+(p.jobTitle||'a job')+'". See the details in your Jobs section.'; }
          else if(p.status==='declined'){ body='The client went with someone else for "'+(p.jobTitle||'a job')+'" this time. Keep applying - the right match is on its way.'; }
          else { const sl={viewed:'is reviewing',interview:'invited you to interview for',offer:'made you an offer on'}[p.status]||'updated'; body='A client '+sl+' "'+(p.jobTitle||'a job')+'".'; }
          items.push({ icon, title, body, ts, view:'proposals' });
        } else if(updated.length>1){
          const accepted=updated.filter(p=>p.status==='accepted').length;
          const tD=(updated[0].respondedAt||updated[0].createdAt); const ts=tD instanceof Date?tD.getTime():0;
          const body = accepted>0 ? (accepted+' of your applications '+(accepted===1?'was':'were')+' accepted - check your Jobs section.') : (updated.length+' of your applications have updates.');
          items.push({ icon: accepted>0?I.check:I.briefcase, title:updated.length+' application updates', body, ts, view:'proposals' });
        }
      }
      // New job matches - aggregated into one notification.
      if(JOBS && JOBS.length){
        const field = DASH.p && DASH.p.field;
        const matches = JOBS.filter(j=>j.field===field && j.status==='open').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
        if(matches.length===1){
          const j=matches[0]; const ts = j.createdAt instanceof Date ? j.createdAt.getTime() : 0;
          items.push({ icon:I.target, title:'New job match', body:'"'+(j.title||'Job')+'" matches your skills', ts, view:'findwork' });
        } else if(matches.length>1){
          const ts = matches[0].createdAt instanceof Date ? matches[0].createdAt.getTime() : 0;
          items.push({ icon:I.target, title:matches.length+' new job matches', body:matches.length+' open jobs match your skills.', ts, view:'findwork' });
        }
      }
      // Profile strength nudge if < 70%
      const ps = profileStrength();
      if(ps.pct < 70){
        const missing = ps.items.filter(i=>!i[1]).map(i=>i[0]).slice(0,2).join(', ');
        items.push({ icon:I.rocket, title:'Complete your profile', body:'Add '+missing+' to rank higher in client searches.', ts:0, href:'profile.html' });
      }
    }

    // Sort: newest timestamp first, then static (ts=0) at end
    items.sort((a,b)=> b.ts - a.ts);
    return items.slice(0,6);
  }

  function renderNotifications(){
    _loadNotifSeen();
    const items = buildNotifications();
    if(!items.length){
      return `<div class="dash-notif-head">Notifications</div><div class="dash-notif-empty">No notifications yet - they'll appear as activity picks up.</div>`;
    }
    return `<div class="dash-notif-head">Notifications</div>${items.map(n=>{
      const unseen = n.ts > _notifSeen;
      // Every notification routes somewhere: a conversation, a dashboard view,
      // another page, or a custom action.
      const click = n.cid ? `dashOpenNotifConvo('${n.cid}')`
                  : n.view ? `dashNotifGo('${n.view}')`
                  : n.href ? `dashNotifHref('${n.href}')`
                  : n.act  ? n.act
                  : '';
      const tag = click ? 'button' : 'div';
      const act = click ? ` onclick="${click}"` : '';
      return `<${tag} class="dash-notif-item${unseen?' unread':''}${click?' is-link':''}"${act}>
        <span class="dash-notif-ic">${n.icon}</span>
        <div><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p>${n.ts?`<time>${timeAgo(new Date(n.ts))}</time>`:''}</div>
      </${tag}>`;
    }).join('')}`;
  }
  // Open a conversation straight from a notification (and close the dropdown).
  window.dashOpenNotifConvo = function(cid){
    const notif=document.getElementById('dashNotif'); if(notif) notif.hidden=true;
    window.dashSelectConvo(cid);
  };
  // Jump to a dashboard view from a notification.
  window.dashNotifGo = function(view){
    const notif=document.getElementById('dashNotif'); if(notif) notif.hidden=true;
    if(view && window.dashSetView) window.dashSetView(view);
  };
  // Navigate to another page from a notification (e.g. profile).
  window.dashNotifHref = function(href){
    const notif=document.getElementById('dashNotif'); if(notif) notif.hidden=true;
    if(href) location.href=href;
  };

  // Re-renders the notification panel (called after each data load) and updates the bell dot.
  function refreshNotifs(){
    if(!DASH) return;
    const notif = document.getElementById('dashNotif'); if(!notif) return;
    if(!notif.hidden) return; // panel open - leave it alone; bell-click handler updates it
    notif.innerHTML = renderNotifications();
    // Show/hide the unread dot based on whether any notification is newer than last seen
    _loadNotifSeen();
    const items = buildNotifications();
    const hasUnread = items.some(n=>n.ts > _notifSeen);
    const dot = document.getElementById('dashBellDot'); if(dot) dot.hidden = !hasUnread;
  }

  // ════════════════════════════════════════════════════════════════════
  //  ANALYTICS - real profile-view data + interactive charts + insights
  // ════════════════════════════════════════════════════════════════════
  const ANALYTICS = { loaded:false, loading:false, raw:[] };
  const RANGES = {
    '7d':  { label:'7 days',   buckets:7,  unit:'day'   },
    '30d': { label:'30 days',  buckets:30, unit:'day'   },
    '12w': { label:'3 months', buckets:12, unit:'week'  },
    '12m': { label:'12 months',buckets:12, unit:'month' }
  };
  let VIEWS_RANGE = '30d';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Load the signed-in user's real profile-view events once.
  function ensureViewAnalytics(done){
    if(ANALYTICS.loaded){ done && done(); return; }
    if(ANALYTICS.loading){ return; }
    ANALYTICS.loading = true;
    const uid = (window.firebaseUser && window.firebaseUser.uid) || (DASH && DASH.u && DASH.u.uid) || null;
    const since = new Date(Date.now() - 400*864e5);
    const job = (window.firebaseDB && uid) ? window.firebaseDB.getProfileViews(uid, since) : Promise.resolve([]);
    job.then(rows=>{ ANALYTICS.raw = rows || []; })
       .catch(()=>{ ANALYTICS.raw = []; })
       .then(()=>{ ANALYTICS.loaded = true; ANALYTICS.loading = false; done && done(); refreshNotifs(); });
  }

  // Start/end of a bucket index counting back from "now".
  function bucketBounds(unit, idxFromOldest, total){
    const now = new Date();
    const back = (total - 1 - idxFromOldest); // 0 = current bucket
    let start, end, label;
    if(unit==='day'){
      end = new Date(now); end.setHours(23,59,59,999); end.setDate(end.getDate()-back);
      start = new Date(end); start.setHours(0,0,0,0);
      label = (total<=7) ? DOW[start.getDay()] : String(start.getDate());
    } else if(unit==='week'){
      end = new Date(now); end.setHours(23,59,59,999); end.setDate(end.getDate()-back*7);
      start = new Date(end); start.setDate(start.getDate()-6); start.setHours(0,0,0,0);
      label = 'W'+(idxFromOldest+1);
    } else { // month
      const d = new Date(now.getFullYear(), now.getMonth()-back, 1);
      start = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
      end   = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
      label = MONTHS[d.getMonth()];
    }
    return { start, end, label };
  }
  function fullDate(d){ return d.getDate()+' '+MONTHS[d.getMonth()]; }

  // Aggregate raw events into a series for the active range (+ delta vs previous).
  function bucketSeries(raw, rangeKey){
    const R = RANGES[rangeKey] || RANGES['30d'];
    const series = [];
    let winStart = null, winEnd = null;
    for(let i=0;i<R.buckets;i++){
      const b = bucketBounds(R.unit, i, R.buckets);
      if(i===0) winStart = b.start;
      winEnd = b.end;
      const v = raw.filter(e=> e.at >= b.start && e.at <= b.end).length;
      series.push({ label:b.label, v, sub: R.unit==='week' ? (fullDate(b.start)+'-'+fullDate(b.end)) : (R.unit==='month' ? MONTHS[b.start.getMonth()]+' '+b.start.getFullYear() : fullDate(b.start)) });
    }
    const total = series.reduce((a,b)=>a+b.v,0);
    // Previous equal-length window for the delta.
    const spanMs = (winEnd - winStart);
    const prevEnd = new Date(winStart.getTime()-1);
    const prevStart = new Date(prevEnd.getTime()-spanMs);
    const prevTotal = raw.filter(e=> e.at >= prevStart && e.at <= prevEnd).length;
    const deltaPct = prevTotal ? Math.round((total-prevTotal)/prevTotal*100) : (total ? 100 : 0);
    return { series, total, prevTotal, deltaPct };
  }

  // Breakdown helpers for the views analytics.
  function rangeWindowStart(rangeKey){
    const R = RANGES[rangeKey] || RANGES['30d'];
    const first = bucketBounds(R.unit, 0, R.buckets);
    return first.start;
  }
  function viewerSplit(raw, since){
    const inWin = raw.filter(e=> e.at >= since);
    const client = inWin.filter(e=> e.viewerRole==='client').length;
    const talent = inWin.length - client;
    return { client, talent, total: inWin.length };
  }
  function locationSplit(raw, since){
    const inWin = raw.filter(e=> e.at >= since);
    const map = {};
    inWin.forEach(e=>{ const k = (e.viewerLocation && e.viewerLocation!=='') ? e.viewerLocation : 'Unknown'; map[k]=(map[k]||0)+1; });
    return Object.keys(map).map(k=>({ name:k, v:map[k] })).sort((a,b)=>b.v-a.v).slice(0,5);
  }

  // ── Interactive line/area chart with hover crosshair + tooltip ──
  const CHART_REG = {};
  let _chartSeq = 0;
  function interactiveChart(series, opts){
    opts = opts || {};
    const id = 'ichart_'+(++_chartSeq);
    const n = series.length;
    const max = Math.max(1, ...series.map(s=>s.v));
    const padTop = 8, padBot = 6;
    const pts = series.map((s,i)=>{
      const x = n>1 ? (i/(n-1))*100 : 50;
      const y = padTop + (1 - s.v/max) * (100 - padTop - padBot);
      return { x, y, v:s.v, label:s.label, sub:s.sub };
    });
    const line = pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const area = `M0 100 L${pts.map(p=>p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' L')} L100 100 Z`;
    CHART_REG[id] = { pts, money:!!opts.money };
    const xlabels = series.map((s,i)=>{
      const show = n<=12 || i%Math.ceil(n/12)===0 || i===n-1;
      return `<span class="dash-ic-x ${show?'':'hide'}">${esc(s.label)}</span>`;
    }).join('');
    return `<div class="dash-ichart" id="${id}" data-chart="${id}" role="img" aria-label="${esc(opts.aria||'Time series chart')}">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="dash-ic-svg">
        <defs><linearGradient id="${id}_g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="var(--blue)" stop-opacity="0"/></linearGradient></defs>
        <path d="${area}" fill="url(#${id}_g)" class="dash-ic-area"/>
        <path d="${line}" fill="none" stroke="var(--blue)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" class="dash-ic-line"/>
      </svg>
      <div class="dash-ic-cursor" hidden><span class="dash-ic-dot"></span></div>
      <div class="dash-ic-tip" hidden></div>
      <div class="dash-ic-hit"></div>
      <div class="dash-ic-xaxis">${xlabels}</div>
    </div>`;
  }
  function initCharts(scope){
    scope.querySelectorAll('.dash-ichart').forEach(el=>{
      const reg = CHART_REG[el.id]; if(!reg) return;
      const hit = el.querySelector('.dash-ic-hit');
      const cursor = el.querySelector('.dash-ic-cursor');
      const tip = el.querySelector('.dash-ic-tip');
      const move = (clientX)=>{
        const rect = el.getBoundingClientRect();
        const rel = Math.min(1, Math.max(0, (clientX-rect.left)/rect.width));
        let idx = Math.round(rel*(reg.pts.length-1));
        idx = Math.min(reg.pts.length-1, Math.max(0, idx));
        const p = reg.pts[idx];
        cursor.hidden = false; tip.hidden = false;
        cursor.style.left = p.x+'%';
        const dot = cursor.querySelector('.dash-ic-dot');
        dot.style.top = p.y+'%';
        const val = reg.money ? money(p.v) : (p.v + ' view'+(p.v===1?'':'s'));
        tip.innerHTML = `<strong>${esc(val)}</strong><span>${esc(p.sub||p.label)}</span>`;
        // keep tooltip within bounds
        tip.style.left = p.x+'%';
        tip.style.top = Math.max(2, p.y-4)+'%';
        tip.classList.toggle('flip', p.x>70);
      };
      const hide = ()=>{ cursor.hidden = true; tip.hidden = true; };
      hit.addEventListener('pointermove', e=>move(e.clientX));
      hit.addEventListener('pointerdown', e=>move(e.clientX));
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('touchmove', e=>{ if(e.touches[0]) move(e.touches[0].clientX); }, {passive:true});
    });
  }
  // Range selector tabs (re-render the active analytics view).
  function timelineTabs(active){
    return `<div class="dash-tl-tabs" role="tablist" aria-label="Timeline">
      ${Object.keys(RANGES).map(k=>`<button class="dash-tl-tab ${k===active?'on':''}" role="tab" aria-selected="${k===active}" onclick="dashSetRange('${k}')">${RANGES[k].label}</button>`).join('')}
    </div>`;
  }
  window.dashSetRange = function(k){ if(RANGES[k]){ VIEWS_RANGE = k; paintMain(); } };

  function deltaPill(deltaPct){
    if(deltaPct===0) return '<span class="dash-delta flat">-</span>';
    const up = deltaPct>0;
    return `<span class="dash-delta ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(deltaPct)}%</span>`;
  }

  // Horizontal proportion bars (viewer split, locations).
  function propBars(rows, total){
    if(!rows.length || !total) return '<p class="dash-muted" style="padding:8px 0">No data in this period yet.</p>';
    return `<div class="dash-prop">${rows.map(r=>{
      const pct = Math.round(r.v/total*100);
      return `<div class="dash-prop-row"><span class="dash-prop-name">${esc(r.name)}</span>
        <span class="dash-prop-track"><span class="dash-prop-fill" style="width:${pct}%"></span></span>
        <span class="dash-prop-val">${pct}%</span></div>`;
    }).join('')}</div>`;
  }

  // ── Heuristic "AI" insights engine ──
  // Reads the user's REAL signals (profile completeness + view trend) and
  // returns specific, ranked recommendations. No backend / no API key.
  function buildInsights(kind, ctx){
    const out = [];
    const ps = ctx.strength;
    const missing = ps ? ps.items.filter(i=>!i[1]).map(i=>i[0]) : [];
    if(kind==='views'){
      const v = ctx.views || { total:0, deltaPct:0 };
      if(v.total===0){
        out.push(['tip','No views yet','Your profile hasn\'t been viewed in this period. Completing your profile and being active (applying, updating skills) helps clients discover you.']);
      } else if(v.deltaPct < 0){
        out.push(['warn','Views are trending down', `Profile views fell ${Math.abs(v.deltaPct)}% vs the previous period. Refresh your title and skills, and add recent work to climb back up search results.`]);
      } else if(v.deltaPct > 0){
        out.push(['good','Views are climbing', `Nice - views are up ${v.deltaPct}% vs the previous period. Keep your profile fresh to sustain the momentum.`]);
      }
      if(missing.length){
        out.push(['warn','Complete your profile', `${missing.slice(0,3).join(', ')} ${missing.length>2?'and more are':'is'} still missing. More complete profiles rank higher and get viewed more.`]);
      }
      if(ctx.profile && (!(ctx.profile.skills)||ctx.profile.skills.length<5)){
        out.push(['tip','Add more skills','Profiles with 5+ skills appear in more client searches. Add the tools and frameworks you know.']);
      }
      out.push(['tip','Action tracking','Once in-app messaging launches, you\'ll see how many viewers messaged you here - and tips to lift that rate.']);
    } else if(kind==='earnings'){
      out.push(['tip','Start earning','Earnings appear here once you complete paid work on Workley. Apply to jobs that match your skills to land your first contract.']);
      if(missing.length) out.push(['warn','Finish your profile first','Clients hire complete profiles. Add: '+missing.slice(0,3).join(', ')+'.']);
      out.push(['tip','Set a competitive rate','A clear, fair hourly rate helps clients shortlist you faster. You can adjust it anytime in your profile.']);
    } else if(kind==='client'){
      const c = ctx.client || { jobs:[], received:0, viewed:0, shortlisted:0 };
      const openJobs = (c.jobs||[]).filter(j=>j.status==='open').length;
      if(openJobs===0){
        out.push(['tip','Post your first job','Posting a clear job is the fastest way to attract proposals from verified ICT talent. Add a budget and a short brief to get matched.']);
      } else if(c.received===0){
        out.push(['warn','No proposals yet','Your job is live but hasn\'t had applications. A clearer title, a realistic budget and a specific brief attract more - and stronger - candidates.']);
      } else if(c.shortlisted===0){
        out.push(['tip','Review your applicants', `You've received ${c.received} proposal${c.received===1?'':'s'}. Open them and move strong candidates to Interview to keep things moving.`]);
      } else {
        out.push(['good','Your pipeline is moving', `${c.shortlisted} candidate${c.shortlisted===1?'':'s'} shortlisted. Reach out to your favourites to lock them in.`]);
      }
      if(missing.length) out.push(['warn','Complete your profile', `Talent trust complete clients. Add: ${missing.slice(0,3).join(', ')}.`]);
      out.push(['tip','Browse talent directly','Beyond posting jobs, you can search verified talent and invite the best fits to your project.']);
    } else { // proposals (talent)
      const st = ctx.proposals || { sent:0, viewed:0, interview:0, offer:0 };
      if(st.sent===0){
        out.push(['tip','No applications yet','When you apply to jobs, each proposal is tracked here from sent → viewed → interview → offer. Browse open jobs to send your first.']);
      } else if(st.viewed===0){
        out.push(['warn','Applications not viewed yet','Clients haven\'t opened your proposals. A sharper title and a complete profile help your applications get noticed.']);
      } else if(st.interview===0){
        out.push(['tip','Turn views into interviews','Your proposals are being viewed - tailor each one to the job and lead with your most relevant work to win interviews.']);
      } else if(st.offer>0){
        out.push(['good','You\'re landing offers','Great momentum - keep applying to similar roles to stay busy.']);
      }
      if(ctx.profile && (!ctx.profile.bio || ctx.profile.bio.length<80)) out.push(['warn','Strengthen your bio','A short bio gets skipped. Aim for 2-3 sentences on what you build and the value you bring.']);
      out.push(['tip','Apply to strong matches','Focus on jobs that match your top skills - tailored proposals convert far better than generic ones.']);
    }
    return out.slice(0,4);
  }
  function insightsBlock(list){
    const ico = { good:I.check, warn:I.bolt, tip:I.target };
    return `<section class="dash-panel dash-insights" data-reveal>
      <div class="dash-insights-head"><span class="dash-ai-badge">${I.bolt} Smart insights</span><h2>Recommendations for you</h2></div>
      <div class="dash-insight-list">
        ${list.map(([tone,title,body])=>`<div class="dash-insight ${tone}">
          <span class="dash-insight-ic">${ico[tone]||I.target}</span>
          <div><strong>${esc(title)}</strong><p>${esc(body)}</p></div>
        </div>`).join('')}
      </div>
      <p class="dash-insights-foot">Generated from your real profile &amp; activity data - updates as you go.</p>
    </section>`;
  }

  function analyticsBackHead(title, sub){
    return `<div class="dash-an-head" data-reveal>
      <button class="dash-back" onclick="dashSetView('overview')" aria-label="Back to dashboard">${I.arrowUp}<span>Back</span></button>
      <div><h2>${esc(title)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div>
    </div>`;
  }
  function analyticsEmpty(icon, title, body){
    return `<div class="dash-empty lg" data-reveal>
      <div class="dash-empty-ic">${icon}</div>
      <h3>${esc(title)}</h3><p>${esc(body)}</p>
    </div>`;
  }

  // ── Analytics view: Profile views (REAL) ──
  function analyticsViews(){
    const ps = profileStrength();
    if(!ANALYTICS.loaded){
      return `${analyticsBackHead('Profile views','Loading your real view data…')}
        <section class="dash-panel" data-reveal><div class="dash-chart-loading"><div class="dash-boot-spin"></div></div></section>`;
    }
    const agg = bucketSeries(ANALYTICS.raw, VIEWS_RANGE);
    const since = rangeWindowStart(VIEWS_RANGE);
    const split = viewerSplit(ANALYTICS.raw, since);
    const locs = locationSplit(ANALYTICS.raw, since);
    const insights = buildInsights('views', { strength:ps, profile:DASH.p, views:agg });
    return `
    ${analyticsBackHead('Profile views', 'Who\'s viewing you, and when')}
    <section class="dash-panel" data-reveal>
      <div class="dash-an-top">
        <div class="dash-an-big"><span class="dash-an-num">${agg.total}</span><span class="dash-an-cap">views · last ${RANGES[VIEWS_RANGE].label}</span></div>
        ${deltaPill(agg.deltaPct)}
        ${timelineTabs(VIEWS_RANGE)}
      </div>
      ${agg.total ? interactiveChart(agg.series,{aria:'Profile views over time'}) : analyticsEmpty(I.eye,'No views in this period','Try a longer timeline, or complete your profile to get discovered. Real views are tracked the moment someone opens your profile.')}
    </section>
    <div class="dash-grid-2">
      <section class="dash-panel" data-reveal>
        ${sectionHead('Who viewed you','By account type')}
        ${propBars([{name:'Clients',v:split.client},{name:'Other talent',v:split.talent}].filter(r=>r.v), split.total)}
      </section>
      <section class="dash-panel" data-reveal>
        ${sectionHead('Where they\'re based','Top locations')}
        ${propBars(locs, split.total)}
      </section>
    </div>
    ${viewersWhoActedHtml()}
    ${insightsBlock(insights)}`;
  }
  // Real "viewers who took action": people who messaged or invited this talent,
  // plus the view → action conversion rate.
  function viewersWhoActedHtml(){
    const viewers = new Set((ANALYTICS.raw||[]).map(v=>v.viewerUid).filter(Boolean));
    const map = {};
    (CONVOS||[]).forEach(c=>{ const o=otherOf(c); if(o&&o.uid){ (map[o.uid]||(map[o.uid]={name:o.name||'Someone',via:new Set()})).via.add('Messaged'); } });
    (MY_INVITES||[]).forEach(m=>{ if(m&&m.clientUid){ (map[m.clientUid]||(map[m.clientUid]={name:m.clientName||'A client',via:new Set()})).via.add('Invited you'); } });
    const list = Object.keys(map).map(uid=>({uid,name:map[uid].name,via:[...map[uid].via]}));
    const head = sectionHead('Viewers who took action','Messaged or invited you');
    if(!list.length){
      return `<section class="dash-panel" data-reveal>${head}${analyticsEmpty(I.handshake,'No one has reached out yet','When someone messages you or invites you to a project, they\'ll show here - along with your view → action rate.')}</section>`;
    }
    const rate = viewers.size ? Math.min(100, Math.round((list.length/viewers.size)*100)) : 0;
    const rows = list.slice(0,10).map(p=>`<div class="dash-act-row"><span class="dash-act-av">${esc(_initialsOf(p.name))}</span><div class="dash-act-main"><span class="dash-act-name">${esc(p.name)}</span><span class="dash-act-via">${p.via.map(v=>`<em>${esc(v)}</em>`).join('')}</span></div></div>`).join('');
    return `<section class="dash-panel" data-reveal>${head}
      <div class="dash-act-summary"><strong>${list.length}</strong> ${list.length===1?'person':'people'} reached out${viewers.size?` · <span class="dash-act-rate">${rate}% of viewers</span>`:''}</div>
      <div class="dash-act-list">${rows}</div></section>`;
  }

  // ── Analytics view: Earnings (empty until paid work exists) ──
  function analyticsEarnings(){
    const ps = profileStrength();
    const insights = buildInsights('earnings', { strength:ps, profile:DASH.p });
    return `
    ${analyticsBackHead('Earnings', 'Track what you earn on Workley')}
    <section class="dash-panel" data-reveal>
      <div class="dash-an-top">
        <div class="dash-an-big"><span class="dash-an-num">R0</span><span class="dash-an-cap">earned · last ${RANGES[VIEWS_RANGE].label}</span></div>
        ${timelineTabs(VIEWS_RANGE)}
      </div>
      ${analyticsEmpty(I.wallet,'No earnings yet','Your earnings, payouts and history will appear here once you complete paid work. Land your first contract by applying to jobs that match your skills.')}
    </section>
    ${insightsBlock(insights)}`;
  }

  // ── Analytics view: Application pipeline / proposals (REAL) ──
  function analyticsProposals(){
    const ps = profileStrength();
    const ready = MY_PROPOSALS!=null;
    const props = (MY_PROPOSALS||[]).slice().sort((a,b)=>b.createdAt-a.createdAt);
    const st = proposalStats(props);
    const insights = buildInsights('proposals', { strength:ps, profile:DASH.p, proposals:st });
    const statusPill = s => {
      const map={ submitted:['Submitted','st-sent'], viewed:['Viewed','st-viewed'], interview:['Interview','st-interview'], offer:['Offer','st-shortlist'], declined:['Declined','st-viewed'] };
      const m=map[s]||map.submitted; return `<span class="dash-status ${m[1]}">${m[0]}</span>`;
    };
    const table = props.length ? `<div class="dash-table-wrap"><table class="dash-table">
        <thead><tr><th>Job</th><th>Status</th><th class="dash-td-r">Applied</th></tr></thead>
        <tbody>${props.map(p=>`<tr data-reveal><td><strong>${esc(p.jobTitle||'Job')}</strong><span class="dash-td-sub">${esc(FIELD_NAMES[p.talentField]||'')}</span></td><td>${statusPill(p.status)}</td><td class="dash-td-r">${esc(timeAgo(p.createdAt))}</td></tr>`).join('')}</tbody>
      </table></div>` : '';
    return `
    ${analyticsBackHead('Application pipeline', 'Sent → viewed → interview → offer')}
    <section class="dash-panel" data-reveal>
      ${sectionHead('Your pipeline', ready?(st.sent+' application'+(st.sent===1?'':'s')):'Loading…')}
      ${!ready ? loadingBlock()
        : (st.sent
          ? pipeline([['Sent',st.sent],['Viewed',st.viewed],['Interview',st.interview],['Offer',st.offer]])
          : analyticsEmpty(I.doc,'No proposals yet','When you apply to jobs, every application is tracked here through each stage so you can spot where you\'re winning and where to improve. Browse open jobs to get started.'))}
    </section>
    ${(ready && props.length) ? `<section class="dash-panel" data-reveal>${sectionHead('Your applications')}${table}</section>` : ''}
    ${insightsBlock(insights)}`;
  }

  // ════════════════════════════════════════════════════════════════════
  //  TALENT DASHBOARD
  // ════════════════════════════════════════════════════════════════════
  // Rank REAL open jobs (from Firestore) by fit for this talent.
  function talentJobsRanked(n){
    const p=DASH.p; const field=p.field; const skills=(p.skills||[]).map(s=>String(s).toLowerCase());
    const scored=(JOBS||[]).map(j=>{
      const fieldHit = j.field===field;
      const overlap = (j.skills||[]).filter(s=>skills.includes(String(s).toLowerCase())).length;
      const match = Math.min(98, (fieldHit?80:64) + overlap*6 + (j.description?2:0));
      return { j, match, fieldHit };
    }).sort((a,b)=> (b.fieldHit-a.fieldHit) || (b.match-a.match) || (b.j.createdAt - a.j.createdAt));
    return n ? scored.slice(0,n) : scored;
  }
  function appliedJobIds(){ return new Set((MY_PROPOSALS||[]).map(p=>p.jobId)); }

  function jobCard(r){
    const j=r.j;
    const applied = appliedJobIds().has(j.id);
    const budget = (j.budgetType==='hourly') ? money(j.budget)+'/hr' : money(j.budget)+' fixed';
    const when = timeAgo(j.createdAt);
    const desc = (j.description||'').slice(0,180) + ((j.description||'').length>180?'…':'');
    return `<article class="dash-job" data-reveal>
      <div class="dash-job-top">
        <div><h3>${esc(j.title)}</h3><div class="dash-job-meta">${j.clientUid?`<button type="button" class="dash-clientlink" onclick="openClientProfile('${j.clientUid}')">${esc(j.clientName||'Client')}</button>`:esc(j.clientName||'Client')} · ${esc(FIELD_NAMES[j.field]||j.field)} · ${esc(when)}</div></div>
        <div class="dash-match" title="Skill match"><span>${r.match}%</span><small>match</small></div>
      </div>
      ${desc?`<p class="dash-job-desc">${esc(desc)}</p>`:''}
      ${(j.skills&&j.skills.length)?`<div class="chips">${j.skills.slice(0,5).map(s=>`<span class="chip">${esc(s)}</span>`).join('')}</div>`:''}
      <div class="dash-job-foot">
        <span class="dash-budget">${esc(budget)}</span>
        ${applied
          ? '<button class="btn btn-outline btn-sm" disabled>✓ Applied</button>'
          : `<button class="btn btn-primary btn-sm" onclick="dashApply('${j.id}')">Apply now</button>`}
      </div>
    </article>`;
  }
  function jobsEmpty(){
    return `<div class="dash-empty" data-reveal>
      <div class="dash-empty-ic">${I.briefcase}</div>
      <h3>No open jobs yet</h3>
      <p>New jobs posted by clients will appear here, matched to your skills. Keep your profile sharp so you rank first when they do.</p>
      <a class="btn btn-outline btn-sm" href="smart-match.html">Explore Smart Match</a>
    </div>`;
  }
  function loadingBlock(){ return '<div class="dash-loading"><div class="wk-loader sm"><img src="assets/icon-blue.png" alt="" width="40" height="40"></div></div>'; }
  // Funnel counts from real proposals (each stage includes the deeper ones).
  function proposalStats(props){
    const s={ sent:props.length, viewed:0, interview:0, offer:0 };
    props.forEach(p=>{
      if(['viewed','interview','offer'].indexOf(p.status)>=0) s.viewed++;
      if(['interview','offer'].indexOf(p.status)>=0) s.interview++;
      if(p.status==='offer') s.offer++;
    });
    return s;
  }
  // Apply to a real job → creates a proposal in Firestore.
  window.dashApply = function(jobId){
    const j=(JOBS||[]).find(x=>x.id===jobId); if(!j) return;
    if(!window.firebaseDB || !window.firebaseUser){ dashToast('Sign in','Log in to apply for work.'); return; }
    if(appliedJobIds().has(jobId)){ return; }
    const prop={ jobId:j.id, clientUid:j.clientUid, talentUid:window.firebaseUser.uid,
      talentName:(DASH.u&&DASH.u.name)||'Talent', talentField:(DASH.p&&DASH.p.field)||'', jobTitle:j.title, note:'' };
    dashToast('Applying…','Sending your application.');
    window.firebaseDB.submitProposal(prop).then(id=>{
      if(id){
        if(!MY_PROPOSALS) MY_PROPOSALS=[];
        MY_PROPOSALS.push({ id, jobId:j.id, clientUid:j.clientUid, talentUid:prop.talentUid, talentName:prop.talentName, talentField:prop.talentField, jobTitle:j.title, note:'', status:'submitted', createdAt:new Date() });
        dashToast('Application sent','The client can now review your profile.');
        paintMain();
      } else { dashToast('Couldn\'t apply','Please try again.'); }
    });
  };

  function talentOverview(){
    const p=DASH.p; const ps=profileStrength();
    const missing=ps.items.filter(i=>!i[1]).map(i=>i[0]);
    // REAL profile views (last 30 days) once analytics have loaded.
    const viewsReady = ANALYTICS.loaded;
    const vAgg = viewsReady ? bucketSeries(ANALYTICS.raw, '30d') : null;
    const viewsVal = viewsReady ? String(vAgg.total) : '-';
    // REAL proposals + jobs.
    const propsReady = MY_PROPOSALS!=null;
    const pstat = proposalStats(MY_PROPOSALS||[]);
    const jobsReady = JOBS!=null;
    const jobs = jobsReady ? talentJobsRanked(3) : [];
    const insights = buildInsights('views', { strength:ps, profile:p, views: vAgg||{total:0,deltaPct:0} });

    return `
    <section class="dash-hero" data-reveal>
      <div class="dash-hero-txt">
        <span class="dash-hero-eyebrow">${esc(FIELD_NAMES[p.field]||'ICT Talent')}</span>
        <h2>Let's find your next opportunity</h2>
        <p>${ps.pct>=85?'Your profile is looking sharp - keep applying to stand out.':'Complete your profile to rank higher in client searches and Smart Match.'}</p>
        <div class="dash-hero-cta">
          <button class="btn btn-white" onclick="dashSetView('findwork')">${I.search} Browse jobs</button>
          <a class="btn btn-light" href="profile.html">Edit profile</a>
        </div>
      </div>
      <div class="dash-hero-vis" aria-hidden="true">${heroBlobTalent()}</div>
    </section>

    <div class="dash-kpis">
      ${kpi(I.eye, viewsVal, 'Profile views', { view:'analytics-views',
          trend: (viewsReady && vAgg.total>0 && vAgg.deltaPct!==0) ? vAgg.deltaPct : null,
          badge: (viewsReady && vAgg.total===0) ? 'No data' : (viewsReady ? null : 'Loading') })}
      ${kpi(I.doc, propsReady?String(pstat.sent):'-', 'Proposals sent', { view:'analytics-proposals', badge: propsReady?(pstat.sent===0?'No data':null):'Loading' })}
      ${kpi(I.handshake, propsReady?String(pstat.interview):'-', 'Interviews', { view:'analytics-proposals', tone:'tone-green', badge: propsReady?(pstat.interview===0?'No data':null):'Loading' })}
      ${kpi(I.wallet, 'R0', 'Earned', { view:'analytics-earnings', tone:'tone-blue', badge:'No data' })}
    </div>

    <div class="dash-grid-2">
      <section class="dash-panel" data-reveal>
        ${sectionHead('Earnings', 'No paid work yet', 'Expand', 'analytics-earnings')}
        ${analyticsEmpty(I.wallet,'No earnings yet','Your monthly earnings will chart here once you complete paid work. Open to add detail and tips.')}
      </section>
      <section class="dash-panel dash-strength" data-reveal>
        ${sectionHead('Profile strength')}
        <div class="dash-strength-body">
          ${ring(ps.pct,128, ps.pct>=85?'Strong':'Improve')}
          <div class="dash-strength-list">
            ${ps.items.map(it=>`<div class="dash-check ${it[1]?'on':''}">${it[1]?I.check:''}<span>${esc(it[0])}</span></div>`).join('')}
          </div>
        </div>
        ${missing.length?`<a class="dash-link" href="profile.html">Complete ${missing.length} item${missing.length>1?'s':''} →</a>`:'<p class="dash-muted" style="margin-top:14px">Your profile is complete. 🎉</p>'}
      </section>
    </div>

    ${insightsBlock(insights)}

    <section class="dash-panel" data-reveal>
      ${sectionHead('Recommended jobs','Matched to your skills in '+(FIELD_NAMES[p.field]||'your field'),'See all','findwork')}
      <div class="dash-jobs">${!jobsReady ? loadingBlock() : (jobs.length ? jobs.map(jobCard).join('') : jobsEmpty())}</div>
    </section>

    <div class="dash-grid-2">
      <section class="dash-panel" data-reveal>
        ${sectionHead('Application pipeline', pstat.sent?pstat.sent+' active':'No applications yet','Expand','analytics-proposals')}
        ${pstat.sent
          ? pipeline([['Sent',pstat.sent],['Viewed',pstat.viewed],['Interview',pstat.interview],['Offer',pstat.offer]])
          : `<div class="dash-pipe dash-pipe-empty">${['Sent','Viewed','Interview','Offer'].map(l=>`<div class="dash-pipe-step"><div class="dash-pipe-bar"><span style="height:6px"></span></div><div class="dash-pipe-n">0</div><div class="dash-pipe-l">${l}</div></div>`).join('')}</div>`}
      </section>
      <section class="dash-panel" data-reveal>
        ${sectionHead('Next steps','Quick wins to get hired faster')}
        <ul class="dash-tasks">
          ${(missing.slice(0,3).map(m=>taskRow('Add your '+m.toLowerCase(),'profile.html'))).join('')}
          ${taskRow('Apply to a recommended job',null,'findwork')}
          ${taskRow('Set up Smart Match alerts','smart-match.html')}
        </ul>
      </section>
    </div>`;
  }

  function viewFindWork(){
    const ready = JOBS!=null;
    const jobs = ready ? talentJobsRanked(0) : [];
    return `<div class="dash-backrow" data-reveal><button class="dash-back" onclick="dashSetView('overview')" aria-label="Back to dashboard">${I.arrowUp}<span>Back to dashboard</span></button></div>
    <section class="dash-panel" data-reveal>
      ${sectionHead(ready?(jobs.length+' open job'+(jobs.length===1?'':'s')):'Jobs matched to you', (DASH.p.skills&&DASH.p.skills.length?DASH.p.skills.slice(0,4).join(' · '):'Based on your field'))}
      <div class="dash-jobs">${!ready ? loadingBlock() : (jobs.length ? jobs.map(jobCard).join('') : jobsEmpty())}</div>
    </section>`;
  }

  // Talent "Jobs" view: applications in progress, active onboarded work (with
  // payment status), and completed+paid history (with the client's rating).
  function viewProposals(){
    const ready = (MY_PROPOSALS!=null) && (MY_INVITES!=null);
    if(!ready) return `<section class="dash-panel" data-reveal>${sectionHead('Jobs','Your applications, active work and history')}${loadingBlock()}</section>`;
    const props=(MY_PROPOSALS||[]).slice();
    const invites=(MY_INVITES||[]);
    const reviews=REVIEWS_ME||[];
    const tkey=m=> (m.acceptedAt||m.respondedAt||m.invitedAt||new Date(0)).getTime();
    const applied = props.filter(p=>['submitted','viewed','interview','offer'].indexOf(p.status)>=0).sort((a,b)=>b.createdAt-a.createdAt);
    const active  = invites.filter(m=>m.inviteStatus==='accepted' && m.memberState!=='dismissed' && m.memberState!=='cancelled' && !m.paid).sort((a,b)=>tkey(b)-tkey(a));
    const history = invites.filter(m=>m.paid && m.memberState!=='cancelled').sort((a,b)=>tkey(b)-tkey(a));
    const declined = props.filter(p=>p.status==='declined');
    const cancelled = invites.filter(m=>m.memberState==='cancelled').sort((a,b)=>{ const ta=a.cancelledAt, tb=b.cancelledAt; return (tb instanceof Date?tb.getTime():0)-(ta instanceof Date?ta.getTime():0); });
    const stars=n=>{ n=Math.max(0,Math.min(5,Math.round(n))); let s=''; for(let i=1;i<=5;i++) s+=(i<=n?'★':'☆'); return s; };
    const reviewFor=cid=>reviews.find(r=>r.clientUid===cid);

    if(!applied.length && !active.length && !history.length && !declined.length && !cancelled.length){
      return `<section class="dash-panel" data-reveal>${sectionHead('Jobs','Your applications, active work and history')}
        ${analyticsEmpty(I.briefcase,'No jobs yet','Browse open jobs and apply - your applications, active work and history will appear here.')}
        <div style="margin-top:14px"><button class="btn btn-primary btn-sm" onclick="dashSetView('findwork')">${I.search} Find work</button></div></section>`;
    }
    const appliedRows=applied.map(p=>{
      const label={submitted:'Under review',viewed:'Reviewed',interview:'Interview',offer:'Offer'}[p.status]||'Applied';
      return `<div class="dash-jobrow" data-reveal><div class="dash-jobrow-main"><strong>${esc(p.jobTitle||'Job')}</strong>
        <span class="dash-td-sub">${esc(FIELD_NAMES[p.talentField]||'ICT')} · applied ${esc(timeAgo(p.createdAt))}</span></div>
        <span class="dash-status st-sent">${esc(label)}</span></div>`;
    }).join('');
    const activeRows=active.map(m=>{
      const name=m.jobTitle||m.projectTitle||'Job';
      const extra=(m.jobTitle && m.projectTitle && m.jobTitle!==m.projectTitle)?' · '+esc(m.projectTitle):'';
      // Payment status only shows once onboarded (both parties signed the
      // Service Agreement); before that the engagement is contract-pending.
      const onb = m.memberState==='onboarded';
      const chip = onb
        ? `<span class="dash-status ${m.paid?'st-sent':'st-viewed'}">${m.paid?'Paid':'Awaiting payment'}</span>`
        : `<span class="dash-status st-viewed">Contract pending</span>`;
      return `<div class="dash-jobrow" data-reveal><div class="dash-jobrow-main"><strong>${esc(name)}</strong>
        <span class="dash-td-sub">${esc(m.clientName||'Client')}${extra} · ${onb?'onboarded':'awaiting onboarding'}</span></div>
        ${chip}<button class="proj-textbtn danger" onclick="dashCancelEngagementTalent('${m.projectId}')">Cancel</button></div>`;
    }).join('');
    const historyRows=history.map(m=>{
      const name=m.jobTitle||m.projectTitle||'Job';
      const rv=reviewFor(m.clientUid);
      const rvHtml=rv?`<div class="dash-jobrow-review"><span class="dash-stars">${stars(rv.rating)}</span>${rv.comment?`<span class="dash-jobrow-comment">"${esc(rv.comment)}"</span>`:''}</div>`:`<span class="dash-td-sub">No rating left yet.</span>`;
      return `<div class="dash-jobrow col" data-reveal><div class="dash-jobrow-top"><div class="dash-jobrow-main"><strong>${esc(name)}</strong>
        <span class="dash-td-sub">${esc(m.clientName||'Client')} · completed</span></div><span class="dash-status st-sent">Paid</span></div>${rvHtml}</div>`;
    }).join('');
    const block=(title,rows,sub)=> rows?`<section class="dash-panel" data-reveal>${sectionHead(title,sub)}<div class="dash-joblist-col">${rows}</div></section>`:'';
    const declinedBlock=declined.length?`<section class="dash-panel" data-reveal><details class="dash-jobs-declined"><summary>${declined.length} not selected this time</summary><div class="dash-joblist-col" style="margin-top:10px">${declined.map(p=>`<div class="dash-jobrow muted"><div class="dash-jobrow-main"><strong>${esc(p.jobTitle||'Job')}</strong><span class="dash-td-sub">The client went another way - keep going, more opportunities are coming.</span></div></div>`).join('')}</div></details></section>`:'';
    const cancelledBlock=cancelled.length?`<section class="dash-panel" data-reveal><details class="dash-jobs-declined"><summary>${cancelled.length} cancelled engagement${cancelled.length===1?'':'s'}</summary><div class="dash-joblist-col" style="margin-top:10px">${cancelled.map(m=>{
      const who=m.cancelledBy==='talent'?'you':(m.cancelledBy==='client'?esc((m.clientName||'the client').split(' ')[0]):'');
      const when=m.cancelledAt?' · '+m.cancelledAt.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}):'';
      return `<div class="dash-jobrow muted"><div class="dash-jobrow-main"><strong>${esc(m.jobTitle||m.projectTitle||'Job')}</strong><span class="dash-td-sub">Cancelled${who?' by '+who:''}${when} · ${esc(cancelReasonLabel(m.cancelReason))}${m.paid?' · work paid':''}</span></div><button class="proj-textbtn" onclick="dashViewCancellation('${m.projectId}','${m.studentUid}')">Details</button></div>`;
    }).join('')}</div></details></section>`:'';
    return `${block('Active jobs',activeRows,active.length+' onboarded')}${block('Applied',appliedRows,applied.length+' in progress')}${block('History',historyRows,history.length+' completed')}${declinedBlock}${cancelledBlock}`;
  }

  // ════════════════════════════════════════════════════════════════════
  //  CLIENT DASHBOARD
  // ════════════════════════════════════════════════════════════════════
  // Pull from the real Firestore-backed talent cache (defined in app.js).
  function talentPool(){ return (typeof TALENT !== 'undefined' && Array.isArray(TALENT)) ? TALENT : []; }
  function recommendedTalent(n){
    const needs=(DASH.p.needs&&DASH.p.needs.length)?DASH.p.needs:Object.keys(FIELD_NAMES);
    const pool=talentPool().slice();
    const scored=pool.map(s=>{
      const fieldHit=needs.includes(s.cat);
      const skillFit=Math.min(3,(s.skills||[]).length);   // more complete = stronger match
      const match=Math.min(98,(fieldHit?84:68)+skillFit*3+(s.blurb?3:0)+(s.avatar?2:0));
      return {s, match, fieldHit};
    }).sort((a,b)=> (b.fieldHit-a.fieldHit) || (b.match-a.match) || ((b.s.skills||[]).length-(a.s.skills||[]).length));
    // "Talent matched to you" only surfaces strong matches (>= 80%).
    return scored.filter(x=>x.match>=80).slice(0,n);
  }

  function talentCard(r){
    const s=r.s; const field=FIELD_NAMES[s.cat]||s.cat||'ICT';
    const ava = s.avatar ? `<img src="${esc(s.avatar)}" alt="">` : esc(s.initials||'U');
    const rating = s.rating ? `<span class="dash-star">${I.star}${Number(s.rating).toFixed(1)}</span> · ` : '<span class="dash-new">New</span> · ';
    const rate = (s.rate!=null) ? `R${s.rate}/hr · ` : '';
    return `<article class="dash-tcard" data-reveal>
      <div class="dash-tcard-top">
        <div class="dash-tava">${ava}</div>
        <div class="dash-tcard-id">
          <h3>${esc(s.name)}${s.username?` <span class="uname-pill">@${esc(s.username)}</span>`:''}</h3>
          <div class="dash-tcard-sub">${esc(s.uni||'ICT talent')}</div>
          <div class="dash-tcard-rate">${rating}${rate}${esc(field)}</div>
        </div>
        <div class="dash-match"><span>${r.match}%</span><small>match</small></div>
      </div>
      <div class="chips">${(s.skills||[]).slice(0,4).map(sk=>`<span class="chip">${esc(sk)}</span>`).join('')||'<span class="dash-muted">No skills listed yet</span>'}</div>
      <div class="dash-tcard-foot">
        <button class="btn btn-outline btn-sm" onclick="${typeof openProfile==='function'?`openProfile('${s.id}')`:`location.href='catalog.html'`}">View profile</button>
        <button class="btn btn-primary btn-sm" onclick="dashMessageTalent('${s.id}')">Message</button>
      </div>
    </article>`;
  }
  // Empty state for the talent grids when no real talent exists yet.
  function talentEmpty(){
    return `<div class="dash-empty" data-reveal>
      <div class="dash-empty-ic">${I.people}</div>
      <h3>No talent yet</h3>
      <p>Verified ICT students &amp; graduates will appear here as they join Workley. Check back soon.</p>
      <a class="btn btn-outline btn-sm" href="catalog.html">Open catalog</a>
    </div>`;
  }

  let _clientJobId = null;   // selected job for the applicants view
  function _initialsOf(name){ return (typeof initials==='function') ? initials(name||'U') : String(name||'U').slice(0,1).toUpperCase(); }
  function propsForJob(jobId){ return (CLIENT_PROPS||[]).filter(p=>p.jobId===jobId); }
  function clientStats(){
    const jobs = MY_JOBS||[]; const props = CLIENT_PROPS||[];
    return {
      jobs, props,
      activeJobs: jobs.filter(j=>j.status==='open').length,
      received: props.length,
      viewed: props.filter(p=>['viewed','interview','offer'].indexOf(p.status)>=0).length,
      shortlisted: props.filter(p=>['interview','offer'].indexOf(p.status)>=0).length,
      hired: props.filter(p=>p.status==='offer').length
    };
  }

  function clientOverview(){
    const p=DASH.p; const ps=profileStrength();
    const recs=recommendedTalent(4);
    const ready = MY_JOBS!=null && CLIENT_PROPS!=null;
    const cs = clientStats();
    const cInsights = buildInsights('client', { strength:ps, profile:p, client:cs, ready });
    const topJobs = (MY_JOBS||[]).slice().sort((a,b)=>b.createdAt-a.createdAt).slice(0,3);

    return `
    <section class="dash-hero" data-reveal>
      <div class="dash-hero-txt">
        <span class="dash-hero-eyebrow">${esc((typeof PROFILE_LABELS!=='undefined'&&PROFILE_LABELS.clientType[p.clientType])||'Client')}</span>
        <h2>Hire verified ICT talent, fast</h2>
        <p>${(p.needs&&p.needs.length)?'Post a job and we\'ll surface real, verified talent matched to your needs.':'Tell us what you\'re hiring for to unlock sharper matches.'}</p>
        <div class="dash-hero-cta">
          <button class="btn btn-white" onclick="openJob()">${I.plus} Post a job</button>
          <button class="btn btn-light" onclick="dashSetView('talent')">Browse talent</button>
        </div>
      </div>
      <div class="dash-hero-vis" aria-hidden="true">${heroBlobClient()}</div>
    </section>

    <div class="dash-kpis">
      ${kpi(I.briefcase, ready?String(cs.activeJobs):'-', 'Active job posts', { view:'jobs', badge: ready?(cs.activeJobs===0?'No data':null):'Loading' })}
      ${kpi(I.doc, ready?String(cs.received):'-', 'Proposals received', { view:'clientproposals', tone:'tone-blue', badge: ready?(cs.received===0?'No data':null):'Loading' })}
      ${kpi(I.star, ready?String(cs.shortlisted):'-', 'Shortlisted', { view:'clientproposals', tone:'tone-amber', badge: ready?(cs.shortlisted===0?'No data':null):'Loading' })}
      ${kpi(I.wallet, 'R0', 'Spent', { tone:'tone-green', badge:'No data' })}
    </div>

    <div class="dash-grid-2">
      <section class="dash-panel" data-reveal>
        ${sectionHead('Hiring pipeline', cs.received?cs.received+' in pipeline':'No applicants yet')}
        ${cs.received
          ? pipeline([['Proposals',cs.received],['Viewed',cs.viewed],['Interview',cs.shortlisted],['Hired',cs.hired]])
          : `<div class="dash-pipe dash-pipe-empty">${['Proposals','Viewed','Interview','Hired'].map(l=>`<div class="dash-pipe-step"><div class="dash-pipe-bar"><span style="height:6px"></span></div><div class="dash-pipe-n">0</div><div class="dash-pipe-l">${l}</div></div>`).join('')}</div>`}
      </section>
      <section class="dash-panel dash-strength" data-reveal>
        ${sectionHead('Profile strength')}
        <div class="dash-strength-body">
          ${ring(ps.pct,128, ps.pct>=85?'Strong':'Improve')}
          <div class="dash-strength-list">
            ${ps.items.map(it=>`<div class="dash-check ${it[1]?'on':''}">${it[1]?I.check:''}<span>${esc(it[0])}</span></div>`).join('')}
          </div>
        </div>
        <a class="dash-link" href="profile.html">Edit profile →</a>
      </section>
    </div>

    ${insightsBlock(cInsights)}

    <section class="dash-panel" data-reveal>
      ${sectionHead('Recommended talent', (p.needs&&p.needs.length)?'Matched to: '+p.needs.map(id=>FIELD_NAMES[id]||id).join(', '):'Verified ICT talent','See all','talent')}
      <div class="dash-tgrid">${recs.length?recs.map(talentCard).join(''):talentEmpty()}</div>
    </section>

    <section class="dash-panel" data-reveal>
      ${sectionHead('Your job posts', ready?(cs.jobs.length+' total'):null, 'Manage','jobs')}
      ${!ready ? loadingBlock()
        : (topJobs.length
          ? `<ul class="dash-joblist">${topJobs.map(clientJobRow).join('')}</ul>`
          : `<div class="dash-empty"><div class="dash-empty-ic">${I.briefcase}</div><h3>No job posts yet</h3><p>Post your first job to start receiving proposals from verified ICT talent.</p><button class="btn btn-primary btn-sm" onclick="openJob()">${I.plus} Post a job</button></div>`)}
    </section>`;
  }

  function clientJobRow(j){
    const count = propsForJob(j.id).length;
    const cls = j.status==='open' ? 'st-sent' : 'st-viewed';
    const rate = (j.budgetType==='hourly') ? money(j.budget)+'/hr' : money(j.budget)+' fixed';
    return `<li class="dash-joblist-row" data-reveal>
      <div><strong>${esc(j.title)}</strong><span class="dash-td-sub">${esc(FIELD_NAMES[j.field]||j.field)} · ${esc(rate)} · posted ${esc(timeAgo(j.createdAt))}</span></div>
      <div class="dash-joblist-meta"><span class="dash-status ${cls}">${j.status==='open'?'Open':'Closed'}</span><button class="dash-link" onclick="dashViewApplicants('${j.id}')">${count} proposal${count===1?'':'s'} →</button></div>
    </li>`;
  }

  function viewFindTalent(){
    const recs=recommendedTalent(60);
    return `<section class="dash-panel" data-reveal>
      ${sectionHead('Talent matched to you', (DASH.p.needs&&DASH.p.needs.length)?DASH.p.needs.map(id=>FIELD_NAMES[id]||id).join(' · '):'All verified ICT talent')}
      <div class="dash-tgrid">${recs.length?recs.map(talentCard).join(''):talentEmpty()}</div>
    </section>`;
  }

  function viewMyJobs(){
    const ready = MY_JOBS!=null;
    const jobs = (MY_JOBS||[]).slice().sort((a,b)=>b.createdAt-a.createdAt);
    return `<section class="dash-panel" data-reveal>
      <div class="dash-sec-head"><div><h2>Your job posts</h2>${ready?`<p>${jobs.length} total · ${jobs.filter(j=>j.status==='open').length} open</p>`:''}</div>
        <button class="btn btn-primary btn-sm" onclick="openJob()">${I.plus} Post a job</button></div>
      ${!ready ? loadingBlock() : (jobs.length
        ? `<ul class="dash-jobmanage-list">${jobs.map(clientJobManageRow).join('')}</ul>`
        : analyticsEmpty(I.briefcase,'No job posts yet','Post your first job to start receiving proposals from verified ICT talent.'))}
    </section>`;
  }
  function clientJobManageRow(j){
    const count = propsForJob(j.id).length;
    const rate = (j.budgetType==='hourly') ? money(j.budget)+'/hr' : money(j.budget)+' fixed';
    return `<li class="dash-jobmanage" data-reveal>
      <div class="dash-jobmanage-info">
        <div class="dash-jobmanage-title"><strong>${esc(j.title)}</strong><span class="dash-status ${j.status==='open'?'st-sent':'st-viewed'}">${j.status==='open'?'Open':'Closed'}</span></div>
        <span class="dash-td-sub">${esc(FIELD_NAMES[j.field]||j.field)} · ${esc(rate)} · posted ${esc(timeAgo(j.createdAt))}</span>
      </div>
      <div class="dash-jobmanage-actions">
        <button class="btn btn-outline btn-sm" onclick="dashViewApplicants('${j.id}')">${count} applicant${count===1?'':'s'}</button>
        ${j.status==='open'?`<button class="btn btn-ghost btn-sm" onclick="dashCloseJob('${j.id}')">Close</button>`:''}
        <button class="btn btn-ghost btn-sm dash-danger" onclick="dashDeleteJob('${j.id}')">Delete</button>
      </div>
    </li>`;
  }

  // Applicants for a single job.
  function viewJobApplicants(){
    const job=(MY_JOBS||[]).find(j=>j.id===_clientJobId);
    const props=propsForJob(_clientJobId).slice().sort((a,b)=>b.createdAt-a.createdAt);
    return `<div class="dash-backrow" data-reveal><button class="dash-back" onclick="dashSetView('jobs')" aria-label="Back to jobs">${I.arrowUp}<span>Back to jobs</span></button></div>
      <section class="dash-panel" data-reveal>
        ${sectionHead(job?esc(job.title):'Applicants', props.length+' applicant'+(props.length===1?'':'s'))}
        ${props.length ? `<div class="dash-applicants">${props.map(applicantRow).join('')}</div>`
          : analyticsEmpty(I.people,'No applicants yet','When talent applies to this job, they\'ll appear here for you to review and move through your pipeline.')}
      </section>`;
  }
  // All proposals across the client's jobs.
  function viewClientProposals(){
    const ready = CLIENT_PROPS!=null;
    const props=(CLIENT_PROPS||[]).slice().sort((a,b)=>b.createdAt-a.createdAt);
    return `<div class="dash-backrow" data-reveal><button class="dash-back" onclick="dashSetView('overview')" aria-label="Back to dashboard">${I.arrowUp}<span>Back to dashboard</span></button></div>
      <section class="dash-panel" data-reveal>
        ${sectionHead(ready?(props.length+' proposal'+(props.length===1?'':'s')+' received'):'Proposals','Across all your jobs')}
        ${!ready ? loadingBlock() : (props.length ? `<div class="dash-applicants">${props.map(p=>applicantRow(p,true)).join('')}</div>`
          : analyticsEmpty(I.doc,'No proposals yet','Post a job and applications from verified talent will appear here.'))}
      </section>`;
  }
  function applicantRow(p, showJob){
    const decided = (p.status==='accepted' || p.status==='declined');
    const badge = p.status==='accepted'
      ? `<span class="proj-state onboarded">${I.check} Accepted - onboard them in Projects</span>`
      : (p.status==='declined' ? `<span class="dash-status st-viewed">Declined</span>` : '');
    const actions = decided ? badge
      : `<button class="btn btn-outline btn-sm" onclick="dashViewStudentProfile('${p.talentUid}')">View profile</button>
         <button class="btn btn-primary btn-sm" onclick="dashAcceptApplicant('${p.id}')">Accept</button>
         <button class="btn btn-ghost btn-sm" onclick="dashDeclineApplicant('${p.id}')">Decline</button>`;
    return `<div class="dash-applicant${decided?' is-decided':''}" data-reveal>
      <div class="dash-applicant-head">
        <div class="dash-tava sm">${esc(_initialsOf(p.talentName))}</div>
        <div class="dash-applicant-id"><strong>${esc(p.talentName)}</strong>
          <span class="dash-td-sub">${showJob?esc(p.jobTitle||'Job')+' · ':''}${esc(FIELD_NAMES[p.talentField]||'ICT')} · applied ${esc(timeAgo(p.createdAt))}</span></div>
      </div>
      ${p.note?`<p class="dash-applicant-note">${esc(p.note)}</p>`:''}
      <div class="dash-applicant-act">${actions}</div>
    </div>`;
  }
  // Client actions on jobs & proposals.
  window.dashViewApplicants = function(jobId){ _clientJobId=jobId; setView('jobapplicants'); };
  window.dashCloseJob = function(jobId){
    if(!window.firebaseDB) return;
    window.firebaseDB.closeJob(jobId).then(ok=>{ if(ok){ const j=(MY_JOBS||[]).find(x=>x.id===jobId); if(j)j.status='closed'; dashToast('Job closed','It\'s no longer accepting applications.'); paintMain(); } else dashToast('Couldn\'t close job','Please try again.'); });
  };
  window.dashDeleteJob = function(jobId){
    if(typeof confirm==='function' && !confirm('Delete this job post? This cannot be undone.')) return;
    if(!window.firebaseDB) return;
    window.firebaseDB.deleteJob(jobId).then(ok=>{ if(ok){ MY_JOBS=(MY_JOBS||[]).filter(x=>x.id!==jobId); CLIENT_PROPS=(CLIENT_PROPS||[]).filter(x=>x.jobId!==jobId); dashToast('Job deleted','The post has been removed.'); setView('jobs'); } else dashToast('Couldn\'t delete','Please try again.'); });
  };
  // Accept an applicant → onboard them onto the job's project; mark proposal accepted.
  window.dashAcceptApplicant = function(propId){
    if(!window.firebaseDB) return;
    const p=(CLIENT_PROPS||[]).find(x=>x.id===propId); if(!p) return;
    if(p.status==='accepted'){ dashToast('Already accepted',''); return; }
    const uid=_uid();
    const job=(MY_JOBS||[]).find(j=>j.id===p.jobId);
    const doAccept=(jobObj)=>{
      window.firebaseDB.acceptApplicant(uid, p, jobObj).then(ok=>{
        if(ok){
          p.status='accepted';
          PROJECTS=null; if(jobObj.projectId) PROJECT_MEMBERS[jobObj.projectId]=null;
          dashToast('Applicant accepted', (p.talentName||'They')+' has been added to "'+(jobObj.projectName||jobObj.title||'the project')+'". Onboard them there to sign the Service Agreement.');
          paintMain(); refreshNotifs();
        } else dashToast('Couldn\'t accept','Please try again.');
      });
    };
    if(job && job.projectId){ doAccept(job); return; }
    // Legacy job without a project (or job not in cache): spin up a project from its title.
    const title=(job&&job.title)||p.jobTitle||'Project';
    window.firebaseDB.createProject(uid, DASH.name||'Client', {title:title, description:''}).then(pid=>{
      if(!pid){ dashToast('Couldn\'t accept','Please try again.'); return; }
      doAccept(Object.assign({}, job||{}, {id:p.jobId, title:(job&&job.title)||title, projectId:pid, projectName:title, clientName:DASH.name||'Client'}));
    });
  };
  // Decline an applicant (talent gets a gentle notification).
  window.dashDeclineApplicant = function(propId){
    if(!window.firebaseDB) return;
    const p=(CLIENT_PROPS||[]).find(x=>x.id===propId); if(!p) return;
    window.firebaseDB.updateProposalStatus(propId,'declined').then(ok=>{
      if(ok){ p.status='declined'; dashToast('Applicant declined','They\'ll get a gentle heads-up.'); paintMain(); }
      else dashToast('Couldn\'t update','Please try again.');
    });
  };

  // ════════════════════════ MESSAGING (real-time) ════════════════════════
  let _seenMsgIds = new Set();   // message ids already on screen (skip re-animation)
  let _threadFirstLoad = false;  // suppress entrance animation on a thread's first load
  let _otherHint = null;         // {uid,name,role} for the active thread's other party
  let _nameCache = {};           // uid → real displayName (from getProfile), best name source

  // Prefer a freshly-fetched real name over a possibly-generic stored/hint name.
  function bestName(uid, fallback){
    const real=_nameCache[uid];
    if(real && real!=='Member' && real!=='Talent') return real;
    return fallback || real || 'Member';
  }
  function currentConvo(){ return (CONVOS||[]).find(c=>c.id===_activeCid) || null; }
  function otherOf(convo){
    const me=_uid();
    if(convo && convo.participants){
      const uid = convo.participants.find(u=>u!==me) || convo.participants[0];
      return { uid, name:bestName(uid,(convo.names&&convo.names[uid])||'Member'), role:(convo.roles&&convo.roles[uid])||'talent' };
    }
    if(_otherHint) return { uid:_otherHint.uid, name:bestName(_otherHint.uid,_otherHint.name), role:_otherHint.role };
    return null;
  }
  function fmtReplyTime(mins, count){
    if(!count || count<1) return 'Usually replies within a day';
    if(mins < 1) return 'Replies almost instantly';
    if(mins < 60) return 'Typically replies in ~'+Math.max(1,Math.round(mins))+' min';
    const h=mins/60; if(h<24){ const r=Math.round(h); return 'Typically replies in ~'+r+' hr'+(r===1?'':'s'); }
    const d=Math.round(h/24); return 'Typically replies in ~'+d+' day'+(d===1?'':'s');
  }
  function replyTimePill(other){
    if(!other) return '';
    const info=_replyInfo[other.uid];
    if(info===undefined || info===null) return `<span class="dash-replytime loading">${I.clock}<span>reply time…</span></span>`;
    const estimate = (!info.count || info.count<1);
    return `<span class="dash-replytime${estimate?' est':''}" title="${estimate?'Estimated until they have replied a few times':'Based on real reply history'}">${I.clock}<span>${esc(fmtReplyTime(info.avgMins,info.count))}</span></span>`;
  }

  // Detach the active-thread listener (conversation list listener stays live).
  function detachThread(){
    if(_msgUnsub){ try{_msgUnsub();}catch(e){} _msgUnsub=null; }
    if(_presenceUnsub){ try{_presenceUnsub();}catch(e){} _presenceUnsub=null; }
    _pendingFiles=[]; _editingMid=null;   // queued attachments/edits belong to the open thread
  }

  // Open (or create) a 1:1 chat with another user, then focus it.
  function openChatWith(other){
    const me=_uid();
    if(!me || !window.firebaseDB || !other || !other.uid || other.uid===me) return;
    _otherHint = { uid:String(other.uid), name:other.name||'Member', role:other.role||'talent' };
    if(VIEW!=='messages') setView('messages'); else paintMain();
    const meInfo = { uid:me, name:(DASH&&DASH.name)||'Member', role:(DASH&&DASH.role)||'talent' };
    window.firebaseDB.openConversation(meInfo, _otherHint).then(cid=>{
      if(cid) selectConvo(cid, _otherHint);
      else dashToast('Couldn\'t open chat','Please refresh and try again.');
    });
  }
  window.dashOpenChat = openChatWith;
  window.dashMessageTalent = function(uid){
    const t = talentPool().find(x=>String(x.id)===String(uid));
    openChatWith({ uid:String(uid), name:(t&&t.name)||'Talent', role:'talent' });
  };

  // Select an existing conversation and stream its messages live.
  function selectConvo(cid, otherHint){
    if(otherHint) _otherHint = otherHint;
    if(_activeCid===cid && _msgUnsub){ if(VIEW==='messages') paintMain(); return; }
    detachThread();
    _activeCid=cid; MSGS=[]; _msgLoading=true; _seenMsgIds=new Set(); _threadFirstLoad=true;
    const me=_uid();
    const convo=currentConvo();
    // mark my unread → 0
    if(convo && convo.unread && Number(convo.unread[me])>0 && window.firebaseDB.markConversationRead){
      window.firebaseDB.markConversationRead(cid, me);
    }
    // fetch the other party's reply-time once
    const other=otherOf(convo);
    // live presence for the open thread's partner (online dot + last seen)
    if(other && other.uid && other.uid!==me && window.firebaseDB.listenPresence){
      _presenceUnsub = window.firebaseDB.listenPresence(other.uid, at=>{ _presenceCache[other.uid]=at; if(VIEW==='messages') paintMain(); });
    }
    if(other && _replyInfo[other.uid]===undefined && window.firebaseDB.getProfile){
      _replyInfo[other.uid]=null; // loading
      window.firebaseDB.getProfile(other.uid).then(p=>{
        _replyInfo[other.uid] = { avgMins:(p&&Number(p.replyAvgMins))||0, count:(p&&Number(p.replyCount))||0 };
        if(p && p.displayName) _nameCache[other.uid] = p.displayName;
        cachePartner(other.uid, p);   // capture avatar/role for profile + photo opening
        if(VIEW==='messages') paintMain();
      });
    } else if(other && other.uid){ ensurePartner(other.uid); }
    // live messages
    _msgUnsub = window.firebaseDB.listenMessages(cid, list=>{
      MSGS = list||[]; _msgLoading=false;
      if(_threadFirstLoad){ MSGS.forEach(m=>_seenMsgIds.add(m.id)); _threadFirstLoad=false; }
      // A message arrived while I'm reading this thread → clear my unread immediately.
      const last=MSGS[MSGS.length-1];
      if(VIEW==='messages' && _activeCid===cid && last && last.senderUid!==_uid() && window.firebaseDB.markConversationRead){
        window.firebaseDB.markConversationRead(cid, _uid());
      }
      if(VIEW==='messages') paintMain();
    });
    if(VIEW!=='messages') setView('messages'); else paintMain();
  }
  window.dashSelectConvo = function(cid){ const c=(CONVOS||[]).find(x=>x.id===cid); selectConvo(cid, c?otherOf(c):null); };
  window.dashCloseThread = function(){ detachThread(); _activeCid=null; _otherHint=null; if(VIEW==='messages') paintMain(); };

  // Send the composed message (optimistic; the listener reconciles).
  window.dashSendMessage = function(){
    const ta=document.getElementById('dashMsgInput'); if(!ta) return;
    const text=ta.value.trim(); const me=_uid();
    if(_sending || !_activeCid || !me || !window.firebaseDB) return;
    if(!text && !_pendingFiles.length) return;
    // ── Edit mode: save changes to an existing message instead of sending new ──
    if(_editingMid){
      if(!text) return;
      const mid=_editingMid; const m=MSGS.find(x=>x.id===mid);
      if(!m || m.senderUid!==me){ dashCancelEdit(); return; }
      const isLast = MSGS.length && MSGS[MSGS.length-1].id===mid;
      m.text=text; m.editedAt=new Date();   // optimistic
      _editingMid=null; ta.value=''; _autoGrow(ta);
      _sending=true; paintMain();
      window.firebaseDB.editMessage(_activeCid, mid, me, text, isLast).then(ok=>{
        _sending=false;
        if(!ok) dashToast('Edit failed','You can only edit a message within 60 seconds of sending it.');
        if(VIEW==='messages') paintMain();
      });
      return;
    }
    const convo=currentConvo();
    const parts = convo ? convo.participants : (_otherHint ? [me,_otherHint.uid].sort() : null);
    const tmpId='tmp_'+Date.now();
    const dropTmp=()=>{ const ix=MSGS.findIndex(m=>m.id===tmpId); if(ix>-1) MSGS.splice(ix,1); };

    // ── Files queued → upload them all, then send ONE message (text optional) ──
    if(_pendingFiles.length){
      if(!(window.firebaseStorage&&window.firebaseStorage.uploadChatFile)){ dashToast('Uploads not ready','Please wait a moment and try again.'); return; }
      const toSend=_pendingFiles.splice(0, MAX_MSG_FILES);
      MSGS.push({ id:tmpId, senderUid:me, text, at:new Date(), pending:true,
        files: toSend.map(f=>({ name:f.name, size:f.size, type:f.type, uploading:true })) });
      ta.value=''; _autoGrow(ta);
      _sending=true; paintMain();
      // Upload sequentially - keeps memory flat and failures early.
      (async()=>{
        const metas=[];
        for(const f of toSend){ metas.push(await window.firebaseStorage.uploadChatFile(_activeCid, me, f)); }
        return window.firebaseDB.sendMessage(_activeCid, me, text, parts, metas);
      })().then(ok=>{
        _sending=false;
        if(!ok){
          // Put everything back in the composer so nothing is lost (restore the
          // text AFTER the repaint - painting renders the composer empty).
          dropTmp(); _pendingFiles=toSend;
          if(VIEW==='messages') paintMain();
          const ta1=document.getElementById('dashMsgInput'); if(ta1){ ta1.value=text; _autoGrow(ta1); }
          dashToast('Message not sent','Check your connection and try again.');
        } else if(VIEW==='messages') paintMain();
      }).catch(err=>{
        _sending=false; dropTmp(); _pendingFiles=toSend;
        if(VIEW==='messages') paintMain();
        const ta2=document.getElementById('dashMsgInput'); if(ta2){ ta2.value=text; _autoGrow(ta2); }
        console.warn('[Workley] chat upload failed:', err && (err.message||err));
        dashToast('Upload failed', (err&&err.message==='too-large') ? 'Each file must be under 10 MB.' : 'Could not send your files. Please try again.');
      });
      return;
    }

    // ── Plain text message ──
    if(!text) return;
    MSGS.push({ id:tmpId, senderUid:me, text, at:new Date(), pending:true });
    ta.value=''; _autoGrow(ta);
    _sending=true;
    paintMain();
    window.firebaseDB.sendMessage(_activeCid, me, text, parts).then(ok=>{
      _sending=false;
      if(!ok){ dashToast('Message not sent','Check your connection and try again.'); if(VIEW==='messages') paintMain(); }
      // success → the messages listener refreshes MSGS with the stored doc
    });
  };
  // Begin editing one of my messages (allowed within 60s of sending).
  window.dashEditMsg = function(mid){
    const me=_uid(); const m=MSGS.find(x=>x.id===mid);
    if(!m || m.senderUid!==me || m.deleted) return;
    if((Date.now() - new Date(m.at).getTime()) > 60000){ dashToast('Too late to edit','Messages can only be edited within 60 seconds of sending.'); return; }
    _editingMid=mid;
    paintMain();
    const ta=document.getElementById('dashMsgInput');
    if(ta){ ta.value=m.text||''; _autoGrow(ta); try{ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }catch(e){} }
  };
  window.dashCancelEdit = function(){
    _editingMid=null;
    const ta=document.getElementById('dashMsgInput'); if(ta){ ta.value=''; _autoGrow(ta); }
    paintMain();
  };
  // Delete a message: "for me" hides it for THIS user only (the other person
  // still sees it, works on any message); "for everyone" tombstones it for both
  // sides (own messages only).
  window.dashDeleteMsg = function(mid){
    const me=_uid(); const m=MSGS.find(x=>x.id===mid);
    if(!m || m.deleted) return;
    const mine = m.senderUid===me;
    document.getElementById('modal').classList.remove('auth-modal');
    document.getElementById('modal').innerHTML = `
      <div class="modal-head"><div><h3 style="font-size:1.2rem">Delete message?</h3></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="modal-body">
        <p style="color:var(--ink-soft);font-size:.92rem">${mine
          ? 'Delete just for you, or for everyone in this chat?'
          : 'This removes the message from your chat only - the other person will still see it.'}</p>
        <button class="btn btn-outline btn-block btn-lg" style="margin-top:14px" onclick="dashDeleteForMe('${mid}')">Delete for me</button>
        ${mine?`<button class="btn btn-danger btn-block btn-lg" style="margin-top:10px" onclick="dashDeleteForEveryone('${mid}')">Delete for everyone</button>`:''}
        <button class="btn btn-ghost btn-block" style="margin-top:10px" onclick="closeModal()">Cancel</button>
      </div>`;
    showOverlay();
  };
  window.dashDeleteForMe = function(mid){
    closeModal();
    const me=_uid(); const m=MSGS.find(x=>x.id===mid);
    if(!m || !me) return;
    if(_editingMid===mid) _editingMid=null;
    m.hiddenFor=(m.hiddenFor||[]).concat([me]);   // optimistic - vanishes from my view only
    paintMain();
    window.firebaseDB.hideMessageForMe(_activeCid, mid, me).then(ok=>{
      if(!ok) dashToast('Delete failed','Check your connection and try again.');
      if(VIEW==='messages') paintMain();
    });
  };
  window.dashDeleteForEveryone = function(mid){
    closeModal();
    const me=_uid(); const m=MSGS.find(x=>x.id===mid);
    if(!m || m.senderUid!==me || m.deleted) return;
    if(_editingMid===mid) _editingMid=null;
    const isLast = MSGS.length && MSGS[MSGS.length-1].id===mid;
    m.deleted=true; m.text=''; m.file=null; m.files=null;   // optimistic
    paintMain();
    window.firebaseDB.deleteMessage(_activeCid, mid, me, isLast).then(ok=>{
      if(!ok){ dashToast('Delete failed','Check your connection and try again.'); }
      if(VIEW==='messages') paintMain();
    });
  };
  function _autoGrow(ta){ if(!ta) return; ta.style.height='auto'; ta.style.height=Math.min(120, ta.scrollHeight)+'px'; }

  // Attach files (any type, ≤10 MB each, max 5 per message). Selected files are
  // QUEUED in the composer - not sent yet - so the sender can add an optional
  // caption and/or more files, then send everything as ONE message.
  const MAX_MSG_FILES = 5;
  window.dashPickFile = function(){ const inp=document.getElementById('dashFileInput'); if(inp && !_sending && !_editingMid) inp.click(); };
  window.dashAttachFile = function(input){
    const picked = input && input.files ? Array.from(input.files) : [];
    if(input) input.value='';
    if(!picked.length || !_activeCid) return;
    let rejectedSize=0, rejectedCount=0;
    picked.forEach(f=>{
      if(f.size > 10*1024*1024){ rejectedSize++; return; }
      if(_pendingFiles.length >= MAX_MSG_FILES){ rejectedCount++; return; }
      _pendingFiles.push(f);
    });
    if(rejectedSize) dashToast('File too large', rejectedSize+' file'+(rejectedSize===1?' was':'s were')+' skipped - each file must be under 10 MB.');
    if(rejectedCount) dashToast('Limit reached', 'A message can carry up to '+MAX_MSG_FILES+' files.');
    if(VIEW==='messages') paintMain();
    const ta=document.getElementById('dashMsgInput'); if(ta){ try{ ta.focus({preventScroll:true}); }catch(e){} }
  };
  window.dashRemovePending = function(i){
    _pendingFiles.splice(i,1);
    if(VIEW==='messages') paintMain();
  };
  // The queued-files strip shown above the composer.
  function pendingFilesHtml(){
    if(!_pendingFiles.length) return '';
    const chips=_pendingFiles.map((f,i)=>`<span class="dash-pf-chip" title="${esc(f.name)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      <span class="dash-pf-name">${esc(f.name)}</span><small>${esc(fmtBytes(f.size))}</small>
      <button type="button" aria-label="Remove ${esc(f.name)}" onclick="dashRemovePending(${i})">×</button>
    </span>`).join('');
    return `<div class="dash-pending-files"><span class="dash-pf-count">${_pendingFiles.length}/${MAX_MSG_FILES}</span>${chips}</div>`;
  }

  // Render a message's file attachment: images inline, everything else as a chip.
  function fmtBytes(n){ n=Number(n)||0; if(n<1024) return n+' B'; if(n<1048576) return Math.round(n/1024)+' KB'; return (n/1048576).toFixed(1)+' MB'; }
  function fileAttachmentHtml(f){
    if(!f) return '';
    const name=esc(f.name||'file');
    const isImg=String(f.type||'').indexOf('image/')===0;
    if(f.uploading){
      return `<span class="dash-file uploading"><span class="dash-file-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg></span><span class="dash-file-meta"><strong>${name}</strong><small>Uploading…</small></span></span>`;
    }
    if(isImg && f.url){
      return `<a class="dash-file-img" href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt="${name}" loading="lazy"></a>`;
    }
    const sub=f.size ? esc(fmtBytes(f.size)) : 'Download';
    return `<a class="dash-file" href="${f.url?esc(f.url):'#'}" target="_blank" rel="noopener" download="${name}"><span class="dash-file-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span><span class="dash-file-meta"><strong>${name}</strong><small>${sub}</small></span></a>`;
  }

  function msgGroupDate(d){
    const today=new Date(); today.setHours(0,0,0,0);
    const md=new Date(d); md.setHours(0,0,0,0);
    const diff=Math.round((today-md)/864e5);
    if(diff===0) return 'Today'; if(diff===1) return 'Yesterday';
    if(diff<7) return DOW[md.getDay()];
    return md.getDate()+' '+MONTHS[md.getMonth()];
  }
  function msgTime(d){ return d.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}); }

  // Conversation list row.
  function convoRow(c){
    const me=_uid(); const other=otherOf(c);
    const unread=Number(c.unread&&c.unread[me])||0;
    const active = c.id===_activeCid;
    const preview = c.lastSender===me ? ('You: '+(c.lastText||'')) : (c.lastText||'Say hello 👋');
    const when = c.lastAt && c.lastAt.getTime()>0 ? timeAgo(c.lastAt) : '';
    const online = presenceState(_presenceCache[other.uid]).online;
    return `<button class="dash-convo${active?' active':''}${unread?' unread':''}" onclick="dashSelectConvo('${c.id}')">
      <span class="dash-convo-av${online?' is-online':''}" role="button" tabindex="0" title="Quick view" onclick="dashPeekConvo('${c.id}',event)">${partnerAvatar(other.uid, other.name)}</span>
      <span class="dash-convo-main">
        <span class="dash-convo-top"><strong>${esc(other.name)}</strong><time>${esc(when)}</time></span>
        <span class="dash-convo-prev">${esc(preview)}</span>
      </span>
      ${unread?`<em class="dash-convo-badge">${unread>9?'9+':unread}</em>`:''}
    </button>`;
  }

  // Message bubbles (with day separators + entrance animation for new ones).
  function threadBubbles(){
    const me=_uid(); let out=''; let lastDay=null;
    const convo=currentConvo(); const other=otherOf(convo);
    const otherReadAt = (convo && other && convo.readAt && convo.readAt[other.uid]) ? new Date(convo.readAt[other.uid]).getTime() : 0;
    const EDIT_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
    const DEL_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
    MSGS.forEach(m=>{
      // Deleted-for-me: this user chose to hide it - the other person still sees it.
      if((m.hiddenFor||[]).indexOf(me)>-1) return;
      const day=msgGroupDate(m.at);
      if(day!==lastDay){ out+=`<div class="dash-msg-day"><span>${esc(day)}</span></div>`; lastDay=day; }
      const mine=m.senderUid===me;
      const isNew=!_seenMsgIds.has(m.id);
      if(m.deleted){
        out+=`<div class="dash-bubble ${mine?'me':'them'} deleted${isNew?' in':''}">
          <span class="dash-bubble-txt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/></svg>This message was deleted</span>
          <span class="dash-bubble-meta">${esc(msgTime(m.at))}</span>
        </div>`;
        return;
      }
      const attach = m.files || (m.file?[m.file]:null);
      const fileHtml = attach ? attach.map(fileAttachmentHtml).join('') : '';
      const txtHtml=m.text?`<span class="dash-bubble-txt">${esc(m.text)}</span>`:'';
      const edited=m.editedAt?`<span class="dash-bubble-edited">edited</span>`:'';
      let tick='';
      if(mine){
        if(m.pending) tick='·';
        else if(otherReadAt && new Date(m.at).getTime() <= otherReadAt) tick='<span class="seen">✓✓</span>';
        else tick='✓';
      }
      const canEdit = mine && !m.pending && m.text && (Date.now()-new Date(m.at).getTime() <= 60000);
      // My messages: edit (within 60s) + delete. Their messages: delete-for-me only.
      const actions = m.pending ? '' :
        `<span class="dash-bubble-actions">${(mine&&canEdit)?`<button type="button" class="dash-bubble-act" title="Edit" aria-label="Edit message" onclick="dashEditMsg('${m.id}')">${EDIT_ICON}</button>`:''}<button type="button" class="dash-bubble-act" title="Delete" aria-label="Delete message" onclick="dashDeleteMsg('${m.id}')">${DEL_ICON}</button></span>`;
      out+=`<div class="dash-bubble ${mine?'me':'them'}${isNew?' in':''}${m.pending?' pending':''}${attach&&!m.text?' has-file':''}${_editingMid===m.id?' editing':''}">
        ${actions}${fileHtml}${txtHtml}
        <span class="dash-bubble-meta">${edited}${esc(msgTime(m.at))}${mine?`<span class="dash-bubble-tick">${tick}</span>`:''}</span>
      </div>`;
    });
    return out;
  }

  function viewMessages(role){
    const ready = CONVOS!=null;
    const convos = CONVOS||[];
    const me=_uid();
    const hasActive = !!_activeCid;
    // ── Left: conversation list ──
    const listHtml = !ready
      ? loadingBlock()
      : (convos.length
        ? convos.map(convoRow).join('')
        : `<div class="dash-convo-empty">${I.chat}<p>${role==='client'?'No conversations yet. Find talent and tap <strong>Message</strong> to start a chat.':'No conversations yet. When a client messages you, it will appear here.'}</p>${role==='client'?`<button class="btn btn-outline btn-sm" onclick="dashSetView('talent')">Find talent</button>`:''}</div>`);

    // ── Right: active thread ──
    let threadHtml;
    if(!hasActive){
      threadHtml = `<div class="dash-thread-empty">
        <div class="dash-empty-ic">${I.chat}</div>
        <h3>Your chats</h3>
        <p>${role==='client'?'Select a conversation, or message talent from their profile to start hiring.':'Select a conversation to reply. Clients reach out here once they have seen your profile.'}</p>
      </div>`;
    } else {
      const convo=currentConvo();
      const other=otherOf(convo);
      const otherRoleLabel = (other&&other.role==='client') ? 'Client' : 'ICT Talent';
      const pres = presenceState(other ? _presenceCache[other.uid] : null);
      const subLine = pres.text
        ? `<span class="pres-dot${pres.online?' on':''}"></span>${esc(pres.text)}`
        : esc(otherRoleLabel);
      threadHtml = `
        <div class="dash-thread-head">
          <button class="dash-thread-back" onclick="dashCloseThread()" aria-label="Back to conversations">${I.back}</button>
          <button class="dash-thread-av${pres.online?' is-online':''}" onclick="dashViewProfile()" title="View profile" aria-label="View ${esc(other?other.name:'')} profile">${other?partnerAvatar(other.uid, other.name):'?'}</button>
          <div class="dash-thread-id">
            <button class="dash-thread-name" onclick="dashViewProfile()">${esc(other?other.name:'Conversation')}</button>
            <span class="dash-thread-sub">${subLine}</span>
          </div>
          ${replyTimePill(other)}
        </div>
        <div class="dash-thread-scroll" id="dashThreadScroll">
          ${_msgLoading ? loadingBlock() : (MSGS.length ? threadBubbles() : `<div class="dash-thread-start"><span>${I.handshake}</span><p>This is the start of your conversation with ${esc(other?other.name.split(' ')[0]:'them')}. Say hello!</p></div>`)}
        </div>
        ${_editingMid?`<div class="dash-edit-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>Editing message</span><button type="button" onclick="dashCancelEdit()">Cancel</button></div>`:''}
        ${pendingFilesHtml()}
        <form class="dash-composer" onsubmit="event.preventDefault();dashSendMessage();">
          <input type="file" id="dashFileInput" class="dash-file-input" multiple onchange="dashAttachFile(this)" tabindex="-1" aria-hidden="true">
          <button type="button" class="dash-attach" aria-label="Attach a file (max 10 MB)" title="Attach a file (max 10 MB)" onclick="dashPickFile()"${(_sending||_editingMid)?' disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
          <textarea id="dashMsgInput" rows="1" placeholder="${_editingMid?'Edit your message…':(_pendingFiles.length?'Add a message (optional)…':'Write a message…')}" aria-label="Message" oninput="this.style.height='auto';this.style.height=Math.min(120,this.scrollHeight)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();dashSendMessage();}${_editingMid?`if(event.key==='Escape'){event.preventDefault();dashCancelEdit();}`:''}"></textarea>
          <button type="submit" class="dash-send" aria-label="${_editingMid?'Save edit':'Send message'}"${_sending?' disabled':''}>${_editingMid?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>':I.send}</button>
        </form>`;
    }

    return `<section class="dash-msg${hasActive?' has-active':''}" data-reveal>
      <div class="dash-msg-list">
        <div class="dash-msg-list-head"><h2>Chats</h2>${ready&&convos.length?`<span class="dash-msg-count">${convos.length}</span>`:''}</div>
        <div class="dash-msg-list-scroll">${listHtml}</div>
      </div>
      <div class="dash-msg-thread">${threadHtml}</div>
    </section>`;
  }

  // After the messages view paints: scroll to newest, mark animated msgs as seen, focus composer.
  function afterMessagesPaint(){
    const scroll=document.getElementById('dashThreadScroll');
    if(scroll){ requestAnimationFrame(()=>{ scroll.scrollTop=scroll.scrollHeight; }); }
    // remember which bubbles we've shown so repaints don't re-animate them
    MSGS.forEach(m=>_seenMsgIds.add(m.id));
    const ta=document.getElementById('dashMsgInput');
    if(ta && _activeCid && window.matchMedia('(min-width:721px)').matches){ try{ ta.focus({preventScroll:true}); }catch(e){} }
  }

  // ════════════════════════ SMALL PARTS ════════════════════════
  function pipeline(stages){
    const max=Math.max(1,...stages.map(s=>s[1]));
    return `<div class="dash-pipe">${stages.map(([label,n],i)=>`
      <div class="dash-pipe-step" data-reveal>
        <div class="dash-pipe-bar"><span style="height:${Math.max(8,Math.round(n/max*100))}%;animation-delay:${i*70}ms"></span></div>
        <div class="dash-pipe-n">${Number(n)||0}</div>
        <div class="dash-pipe-l">${esc(label)}</div>
      </div>`).join('')}</div>`;
  }

  function taskRow(label, href, view){
    const act = href ? `onclick="location.href='${href}'"` : view ? `onclick="dashSetView('${view}')"` : '';
    return `<li class="dash-task" ${act}><span class="dash-task-ic">${I.bolt}</span><span>${esc(label)}</span><span class="dash-task-go">→</span></li>`;
  }

  function dashToast(t,m){ if(typeof toast==='function') toast(t,m); }
  window.dashToast=dashToast;

  // ─── Decorative hero illustrations ───
  function heroBlobTalent(){
    return `<svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="24" y="40" width="172" height="110" rx="14" fill="#fff" opacity=".14"/>
      <rect x="40" y="60" width="78" height="10" rx="5" fill="#fff" opacity=".5"/>
      <rect x="40" y="80" width="120" height="8" rx="4" fill="#fff" opacity=".3"/>
      <rect x="40" y="98" width="100" height="8" rx="4" fill="#fff" opacity=".3"/>
      <circle cx="166" cy="64" r="14" fill="#fff" opacity=".55"/>
      <rect x="40" y="120" width="54" height="18" rx="9" fill="#fff" opacity=".7"/>
      <g class="dash-float"><circle cx="190" cy="36" r="20" fill="#fff" opacity=".22"/><path d="M183 36l5 5 9-10" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>
    </svg>`;
  }
  function heroBlobClient(){
    return `<svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="24" y="40" width="172" height="110" rx="14" fill="#fff" opacity=".14"/>
      <circle cx="70" cy="84" r="20" fill="#fff" opacity=".5"/>
      <circle cx="118" cy="84" r="20" fill="#fff" opacity=".34"/>
      <circle cx="166" cy="84" r="20" fill="#fff" opacity=".22"/>
      <rect x="50" y="118" width="120" height="10" rx="5" fill="#fff" opacity=".4"/>
      <g class="dash-float"><circle cx="190" cy="40" r="18" fill="#fff" opacity=".26"/><path d="M190 32v16M182 40h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>
    </svg>`;
  }
})();
