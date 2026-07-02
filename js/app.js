// ═══════════════════════════ OAuth Configuration ═══════════════════════════
// Fill these with your actual credentials from Google & Apple consoles
const OAUTH_CONFIG = {
  GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE',  // Get from console.cloud.google.com
  // For Apple Sign-In: you'll need a backend to handle the secret key exchange
  // See: https://developer.apple.com/sign-in-with-apple/get-started
};

// ═══════════════════════════════════════════════════════════════════════════

const IC = {
  dev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12"/></svg>',
  data:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  sec:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10a4 4 0 00-7.7-1.3A3.5 3.5 0 106 16h11a3.5 3.5 0 001-6.9z"/></svg>',
  support:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  design:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="12" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="13" r="2.5"/><path d="M12 22a2 2 0 002-2c0-1.1-.9-2-2-2s-2-.9-2-2a4 4 0 014-4"/></svg>',
  port:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16v12H4zM8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  star:'<svg viewBox="0 0 24 24"><path d="M12 2l3 7 7 .5-5.5 4.5 2 7L12 17l-6.5 4 2-7L2 9.5 9 9z"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 13l4 4 10-10"/></svg>'
};

const CATEGORIES = [
  {id:'dev',  name:'Software Development', icon:IC.dev,  skills:['React','Node.js','C#/.NET','Python','Java','Flutter','PostgreSQL','REST APIs']},
  {id:'data', name:'Data Science & AI',   icon:IC.data, skills:['Python','Pandas','SQL','Machine Learning','Power BI','TensorFlow','Data cleaning']},
  {id:'sec',  name:'Cybersecurity',       icon:IC.sec,  skills:['Pen-testing','SIEM','Network security','Vulnerability scanning','Linux']},
  {id:'cloud',name:'Cloud & DevOps',      icon:IC.cloud,skills:['Azure','AWS','Docker','CI/CD','Linux','Kubernetes']},
  {id:'support',name:'IT Support',        icon:IC.support,skills:['Troubleshooting','Networking','Windows','Hardware','Help desk']},
  {id:'design',name:'UI/UX & Web Design', icon:IC.design,skills:['Figma','UI design','Tailwind CSS','Prototyping','HTML/CSS','Webflow']}
];
const catById = id => CATEGORIES.find(c=>c.id===id);

// ─── Real talent (Firestore-backed) ──────────────────────────────────
// TALENT is populated from Firestore (users where role=='talent') once the
// firebaseDB helpers are ready. Every consumer (catalog, Smart Match,
// featured, dashboard recommendations) reads this cache. No hardcoded users.
let TALENT = [];
let TALENT_LOADED = false;
let _talentLoadPromise = null;
let _ratingCache = {};        // talentUid → {avg, count} (from getAllRatings)
let _ratingsLoaded = false;

// Map a public Firestore profile doc → the card shape the UI expects.
// Real users have no ratings/reviews/skill-matrix/portfolio yet → null,
// and the UI shows a "New" badge / placeholders instead of fake data.
function talentDocToCard(d){
  const name = d.displayName || 'Workley member';
  const uniParts = [];
  if(d.course) uniParts.push(d.course);
  if(d.university) uniParts.push(d.university);
  return {
    id: d.id, uid: d.id, name, initials: initials(name),
    username: d.username || '',
    grad: d.status === 'grad' ? 'grad' : 'student',
    statusRaw: d.status || '', experience: d.experience || '',
    uni: uniParts.join(' · '), university: d.university || '', course: d.course || '', gradYear: d.gradYear || '',
    degreeYear: d.degreeYear || '', startYear: d.startYear || '',
    cat: d.field || '',
    rate: (d.rate != null && d.rate !== '') ? (Number(d.rate) || 0) : null,
    rating: null, reviews: 0,
    blurb: d.bio || '', title: d.title || '',
    skills: Array.isArray(d.skills) ? d.skills : [],
    softSkills: Array.isArray(d.softSkills) ? d.softSkills : [],
    hobbies: d.hobbies || '', avatar: d.avatar || null,
    website: d.website || '', certifications: d.certifications || '', workExperience: d.workExperience || '',
    portfolio: Array.isArray(d.portfolio) ? d.portfolio : [],
    matrix: null, port: null, isReal: true
  };
}

// Load (or refresh) the talent cache from Firestore, then refresh any
// talent-driven UI on the current page and notify other modules.
function loadTalent(force){
  if(_talentLoadPromise && !force) return _talentLoadPromise;
  if(!window.firebaseDB){ return Promise.resolve(TALENT); }
  _talentLoadPromise = window.firebaseDB.listTalent(60).then(docs=>{
    TALENT = (docs || []).map(talentDocToCard);
    TALENT_LOADED = true;
    _mergeSelfIntoTalent();   // always show the signed-in talent their own card
    if(document.getElementById('talentGrid')) renderTalent();
    if(document.getElementById('featGrid'))   renderFeatured();
    if(document.getElementById('catGrid'))    renderCats();
    loadRatings();   // fetch review aggregates, then re-render stars in place
    try { document.dispatchEvent(new CustomEvent('workley:talentLoaded')); } catch(e){}
    return TALENT;
  }).catch(()=>{ TALENT_LOADED = true; _mergeSelfIntoTalent(); return TALENT; });
  return _talentLoadPromise;
}
// Apply review aggregates onto the loaded talent cards (avg stars + count).
function applyRatings(map){
  if(!map) return;
  _ratingCache = map;
  TALENT.forEach(t=>{
    const r = map[t.id];
    t.rating  = r ? Math.round(r.avg*10)/10 : null;
    t.reviews = r ? r.count : 0;
  });
}
// One collection-group read → real star ratings on the catalog grid/featured.
function loadRatings(){
  if(!window.firebaseDB || !window.firebaseDB.getAllRatings) return Promise.resolve();
  return window.firebaseDB.getAllRatings().then(map=>{
    applyRatings(map);
    _ratingsLoaded = true;
    if(document.getElementById('talentGrid')) renderTalent();
    if(document.getElementById('featGrid'))   renderFeatured();
  }).catch(()=>{});
}
// Build a catalog card for the signed-in user from their saved local profile.
function _selfTalentDoc(){
  const uid = window.firebaseUser && window.firebaseUser.uid;
  if(!uid) return null;
  let p=null; try{ p=JSON.parse(localStorage.getItem('workley_profile_'+uid)||'null'); }catch(e){}
  if(!p || p.role!=='talent') return null;
  // Only list reasonably-complete talent (a field + at least one skill).
  if(!p.field && !(p.skills && p.skills.length)) return null;
  let fullName=''; try{ fullName=localStorage.getItem('workley_signup_name_'+(((window.firebaseUser.email)||'').toLowerCase()))||''; }catch(e){}
  const name = fullName || (USER&&USER.name) || window.firebaseUser.displayName || 'Workley member';
  return Object.assign({ id: uid, displayName: name }, p);
}
// Inject (or refresh) the signed-in talent's own card so they always appear in
// the catalog - even before their Firestore write has propagated or if reads
// are blocked. No duplicate: refreshes in place when already present.
function _mergeSelfIntoTalent(){
  const d=_selfTalentDoc(); if(!d) return false;
  const card=talentDocToCard(d);
  const i=TALENT.findIndex(t=>String(t.id)===String(d.id));
  if(i>=0) TALENT[i]=card; else TALENT.unshift(card);
  return true;
}
function getTalentById(id){ return TALENT.find(t => String(t.id) === String(id)) || null; }
function talentInCat(catId){ return TALENT.filter(t => t.cat === catId).length; }

// firebase-config.js calls this once Firestore helpers are live (it's a
// deferred module, so it runs after this classic script's bootstrap).
window.onFirebaseDBReady = function(){ loadTalent(); };

function renderCats(){
  const _g=document.getElementById('catGrid'); if(!_g)return;
  _g.innerHTML = CATEGORIES.map(c=>{
    const count = talentInCat(c.id);
    const avail = !TALENT_LOADED ? 'View talent' : (count + ' available');
    return `<div class="cat-card" onclick="filterToCat('${c.id}')" role="button" tabindex="0" onkeypress="if(event.key==='Enter')filterToCat('${c.id}')"><div class="cat-icon">${c.icon}</div><h3>${c.name}</h3><div class="cat-meta"><span>${avail}</span><span class="cat-go">Browse →</span></div></div>`;
  }).join('');
}

let wiz = {cat:null,skills:[],budget:300,len:'short',oneOffAmount:''};
function renderWizCats(){const _w=document.getElementById('wizCats'); if(!_w)return; _w.innerHTML = CATEGORIES.map(c=>`<div class="opt" data-c="${c.id}" onclick="pickWizCat('${c.id}')"><span class="oi">${c.icon}</span>${c.name}</div>`).join('');}
function pickWizCat(id){wiz.cat=id;wiz.skills=[];document.querySelectorAll('#wizCats .opt').forEach(o=>o.classList.toggle('sel',o.dataset.c===id));document.getElementById('next1').disabled=false;}
function renderWizSkills(){const c=catById(wiz.cat);if(!c)return;document.getElementById('wizSkills').innerHTML=c.skills.map(s=>`<button class="spill ${wiz.skills.includes(s)?'sel':''}" onclick="toggleWizSkill('${s.replace(/'/g,"\\'")}')">${s}</button>`).join('');document.getElementById('next2').disabled=wiz.skills.length===0;}
function toggleWizSkill(s){wiz.skills.includes(s)?wiz.skills=wiz.skills.filter(x=>x!==s):wiz.skills.push(s);renderWizSkills();}
// Maximum hourly rate - slider. At the top of the range we treat the value as
// "Any rate" (no cap → budget 9999, matching the old "Any" segment behaviour).
function setBudget(v){
  v=+v;
  const any = v>=600;
  wiz.budget = any ? 9999 : v;
  const lbl=document.getElementById('wizBudgetVal');
  if(lbl) lbl.textContent = any ? 'Any rate' : ('R'+v);
  const r=document.getElementById('wizBudgetRange');
  if(r) r.style.setProperty('--pct', (((v-100)/500)*100) + '%');
}
function pickLen(el,v){wiz.len=v;document.querySelectorAll('#wizLen button').forEach(b=>b.classList.toggle('sel',b===el));const oo=document.getElementById('wizOneOff');if(oo)oo.hidden=(v!=='short');}
// One-off project budget (a single fixed amount; only shown for the 'One-off' option)
function setOneOff(v){ wiz.oneOffAmount = (v==null?'':String(v).replace(/[^\d]/g,'')); }
function setWizStep(n){if(!document.getElementById('wizSteps'))return;document.querySelectorAll('#wizSteps .wstep').forEach(w=>w.classList.toggle('active',+w.dataset.s===n));document.querySelectorAll('#wizRight .wiz-panel').forEach(p=>p.classList.toggle('show',+p.dataset.panel===n));}
function wizGo(n){if(n===2)renderWizSkills();setWizStep(n);}
function scoreStudent(s){
  let score=0;
  if(s.cat===wiz.cat)score+=22;
  const have=wiz.skills.filter(sk=>s.skills.includes(sk)).length;
  score+=wiz.skills.length?(have/wiz.skills.length)*52:0;
  const rate = (s.rate!=null)?s.rate:wiz.budget;
  if(rate<=wiz.budget)score+=14;else score+=Math.max(0,14-(rate-wiz.budget)/20);
  // Real talent has no rating yet → neutral baseline so they aren't penalised.
  score+=((s.rating||4.5)/5)*12;
  return{score:Math.min(99,Math.round(score)),have};
}
function runMatch(){
  setWizStep(4);
  const box=document.getElementById('wizResults');
  const c=catById(wiz.cat);
  box.innerHTML=`<div class="analyzing"><div class="spinner"></div><div class="a-txt">Matching talent…</div><div class="a-sub">Scoring verified skills &amp; rate fit</div></div>`;
  const finish=()=>{
    const pool = TALENT.filter(t=>t.cat && t.skills && t.skills.length);
    if(!pool.length){
      box.innerHTML=`<div class="no-results" style="text-align:center;padding:30px 18px">
        <strong>No talent to match yet.</strong><br>
        ${TALENT_LOADED?'Be the first ICT talent on Workley - verified students &amp; graduates will appear here as they join.':'Loading talent…'}
        <div class="wiz-nav" style="justify-content:center;margin-top:18px"><button class="btn btn-ghost btn-sm" onclick="resetWiz()">↻ Start over</button></div></div>`;
      return;
    }
    const ranked=pool.map(s=>({s,...scoreStudent(s)})).sort((a,b)=>b.score-a.score||(b.s.rating||0)-(a.s.rating||0)).slice(0,3);
    box.innerHTML=`<h4>Your top matches</h4><p class="hint">Ranked by fit for <strong>${c.name}</strong> · skills: ${_esc(wiz.skills.join(', '))}</p>`+ranked.map(r=>{
      const matched=wiz.skills.filter(sk=>r.s.skills.includes(sk));
      const mChips=matched.length
        ?matched.map(m=>`<span class="chip match">${_esc(m)}</span>`).join('')
        :'<span class="chip">Related skills</span>';
      const rate = r.s.rate!=null ? `R${r.s.rate}<span>/hr</span>` : 'Rate on request';
      return `<div class="result-card" onclick="openProfile('${r.s.id}')" style="cursor:pointer;">
        <div class="rc-top">
          <div class="avatar peek-trigger" onclick="quickPeek('${r.s.id}',event)" role="button" tabindex="0" title="Quick preview" aria-label="Quick preview of ${_esc(r.s.name)}" onkeydown="if(event.key==='Enter'){event.stopPropagation();quickPeek('${r.s.id}',event)}">${avatarInner(r.s)}</div>
          <div class="rc-info">
            <div class="name">${_esc(r.s.name)}</div>
            <div class="sub">${_esc(r.s.uni||'ICT talent')}</div>
          </div>
          <div class="ring ring-sm">
            <svg width="38" height="38" viewBox="0 0 54 54">
              <circle class="track" cx="27" cy="27" r="22" stroke-width="6" fill="none"/>
              <circle class="prog" cx="27" cy="27" r="22" stroke-width="6" fill="none"
                stroke-linecap="round" stroke-dasharray="138" stroke-dashoffset="138"/>
            </svg>
            <span class="val">${r.score}%</span>
          </div>
        </div>
        <div class="rc-foot">
          <div class="chips">${mChips}</div>
          <div class="rc-rate">${rate}</div>
        </div>
      </div>`;
    }).join('')+`<div class="wiz-nav" style="justify-content:center;gap:12px;"><button class="btn btn-ghost btn-sm" onclick="resetWiz()">↻ Start over</button><button class="btn btn-primary btn-sm" onclick="openProfile('${ranked[0].s.id}')">View top match →</button></div>`;
    requestAnimationFrame(()=>{document.querySelectorAll('#wizResults .ring .prog').forEach((c2,i)=>{c2.style.strokeDashoffset=138-(138*ranked[i].score/100);});});
    toast('Match complete','We found '+ranked.length+' strong candidate'+(ranked.length===1?'':'s')+' for you.');
  };
  // Ensure talent is loaded before matching.
  (TALENT_LOADED ? Promise.resolve() : loadTalent()).then(()=>setTimeout(finish, 700));
}
function resetWiz(){wiz={cat:null,skills:[],budget:300,len:'short',oneOffAmount:''};document.querySelectorAll('#wizCats .opt').forEach(o=>o.classList.remove('sel'));document.getElementById('next1').disabled=true;const r=document.getElementById('wizBudgetRange');if(r)r.value=300;setBudget(300);document.querySelectorAll('#wizLen button').forEach(b=>b.classList.toggle('sel',b.dataset.l==='short'));const ooi=document.getElementById('wizOneOffInput');if(ooi)ooi.value='';const oo=document.getElementById('wizOneOff');if(oo)oo.hidden=false;setWizStep(1);}

function renderFilterCats(){const _f=document.getElementById('filterCats'); if(!_f)return; _f.innerHTML=CATEGORIES.map(c=>`<label class="check"><input type="checkbox" class="fcat" value="${c.id}" checked onchange="renderTalent()"> ${c.name}</label>`).join('');}
function getActiveCats(){return [...document.querySelectorAll('.fcat:checked')].map(c=>c.value);}
function starsHtml(r){return `<span class="stars">${IC.star} ${Number(r).toFixed(1)}</span>`;}
// Real talent has no rating yet → show a "New" pill instead of fake stars.
function ratingOrNew(t){ return (t && t.rating) ? starsHtml(t.rating) : '<span class="new-badge">New</span>'; }
// Avatar inner: profile image if present, else initials.
function avatarInner(t){ return (t && t.avatar) ? `<img src="${_esc(t.avatar)}" alt="" loading="lazy">` : _esc((t&&t.initials)||'U'); }
// Degree-year tag for the catalog card (students only).
function yearTag(s){
  if(!s) return '';
  const cap = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5"/></svg>';
  // Graduates get a blue "Graduate" badge; current students show their year of study.
  if(s.grad === 'grad') return `<div class="tyear">${cap}Graduate</div>`;
  if(s.degreeYear && s.grad === 'student') return `<div class="tyear">${cap}${_esc(s.degreeYear)}</div>`;
  return '';
}
// Catalog skill chips: show up to 4, then a "+N" pill so blocks stay uniform.
function catalogChips(skills){
  const sk = Array.isArray(skills) ? skills : [];
  const shown = sk.slice(0,4).map(x=>`<span class="chip">${_esc(x)}</span>`).join('');
  const more = sk.length > 4 ? `<span class="chip chip-more">+${sk.length-4}</span>` : '';
  return shown + more;
}
function rateHtml(t){ return (t && t.rate!=null) ? `<div class="rate">R${t.rate}<span>/hr</span></div>` : '<div class="rate rate-tba">Rate on request</div>'; }
function renderTalent(){
  if(!document.getElementById('talentGrid'))return;
  const q=((document.getElementById('searchInput')?document.getElementById('searchInput').value:'')||'').toLowerCase().trim();
  const maxRate=+document.getElementById('rateRange').value;
  document.getElementById('rateLabel').textContent='R'+maxRate+'/hr';
  const cats=getActiveCats(),showStudent=document.getElementById('fStudent').checked,showGrad=document.getElementById('fGrad').checked,sort=document.getElementById('sortSel').value;
  const grid=document.getElementById('talentGrid');
  const countEl=document.getElementById('talentCount');
  // Still loading from Firestore → quiet skeleton.
  if(!TALENT_LOADED){
    if(countEl)countEl.textContent='Loading…';
    grid.innerHTML='<div class="no-results"><div class="pf-loading-spinner" style="width:30px;height:30px;border:3px solid var(--blue-50);border-top-color:var(--blue);border-radius:50%;margin:0 auto 12px;animation:spin .8s linear infinite"></div>Finding verified talent…</div>';
    return;
  }
  let list=TALENT.filter(s=>{
    if(!cats.includes(s.cat))return false;
    if(s.rate!=null && s.rate>maxRate)return false;
    if(s.grad==='student'&&!showStudent)return false;
    if(s.grad==='grad'&&!showGrad)return false;
    if(q){const qn=q.replace(/^@/,'');const hay=(s.name+' @'+(s.username||'')+' '+s.uni+' '+(s.skills||[]).join(' ')).toLowerCase();if(!hay.includes(qn))return false;}
    return true;
  });
  if(sort==='rating')list.sort((a,b)=>(b.rating||0)-(a.rating||0)||(b.reviews||0)-(a.reviews||0));
  if(sort==='low')list.sort((a,b)=>(a.rate==null?Infinity:a.rate)-(b.rate==null?Infinity:b.rate));
  if(sort==='high')list.sort((a,b)=>(b.rate==null?-1:b.rate)-(a.rate==null?-1:a.rate));
  if(countEl)countEl.textContent=list.length+' '+(list.length===1?'person':'people')+' available';
  // Empty: distinguish "no talent at all" from "filtered everything out".
  if(!list.length){
    grid.innerHTML = TALENT.length
      ? '<div class="no-results"><strong>No talent matches these filters.</strong><br>Try widening your rate range or selecting more fields.</div>'
      : '<div class="no-results"><strong>No talent has joined yet.</strong><br>Verified ICT students &amp; graduates will appear here as they sign up. Know someone? Invite them to create a profile.</div>';
    return;
  }
  grid.innerHTML=list.map(s=>`<div class="tcard" onclick="openProfile('${s.id}')" role="button" tabindex="0" onkeypress="if(event.key==='Enter')openProfile('${s.id}')"><div class="thead"><div class="avatar peek-trigger" onclick="quickPeek('${s.id}',event)" role="button" tabindex="0" title="Quick preview" aria-label="Quick preview of ${_esc(s.name)}" onkeydown="if(event.key==='Enter'){event.stopPropagation();quickPeek('${s.id}',event)}">${avatarInner(s)}</div><div style="min-width:0"><div class="name">${_esc(s.name)}${s.username?` <span class="uname-pill">@${_esc(s.username)}</span>`:''}</div><div class="uni">${_esc(s.uni||'ICT talent')}</div><div class="tcard-badges">${yearTag(s)}<span class="verified">${IC.check} Verified</span></div></div></div><div class="blurb">${_esc(s.blurb)||'<span style="color:var(--muted)">No bio yet.</span>'}</div><div class="chips">${catalogChips(s.skills)}</div><div class="tfoot">${ratingOrNew(s)}${rateHtml(s)}</div></div></div>`).join('');
}
function resetFilters(){document.getElementById('searchInput').value='';document.getElementById('rateRange').value=400;document.getElementById('fStudent').checked=true;document.getElementById('fGrad').checked=true;document.querySelectorAll('.fcat').forEach(c=>c.checked=true);document.getElementById('sortSel').value='rating';renderTalent();}
// Slide the filter panel in/out. Collapsed by default so the catalog shows
// talent cards first; this reveals the filters on demand (desktop + mobile).
function toggleFilters(btn){
  const grid = (btn && btn.closest) ? btn.closest('.browse-grid') : document.querySelector('.browse-grid');
  if(!grid) return;
  const open = grid.classList.toggle('filters-open');
  if(btn){ btn.classList.toggle('active', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
}
function filterToCat(id){
  openCatalog();
  // slight delay so catalog is visible before filtering
  setTimeout(function(){
    document.querySelectorAll('.fcat').forEach(c=>c.checked=(c.value===id));
    document.getElementById('rateRange').value=400;
    renderTalent();
  },80);
}

function openProfile(id){
  const cached = getTalentById(id);
  if(cached){ _renderProfileModal(cached); _trackProfileView(id, cached); return; }
  // Not in the loaded page cache (e.g. a deep link) → fetch from Firestore.
  document.getElementById('modal').innerHTML = '<div class="modal-body" style="text-align:center;padding:46px 20px"><div class="pf-loading-spinner" style="width:34px;height:34px;border:3px solid var(--blue-50);border-top-color:var(--blue);border-radius:50%;margin:0 auto 14px;animation:spin .8s linear infinite"></div><p style="color:var(--muted)">Loading profile…</p></div>';
  showOverlay();
  if(window.firebaseDB){
    window.firebaseDB.getProfile(id).then(docu=>{
      if(!docu || docu.role!=='talent'){
        document.getElementById('modal').innerHTML = '<div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div><div class="modal-body" style="text-align:center;padding:0 20px 30px"><p style="color:var(--muted)">This profile is no longer available.</p></div>';
        return;
      }
      const t = talentDocToCard(docu);
      _renderProfileModal(t);
      _trackProfileView(id, t);
    });
  } else {
    document.getElementById('modal').innerHTML = '<div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div><div class="modal-body" style="text-align:center;padding:0 20px 30px"><p style="color:var(--muted)">Profiles load once you\'re online.</p></div>';
  }
}

// Talent-facing CLIENT profile (reached from a job post, an invite, or a message
// thread - never the catalog). Shows the client's public info but NEVER their
// contact details: email/phone live in an owner-only subcollection and are shared
// only once the two are working together.
function openClientProfile(uid){
  if(!uid) return;
  const loading = '<div class="modal-body" style="text-align:center;padding:46px 20px"><div class="pf-loading-spinner" style="width:34px;height:34px;border:3px solid var(--blue-50);border-top-color:var(--blue);border-radius:50%;margin:0 auto 14px;animation:spin .8s linear infinite"></div><p style="color:var(--muted)">Loading…</p></div>';
  document.getElementById('modal').classList.remove('auth-modal');
  document.getElementById('modal').innerHTML = loading;
  showOverlay();
  const fail = (msg)=>{ document.getElementById('modal').innerHTML = '<div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div><div class="modal-body" style="padding:0 20px 30px"><p style="color:var(--muted)">'+msg+'</p></div>'; };
  if(!window.firebaseDB || !window.firebaseDB.getProfile){ fail('Profiles load once you\'re online.'); return; }
  window.firebaseDB.getProfile(uid).then(d=>{
    if(!d || d.role!=='client'){ fail('This profile isn\'t available.'); return; }
    _renderClientProfileModal(Object.assign({id:uid}, d));
  }).catch(()=> fail('Couldn\'t load this profile.'));
}
function _renderClientProfileModal(c){
  _lastClientProfile = c;
  const name = c.orgName || c.displayName || 'Client';
  const typeLabel = ({individual:'Individual',startup:'Startup',small:'Small organization',large:'Established company'})[c.clientType] || 'Client';
  const timeLabel = ({now:'Ready to hire now',month:'Hiring within a month',exploring:'Exploring options'})[c.timing] || '';
  const needs = Array.isArray(c.needs) ? c.needs : [];
  const init = (typeof initials==='function') ? initials(name) : (name[0]||'C');
  const avatar = c.avatar ? `<img src="${_esc(c.avatar)}" alt="">` : _esc(init);
  const needsBlock = needs.length ? `<h4 style="font-size:.95rem;margin:22px 0 12px">Looking for</h4><div class="chips">${needs.map(id=>`<span class="chip">${_esc((catById(id)||{}).name||id)}</span>`).join('')}</div>` : '';
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div style="display:flex;gap:14px;align-items:center"><button class="avatar peek-trigger" style="width:58px;height:58px;font-size:1.3rem;border:0;padding:0;cursor:pointer" onclick="openClientPhoto()" title="View photo" aria-label="View ${_esc(name)}'s photo">${avatar}</button><div><h3 style="font-size:1.3rem">${_esc(name)}</h3><div style="font-size:.85rem;color:var(--muted)">${_esc(typeLabel)}${c.industry?' · '+_esc(c.industry):''}</div><div style="margin-top:5px"><span class="verified">${IC.check} Verified email</span></div></div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="modal-body">
      ${c.description?`<p style="color:var(--ink-soft);margin-bottom:18px">${_esc(c.description).replace(/\n/g,'<br>')}</p>`:''}
      <div class="stat-row"><div class="stat"><div class="sl">Type</div><div class="sv" style="font-size:.95rem">${_esc(typeLabel)}</div></div><div class="stat"><div class="sl">Industry</div><div class="sv" style="font-size:.95rem">${_esc(c.industry||'-')}</div></div><div class="stat"><div class="sl">Province</div><div class="sv" style="font-size:.95rem">${_esc(c.location||'-')}</div></div></div>
      ${needsBlock}
      ${timeLabel?`<h4 style="font-size:.95rem;margin:22px 0 8px">Hiring timeline</h4><p style="color:var(--ink-soft)">${_esc(timeLabel)}</p>`:''}
      <p style="color:var(--muted);font-size:.84rem;margin-top:22px;display:flex;gap:8px;align-items:center"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Contact details are shared once you're working together.</p>
    </div>`;
  showOverlay();
}

// ── Photo preview: clicking a talent's avatar enlarges their PROFILE PHOTO
// in a lightbox (smooth zoom+fade), separate from opening the full profile. ──
function quickPeek(id, ev){
  if(ev){ try{ ev.stopPropagation(); }catch(e){} }
  // Prefer the catalog cache; fall back to the currently-open profile (covers
  // deep-linked profiles not in the cache, e.g. clicking the photo in the modal).
  const s = getTalentById(id) || ((_lastProfileData && String(_lastProfileData.id)===String(id)) ? _lastProfileData : null);
  if(!s){ return; }
  let layer = document.getElementById('peekLayer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'peekLayer';
    layer.className = 'peek-layer';
    layer.addEventListener('click', e=>{ if(e.target===layer) closePeek(); });
    document.body.appendChild(layer);
  }
  // Real photo → enlarge it; no photo → show the initials placeholder enlarged.
  const media = s.avatar
    ? `<img class="peek-photo" src="${_esc(s.avatar)}" alt="Profile photo of ${_esc(s.name)}">`
    : `<div class="peek-photo peek-photo-initials">${_esc(s.initials||'U')}</div>`;
  layer.innerHTML = `
    <figure class="peek-photo-wrap" role="dialog" aria-modal="true" aria-label="Profile photo of ${_esc(s.name)}">
      <button class="peek-x" aria-label="Close" onclick="closePeek()">×</button>
      ${media}
      <figcaption class="peek-caption">
        <span class="peek-caption-name">${_esc(s.name)}</span>
        <span class="peek-caption-sub">${_esc(s.uni||'ICT talent')}</span>
        <div class="peek-actions" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          ${_talentActionBtns(s, true)}
        </div>
      </figcaption>
    </figure>`;
  document.body.style.overflow='hidden';
  // Force a reflow so the start state (opacity:0/scale) is committed, then add
  // .show so the CSS transition reliably plays (rAF can be throttled in bg tabs).
  void layer.offsetWidth;
  layer.classList.add('show');
  document.addEventListener('keydown', _peekEsc);
}
function closePeek(){
  const layer=document.getElementById('peekLayer');
  if(!layer) return;
  layer.classList.remove('show');
  document.removeEventListener('keydown', _peekEsc);
  // restore scroll only if no heavier overlay (full profile modal) is open
  setTimeout(()=>{
    const ov=document.getElementById('overlay');
    if(!ov || !ov.classList.contains('show')) document.body.style.overflow='';
  }, 230);
}
function _peekEsc(e){ if(e.key==='Escape') closePeek(); }

// Generic enlarged-photo lightbox (reuses the talent photo-peek layer): shows a
// profile photo (or initials) with a name caption and no action buttons. Used so
// talent can click a client's profile photo to see it bigger.
let _lastClientProfile = null;
function openPhotoLightbox(src, name, initialsTxt){
  let layer = document.getElementById('peekLayer');
  if(!layer){
    layer = document.createElement('div'); layer.id = 'peekLayer'; layer.className = 'peek-layer';
    layer.addEventListener('click', e=>{ if(e.target===layer) closePeek(); });
    document.body.appendChild(layer);
  }
  const media = src
    ? `<img class="peek-photo" src="${_esc(src)}" alt="Profile photo of ${_esc(name)}">`
    : `<div class="peek-photo peek-photo-initials">${_esc(initialsTxt||'U')}</div>`;
  layer.innerHTML = `
    <figure class="peek-photo-wrap" role="dialog" aria-modal="true" aria-label="Profile photo of ${_esc(name)}">
      <button class="peek-x" aria-label="Close" onclick="closePeek()">×</button>
      ${media}
      <figcaption class="peek-caption"><span class="peek-caption-name">${_esc(name)}</span></figcaption>
    </figure>`;
  document.body.style.overflow='hidden';
  void layer.offsetWidth;
  layer.classList.add('show');
  document.addEventListener('keydown', _peekEsc);
}
function openClientPhoto(){
  const c = _lastClientProfile; if(!c) return;
  const name = c.orgName || c.displayName || 'Client';
  const init = (typeof initials==='function') ? initials(name) : (name[0]||'C');
  openPhotoLightbox(c.avatar || null, name, init);
}

// ── Document/file preview: clicking an uploaded file (CV, certificate, sample)
// opens it in a lightbox. Images render inline; PDFs in an embedded frame;
// anything else (doc/docx) opens in a new tab since browsers can't render it. ──
function previewFile(url, name, type){
  if(!url) return;
  const isImg = /^image\//.test(type||'') || /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url);
  const isPdf = /pdf/i.test(type||'') || /\.pdf(\?|$)/i.test(url);
  if(!isImg && !isPdf){ window.open(url, '_blank', 'noopener'); return; }
  let layer = document.getElementById('docPreviewLayer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'docPreviewLayer';
    layer.className = 'doc-preview-layer';
    layer.addEventListener('click', e=>{ if(e.target===layer) closeDocPreview(); });
    document.body.appendChild(layer);
  }
  const body = isImg
    ? `<img src="${_esc(url)}" alt="${_esc(name||'')}" class="doc-preview-img">`
    : `<iframe src="${_esc(url)}" class="doc-preview-frame" title="${_esc(name||'Document')}"></iframe>`;
  layer.innerHTML = `
    <div class="doc-preview-box" role="dialog" aria-modal="true" aria-label="${_esc(name||'Document preview')}">
      <div class="doc-preview-top">
        <span class="doc-preview-name">${_esc(name||'Document')}</span>
        <a class="doc-preview-open" href="${_esc(url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>
        <button class="doc-preview-x" onclick="closeDocPreview()" aria-label="Close">×</button>
      </div>
      ${body}
    </div>`;
  document.body.style.overflow='hidden';
  void layer.offsetWidth;
  layer.classList.add('show');
  document.addEventListener('keydown', _docPreviewEsc);
}
function closeDocPreview(){
  const l=document.getElementById('docPreviewLayer');
  if(!l) return;
  l.classList.remove('show');
  document.removeEventListener('keydown', _docPreviewEsc);
  setTimeout(()=>{ const ov=document.getElementById('overlay'); if(!ov || !ov.classList.contains('show')) document.body.style.overflow=''; }, 230);
}
function _docPreviewEsc(e){ if(e.key==='Escape') closeDocPreview(); }

// Expanded-view portfolio: files (CV/certs/samples), website/social link,
// certifications and work experience. Shows only the sections that have data.
function portfolioHtml(s){
  const files = Array.isArray(s.portfolio) ? s.portfolio : [];
  const linkIc = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>';
  const hasExtras = files.length || s.website || s.certifications || s.workExperience;
  if(!hasExtras){
    return `<h4 style="font-size:.95rem;margin:24px 0 12px">Portfolio &amp; CV</h4>
      <div class="port-placeholder">${IC.port}<div><strong>Nothing here yet</strong><span>${_esc((s.name||'This talent').split(' ')[0])} hasn't added any files, links or extra details yet.</span></div></div>`;
  }
  let out = '';
  if(files.length){
    out += `<h4 style="font-size:.95rem;margin:24px 0 12px">Files &amp; CV</h4><div class="pf-files">`;
    out += files.slice(0,3).map(f=>{
      const url = f && f.url ? f.url : '';
      if(!url) return '';
      const isImg = /^image\//.test(f.type||'') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
      const thumb = isImg
        ? `<img src="${_esc(url)}" alt="" class="pf-file-thumb" loading="lazy">`
        : `<span class="pf-file-ic">${IC.port}</span>`;
      return `<a class="pf-file" href="${_esc(url)}" data-name="${_esc(f.name||'File')}" data-type="${_esc(f.type||'')}" target="_blank" rel="noopener noreferrer" onclick="event.preventDefault();previewFile(this.href,this.dataset.name,this.dataset.type)">${thumb}<span class="pf-file-name">${_esc(f.name||'File')}</span></a>`;
    }).join('');
    out += `</div>`;
  }
  if(s.website){
    const href = /^https?:\/\//i.test(s.website) ? s.website : ('https://'+s.website);
    out += `<h4 style="font-size:.95rem;margin:22px 0 10px">Website / social</h4>
      <a class="pf-link" href="${_esc(href)}" target="_blank" rel="noopener noreferrer">${linkIc}<span>${_esc(s.website)}</span></a>`;
  }
  if(s.certifications){
    out += `<h4 style="font-size:.95rem;margin:22px 0 10px">Certifications</h4><p class="pf-text">${_esc(s.certifications).replace(/\n/g,'<br>')}</p>`;
  }
  if(s.workExperience){
    out += `<h4 style="font-size:.95rem;margin:22px 0 10px">Work experience</h4><p class="pf-text">${_esc(s.workExperience).replace(/\n/g,'<br>')}</p>`;
  }
  return out;
}

let _lastProfileData = null;   // the talent shown in the open profile modal (for photo peek)
function _renderProfileModal(s){
  _lastProfileData = s;
  document.getElementById('modal').classList.remove('auth-modal');
  const c = catById(s.cat);
  const fieldName = c ? c.name : '-';
  const statusLabel = s.grad==='grad' ? 'Graduate' : 'Current student';
  const ratingRow = s.rating
    ? `${starsHtml(s.rating)}<span style="font-size:.8rem;color:var(--muted)">(${s.reviews} reviews)</span>`
    : '<span class="new-badge">New talent</span>';
  const rateVal = s.rate!=null ? `R${s.rate}<span style="font-size:.8rem;font-weight:400;color:var(--muted)">/hr</span>` : 'On request';
  const skillsBlock = (s.skills && s.skills.length)
    ? `<h4 style="font-size:.95rem;margin:22px 0 12px">Skills</h4><div class="chips">${s.skills.map(sk=>`<span class="chip">${_esc(sk)}</span>`).join('')}</div>`
    : '';
  const softBlock = (s.softSkills && s.softSkills.length)
    ? `<h4 style="font-size:.95rem;margin:22px 0 12px">Soft skills</h4><div class="chips">${s.softSkills.map(sk=>`<span class="chip">${_esc(sk)}</span>`).join('')}</div>`
    : '';
  const portfolioBlock = portfolioHtml(s);
  document.getElementById('modal').innerHTML=`
    <div class="modal-head"><div style="display:flex;gap:14px;align-items:center"><div class="avatar peek-trigger" style="width:58px;height:58px;font-size:1.3rem" onclick="quickPeek('${s.id}',event)" role="button" tabindex="0" title="View photo" aria-label="View ${_esc(s.name)}'s photo" onkeydown="if(event.key==='Enter'){event.stopPropagation();quickPeek('${s.id}',event)}">${avatarInner(s)}</div><div><h3 style="font-size:1.3rem">${_esc(s.name)}${s.username?` <span class="uname-pill">@${_esc(s.username)}</span>`:''}</h3><div style="font-size:.85rem;color:var(--muted)">${_esc(s.uni||'ICT talent')}${(s.degreeYear && s.grad==='student')?' · '+_esc(s.degreeYear):''}</div><div style="margin-top:5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap" id="pfRatingRow">${ratingRow}<span class="verified">${IC.check} Verified</span></div></div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="modal-body">
      <p style="color:var(--ink-soft);margin-bottom:20px">${_esc(s.blurb) || '<span style="color:var(--muted)">No bio added yet.</span>'}</p>
      <div class="stat-row"><div class="stat"><div class="sl">Rate</div><div class="sv">${rateVal}</div></div><div class="stat"><div class="sl">Field</div><div class="sv" style="font-size:.95rem">${_esc(fieldName)}</div></div><div class="stat"><div class="sl">Status</div><div class="sv" style="font-size:.95rem">${statusLabel}</div></div></div>
      ${skillsBlock}
      ${softBlock}
      ${portfolioBlock}
      <div class="pf-reviews-head"><h4 style="font-size:.95rem;margin:24px 0 12px">Reviews</h4><div id="pfReviewAction"></div></div>
      <div id="pfReviews" data-tid="${s.id}" data-name="${_esc(s.name)}"><div class="pf-empty" style="color:var(--muted);font-size:.88rem">Loading reviews…</div></div>
      <div class="modal-foot">${_talentActionBtns(s, false)}</div>
    </div>`;
  showOverlay();
  loadProfileReviews(s.id, s.name);
}

// Render the star/comment reviews for a talent into the open profile modal,
// refresh the header rating, and surface a review action for eligible clients.
function loadProfileReviews(tid, talentName){
  if(!window.firebaseDB || !window.firebaseDB.getReviews) return;
  window.firebaseDB.getReviews(tid).then(list=>{
    const box=document.getElementById('pfReviews');
    if(!box || box.getAttribute('data-tid')!==String(tid)) return; // modal changed
    if(list.length){
      const avg = list.reduce((a,r)=>a+r.rating,0)/list.length;
      const row=document.getElementById('pfRatingRow');
      if(row) row.innerHTML = `${starsHtml(Math.round(avg*10)/10)}<span style="font-size:.8rem;color:var(--muted)">(${list.length} review${list.length===1?'':'s'})</span><span class="verified">${IC.check} Verified</span>`;
      box.innerHTML = list.map(r=>`
        <div class="pf-review">
          <div class="pf-review-top"><strong>${_esc(r.clientName)}</strong><span class="pf-review-stars">${starRow(r.rating)}</span></div>
          ${r.comment ? `<p class="pf-review-body">${_esc(r.comment)}</p>` : ''}
          ${r.at ? `<div class="pf-review-date">${r.at.toLocaleDateString('en-ZA',{year:'numeric',month:'short',day:'numeric'})}</div>` : ''}
        </div>`).join('');
    } else {
      box.innerHTML = '<div class="pf-empty" style="color:var(--muted);font-size:.88rem">No reviews yet. Reviews appear here once a client they\'ve worked with leaves one.</div>';
    }
    _maybeShowReviewButton(tid, talentName, list);
  });
}
// Show "Leave/Edit a review" only for a verified client who has an established
// (messaging) relationship with this talent - i.e. someone they've worked with.
function _maybeShowReviewButton(tid, talentName, list){
  const slot=document.getElementById('pfReviewAction');
  if(!slot || !USER || USER.role!=='client' || !window.firebaseUser) return;
  if(window.firebaseUser.uid===tid) return;
  const mine=(list||[]).find(r=>r.clientUid===window.firebaseUser.uid);
  // New reviews can only be left after PAYING the talent - that entry point lives
  // on the project member card. Here we only let a client EDIT a review they
  // already left (so they can always update it).
  if(mine){ slot.innerHTML=`<button class="btn btn-outline btn-sm" onclick="openReviewModal('${tid}','${_esc(talentName).replace(/'/g,"\\'")}')">Edit your review</button>`; }
}
// Five-star glyph row (filled vs empty) for a fixed rating.
function starRow(n){
  n=Math.max(0,Math.min(5,Math.round(Number(n)||0)));
  let out='';
  for(let i=1;i<=5;i++) out+=`<span class="rstar${i<=n?' on':''}">${IC.star}</span>`;
  return out;
}

// ── Leave / edit a review (clients only) ──────────────────────────────
let _reviewStars = 0, _reviewTid = null, _reviewName = '';
function openReviewModal(tid, talentName){
  if(!USER || USER.role!=='client' || !window.firebaseUser){ closeModal(); openLogin(); return; }
  _reviewTid = tid; _reviewName = talentName||'this talent'; _reviewStars = 0;
  const m=document.getElementById('modal');
  m.classList.add('auth-modal');
  m.innerHTML = `
    <div class="modal-head"><div><h3 style="font-size:1.25rem">Review ${_esc(_reviewName)}</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">Share your experience working together</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:14px">
      <div class="review-stars" id="reviewStars">${[1,2,3,4,5].map(i=>`<button type="button" class="rv-star" data-v="${i}" onclick="setReviewStars(${i})" onmouseover="hoverReviewStars(${i})" onmouseout="hoverReviewStars(0)" aria-label="${i} star${i>1?'s':''}">${IC.star}</button>`).join('')}</div>
      <div class="rv-star-label" id="rvStarLabel">Tap to rate</div>
      <div class="form-field" style="margin-top:16px"><label for="rvComment">Comment <span style="font-weight:400;color:var(--muted)">(optional)</span></label><textarea id="rvComment" rows="4" placeholder="What was it like working with ${_esc(_reviewName.split(' ')[0])}?" maxlength="1000"></textarea></div>
      <div class="auth-error" id="rvAuthErr"></div>
      <button class="btn btn-primary btn-block btn-lg" id="rvSubmit" onclick="submitReview()">Submit review</button>
    </div>`;
  showOverlay();
  // Prefill an existing review so the client can edit it.
  if(window.firebaseDB && window.firebaseDB.getReviews){
    window.firebaseDB.getReviews(tid).then(list=>{
      const mine=list.find(r=>r.clientUid===window.firebaseUser.uid);
      if(mine && _reviewTid===tid){ setReviewStars(mine.rating); const c=document.getElementById('rvComment'); if(c) c.value=mine.comment||''; }
    });
  }
}
function hoverReviewStars(v){
  const target=v||_reviewStars;
  document.querySelectorAll('#reviewStars .rv-star').forEach(b=>b.classList.toggle('on', +b.dataset.v <= target));
}
function setReviewStars(v){
  _reviewStars=v; hoverReviewStars(0);
  const lbl=document.getElementById('rvStarLabel');
  if(lbl) lbl.textContent=['Tap to rate','Poor','Fair','Good','Very good','Excellent'][v]||'Tap to rate';
}
function submitReview(){
  if(!_reviewStars){ showAuthError('rv','Please choose a star rating.'); return; }
  if(!window.firebaseUser){ closeModal(); openLogin(); return; }
  clearAuthError('rv');
  setAuthBusy('rvSubmit', true, 'Submitting…');
  const comment=(document.getElementById('rvComment')||{}).value||'';
  window.firebaseDB.addReview(_reviewTid, {
    clientUid: window.firebaseUser.uid,
    clientName: (USER&&USER.name) || window.firebaseUser.displayName || 'Workley client',
    rating: _reviewStars, comment
  }).then(ok=>{
    if(ok){
      closeModal();
      toast('Review submitted','Thanks for sharing your experience.');
      loadRatings();
      try { document.dispatchEvent(new CustomEvent('workley:reviewsChanged',{detail:{tid:_reviewTid}})); } catch(e){}
    } else {
      setAuthBusy('rvSubmit', false, 'Submit review');
      showAuthError('rv','Couldn\'t submit your review. Make sure your account is verified, then try again.');
    }
  });
}

// Start (or resume) a chat with a talent from their profile modal.
// On the dashboard we open the chat in place; elsewhere we hand off via
// sessionStorage and let the dashboard pick it up on load.
function messageTalentFromProfile(uid){
  if(!USER || !window.firebaseUser){ closeModal(); openLogin(); return; }
  if(String(uid) === String(window.firebaseUser.uid)){ closeModal(); toast('That\'s you','You can\'t message your own profile.'); return; }
  const t = (typeof getTalentById==='function') ? getTalentById(uid) : null;
  const payload = { uid:String(uid), name:(t&&t.name)||'Talent', role:'talent' };
  closeModal();
  if(typeof window.dashOpenChat === 'function'){ window.dashOpenChat(payload); return; }
  try { sessionStorage.setItem('workley_open_chat', JSON.stringify(payload)); } catch(e){}
  location.href = 'dashboard.html';
}

// Record a real profile-view event (verified viewer, not self). Best-effort.
function _trackProfileView(viewedUid, t){
  try {
    if(!window.firebaseDB || !window.firebaseUser) return;
    if(window.firebaseUser.uid === viewedUid) return;
    const viewerRole = (USER && USER.role) || 'talent';
    const viewerLocation = (USER && USER.location) || '';
    window.firebaseDB.recordProfileView(viewedUid, { viewerUid: window.firebaseUser.uid, viewerRole, viewerLocation });
  } catch(e){ /* non-fatal */ }
}

// Profile actions: clients see Invite + Message; talent see Message only (they
// have no projects to invite to); on your OWN profile you get neither.
function _talentActionBtns(s, peek){
  const myUid = window.firebaseUser && window.firebaseUser.uid;
  if(myUid && String(s.id) === String(myUid)) return '<span style="color:var(--muted);font-size:.88rem">This is your profile.</span>';
  const isClient = USER && USER.role === 'client';
  if(peek){
    const inv = isClient ? `<button class="btn btn-primary btn-sm peek-view-btn" onclick="closePeek();openHire('${s.id}')">Invite to project</button>` : '';
    return `${inv}<button class="btn btn-outline btn-sm peek-view-btn" onclick="closePeek();messageTalentFromProfile('${s.id}')">Message</button>`;
  }
  const inv = isClient ? `<button class="btn btn-primary btn-block btn-lg" onclick="closeModal();openHire('${s.id}')">Invite to project</button>` : '';
  return `${inv}<button class="btn btn-outline btn-lg" onclick="messageTalentFromProfile('${s.id}')">Message</button>`;
}
function openHire(id){
  if(!USER || !window.firebaseUser){ openLogin(); return; }
  if(USER.role !== 'client'){ toast('Clients only','Only clients can invite talent to a project.'); return; }
  if(String(id) === String(window.firebaseUser.uid)) return; // can't invite yourself
  const s=getTalentById(id);jobModal('Invite '+(s?s.name:'talent')+' to a project',s?s.cat:'');
}
function openJob(){ if(!USER){ openLogin(); return; } jobModal('Post a job',''); }
// "Offer my skills" (landing): require an account first. New visitors sign up;
// signed-in talent go to their dashboard to build/manage their listing.
function offerSkills(){ if(!USER || !window.firebaseUser){ openSignup(); return; } location.href = (USER.role==='client') ? 'catalog.html' : 'dashboard.html'; }
const TIMELINES=[
  {val:'<1w',  label:'Under 1 week', sub:'Quick fix or review'},
  {val:'1-2w', label:'1 - 2 weeks',  sub:'Small feature or task'},
  {val:'2-4w', label:'2 - 4 weeks',  sub:'Short project'},
  {val:'1-2m', label:'1 - 2 months', sub:'Medium-scope build'},
  {val:'3-6m', label:'3 - 6 months', sub:'Full project or app'},
  {val:'flex', label:'Flexible',      sub:'To be agreed'},
];
function pickTimeline(val){
  document.querySelectorAll('.tpill').forEach(p=>p.classList.toggle('sel',p.dataset.t===val));
  document.getElementById('jTimeline').value=val;
  document.getElementById('ff-timeline').classList.remove('err');
}
function jobModal(title,presetCat){
  document.getElementById('modal').innerHTML=`
    <div class="modal-head"><div><h3 style="font-size:1.25rem">${title}</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">Fill this in and we'll match talent - or notify your invitee.</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="modal-body">
      <div class="form-field" id="ff-title"><label for="jTitle">Job title</label><input id="jTitle" type="text" placeholder="e.g. Build a booking website for my salon"><div class="errmsg">Give your job a short title.</div></div>
      <div class="form-field" id="ff-project"><label for="jProject">Project <span style="font-weight:400;color:var(--muted);font-size:.82rem">- this job lives under a project</span></label>
        <select id="jProject" onchange="onJobProjectChange(this.value)"><option value="">Loading your projects…</option></select>
        <input id="jNewProject" type="text" placeholder="New project name" maxlength="120" style="display:none;margin-top:8px">
        <div class="errmsg">Choose a project or create one for this job.</div></div>
      <div class="form-field" id="ff-cat"><label for="jCat">Field</label><select id="jCat" onchange="renderJobSkills(this.value)"><option value="">Select a field…</option>${CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===presetCat?'selected':''}>${c.name}</option>`).join('')}</select><div class="errmsg">Choose a field.</div></div>
      <div class="form-field" id="ff-skills"><label>Skills needed <span style="font-weight:400;color:var(--muted)">(optional - sharpens talent matching)</span></label><div class="jchip-grid" id="jSkillChips"><span class="jchip-hint">Pick a field first to choose relevant skills.</span></div></div>
      <div class="form-field" id="ff-budget"><label for="jBudget">Budget (R)</label>
        <div style="display:flex;gap:8px">
          <select id="jBudgetType" aria-label="Budget type" style="flex:0 0 auto;width:108px"><option value="fixed">Fixed</option><option value="hourly">Per hour</option></select>
          <input id="jBudget" type="number" inputmode="numeric" min="0" placeholder="e.g. 3500" style="flex:1">
        </div>
        <div class="errmsg">Enter a budget as a number.</div></div>
      <div class="form-field" id="ff-timeline">
        <label>Timeline</label>
        <input type="hidden" id="jTimeline" value="">
        <div class="tpill-grid">
          ${TIMELINES.map(t=>`<button type="button" class="tpill" data-t="${t.val}" onclick="pickTimeline('${t.val}')">${t.label}<span>${t.sub}</span></button>`).join('')}
        </div>
        <div class="errmsg">Please select a timeline for your project.</div>
      </div>
      <div class="form-field" id="ff-desc"><label for="jDesc">What needs doing?</label><textarea id="jDesc" rows="3" placeholder="A sentence or two about the work…"></textarea><div class="errmsg">Add a short description (at least 15 characters).</div></div>
      <button class="btn btn-primary btn-block btn-lg" onclick="submitJob()">${title.startsWith('Invite')?'Send invitation':'Post job & find matches'}</button>
    </div>`;
  showOverlay();setTimeout(()=>document.getElementById('jTitle').focus(),120);
  if(presetCat) renderJobSkills(presetCat);
  _loadJobProjects();
}
// Populate the job modal's project picker with the client's projects (+ create-new).
function _loadJobProjects(){
  const sel=document.getElementById('jProject'); if(!sel) return;
  if(!window.firebaseDB || !window.firebaseUser){ sel.innerHTML='<option value="__new">+ Create a new project</option>'; onJobProjectChange('__new'); return; }
  window.firebaseDB.listProjects(window.firebaseUser.uid).then(list=>{
    const s=document.getElementById('jProject'); if(!s) return;
    const active=(list||[]).filter(p=>p.status!=='archived');
    const opts=active.map(p=>`<option value="${_esc(p.id)}">${_esc(p.title)}</option>`).join('');
    s.innerHTML=`<option value="">Select a project…</option>${opts}<option value="__new">+ Create a new project</option>`;
    if(!active.length){ s.value='__new'; onJobProjectChange('__new'); }
  }).catch(()=>{ const s=document.getElementById('jProject'); if(s){ s.innerHTML='<option value="__new">+ Create a new project</option>'; onJobProjectChange('__new'); } });
}
function onJobProjectChange(v){
  const inp=document.getElementById('jNewProject');
  if(inp) inp.style.display=(v==='__new')?'block':'none';
  const ff=document.getElementById('ff-project'); if(ff) ff.classList.remove('err');
}
// Populate the job-skills chips for the chosen field (relevant skills only).
function renderJobSkills(fieldId){
  const box=document.getElementById('jSkillChips'); if(!box) return;
  const cat=CATEGORIES.find(c=>c.id===fieldId);
  if(!cat || !cat.skills || !cat.skills.length){ box.innerHTML='<span class="jchip-hint">Pick a field first to choose relevant skills.</span>'; return; }
  box.innerHTML=cat.skills.map(sk=>`<button type="button" class="jchip" onclick="toggleJobSkill(this)">${_esc(sk)}</button>`).join('');
}
function toggleJobSkill(btn){ btn.classList.toggle('sel'); }
function _selectedJobSkills(){ return Array.from(document.querySelectorAll('#jSkillChips .jchip.sel')).map(b=>b.textContent.trim()).slice(0,20); }
function submitJob(){
  let ok=true;
  const t=document.getElementById('jTitle'),c=document.getElementById('jCat'),
        b=document.getElementById('jBudget'),tl=document.getElementById('jTimeline'),d=document.getElementById('jDesc');
  const btTypeEl=document.getElementById('jBudgetType');
  const set=(id,bad)=>{document.getElementById(id).classList.toggle('err',bad);if(bad)ok=false;};
  set('ff-title',!t.value.trim());
  set('ff-cat',!c.value);
  set('ff-budget',!b.value||isNaN(+b.value)||+b.value<=0);
  set('ff-timeline',!tl.value);
  set('ff-desc',d.value.trim().length<15);
  // Project is required: pick an existing one or name a new one.
  const projSel=document.getElementById('jProject');
  const projVal=projSel?projSel.value:'';
  const newProjName=((document.getElementById('jNewProject')||{}).value||'').trim();
  const projOk = !!projVal && (projVal!=='__new' || newProjName.length>=2);
  set('ff-project', !projOk);
  if(!ok)return;
  if(!USER || !window.firebaseUser){ closeModal(); openLogin(); return; }
  if(!window.firebaseDB){ toast('Not ready','Please refresh and try again.'); return; }
  const btn=document.querySelector('#modal .btn-primary'); if(btn){ btn.disabled=true; btn.textContent='Posting…'; }
  const job={
    clientName: USER.name || 'Workley client',
    clientOrg: (USER.profileData && USER.profileData.orgName) || '',
    title: t.value.trim(), field: c.value, description: d.value.trim(),
    budget: +b.value, budgetType: (btTypeEl && btTypeEl.value==='hourly')?'hourly':'fixed',
    timeline: tl.value, skills: _selectedJobSkills()
  };
  const restoreBtn=()=>{ if(btn){ btn.disabled=false; btn.textContent='Post job & find matches'; } };
  const finishPost=(projectId, projectName)=>{
    job.projectId=projectId; job.projectName=projectName;
    window.firebaseDB.postJob(window.firebaseUser.uid, job).then(id=>{
      if(id){
        closeModal();
        try { document.dispatchEvent(new CustomEvent('workley:jobsChanged')); } catch(e){}
        if(document.getElementById('dashboardPage') && typeof window.dashSetView==='function'){
          toast('Job posted','Here\'s verified talent matched to your job.');
          window.dashSetView('talent');
        } else {
          toast('Job posted','Taking you to your matches…');
          setTimeout(()=>{ window.location.href='dashboard.html'; }, 800);
        }
      }else{ restoreBtn(); toast('Couldn\'t post job','Please check your connection and try again.'); }
    });
  };
  if(projVal==='__new'){
    window.firebaseDB.createProject(window.firebaseUser.uid, USER.name||'Client', {title:newProjName, description:''}).then(pid=>{
      if(pid){ try{ document.dispatchEvent(new CustomEvent('workley:jobsChanged')); }catch(e){} finishPost(pid, newProjName); }
      else { restoreBtn(); toast('Couldn\'t create project','Please try again.'); }
    });
  } else {
    const pName = (projSel && projSel.options[projSel.selectedIndex]) ? projSel.options[projSel.selectedIndex].text : '';
    finishPost(projVal, pName);
  }
}

// ── Smart Match page (mobile) ────────────────────────────────────
let _wizHome=null;
function openWizPage(){
  const panel=document.getElementById('wizRight');
  const mount=document.getElementById('wizPageMount');
  if(!_wizHome){_wizHome=panel.parentNode;}        // remember original parent (.wiz-grid)
  mount.appendChild(panel);                         // move interactive panel into overlay
  document.getElementById('wizPageOverlay').classList.add('open');
  document.body.style.overflow='hidden';
  const sheet=document.querySelector('.wizpage-sheet');
  if(sheet)sheet.scrollTop=0;
}
function closeWizPage(){
  const panel=document.getElementById('wizRight');
  document.getElementById('wizPageOverlay').classList.remove('open');
  document.body.style.overflow='';
  if(_wizHome){_wizHome.appendChild(panel);}        // move panel back to the section
}
// ── Catalog ──────────────────────────────────────────────────────
function renderFeatured(){
  const grid=document.getElementById('featGrid');
  if(!grid)return;
  // Keep the "N verified SA students & graduates…" line in sync with real data.
  const fEl=document.getElementById('featCount');
  if(fEl && TALENT_LOADED){
    const n=TALENT.length;
    fEl.textContent = n
      ? `${n} verified SA ${n===1?'student / graduate':'students & graduates'} across ${CATEGORIES.length} ICT fields`
      : `Verified SA students & graduates across ${CATEGORIES.length} ICT fields`;
  }
  // Feature the most complete real profiles (bio + a few skills first).
  const ranked = TALENT.slice().sort((a,b)=>{
    const score = t => (t.blurb?2:0) + Math.min(3,(t.skills||[]).length) + (t.avatar?1:0);
    return score(b) - score(a);
  });
  const list = ranked.slice(0,3);
  if(!list.length){
    if(!TALENT_LOADED){
      grid.innerHTML = '<div class="no-results" style="grid-column:1/-1"><div class="pf-loading-spinner" style="width:30px;height:30px;border:3px solid var(--blue-50);border-top-color:var(--blue);border-radius:50%;margin:0 auto 12px;animation:spin .8s linear infinite"></div>Loading featured talent…</div>';
    } else if(USER && USER.role==='client'){
      // Signed-in clients shouldn't be nudged to create a talent profile.
      grid.innerHTML = `<div class="feat-empty" style="grid-column:1/-1">
           <strong>No talent to feature yet</strong>
           <p>Verified ICT students &amp; graduates will appear here as they join Workley. In the meantime, post a job and we'll match you as talent signs up.</p>
           <button class="btn btn-primary" onclick="openJob()">Post a job</button>
         </div>`;
    } else {
      grid.innerHTML = `<div class="feat-empty" style="grid-column:1/-1">
           <strong>Be the first ICT talent on Workley</strong>
           <p>Verified students &amp; graduates show up here as they join. Create your profile to get discovered by clients.</p>
           <button class="btn btn-primary" onclick="openSignup()">Create your profile</button>
         </div>`;
    }
    return;
  }
  grid.innerHTML=list.map(s=>{
    const chips=catalogChips(s.skills);
    return `<div class="tcard" onclick="openProfile('${s.id}')" role="button" tabindex="0" onkeypress="if(event.key==='Enter')openProfile('${s.id}')">
      <div class="thead"><div class="avatar peek-trigger" onclick="quickPeek('${s.id}',event)" role="button" tabindex="0" title="Quick preview" aria-label="Quick preview of ${_esc(s.name)}" onkeydown="if(event.key==='Enter'){event.stopPropagation();quickPeek('${s.id}',event)}">${avatarInner(s)}</div>
        <div style="min-width:0"><div class="name">${_esc(s.name)}</div><div class="uni">${_esc(s.uni||'ICT talent')}</div><div class="tcard-badges">${yearTag(s)}<span class="verified">${IC.check} Verified</span></div></div></div>
      <div class="blurb">${_esc(s.blurb)||'<span style="color:var(--muted)">New to Workley.</span>'}</div>
      <div class="chips">${chips}</div>
      <div class="tfoot">${ratingOrNew(s)}${rateHtml(s)}</div>
    </div>`;
  }).join('');
}
function openCatalog(){
  var el=document.getElementById('catalogOverlay');
  el.classList.add('open');
  document.body.style.overflow='hidden';
  el.scrollTop=0;
  renderFilterCats();
  renderTalent();
}
function closeCatalog(){
  var el=document.getElementById('catalogOverlay');
  el.classList.remove('open');
  document.body.style.overflow='';
}
// ─────────────────────────────────────────────────────────────────
function showOverlay(){document.getElementById('overlay').classList.add('show');document.body.style.overflow='hidden';}
function closeModal(){document.getElementById('overlay').classList.remove('show');document.body.style.overflow='';}
// Track where a press STARTED so a backdrop-dismiss only fires for a genuine
// backdrop click - not when a text selection drag (e.g. highlighting your name
// in the signup form) happens to release on the dimmed backdrop. Without this
// the modal would close mid-typing, which felt like a crash.
let _pressStartTarget = null;
document.addEventListener('mousedown', e=>{ _pressStartTarget = e.target; }, true);
document.addEventListener('touchstart', e=>{ _pressStartTarget = e.target; }, true);
function overlayClick(e){
  const ov = e.currentTarget;
  if(e.target === ov && _pressStartTarget === ov) closeModal();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeCatalog();closeWizPage();toggleMnav(false);}});
function toast(title,desc){const w=document.getElementById('toastWrap');const el=document.createElement('div');el.className='toast';el.innerHTML=`<span class="ti">${IC.check}</span><div><div class="tt">${title}</div><div class="td">${desc}</div></div><button class="tx" aria-label="Dismiss">×</button>`;el.querySelector('.tx').onclick=()=>dismiss(el);w.appendChild(el);setTimeout(()=>dismiss(el),4600);}
function dismiss(el){el.classList.add('out');setTimeout(()=>el.remove(),300);}
function toggleMnav(on){document.getElementById('mnav').classList.toggle('show',on);document.body.style.overflow=on?'hidden':'';}
function scrollToId(id){document.getElementById(id).scrollIntoView({behavior:'smooth',block:'start'});}

const _nav=document.getElementById('siteNav');
window.addEventListener('scroll',()=>{_nav.classList.toggle('scrolled',window.scrollY>16);},{passive:true});

// ═══════════════════════ AUTH & PROFILE ═══════════════════════
// In-memory session (artifacts can't use localStorage). Resets on reload.
let USER = null;
let signupRole = 'client';   // 'client' (find talent) | 'talent' (offer skills)

const G_ICON = '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 01-2.2 3.3v2.7h3.6c2.1-2 3.2-4.9 3.2-7.9z"/><path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0012 23z"/><path fill="#FBBC05" d="M6 14.4a6.6 6.6 0 010-4.2V7.4H2.3a11 11 0 000 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 002.3 7.4L6 10.2C6.9 7.7 9.2 5.4 12 5.4z"/></svg>';
const A_ICON = '<svg viewBox="0 0 24 24" fill="#000"><path d="M16.4 12.7c0-2 1.6-3 1.7-3a3.8 3.8 0 00-3-1.6c-1.3-.1-2.5.7-3.1.7-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.2 2.6 2.2 1 0 1.4-.7 2.7-.7s1.6.7 2.7.7 1.8-1 2.5-2a8.8 8.8 0 001.1-2.3c-.1 0-2.1-.8-2.1-3zM14.3 6.3c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2z"/></svg>';
const EYE_ICON     = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function authClose(){closeModal();}

// ── Password helpers (called from inline oninput / onclick) ──
function togglePwVis(inputId,btnId){
  var inp=document.getElementById(inputId),btn=document.getElementById(btnId);
  if(!inp||!btn)return;
  var show=inp.type==='password';
  inp.type=show?'text':'password';
  btn.innerHTML=show?EYE_OFF_ICON:EYE_ICON;
  btn.setAttribute('aria-label',show?'Hide password':'Show password');
}
function onPwInput(val){
  var c={len:val.length>=12,upper:/[A-Z]/.test(val),lower:/[a-z]/.test(val),num:/[0-9]/.test(val),spec:/[^A-Za-z0-9]/.test(val)};
  ['len','upper','lower','num','spec'].forEach(function(k){var el=document.getElementById('pr-'+k);if(el)el.classList.toggle('met',c[k]);});
  var allMet=Object.values(c).every(Boolean);
  var conf=document.getElementById('su-pass2');
  if(conf){
    conf.style.display=allMet?'':'none';
    if(!allMet){var ci=document.getElementById('suPass2');if(ci)ci.value='';conf.classList.remove('err');}
  }
}

// ── Firebase auth UI helpers ──
function showAuthError(prefix,msg){
  const el=document.getElementById(prefix+'AuthErr');
  if(el){el.textContent=msg;el.classList.add('show');}
}
function clearAuthError(prefix){
  const el=document.getElementById(prefix+'AuthErr');
  if(el){el.textContent='';el.classList.remove('show');}
}
function setAuthBusy(btnId,busy,label){
  const b=document.getElementById(btnId);
  if(!b)return;
  b.disabled=busy;
  b.textContent=label;
}
function firebaseFallbackMessage(code){
  if(code==='auth/weak-password')return 'Password must be at least 6 characters.';
  if(code==='auth/too-many-requests')return 'Too many attempts. Please wait a moment and try again.';
  if(code==='auth/network-request-failed')return 'Network error. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}

// ---- Account-type chooser (first signup step) ----
function openSignup(){
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div><h3 style="font-size:1.25rem">Join Workley</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">How do you want to use Workley?</div></div><button class="modal-x" onclick="authClose()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:18px">
      <div class="acct-pick" id="acctPick">
        <div class="acct-card ${signupRole==='client'?'sel':''}" data-role="client" onclick="pickRole('client')">
          <span class="ac-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg></span>
          <div><h4>I'm a client</h4><p>I want to hire ICT talent</p></div>
          <span class="ac-radio"></span>
        </div>
        <div class="acct-card ${signupRole==='talent'?'sel':''}" data-role="talent" onclick="pickRole('talent')">
          <span class="ac-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></span>
          <div><h4>I'm a student / graduate</h4><p>I want to offer my ICT skills</p></div>
          <span class="ac-radio"></span>
        </div>
      </div>
      <button class="btn btn-primary btn-block btn-lg" style="margin-top:18px" onclick="openSignupForm()">Continue →</button>
      <div class="auth-switch">Already have an account? <button onclick="openLogin()">Log in</button></div>
    </div>`;
  showOverlay();
}
function pickRole(r){signupRole=r;document.querySelectorAll('#acctPick .acct-card').forEach(c=>c.classList.toggle('sel',c.dataset.role===r));}

// ---- Signup form ----
function openSignupForm(){
  signupCC = { cc:'za', dial:'+27' };   // reset country picker each time
  const roleLabel = signupRole==='talent' ? 'as ICT talent' : 'as a client';
  const maxDob = (()=>{ const d=new Date(); d.setFullYear(d.getFullYear()-18); return d.toISOString().split('T')[0]; })();
  const talentFields = signupRole==='talent' ? `
      <div class="form-field" id="su-age"><label for="suAge">Date of birth</label><input id="suAge" type="date" max="${maxDob}"><div class="errmsg">You must be 18 or older to sign up as ICT talent.</div></div>
      <div class="form-field" id="su-nation"><label for="suNation">Country of residence</label><select id="suNation"><option value="">Select…</option><option value="ZA">South Africa</option><option value="other">Other (not eligible)</option></select><div class="errmsg">ICT talent must be based in South Africa.</div></div>` : '';
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><button class="modal-x" style="background:transparent" onclick="openSignup()" aria-label="Back">‹</button><div style="flex:1"></div><button class="modal-x" onclick="authClose()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:0">
      <h3>${signupRole==='talent'?'Sign up to find work':'Sign up as a client'}</h3>
      <div class="auth-sub">Joining ${roleLabel}</div>
      <button class="oauth-btn" onclick="oauthSignup('Google')">${G_ICON} Continue with Google</button>
      <div class="auth-or">or sign up with email</div>
      <div class="form-field" id="su-name"><label for="suName">Full name</label><input id="suName" type="text" placeholder="e.g. Lerato Mokoena"><div class="errmsg">Please enter your name.</div></div>
      <div class="form-field" id="su-email"><label for="suEmail">Email</label><input id="suEmail" type="email" inputmode="email" placeholder="you@example.com"><div class="errmsg">Enter a valid email address.</div></div>
      <div class="form-field" id="su-phone"><label for="suPhone">Phone number <span style="font-weight:400;color:var(--muted)">(SA mobile, for SMS verification)</span></label>
        <div class="phone-field za-locked">
          <span class="cc-fixed"><img src="${flagUrl('za')}" alt="South Africa flag">+27</span>
          <input id="suPhone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="82 123 4567" maxlength="13">
        </div>
        <label class="check-row" id="su-sms" style="margin-top:10px"><input type="checkbox" id="suSmsConsent"> <span>I agree to receive an SMS to verify my identity (2FA) at sign-in. Standard rates may apply.</span></label>
        <div class="errmsg">Enter a valid South African mobile number.</div>
      </div>
      <div class="form-field" id="su-loc"><label for="suLoc">Location</label><select id="suLoc"><option value="">Select your city…</option><option>Cape Town</option><option>Johannesburg</option><option>Durban</option><option>Pretoria</option><option>Gqeberha</option><option>Bloemfontein</option><option>Other (South Africa)</option></select><div class="errmsg">Please select your location.</div></div>
      ${talentFields}
      <div class="form-field" id="su-pass">
        <label for="suPass">Password</label>
        <div class="pw-wrap">
          <input id="suPass" type="password" placeholder="12+ chars, A-Z, a-z, 0-9, symbol" autocomplete="new-password" oninput="onPwInput(this.value)">
          <button type="button" class="pw-eye" id="suPassEye" onclick="togglePwVis('suPass','suPassEye')" aria-label="Show password">${EYE_ICON}</button>
        </div>
        <div class="pw-rules">
          <span class="pr-chip" id="pr-len">12+ chars</span>
          <span class="pr-chip" id="pr-upper">A-Z</span>
          <span class="pr-chip" id="pr-lower">a-z</span>
          <span class="pr-chip" id="pr-num">0-9</span>
          <span class="pr-chip" id="pr-spec">!@#…</span>
        </div>
        <div class="errmsg">Password must meet all requirements above.</div>
      </div>
      <div class="form-field" id="su-pass2" style="display:none">
        <label for="suPass2">Confirm password <span style="font-size:.76rem;font-weight:400;color:var(--muted)">(no pasting)</span></label>
        <div class="pw-wrap">
          <input id="suPass2" type="password" placeholder="Re-enter your password" autocomplete="new-password" onpaste="return false;" ondrop="return false;">
          <button type="button" class="pw-eye" id="suPass2Eye" onclick="togglePwVis('suPass2','suPass2Eye')" aria-label="Show password">${EYE_ICON}</button>
        </div>
        <div class="errmsg">Passwords don't match.</div>
      </div>
      <label class="check-row"><input type="checkbox" id="suTos"> <span>I have read and agree to the <button type="button" class="terms-link" onclick="openTerms()">Terms of Use &amp; Privacy Policy</button>, and I consent to Workley processing my personal information in line with POPIA.</span></label>
      <div class="auth-error" id="suAuthErr"></div>
      <button class="btn btn-primary btn-block btn-lg" id="suSubmitBtn" onclick="submitSignup()">Create my account</button>
      <div class="auth-switch">Already have an account? <button onclick="openLogin()">Log in</button></div>
    </div>`;
  showOverlay();
  setTimeout(()=>document.getElementById('suName').focus(),120);
}
function submitSignup(){
  let ok=true;
  const n=document.getElementById('suName'),e=document.getElementById('suEmail'),
        p=document.getElementById('suPass'),l=document.getElementById('suLoc'),t=document.getElementById('suTos');
  const p2=document.getElementById('suPass2');
  const ageEl=document.getElementById('suAge'), nationEl=document.getElementById('suNation');
  const set=(id,bad)=>{document.getElementById(id).classList.toggle('err',bad);if(bad)ok=false;};

  set('su-name',!n.value.trim());
  set('su-email',!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.value.trim()));
  set('su-loc',!l.value);
  // Phone: must be a valid SA mobile (required for SMS 2-factor verification)
  set('su-phone', !phoneE164());

  // Talent-only: age ≥ 18 and South Africa
  if(signupRole==='talent'){
    if(ageEl){ const dob=new Date(ageEl.value),now=new Date(); const age=now.getFullYear()-dob.getFullYear()-((now.getMonth()<dob.getMonth()||(now.getMonth()===dob.getMonth()&&now.getDate()<dob.getDate()))?1:0); set('su-age',!ageEl.value||isNaN(age)||age<18); }
    if(nationEl){ set('su-nation',nationEl.value!=='ZA'); }
  }

  // Password: all 5 criteria must be met
  const pVal=p.value;
  const pwOk=pVal.length>=12&&/[A-Z]/.test(pVal)&&/[a-z]/.test(pVal)&&/[0-9]/.test(pVal)&&/[^A-Za-z0-9]/.test(pVal);
  set('su-pass',!pwOk);

  // Confirm password (only when strength criteria are all met)
  if(pwOk&&p2){ set('su-pass2',!p2.value||p2.value!==pVal); }
  else if(!pwOk&&p2){ document.getElementById('su-pass2').classList.remove('err'); }

  if(!t.checked){ok=false;toast('One more step','Please accept the Terms of Use to continue.');}
  const smsC=document.getElementById('suSmsConsent');
  if(smsC && !smsC.checked){ok=false;toast('Consent needed','Please agree to SMS verification to continue.');}
  clearAuthError('su');
  if(!ok)return;

  if(!window.firebaseAuth){ showAuthError('su','Authentication isn\'t ready yet. Please refresh and try again.'); return; }

  const email=e.value.trim(), password=pVal;
  setAuthBusy('suSubmitBtn', true, 'Creating your account…');

  const signupName = n ? n.value.trim() : '';
  // Remember the chosen role keyed by email so the onboarding redirect after
  // first login can look it up. Persists across the verify-email round-trip.
  try { localStorage.setItem('workley_signup_role_'+email.toLowerCase(), signupRole); } catch(e){}
  if(signupName){ try { localStorage.setItem('workley_signup_name_'+email.toLowerCase(), signupName); } catch(e){} }
  // Verification emails greet the user via the Firebase template's
  // %DISPLAY_NAME% variable, so set the auth displayName to their FIRST name
  // and AWAIT it before sending - otherwise the email goes out unnamed.
  // (The full name is kept in localStorage and used for the profile/catalog.)
  const firstName = signupName ? (signupName.split(/\s+/)[0] || signupName) : '';
  const phone = phoneE164();
  // Keep the phone for SMS 2-factor auth. Firebase only lets you enroll a 2nd
  // factor once the email is VERIFIED, so enrolment happens at first login
  // (see submitLogin) - here we just register the account and email link.
  if(phone){ try{ localStorage.setItem('workley_signup_phone_'+email.toLowerCase(), phone); }catch(_){} }
  window.firebaseAuth.signUp(email, password)
    .then(credential=>{
      const user = credential.user;
      const setName = firstName
        ? window.firebaseAuth.updateProfile(user, { displayName: firstName }).catch(()=>{})
        : Promise.resolve();
      return setName.then(()=> finishEmailVerification(user, email));
    })
    .catch(err=>{
      setAuthBusy('suSubmitBtn', false, 'Create my account');
      if(err.code === 'auth/email-already-in-use'){
        showAuthError('su', 'User already exists. Please sign in');
      }else{
        showAuthError('su', firebaseFallbackMessage(err.code));
      }
    });
}
function oauthSignup(provider){
  if(!document.getElementById('suTos') || !document.getElementById('suTos').checked){
    toast('Accept the Terms first','Please tick the Terms of Use box, then continue with '+provider+'.');
    return;
  }
  if(provider==='Google'){
    googleAuth(signupRole || 'talent');
  }else if(provider==='Apple'){
    appleSignupRedirect();
  }
}
function appleSignupRedirect(){
  toast('Coming soon','Apple Sign-In requires backend infrastructure. Use Google for now.');
}

// Native Firebase Google sign-in (popup). role = 'talent'|'client' for a fresh
// signup, or '' when logging in (role then comes from the existing profile).
function googleAuth(role){
  if(!window.firebaseAuth || !window.firebaseAuth.signInWithGoogle){
    toast('Just a sec','Sign-in is still loading. Please try again in a moment.');
    return;
  }
  window.firebaseAuth.signInWithGoogle()
    .then(cred=>{
      const user = cred.user;
      const email = (user.email||'').toLowerCase();
      // Cache the name/role hints the rest of the flow expects.
      try { if(user.displayName) localStorage.setItem('workley_signup_name_'+email, user.displayName); } catch(e){}
      if(role){ try { localStorage.setItem('workley_signup_role_'+email, role); } catch(e){} }
      authClose();
      sessionStorage.setItem('workley_show_welcome','1');
      _routeAfterGoogle(user, role);
    })
    .catch(err=>{
      const code = err && err.code;
      // User simply closed/!cancelled the popup → no error UI.
      if(code==='auth/popup-closed-by-user' || code==='auth/cancelled-popup-request' || code==='auth/user-cancelled') return;
      if(code==='auth/multi-factor-auth-required'){ beginMfaSignIn(err); return; }
      if(code==='auth/popup-blocked'){ toast('Pop-up blocked','Allow pop-ups for Workley, then tap “Continue with Google” again.'); return; }
      if(code==='auth/account-exists-with-different-credential'){ toast('Use your email login','This email already has a Workley account created with a password. Log in with your email and password instead.'); return; }
      if(code==='auth/operation-not-allowed'){ toast('Not enabled yet','Google sign-in isn\'t switched on for this project yet.'); return; }
      toast('Google sign-in failed', (err&&err.message)? err.message.replace(/^Firebase:\s*/,'').replace(/\s*\(auth\/.*\)\.?$/,'').trim() : 'Please try again.');
    });
}
// Route a Google user: existing profile → dashboard; brand-new → onboarding.
function _routeAfterGoogle(user, role){
  const uid = user.uid;
  const email = (user.email||'').toLowerCase();
  const go = (hasProfile)=>{
    if(hasProfile){ _googleContinue(user, _resolveUserRole(user), true); return; }
    // No Workley profile exists for this Google account yet.
    if(role){
      // Came from "Sign up" with an explicit role chosen → create that profile.
      _googleCreateFlow(user, role);
    } else {
      // Came from "Log in" but no account existed (Google silently created the
      // auth user). Tell them, and offer to create one - never silently assume a
      // role. After they confirm: SMS verify → specify user type → profile setup.
      _askGoogleCreateAccount(user);
    }
  };
  // Fast path: local cache. Otherwise ask Firestore whether a real profile exists.
  let local=false; try { local = !!localStorage.getItem('workley_profile_'+uid); } catch(e){}
  if(local){ go(true); return; }
  if(window.firebaseDB && window.firebaseDB.getProfile){
    window.firebaseDB.getProfile(uid)
      .then(p=> go(!!(p && (p.field || p.clientType || p.bio || p.description || (p.skills&&p.skills.length)))))
      .catch(()=> go(false));
  } else { go(false); }
}

// "Log in" with a Google account that has no Workley account yet: tell the user
// it doesn't exist and offer to create one. Cancelling signs them back out so
// they're never left half-authenticated.
let _gcUser = null;
function _askGoogleCreateAccount(user){
  _gcUser = user;
  const email=(user.email||'').toLowerCase();
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML=`
    <div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="_googleCancelCreate()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:0">
      <div style="margin:0 auto 16px;width:58px;height:58px;border-radius:50%;background:var(--blue-50);color:var(--blue);display:grid;place-items:center">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M3 21v-1a6 6 0 0112 0v1"/><path d="M18 8v6M21 11h-6"/></svg>
      </div>
      <h3 style="text-align:center">No account yet</h3>
      <div class="auth-sub" style="text-align:center">There's no Workley account for <strong>${_esc(email)}</strong> yet. Would you like to create one?</div>
      <button class="btn btn-primary btn-block btn-lg" style="margin-top:18px" onclick="_googleStartCreate()">Create an account</button>
      <div class="auth-switch"><button onclick="_googleCancelCreate()">Not now</button></div>
    </div>`;
  showOverlay();
}
function _googleStartCreate(){ const u=_gcUser; if(u) _googleCreateFlow(u, null); }
function _googleCancelCreate(){
  _gcUser=null; window._signingOut=true;
  const done=()=>{ try{ location.replace('index.html'); }catch(e){ window.location.href='index.html'; } };
  try{
    if(window.firebaseAuth && window.firebaseAuth.logout){ window.firebaseAuth.logout().then(done).catch(done); }
    else done();
  }catch(e){ done(); }
}
// Brand-new account confirmed → create it. Order (per requirement): collect phone,
// verify by SMS, then specify user type (client vs talent), then profile setup.
// When `role` is already known (explicit "Sign up"), skip the user-type step.
function _googleCreateFlow(user, role){
  const email=(user.email||'').toLowerCase();
  const afterSms = ()=>{
    if(role){ _goOnboarding(role); return; }
    _askGoogleRole(email, chosen=>{
      if(chosen==='talent'){ _googleTalentEligibility(user, ()=>_goOnboarding('talent')); }
      else { _goOnboarding('client'); }
    });
  };
  _collectGoogleDetails(role, false,
    (ph)=>{ try{ localStorage.setItem('workley_signup_phone_'+email, ph); }catch(e){} beginMfaEnrollment(ph, email, afterSms); },
    _googleCancelCreate);
}
function _goOnboarding(role){ window.location.href = 'onboarding.html?role='+encodeURIComponent(role||'talent'); }
// Talent-only eligibility (18+, South Africa). Asked after SMS + user-type pick,
// since the phone was already collected and verified above.
let _geDone=null;
function _googleTalentEligibility(user, done){
  _geDone=done;
  const maxDob=(()=>{ const d=new Date(); d.setFullYear(d.getFullYear()-18); return d.toISOString().split('T')[0]; })();
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML=`
    <div class="modal-head"><div><h3 style="font-size:1.2rem">A few details</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">ICT talent must be 18 or older and based in South Africa.</div></div></div>
    <div class="auth-body" style="padding-top:8px">
      <div class="form-field" id="ge-age"><label for="geAge">Date of birth</label><input id="geAge" type="date" max="${maxDob}"><div class="errmsg">You must be 18 or older to join as ICT talent.</div></div>
      <div class="form-field" id="ge-nation"><label for="geNation">Country of residence</label><select id="geNation"><option value="">Select…</option><option value="ZA">South Africa</option><option value="other">Other (not eligible)</option></select><div class="errmsg">ICT talent must be based in South Africa.</div></div>
      <button class="btn btn-primary btn-block btn-lg" onclick="_submitGoogleEligibility()">Continue to profile setup</button>
    </div>`;
  showOverlay();
  setTimeout(()=>{ const i=document.getElementById('geAge'); if(i) i.focus(); },120);
}
function _submitGoogleEligibility(){
  let ok=true;
  const set=(id,bad)=>{ const el=document.getElementById(id); if(el) el.classList.toggle('err',bad); if(bad) ok=false; };
  const ageEl=document.getElementById('geAge'); let age=NaN;
  if(ageEl && ageEl.value){ const dob=new Date(ageEl.value),now=new Date(); age=now.getFullYear()-dob.getFullYear()-((now.getMonth()<dob.getMonth()||(now.getMonth()===dob.getMonth()&&now.getDate()<dob.getDate()))?1:0); }
  set('ge-age', !ageEl||!ageEl.value||isNaN(age)||age<18);
  const nationEl=document.getElementById('geNation'); set('ge-nation', !nationEl||nationEl.value!=='ZA');
  if(!ok) return;
  const done=_geDone; _geDone=null; closeModal();
  if(typeof done==='function') done();
}

// Ask a brand-new Google user whether they're a client or talent, then continue.
// Clicking a card resolves immediately (no extra "continue" step).
let _googleRoleCb = null, _googleRoleEmail = '';
function _askGoogleRole(email, cb){
  _googleRoleCb = cb; _googleRoleEmail = (email||'').toLowerCase();
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div><h3 style="font-size:1.25rem">One quick thing</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">How will you use Workley?</div></div></div>
    <div class="auth-body" style="padding-top:18px">
      <div class="acct-pick" id="gAcctPick">
        <div class="acct-card" data-role="client" onclick="_chooseGoogleRole('client')">
          <span class="ac-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg></span>
          <div><h4>I'm a client</h4><p>I want to hire ICT talent</p></div>
          <span class="ac-radio"></span>
        </div>
        <div class="acct-card" data-role="talent" onclick="_chooseGoogleRole('talent')">
          <span class="ac-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></span>
          <div><h4>I'm a student / graduate</h4><p>I want to offer my ICT skills</p></div>
          <span class="ac-radio"></span>
        </div>
      </div>
      <p style="font-size:.78rem;color:var(--muted);text-align:center;margin-top:14px">This sets up the right experience for you.</p>
    </div>`;
  showOverlay();
}
function _chooseGoogleRole(r){
  try{ if(_googleRoleEmail) localStorage.setItem('workley_signup_role_'+_googleRoleEmail, r); }catch(e){}
  const cb = _googleRoleCb; _googleRoleCb = null;
  closeModal();
  if(typeof cb==='function') cb(r);
}

// Google sign-in provides name/email/photo but NOT the phone (and, for talent,
// DOB/SA eligibility) that the email signup collects. Fill those gaps here, then
// set up SMS 2FA via the same enrollment path the email flow uses.
let _gdRole=null, _gdOnSubmit=null, _gdOnSkip=null;
function _googleContinue(user, role, hasProfile){
  const email=(user.email||'').toLowerCase();
  const routeNow = ()=>{ window.location.href = hasProfile ? 'dashboard.html' : ('onboarding.html?role='+encodeURIComponent(role||'talent')); };
  let factors=[]; try{ factors = window.firebaseAuth.getEnrolledFactors ? window.firebaseAuth.getEnrolledFactors() : []; }catch(e){}
  if(factors && factors.length){ routeNow(); return; }   // already protected by 2FA
  let phone=''; try{ phone=localStorage.getItem('workley_signup_phone_'+email)||''; }catch(e){}
  // Phone already on file → go straight to SMS enrollment (resilient: a failure
  // just lets them through and we retry next sign-in). Success routes via finishLogin.
  if(phone){ beginMfaEnrollment(phone, email); return; }
  // Otherwise collect the missing details first.
  _collectGoogleDetails(role, hasProfile,
    (ph)=>{ try{ localStorage.setItem('workley_signup_phone_'+email, ph); }catch(e){} beginMfaEnrollment(ph, email); },
    routeNow);
}
function _collectGoogleDetails(role, hasProfile, onSubmit, onSkip){
  _gdRole=role; _gdOnSubmit=onSubmit; _gdOnSkip=onSkip;
  const isTalent = role==='talent';
  const maxDob=(()=>{ const d=new Date(); d.setFullYear(d.getFullYear()-18); return d.toISOString().split('T')[0]; })();
  const talentFields = isTalent ? `
    <div class="form-field" id="gd-age"><label for="gdAge">Date of birth</label><input id="gdAge" type="date" max="${maxDob}"><div class="errmsg">You must be 18 or older to join as ICT talent.</div></div>
    <div class="form-field" id="gd-nation"><label for="gdNation">Country of residence</label><select id="gdNation"><option value="">Select…</option><option value="ZA">South Africa</option><option value="other">Other (not eligible)</option></select><div class="errmsg">ICT talent must be based in South Africa.</div></div>` : '';
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML=`
    <div class="modal-head"><div><h3 style="font-size:1.2rem">A few last details</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">We use these to verify your identity and keep Workley safe.</div></div><button class="modal-x" onclick="_skipGoogleDetails()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:8px">
      <div class="form-field" id="gd-phone"><label for="gdPhone">Phone number <span style="font-weight:400;color:var(--muted)">(SA mobile, for SMS verification)</span></label>
        <div class="phone-field za-locked"><span class="cc-fixed"><img src="${flagUrl('za')}" alt="South Africa flag">+27</span><input id="gdPhone" type="tel" inputmode="tel" placeholder="82 123 4567" maxlength="13"></div>
        <div class="errmsg">Enter a valid South African mobile number.</div></div>
      ${talentFields}
      <label class="check-row" style="margin-top:6px"><input type="checkbox" id="gdSms"> <span>I agree to receive an SMS to verify my identity (2FA). Standard rates may apply.</span></label>
      <div class="auth-error" id="gdAuthErr"></div>
      <button class="btn btn-primary btn-block btn-lg" id="gdSubmitBtn" onclick="_submitGoogleDetails()">Continue</button>
    </div>`;
  showOverlay();
  setTimeout(()=>{ const i=document.getElementById('gdPhone'); if(i) i.focus(); },120);
}
function _submitGoogleDetails(){
  let ok=true;
  const set=(id,bad)=>{ const el=document.getElementById(id); if(el) el.classList.toggle('err',bad); if(bad) ok=false; };
  const ph=_saE164((document.getElementById('gdPhone')||{}).value);
  set('gd-phone', !ph);
  if(_gdRole==='talent'){
    const ageEl=document.getElementById('gdAge');
    if(ageEl){ const dob=new Date(ageEl.value),now=new Date(); const age=now.getFullYear()-dob.getFullYear()-((now.getMonth()<dob.getMonth()||(now.getMonth()===dob.getMonth()&&now.getDate()<dob.getDate()))?1:0); set('gd-age', !ageEl.value||isNaN(age)||age<18); }
    const nationEl=document.getElementById('gdNation'); if(nationEl) set('gd-nation', nationEl.value!=='ZA');
  }
  const sms=document.getElementById('gdSms');
  if(sms && !sms.checked){ ok=false; toast('Consent needed','Please agree to SMS verification to continue.'); }
  if(!ok) return;
  const cb=_gdOnSubmit; _gdOnSubmit=null; _gdOnSkip=null;
  if(typeof cb==='function') cb(ph);
}
function _skipGoogleDetails(){
  const skip=_gdOnSkip; _gdOnSubmit=null; _gdOnSkip=null;
  closeModal();
  if(typeof skip==='function') skip();
}

// ---- Login ----
function openLogin(){
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="authClose()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:0">
      <h3>Log in to Workley</h3>
      <div class="auth-sub">Welcome back</div>
      <button class="oauth-btn" onclick="oauthLogin('Google')">${G_ICON} Continue with Google</button>
      <div class="auth-or">or</div>
      <div class="form-field" id="li-id"><label for="liId">Username or email</label><input id="liId" type="text" placeholder="you@example.com" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><div class="errmsg">Enter your username or email.</div></div>
      <div class="form-field" id="li-pass"><label for="liPass">Password</label><div class="pw-wrap"><input id="liPass" type="password" placeholder="Your password" autocomplete="new-password"><button type="button" class="pw-eye" id="liPassEye" onclick="togglePwVis('liPass','liPassEye')" aria-label="Show password">${EYE_ICON}</button></div><div class="errmsg">Enter your password.</div></div>
      <div style="text-align:right;margin-top:-8px;margin-bottom:4px"><button type="button" class="terms-link" onclick="openForgotPassword()">Forgot password?</button></div>
      <div class="auth-error" id="liAuthErr"></div>
      <button class="btn btn-primary btn-block btn-lg" id="liSubmitBtn" onclick="submitLogin()">Log in</button>
      <div class="auth-switch">New to Workley? <button onclick="openSignup()">Sign up</button></div>
    </div>`;
  showOverlay();
  // Privacy: never carry over a previous session's credentials. Clear the
  // fields after the browser's autofill pass, then focus.
  setTimeout(()=>{
    const idEl=document.getElementById('liId'), pwEl=document.getElementById('liPass');
    if(idEl) idEl.value=''; if(pwEl) pwEl.value='';
    if(idEl) idEl.focus();
  },120);
}
function submitLogin(){
  let ok=true;
  const id=document.getElementById('li-id'),p=document.getElementById('li-pass');
  const idv=document.getElementById('liId').value.trim(), pv=document.getElementById('liPass').value;
  const set=(el,bad)=>{el.classList.toggle('err',bad);if(bad)ok=false;};
  set(id,!idv); set(p,!pv);
  clearAuthError('li');
  if(!ok)return;

  if(!window.firebaseAuth){ showAuthError('li','Authentication isn\'t ready yet. Please refresh and try again.'); return; }

  // Firebase Authentication only supports email + password (not a free-text username).
  setAuthBusy('liSubmitBtn', true, 'Logging in…');
  window.firebaseAuth.signIn(idv, pv)
    .then(credential=>{
      setAuthBusy('liSubmitBtn', false, 'Log in');
      const u = credential.user;
      // Email verification is mandatory for EVERY login. An unverified account
      // gets a fresh verification link and is signed straight back out.
      if(!u.emailVerified){
        const acs = { url: window.location.origin + '/verify-email.html' };
        window.firebaseAuth.sendVerificationEmail(u, acs)
          .catch(()=>{})
          .then(()=> window.firebaseAuth.logout())
          .then(()=> showVerificationScreen(idv, { resent:true }));
        return;
      }
      // Email verified. If a phone is on file but SMS 2FA isn't enrolled yet,
      // enroll it now (first-login bootstrap - enrolment needs verified email).
      // Once enrolled, future logins instead hit the catch() branch below.
      const factors = window.firebaseAuth.getEnrolledFactors ? window.firebaseAuth.getEnrolledFactors() : [];
      if(!factors || !factors.length){
        let phone=''; try{ phone=localStorage.getItem('workley_signup_phone_'+idv.toLowerCase())||''; }catch(e){}
        if(phone && window.firebaseAuth.startMfaEnrollment){ beginMfaEnrollment(phone, idv); return; }
      }
      finishLogin();
    })
    .catch(err=>{
      const code = err && err.code;
      // The account has SMS 2FA enrolled → challenge the phone before sign-in.
      if(code==='auth/multi-factor-auth-required'){ beginMfaSignIn(err); return; }
      setAuthBusy('liSubmitBtn', false, 'Log in');
      if(code==='auth/wrong-password' || code==='auth/user-not-found' ||
         code==='auth/invalid-credential' || code==='auth/invalid-email'){
        showAuthError('li', 'Email or password is incorrect');
      }else{
        showAuthError('li', firebaseFallbackMessage(code));
      }
    });
}
// First login after email verification: enroll the stored phone as an SMS 2nd
// factor. Sends an SMS, then shows the OTP screen (mode 'enroll').
function beginMfaEnrollment(phone, email, next){
  ensureRecaptchaContainer();
  if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha();
  toast('Securing your account','Sending an SMS code to set up 2-factor authentication.');
  window.firebaseAuth.startMfaEnrollment(phone)
    .then(verificationId=>{
      _mfaVerificationId = verificationId; _mfaResolver = null;
      // `next` (optional): run instead of finishLogin after a successful enrol -
      // used by the Google create flow to continue to user-type / profile setup.
      showSmsVerificationScreen({ mode:'enroll', phone, email, next: (typeof next==='function'?next:null) });
    })
    .catch(err=>{
      if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha();
      // Don't block sign-in if enrolment can't start - let them in, try later.
      console.warn('[Workley] MFA enrollment failed:', err && (err.code||err.message));
      toast('Couldn\'t set up SMS 2FA', (smsErrorMessage(err)||'') + ' You can try again next time.');
      if(typeof next==='function'){ next(); } else { finishLogin(); }
    });
}
// Returning login when SMS 2FA is enrolled: send the challenge to the enrolled
// phone, then show the OTP screen (mode 'mfa-signin') to resolve sign-in.
function beginMfaSignIn(error){
  ensureRecaptchaContainer();
  if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha();
  setAuthBusy('liSubmitBtn', false, 'Log in');
  let resolver;
  try { resolver = window.firebaseAuth.getMfaResolver(error); }
  catch(e){ showAuthError('li', smsErrorMessage(e) || 'Couldn\'t start verification.'); return; }
  _mfaResolver = resolver;
  const hint = resolver.hints && resolver.hints[0];
  const phone = (hint && hint.phoneNumber) || '';   // already masked, e.g. +27••••1234
  toast('Verify it\'s you','Sending a verification code to your phone.');
  window.firebaseAuth.startMfaSignIn(resolver)
    .then(verificationId=>{
      _mfaVerificationId = verificationId;
      showSmsVerificationScreen({ mode:'mfa-signin', phone });
    })
    .catch(err=>{
      if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha();
      showAuthError('li', smsErrorMessage(err) || 'Couldn\'t send your verification code.');
    });
}
// ════════════════ FORGOT PASSWORD ════════════════
function openForgotPassword(){
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><button class="modal-x" style="background:transparent" onclick="openLogin()" aria-label="Back">‹</button><div style="flex:1"></div><button class="modal-x" onclick="authClose()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:0">
      <div style="margin:0 auto 16px;width:58px;height:58px;border-radius:50%;background:var(--blue-50);color:var(--blue);display:grid;place-items:center">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      </div>
      <h3>Reset your password</h3>
      <div class="auth-sub">Enter your account email and we'll send a link to create a new password.</div>
      <div class="form-field" id="fp-email"><label for="fpEmail">Email address</label><input id="fpEmail" type="email" inputmode="email" placeholder="you@example.com"><div class="errmsg">Enter a valid email address.</div></div>
      <div class="auth-error" id="fpAuthErr"></div>
      <button class="btn btn-primary btn-block btn-lg" id="fpSubmitBtn" onclick="submitForgotPassword()">Send reset link</button>
      <div class="auth-switch"><button onclick="openLogin()">← Back to log in</button></div>
    </div>`;
  showOverlay();
  setTimeout(()=>document.getElementById('fpEmail').focus(),120);
}
function submitForgotPassword(){
  const emailInput=document.getElementById('fpEmail');
  const email=emailInput?emailInput.value.trim():'';
  const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  document.getElementById('fp-email').classList.toggle('err',!emailOk);
  if(!emailOk) return;
  clearAuthError('fp');
  setAuthBusy('fpSubmitBtn',true,'Sending…');
  const actionCodeSettings={ url: window.location.origin+'/reset-password.html' };
  const showSuccess=()=>{
    document.getElementById('modal').innerHTML=`
      <div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="authClose()" aria-label="Close">×</button></div>
      <div class="auth-body" style="padding-top:0">
        <div style="margin:0 auto 16px;width:58px;height:58px;border-radius:50%;background:var(--blue-50);color:var(--blue);display:grid;place-items:center">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
        </div>
        <h3 style="text-align:center">Check your inbox</h3>
        <div class="auth-sub" style="text-align:center">We've sent a password reset link to <strong>${email}</strong>. Follow the link to create a new password.</div>
        <button class="btn btn-primary btn-block btn-lg" style="margin-top:24px" onclick="authClose();openLogin()">Back to log in</button>
      </div>`;
  };
  window.firebaseAuth.sendPasswordReset(email,actionCodeSettings)
    .then(showSuccess)
    .catch(err=>{
      if(err.code==='auth/user-not-found'){ showSuccess(); return; }
      setAuthBusy('fpSubmitBtn',false,'Send reset link');
      showAuthError('fp', firebaseFallbackMessage(err.code));
    });
}
// ════════════════ PHONE / SMS VERIFICATION ════════════════
// Country dial codes with ISO-2 (flag images come from flagcdn so they render
// as real flags on every OS, including Windows where emoji flags don't).
const COUNTRIES = [
  {cc:'za',dial:'+27',name:'South Africa'},{cc:'na',dial:'+264',name:'Namibia'},
  {cc:'bw',dial:'+267',name:'Botswana'},{cc:'zw',dial:'+263',name:'Zimbabwe'},
  {cc:'mz',dial:'+258',name:'Mozambique'},{cc:'ls',dial:'+266',name:'Lesotho'},
  {cc:'sz',dial:'+268',name:'Eswatini'},{cc:'zm',dial:'+260',name:'Zambia'},
  {cc:'mw',dial:'+265',name:'Malawi'},{cc:'ke',dial:'+254',name:'Kenya'},
  {cc:'ng',dial:'+234',name:'Nigeria'},{cc:'gh',dial:'+233',name:'Ghana'},
  {cc:'tz',dial:'+255',name:'Tanzania'},{cc:'ug',dial:'+256',name:'Uganda'},
  {cc:'rw',dial:'+250',name:'Rwanda'},{cc:'et',dial:'+251',name:'Ethiopia'},
  {cc:'eg',dial:'+20',name:'Egypt'},{cc:'ma',dial:'+212',name:'Morocco'},
  {cc:'gb',dial:'+44',name:'United Kingdom'},{cc:'us',dial:'+1',name:'United States'},
  {cc:'ca',dial:'+1',name:'Canada'},{cc:'au',dial:'+61',name:'Australia'},
  {cc:'in',dial:'+91',name:'India'},{cc:'cn',dial:'+86',name:'China'},
  {cc:'de',dial:'+49',name:'Germany'},{cc:'fr',dial:'+33',name:'France'},
  {cc:'nl',dial:'+31',name:'Netherlands'},{cc:'pt',dial:'+351',name:'Portugal'},
  {cc:'es',dial:'+34',name:'Spain'},{cc:'it',dial:'+39',name:'Italy'},
  {cc:'ie',dial:'+353',name:'Ireland'},{cc:'ae',dial:'+971',name:'United Arab Emirates'},
  {cc:'sa',dial:'+966',name:'Saudi Arabia'},{cc:'br',dial:'+55',name:'Brazil'},
  {cc:'pk',dial:'+92',name:'Pakistan'},{cc:'bd',dial:'+880',name:'Bangladesh'}
];
let signupCC = { cc:'za', dial:'+27' };
function flagUrl(cc){ return 'https://flagcdn.com/w20/'+cc+'.png'; }
function ccItemsHtml(){
  return COUNTRIES.map(c=>`<button type="button" class="cc-item" onclick="pickCC('${c.cc}','${c.dial}')">
    <img src="${flagUrl(c.cc)}" alt="" loading="lazy"><span class="cc-item-name">${c.name}</span><span class="cc-item-dial">${c.dial}</span>
  </button>`).join('');
}
function toggleCC(){
  const list=document.getElementById('ccList'); if(!list) return;
  list.hidden=!list.hidden;
  if(!list.hidden){ const s=document.getElementById('ccSearch'); if(s){ s.value=''; filterCC(''); setTimeout(()=>s.focus(),30); } }
}
function pickCC(cc,dial){
  signupCC={cc,dial};
  const f=document.getElementById('ccFlag'); if(f) f.src=flagUrl(cc);
  const d=document.getElementById('ccDial'); if(d) d.textContent=dial;
  const list=document.getElementById('ccList'); if(list) list.hidden=true;
  const inp=document.getElementById('suPhone'); if(inp) inp.focus();
}
function filterCC(q){
  q=(q||'').toLowerCase().trim();
  document.querySelectorAll('#ccList .cc-item').forEach(b=>{
    const t=b.textContent.toLowerCase();
    b.style.display = (!q || t.indexOf(q)>=0) ? '' : 'none';
  });
}
// Normalise a South African mobile number to E.164 (+27…). Accepts the common
// forms a user might type - 082 123 4567, 0821234567, 27821234567, +2782… - and
// returns '' if it isn't a valid SA mobile (9 national digits starting 6/7/8).
function _saE164(raw){
  let n=String(raw||'').replace(/[^\d]/g,'');
  n=n.replace(/^27/,'');     // strip a leading country code if they typed it
  n=n.replace(/^0+/,'');     // strip the trunk leading 0
  if(!/^[678]\d{8}$/.test(n)) return '';
  return '+27'+n;
}
// Read + normalise the signup phone field. SA-only.
function phoneE164(){
  const inp=document.getElementById('suPhone'); if(!inp) return '';
  return _saE164(inp.value);
}
function ensureRecaptchaContainer(){
  if(!document.getElementById('recaptcha-container')){
    const d=document.createElement('div'); d.id='recaptcha-container';
    // Keep it in the layout (off-screen) but NOT pointer-events:none, so an
    // invisible-reCAPTCHA challenge can still render/interact if required.
    d.style.position='fixed'; d.style.bottom='0'; d.style.right='0'; d.style.zIndex='2147483647';
    document.body.appendChild(d);
  }
}
// OTP entry screen - used for SMS MFA enrolment, MFA sign-in, and (legacy) phone link.
let _otpConfirmation = null;     // Firebase confirmationResult (legacy phone-link path)
let _otpContext = null;          // { mode:'enroll'|'mfa-signin'|'signup'|'login', email, phone }
let _mfaVerificationId = null;   // verificationId from PhoneAuthProvider.verifyPhoneNumber
let _mfaResolver = null;         // MultiFactorResolver (sign-in challenge)
function showSmsVerificationScreen(ctx){
  _otpContext = ctx || {};
  const mode = _otpContext.mode;
  const heading = mode==='enroll' ? 'Set up SMS 2-factor authentication'
    : (mode==='mfa-signin' ? 'Verify it\'s you' : 'Enter the code we sent');
  const sub = mode==='enroll'
    ? `To protect your account, enter the 6-digit code we just sent by SMS to <strong>${_esc(ctx.phone||'your phone')}</strong>.`
    : `We sent a 6-digit verification code by SMS to <strong>${_esc(ctx.phone||'your phone')}</strong>.`;
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="authClose()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:0">
      <div style="margin:0 auto 18px;width:58px;height:58px;border-radius:50%;background:var(--blue-50);color:var(--blue);display:grid;place-items:center">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M11 18h2"/></svg>
      </div>
      <h3 style="text-align:center">${heading}</h3>
      <div class="auth-sub" style="text-align:center">${sub}</div>
      <div class="form-field" id="otp-field" style="margin-top:14px">
        <input id="otpInput" class="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" oninput="this.value=this.value.replace(/[^0-9]/g,'')">
        <div class="errmsg">Enter the 6-digit code.</div>
      </div>
      <div class="auth-error" id="otpAuthErr"></div>
      <button class="btn btn-primary btn-block btn-lg" id="otpSubmitBtn" onclick="confirmSmsCode()">Verify &amp; continue</button>
      <div class="auth-switch">Didn't get it? <button onclick="resendSmsCode()">Resend code</button></div>
      <div class="sec-note" style="margin-top:16px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg><span>Standard SMS rates may apply. Codes verify it's really you.</span></div>
    </div>`;
  showOverlay();
  setTimeout(()=>{ const i=document.getElementById('otpInput'); if(i) i.focus(); },120);
}
function confirmSmsCode(){
  const inp=document.getElementById('otpInput');
  const code=(inp?inp.value:'').trim();
  if(!/^\d{6}$/.test(code)){ document.getElementById('otp-field').classList.add('err'); return; }
  document.getElementById('otp-field').classList.remove('err');
  clearAuthError('otp');
  const ctx=_otpContext||{};
  setAuthBusy('otpSubmitBtn', true, 'Verifying…');
  const cleanup=()=>{ if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha(); };
  const fail=(err)=>{ setAuthBusy('otpSubmitBtn', false, 'Verify & continue'); showAuthError('otp', smsErrorMessage(err) || 'Verification failed. Please resend a new code.'); };

  // ── SMS MFA: finish enrolling the phone as a 2nd factor ──
  if(ctx.mode==='enroll'){
    if(!_mfaVerificationId){ fail({code:'auth/code-expired'}); return; }
    window.firebaseAuth.confirmMfaEnrollment(_mfaVerificationId, code, 'My phone')
      .then(()=>{ cleanup(); toast('Two-factor enabled','Your phone now protects your account.'); const nx=ctx.next; if(typeof nx==='function'){ nx(); } else { finishLogin(); } })
      .catch(fail);
    return;
  }
  // ── SMS MFA: complete the second-factor challenge at sign-in ──
  if(ctx.mode==='mfa-signin'){
    if(!_mfaResolver || !_mfaVerificationId){ showAuthError('otp','This session expired. Please log in again.'); setAuthBusy('otpSubmitBtn',false,'Verify & continue'); return; }
    window.firebaseAuth.confirmMfaSignIn(_mfaResolver, _mfaVerificationId, code)
      .then(()=>{ cleanup(); finishLogin(); })
      .catch(fail);
    return;
  }
  // ── Legacy phone-link / phone sign-in path ──
  if(!_otpConfirmation){ fail({code:'auth/code-expired'}); return; }
  _otpConfirmation.confirm(code)
    .then(()=>{
      cleanup();
      if(ctx.mode==='login'){ finishLogin(); }
      else { const user = window.firebaseAuth.currentUser && window.firebaseAuth.currentUser(); finishEmailVerification(user, ctx.email); }
    })
    .catch(fail);
}
function resendSmsCode(){
  const ctx=_otpContext||{};
  ensureRecaptchaContainer();
  // A consumed reCAPTCHA token can't be reused - rebuild a fresh verifier.
  if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha();
  clearAuthError('otp');
  toast('Sending…','A new code is on its way.');
  let sender;
  if(ctx.mode==='enroll'){
    if(!ctx.phone) return;
    sender = window.firebaseAuth.startMfaEnrollment(ctx.phone).then(vid=>{ _mfaVerificationId=vid; });
  } else if(ctx.mode==='mfa-signin'){
    if(!_mfaResolver) return;
    sender = window.firebaseAuth.startMfaSignIn(_mfaResolver).then(vid=>{ _mfaVerificationId=vid; });
  } else if(ctx.phone){
    sender = (ctx.mode==='login' ? window.firebaseAuth.sendPhoneOtp(ctx.phone) : window.firebaseAuth.linkPhoneOtp(ctx.phone)).then(c=>{ _otpConfirmation=c; });
  } else { return; }
  sender.then(()=> toast('Code sent','Check your phone for the new code.'))
        .catch(err=>{ if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha(); showAuthError('otp', smsErrorMessage(err) || 'Could not send the code. Try again shortly.'); });
}
// Human-friendly message for the most common Firebase phone-auth errors.
function smsErrorMessage(err){
  const code = (err && err.code) || '';
  switch(code){
    case 'auth/invalid-phone-number': return 'That phone number looks invalid. Check it and try again.';
    case 'auth/missing-phone-number': return 'Please enter a phone number first.';
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/quota-exceeded': return 'Our SMS quota is temporarily exhausted. Please try again later or use email.';
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential': return 'Verification check failed. Please reload the page and try again.';
    case 'auth/operation-not-allowed': return 'Phone sign-in isn\'t enabled for this project yet.';
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential': return 'That phone number is already linked to another account.';
    case 'auth/code-expired': return 'That code expired. Tap “Resend code” for a new one.';
    case 'auth/invalid-verification-code': return 'That code is incorrect. Please try again.';
    default: return (err && err.message) ? err.message.replace(/^Firebase:\s*/,'') : '';
  }
}
// Send the email verification link, sign out, then show the "check inbox" screen.
function finishEmailVerification(user, email){
  const acs={ url: window.location.origin + '/verify-email.html' };
  const send = user ? window.firebaseAuth.sendVerificationEmail(user, acs) : Promise.resolve();
  return send.catch(err=>{ console.error('[Workley] sendEmailVerification failed:', err); })
    .then(()=> window.firebaseAuth.logout())
    .then(()=>{ showVerificationScreen(email, { phoneVerified:true }); });
}

// ════════════════ EMAIL VERIFICATION SCREEN ════════════════
function showVerificationScreen(email, opts){
  opts = opts || {};
  const headline = opts.phoneVerified ? 'Phone verified - now confirm your email'
    : (opts.resent ? 'Verify your email to continue' : 'Check your inbox');
  const sub = opts.phoneVerified
    ? `Your phone is verified ✓. We've also sent a verification link to <strong>${_esc(email)}</strong> - open it, then log in.`
    : (opts.resent
      ? `Your email isn't verified yet, so we've sent a fresh verification link to <strong>${_esc(email)}</strong>. Open it, then log in.`
      : `We've sent a verification email to <strong>${_esc(email)}</strong>. Please verify it and log in.`);
  // If the account has a verified phone, offer SMS as an alternative.
  const smsBtn = opts.phone
    ? `<button class="btn btn-outline btn-block btn-lg" style="margin-top:10px" onclick="startLoginSmsVerification('${_esc(opts.phone)}')">Can't access email? Verify by SMS</button>`
    : '';
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="authClose()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:0">
      <div style="margin:0 auto 20px;width:58px;height:58px;border-radius:50%;background:var(--blue-50);color:var(--blue);display:grid;place-items:center">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
      </div>
      <h3 style="text-align:center">${headline}</h3>
      <div class="auth-sub" style="text-align:center">${sub}</div>
      <button class="btn btn-primary btn-block btn-lg" style="margin-top:24px" onclick="authClose();openLogin()">Go to log in</button>
      ${smsBtn}
      <div class="sec-note" style="margin-top:16px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg><span>For your security, every Workley login requires a verified email or SMS code.</span></div>
    </div>`;
  showOverlay();
}
// Login alternative: send an SMS code to the account's verified number.
function startLoginSmsVerification(phone){
  if(!phone){ toast('No phone on file','This account has no verified number - use the email link.'); return; }
  if(!window.firebaseAuth || !window.firebaseAuth.sendPhoneOtp){ toast('Unavailable','SMS verification isn\'t ready. Use the email link.'); return; }
  ensureRecaptchaContainer();
  if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha();
  toast('Sending code…','We\'re texting you a verification code.');
  window.firebaseAuth.sendPhoneOtp(phone)
    .then(c=>{ _otpConfirmation=c; showSmsVerificationScreen({ mode:'login', phone }); })
    .catch(err=>{ if(window.firebaseAuth.resetRecaptcha) window.firebaseAuth.resetRecaptcha(); toast('Couldn\'t send SMS', smsErrorMessage(err) || 'Try the email link instead.'); });
}

// ════════════════ POST-LOGIN ROUTING ════════════════
// After Firebase verifies the credentials, send the user to onboarding (if
// their profile is missing) or back to the landing page.
function finishLogin(){
  authClose();
  sessionStorage.setItem('workley_show_welcome', '1');
  // After an MFA resolveSignIn/enroll, onAuthStateChanged may not have set
  // window.firebaseUser yet - fall back to the live currentUser.
  const u = window.firebaseUser || (window.firebaseAuth && window.firebaseAuth.currentUser && window.firebaseAuth.currentUser());
  const uid = u ? u.uid : null;
  const email = (u && u.email) ? u.email.toLowerCase() : '';
  const go = (hasProfile)=>{
    if(hasProfile){ window.location.href = 'dashboard.html'; return; }
    const storedRole = email ? localStorage.getItem('workley_signup_role_'+email) : null;
    window.location.href = 'onboarding.html?role='+encodeURIComponent(storedRole || 'talent');
  };
  // Fast path: a cached profile means we already know they're set up.
  let local = false;
  try { local = !!(uid && localStorage.getItem('workley_profile_'+uid)); } catch(e){}
  if(local){ go(true); return; }
  // No local cache - happens after a password reset, on a new device, or when
  // storage was cleared. DON'T assume they need onboarding: check Firestore for
  // an existing profile first, and re-seed the local cache if found.
  if(uid && window.firebaseDB && window.firebaseDB.getProfile){
    window.firebaseDB.getProfile(uid).then(p=>{
      const complete = !!(p && (p.field || p.clientType || p.bio || p.description || (p.skills && p.skills.length)));
      if(complete){
        try { localStorage.setItem('workley_profile_'+uid, JSON.stringify(p)); } catch(e){}
        if(p.role && email){ try { localStorage.setItem('workley_signup_role_'+email, p.role); } catch(e){} }
      }
      go(complete);
    }).catch(()=> go(false));
  } else { go(false); }
}


function oauthLogin(provider){
  if(provider==='Google'){
    googleAuth('');   // login - role resolved from the existing profile
  }else if(provider==='Apple'){
    appleLoginRedirect();
  }
}
function appleLoginRedirect(){
  toast('Coming soon','Apple Sign-In requires backend infrastructure. Use Google for now.');
}

// ---- Session helpers ----
function initials(name){return name.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'U';}
function signIn(name,email,location,role,method){
  USER={name,email,location,role,method,
        avatar:null,           // profile picture URL (none yet → icon/initials shown)
        initials:initials(name),
        title: role==='talent'?'ICT Student / Graduate':'Client',
        rate: role==='talent'?250:null,
        skills: role==='talent'?['Add your skills']:[],
        about:''};
  renderNavAuth();
}

// Resolve a signed-in user's role from their saved profile, falling back to
// the role they chose at signup (stored by email). Defaults to 'talent'.
function _resolveUserRole(user){
  try {
    if(user && user.uid){
      const raw = localStorage.getItem('workley_profile_'+user.uid);
      if(raw){ const p=JSON.parse(raw); if(p && p.role) return p.role; }
    }
    const email = (user && user.email) ? user.email.toLowerCase() : '';
    if(email){ const r=localStorage.getItem('workley_signup_role_'+email); if(r) return r; }
  } catch(e){}
  return 'talent';
}

// ═══════════ Firebase session sync (real auth state, no profile data saved) ═══════════
// Called by js/firebase-config.js whenever Firebase's auth state changes.
function onFirebaseAuthChanged(user){
  if(user && !user.emailVerified){
    // Email not verified - block app-level access without calling logout() here.
    // (Calling logout() inside onAuthStateChanged can race with sendEmailVerification.)
    // The explicit logout() calls in submitSignup / submitLogin handle session cleanup.
    USER = null;
    renderNavAuth();
    if(document.getElementById('dashboardPage')){ window.location.href='index.html'; }
    return;
  }
  if(user){
    // Auth displayName is the FIRST name (for the verification email). Prefer
    // the full name stored at signup for the UI/initials when available.
    let fullName = '';
    try { fullName = localStorage.getItem('workley_signup_name_'+((user.email||'').toLowerCase())) || ''; } catch(e){}
    const displayName = fullName || user.displayName || (user.email||'user').split('@')[0].replace(/[._]/g,' ');
    // Resolve the real account role: saved profile first, then the role chosen
    // at signup (kept by email). Lets the landing page tailor talent/client CTAs.
    const resolvedRole = _resolveUserRole(user);
    USER = {
      name: displayName, email: user.email, location:'', role: resolvedRole, method:'email',
      avatar:user.photoURL||null, initials:initials(displayName),
      title: resolvedRole==='client'?'Client':'ICT Student / Graduate', rate:null, skills:[], about:''
    };
    if(sessionStorage.getItem('workley_show_welcome')){
      sessionStorage.removeItem('workley_show_welcome');
      setTimeout(()=>showWelcomeBanner(USER.name), 600);
    }
    // Backfill: ensure this user's saved profile exists in Firestore so
    // existing talent (who onboarded before Firestore) appear in the catalog.
    _backfillProfileToCloud();
    // The talent cache may have loaded before auth resolved - inject the
    // signed-in talent's own card now so they see themselves in the catalog.
    if(TALENT_LOADED && (document.getElementById('talentGrid')||document.getElementById('featGrid')||document.getElementById('catGrid'))){
      if(_mergeSelfIntoTalent()){
        if(document.getElementById('talentGrid')) renderTalent();
        if(document.getElementById('featGrid'))   renderFeatured();
        if(document.getElementById('catGrid'))    renderCats();
      }
    }
  }else{
    USER = null;
  }
  renderNavAuth();

  // Dashboard page: guard + render
  if(document.getElementById('dashboardPage')){
    if(!user){ window.location.replace('index.html'); }
    else{ renderDashboard(user); }
  }
  // Profile page: re-render once Firebase has reported the session,
  // so the synchronous null check at script-load doesn't strand us
  // on the "not logged in" placeholder.
  if(document.getElementById('profilePage')){
    const mount = document.getElementById('profileMount');
    if(user && USER){
      renderProfileInto('profileMount');
    } else if(!user && mount && !window._signingOut){
      // (When signing out we skip this - the redirect to the landing page is
      //  imminent, so showing a login/sign-up prompt would just be a flash.)
      mount.innerHTML = '<div class="pf-card" style="text-align:center"><h1 style="font-size:1.3rem">You\'re not logged in</h1><p style="color:var(--muted);margin:10px 0 18px">Log in or sign up to view your profile.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary btn-lg" onclick="openLogin()">Log in</button><button class="btn btn-outline btn-lg" onclick="openSignup()">Sign up</button></div></div>';
    }
  }
}
function renderDashboard(user){
  const el=document.getElementById('dashEmail');
  if(el)el.textContent=user.email;
}
function showWelcomeBanner(name){
  const existing=document.getElementById('welcomeBanner');
  if(existing) existing.remove();
  const first=(name||'').trim().split(/\s+/)[0];
  const display=first?first.charAt(0).toUpperCase()+first.slice(1):'there';
  const el=document.createElement('div');
  el.id='welcomeBanner';
  el.className='welcome-banner';
  el.innerHTML=`<span class="wave">👋</span><span class="wb-text">Welcome back, <strong>${display}</strong></span>`;
  document.body.appendChild(el);
  setTimeout(()=>{
    el.classList.add('out');
    setTimeout(()=>{ if(el.parentNode) el.remove(); }, 380);
  }, 3800);
}
// ════════════════ TERMS OF USE (POPIA-aligned) ════════════════
function openTerms(){
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div><h3 style="font-size:1.2rem">Terms of Use &amp; Privacy</h3><div class="terms-doc upd" style="margin-top:3px">Summary · Read the full <a href="terms.html" target="_blank" rel="noopener">Terms</a>, <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> &amp; <a href="refund.html" target="_blank" rel="noopener">Refund Policy</a></div></div><button class="modal-x" onclick="openSignupForm()" aria-label="Close">×</button></div>
    <div class="modal-body">
      <div class="terms-doc">
        <h4>1. Who we are</h4>
        <p>Workley (Pty) Ltd ("Workley", "we") operates this marketplace connecting South African ICT students and graduates with clients. We are the Responsible Party for your personal information under the Protection of Personal Information Act, 2013 (POPIA).</p>

        <h4>2. Information we collect</h4>
        <ul>
          <li>Account details: name, email, password (stored hashed), location and account type.</li>
          <li>Profile data you choose to add: skills, portfolio, education and rate.</li>
          <li>Verification data: proof of enrolment or qualification, processed only to confirm credibility.</li>
          <li>Technical data: device, log and security information used to protect your account.</li>
        </ul>

        <h4>3. How we use it (purpose limitation)</h4>
        <p>We process your information only to operate the marketplace - creating your account, verifying identity (including via the Department of Home Affairs), matching talent with work, enabling payments between clients and talent, and keeping the platform safe. We do not sell your personal information.</p>

        <h4>4. Your POPIA rights</h4>
        <ul>
          <li>Access the personal information we hold about you.</li>
          <li>Request correction or deletion of your information.</li>
          <li>Object to processing or withdraw consent at any time.</li>
          <li>Lodge a complaint with the Information Regulator (South Africa).</li>
        </ul>

        <h4>5. Consent</h4>
        <p>By creating an account you consent to the processing of your personal information as described here. Consent is voluntary and may be withdrawn, though some features may then be unavailable. Where you are under 18, a parent or guardian must consent on your behalf.</p>

        <h4>6. Security</h4>
        <p>We apply technical and organisational safeguards including encryption in transit and at rest, hashed passwords, two-factor authentication, access controls and monitoring. No system is perfectly secure, and you are responsible for keeping your credentials confidential.</p>

        <h4>7. Data retention &amp; sharing</h4>
        <p>We keep your information only as long as needed for the purposes above or as required by law, then delete or anonymise it. Limited sharing occurs with payment and verification providers under contract, and with authorities where legally required.</p>

        <h4>8. Contact</h4>
        <p>Information Officer, Workley (Pty) Ltd - privacy@workley.co.za. You may also contact the Information Regulator at inforeg.org.za.</p>

        <p class="upd" style="margin-top:14px">This is a summary. The full <a href="terms.html" target="_blank" rel="noopener">Terms &amp; Conditions</a>, <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> and <a href="refund.html" target="_blank" rel="noopener">Return &amp; Refund Policy</a> govern your use of Workley.</p>
      </div>
      <button class="btn btn-primary btn-block btn-lg" style="margin-top:18px" onclick="acceptTermsFromDoc()">I agree - go back</button>
    </div>`;
  showOverlay();
}
function acceptTermsFromDoc(){
  openSignupForm();
  setTimeout(()=>{const c=document.getElementById('suTos');if(c)c.checked=true;},60);
}

function signOut(){
  // Flag the sign-out so the auth-change handler doesn't flash a login/sign-up
  // prompt before we land on the (signed-out) landing page. replace() also keeps
  // the signed-out page out of history.
  window._signingOut = true;
  if(window.firebaseAuth){
    window.firebaseAuth.logout().finally(()=>{ window.location.replace('index.html'); });
  }else{
    USER=null; renderNavAuth(); closeProfilePage();
    window.location.replace('index.html');
  }
}

// ─── Delete account ──────────────────────────────────────────────────
// Deleting the Auth user triggers a Cloud Function (onUserDeleted) that purges
// the Firestore profile + storage, so the person disappears from the talent
// catalog. Firebase needs a recent login first, so we re-auth when required.
function confirmDeleteAccount(){
  document.getElementById('modal').classList.remove('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div><h3 style="font-size:1.25rem">Delete your account?</h3></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="modal-body">
      <p style="color:var(--ink-soft);margin-bottom:10px">This permanently deletes your Workley account and removes your profile from the talent catalog. This can't be undone.</p>
      <ul style="color:var(--muted);font-size:.88rem;margin:0 0 18px 18px;line-height:1.7">
        <li>Your public profile and photo are removed</li>
        <li>Your reviews, views and messages are cleared</li>
        <li>You're signed out immediately</li>
      </ul>
      <div class="auth-error" id="delErr"></div>
      <button class="btn btn-danger btn-block btn-lg" id="delBtn" onclick="doDeleteAccount()">Yes, delete my account</button>
      <button class="btn btn-outline btn-block" style="margin-top:10px" onclick="closeModal()">Cancel</button>
    </div>`;
  showOverlay();
}
function doDeleteAccount(){
  if(!window.firebaseAuth || !window.firebaseAuth.deleteAccount){ _delErr('Account services aren\'t ready. Please refresh and try again.'); return; }
  // Gate 1: the account's email must be verified (it is for every logged-in
  // user, but enforce it explicitly so deletion can never happen unverified).
  const u = window.firebaseAuth.currentUser && window.firebaseAuth.currentUser();
  if(u && u.emailVerified === false){
    if(window.firebaseAuth.sendVerificationEmail){ window.firebaseAuth.sendVerificationEmail(u).catch(()=>{}); }
    _delErr('Please verify your email first - we\'ve sent you a fresh verification link.');
    return;
  }
  // Gate 2: ALWAYS re-confirm identity before deleting (password re-entry, or a
  // Google re-auth popup) - never a silent delete, even right after signing in.
  _reauthThenDelete();
}
function _reauthThenDelete(){
  const prov = (window.firebaseAuth.providerId && window.firebaseAuth.providerId()) || '';
  if(prov==='google.com'){
    setAuthBusy('delBtn', true, 'Verifying…');
    window.firebaseAuth.reauthGoogle()
      .then(()=> window.firebaseAuth.deleteAccount())
      .then(()=> _afterAccountDeleted())
      .catch(err=>{
        setAuthBusy('delBtn', false, 'Yes, delete my account');
        if(err && (err.code==='auth/popup-closed-by-user'||err.code==='auth/cancelled-popup-request')) return;
        _delErr('Please confirm with Google to delete your account.');
      });
    return;
  }
  // Email/password account → ask for the password to confirm identity.
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div><h3 style="font-size:1.2rem">Confirm it's you</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">Enter your password to delete your account.</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="modal-body">
      <div class="form-field" id="del-pw"><label for="delPw">Password</label>
        <div class="pw-wrap"><input id="delPw" type="password" placeholder="Your password" autocomplete="current-password"><button type="button" class="pw-eye" id="delPwEye" onclick="togglePwVis('delPw','delPwEye')" aria-label="Show password">${EYE_ICON}</button></div>
        <div class="errmsg">Enter your password.</div>
      </div>
      <div class="auth-error" id="delErr"></div>
      <button class="btn btn-danger btn-block btn-lg" id="delBtn" onclick="confirmPwDelete()">Delete account</button>
      <button class="btn btn-outline btn-block" style="margin-top:10px" onclick="closeModal()">Cancel</button>
    </div>`;
  setTimeout(()=>{const el=document.getElementById('delPw');if(el)el.focus();},100);
}
function confirmPwDelete(){
  const pw = (document.getElementById('delPw')||{}).value||'';
  if(!pw){ document.getElementById('del-pw').classList.add('err'); return; }
  setAuthBusy('delBtn', true, 'Deleting…');
  window.firebaseAuth.reauthPassword(pw)
    .then(()=> window.firebaseAuth.deleteAccount())
    .then(()=> _afterAccountDeleted())
    .catch(err=>{
      setAuthBusy('delBtn', false, 'Delete account');
      const code = err && err.code;
      if(code==='auth/wrong-password' || code==='auth/invalid-credential'){ _delErr('That password is incorrect.'); return; }
      _delErr((err&&err.message)? err.message.replace(/^Firebase:\s*/,'') : 'Couldn\'t delete the account.');
    });
}
function _afterAccountDeleted(){
  try { const uid = window.firebaseUser && window.firebaseUser.uid; if(uid) localStorage.removeItem('workley_profile_'+uid); } catch(e){}
  closeModal();
  toast('Account deleted','Your Workley account and profile have been removed.');
  setTimeout(()=>{ window.location.href='index.html'; }, 900);
}
function _delErr(msg){ const el=document.getElementById('delErr'); if(el){ el.textContent=msg; el.style.display='block'; } }

// ---- Nav reflects auth state ----
function renderNavAuth(){
  document.querySelectorAll('[data-auth-guest]').forEach(el=>el.style.display = USER?'none':'');
  document.querySelectorAll('[data-auth-user]').forEach(el=>el.style.display = USER?'':'none');
  // Role-aware CTAs: talent-only elements are hidden from signed-in clients,
  // client-only elements hidden from signed-in talent. (Guests see everything.)
  const isClient = !!(USER && USER.role==='client');
  const isTalent = !!(USER && USER.role==='talent');
  document.querySelectorAll('[data-hide-client]').forEach(el=>el.style.display = isClient?'none':'');
  document.querySelectorAll('[data-hide-talent]').forEach(el=>el.style.display = isTalent?'none':'');
  if(USER){
    document.querySelectorAll('.na-av').forEach(a=>a.textContent=USER.initials);
    document.querySelectorAll('.na-name').forEach(n=>n.textContent=USER.name.split(' ')[0]);
  }
  if(typeof renderFeatured==='function' && document.getElementById('featGrid')) renderFeatured();
  renderProfileBtn();
}
// Profile button: pic if logged-in & has one, else initials if logged-in, else generic icon
function renderProfileBtn(){
  const b=document.getElementById('navProf');
  if(!b)return;
  if(USER && USER.avatar){
    b.innerHTML='<img src="'+USER.avatar+'" alt="'+USER.name+'">';
    b.setAttribute('aria-label','Your profile');
  }else if(USER){
    b.innerHTML='<span class="np-initials">'+USER.initials+'</span>';
    b.setAttribute('aria-label','Your profile');
  }else{
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/></svg>';
    b.setAttribute('aria-label','Log in or sign up');
  }
}
// Profile button click: logged in → profile page; else → auth slider
function profileBtn(){
  if(USER){openProfilePage();}
  else{toggleAuthSlider(true);}
}
function toggleAuthSlider(on){
  document.getElementById('authSlider').classList.toggle('show',on);
  document.body.style.overflow=on?'hidden':'';
}

// ---- Profile page ----
// Load saved onboarding profile (localStorage) for the current Firebase UID
// and merge it into USER so the page reflects what they entered.
function loadSavedProfileIntoUser(){
  if(!USER) return;
  const uid = (window.firebaseUser && window.firebaseUser.uid) || null;
  if(!uid) return;
  try {
    const raw = localStorage.getItem('workley_profile_'+uid);
    if(!raw) return;
    const p = JSON.parse(raw);
    USER.profileData = p;
    // Promote a few fields onto USER itself so existing UI bits pick them up
    if(p.role) USER.role = p.role;
    if(p.avatar) USER.avatar = p.avatar;
    if(USER.role==='talent'){
      if(p.title)    USER.title = p.title;
      if(p.rate)     USER.rate = p.rate;
      if(p.skills)   USER.skills = p.skills;
      if(p.bio)      USER.about = p.bio;
    } else {
      if(p.orgName)  USER.title = p.orgName;
      if(p.location) USER.location = p.location;
      if(p.description) USER.about = p.description;
    }
  } catch(e){ console.error('[Workley] loadSavedProfile failed:', e); }
}

// Wider talent skill pool - kept in sync with onboarding.html
const SKILL_POOL = {
  dev:['JavaScript','TypeScript','HTML/CSS','React','Vue.js','Angular','Svelte','Next.js','Tailwind CSS','Node.js','Express','Nest.js','Python','Django','Flask','FastAPI','Java','Spring Boot','C#/.NET','PHP','Laravel','Ruby on Rails','Go','Rust','Kotlin','Swift','Flutter','React Native','iOS','Android','PostgreSQL','MySQL','MongoDB','Redis','SQLite','Firebase','REST APIs','GraphQL','WebSockets','gRPC','Git','Docker','CI/CD','Testing (Jest/Pytest)','Agile/Scrum','Code review','System design'],
  data:['Python','R','SQL','Pandas','NumPy','Matplotlib','Seaborn','Scikit-learn','TensorFlow','PyTorch','Keras','XGBoost','Machine Learning','Deep Learning','NLP','Computer Vision','Time-series analysis','Statistics','Hypothesis testing','A/B testing','Feature engineering','Power BI','Tableau','Looker','Excel (advanced)','Data cleaning','ETL pipelines','Airflow','dbt','Apache Spark','Hadoop','BigQuery','Snowflake','Redshift','Databricks','MLOps','Model deployment','Prompt engineering','LangChain','RAG'],
  sec:['Pen-testing','Vulnerability scanning','OWASP Top 10','Burp Suite','Metasploit','Nmap','Wireshark','SIEM','Splunk','Wazuh','ELK Stack','Incident response','Forensics','Threat hunting','Threat modeling','Network security','Firewall configuration','VPN','Zero Trust','IDS/IPS','Cryptography','PKI','OAuth/JWT','SAML','Identity & access management','Cloud security (AWS/Azure)','Endpoint security','SAST/DAST','Secure code review','Linux hardening','Windows hardening','Red team / Blue team','Risk assessment','Compliance (POPIA, ISO 27001, PCI-DSS)','Security awareness training','CISSP / CEH (in progress)'],
  cloud:['AWS','Azure','GCP','DigitalOcean','Linode','Docker','Kubernetes','Helm','Docker Compose','CI/CD','GitHub Actions','GitLab CI','Jenkins','CircleCI','Terraform','Ansible','Pulumi','CloudFormation','ARM templates','Linux','Bash scripting','Python scripting','PowerShell','Prometheus','Grafana','Datadog','New Relic','ELK Stack','Monitoring & alerting','Nginx','Apache','Load balancing','CDN','Caching','Serverless (Lambda/Functions)','S3','EC2','RDS','VPC','IAM','Site reliability engineering','Incident management','On-call'],
  support:['Troubleshooting','Help desk','Ticketing systems (Zendesk/Jira)','Customer service','Windows 10/11','macOS','Linux desktop','Chrome OS','Networking fundamentals','TCP/IP','DNS','DHCP','Wi-Fi configuration','Active Directory','Group Policy','Office 365 admin','Google Workspace admin','Hardware repair','Peripheral setup','Printer support','Remote support tools (TeamViewer/AnyDesk)','VPN setup','SSO setup','Backup & recovery','Disaster recovery','Patch management','Antivirus / EDR','Asset & inventory management','SLAs','Documentation','Training end-users','A+ / Network+ (in progress)'],
  design:['Figma','Adobe XD','Sketch','InVision','Penpot','UI design','UX design','Interaction design','Visual design','Wireframing','Prototyping','Design systems','Component libraries','User research','Usability testing','User interviews','Personas','Journey mapping','Accessibility (WCAG)','Inclusive design','Responsive web','Mobile-first design','HTML/CSS','Tailwind CSS','Webflow','Framer','WordPress','Adobe Photoshop','Adobe Illustrator','After Effects','Motion design','Typography','Color theory','Brand identity','Logo design','UX writing','Microcopy','Design tokens','Information architecture']
};
const SOFT_SKILLS = [
  'Communication','Problem solving','Critical thinking','Teamwork','Leadership',
  'Time management','Adaptability','Creativity','Emotional intelligence','Conflict resolution',
  'Active listening','Empathy','Self-motivation','Public speaking','Negotiation',
  'Decision making','Attention to detail','Patience','Strong work ethic','Collaboration',
  'Mentoring','Project management','Strategic thinking','Customer focus','Networking',
  'Presentation skills','Cross-cultural awareness','Resilience','Stress management',
  'Open-mindedness','Curiosity','Initiative','Accountability','Reliability',
  'Constructive feedback','Self-awareness','Continuous learning','Storytelling','Persuasion'
];

const PROFILE_CATEGORIES = {
  dev:'Software Development', data:'Data Science & AI', sec:'Cybersecurity',
  cloud:'Cloud & DevOps', support:'IT Support', design:'UI/UX & Web Design'
};
const PROFILE_LABELS = {
  status:    {student:'Currently studying', grad:'Recent graduate', selfTaught:'Self-taught'},
  experience:{starter:'Just starting out', practiced:'Some hands-on experience', confident:'Confident professional'},
  clientType:{individual:'Individual', startup:'Startup', small:'Small organization', large:'Established company'},
  timing:    {now:'Ready to hire now', month:'Within the next month', exploring:'Just exploring'}
};
function _esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);}

const PEN_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';

function renderProfileInto(mountId){
  if(!USER)return false;
  loadSavedProfileIntoUser();
  const u=USER;
  const p=u.profileData||{};
  const mount=document.getElementById(mountId);
  if(!mount)return false;

  if(u.role==='talent'){
    mount.innerHTML = renderTalentProfile(u,p);
  } else {
    mount.innerHTML = renderClientProfile(u,p);
  }
  return true;
}

function renderTalentProfile(u,p){
  const fieldName = PROFILE_CATEGORIES[p.field] || '-';
  const skills = (p.skills||u.skills||[]);
  const skillsHtml = skills.length
    ? skills.map(s=>`<span class="chip">${_esc(s)}</span>`).join('')
    : '<span class="pf-empty">No skills added yet.</span>';
  const rate = p.rate || u.rate;
  const title = p.title || u.title || '-';
  const photo = p.avatar || u.avatar;
  return `
    <div class="pf-card">
      <div class="pf-id">
        <div class="pf-av-wrap">
          <button class="pf-av pf-av-btn" onclick="openAvatarUpload()" aria-label="Change profile picture" title="Change profile picture">
            ${photo ? `<img src="${_esc(photo)}" alt="${_esc(u.name)}">` : u.initials}
          </button>
          <button class="pf-av-edit" onclick="openAvatarUpload()" aria-label="Change profile picture">${PEN_ICON}</button>
        </div>
        <div class="pf-id-main">
          <h1>${_esc(u.name)}</h1>
          <div class="pf-username">${p.username?'@'+_esc(p.username):'<span style="color:var(--muted)">No username yet</span>'}<button class="pf-uname-edit" onclick="editUsername()" aria-label="Edit username" title="Edit username">${PEN_ICON}</button></div>
          <div class="pf-title">${_esc(title)}</div>
          <div class="pf-loc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>${_esc(u.location||'South Africa')}</div>
          <span class="pf-verified">${IC.check} Verified email</span>
        </div>
        ${rate ? `<div class="pf-rate"><div class="r-n">R${_esc(rate)}<span style="font-size:.9rem;font-weight:400;color:var(--muted)">/hr</span></div><div class="r-l">Hourly rate</div></div>` : ''}
      </div>
      <div class="pf-actions">
        <div class="pf-actions-main">
          <button class="btn btn-primary btn-edit-profile" onclick="location.href='dashboard.html'">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
            Go to dashboard
          </button>
          <button class="btn btn-outline btn-edit-profile" onclick="sessionStorage.setItem('workley_force_onboarding','1');location.href='onboarding.html?role='+encodeURIComponent(USER.role||'talent')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Edit profile fully
          </button>
        </div>
        <button class="btn btn-signout" onclick="signOut()">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </div>
    </div>

    <div class="pf-grid">
      <div class="pf-block">
        <div class="pf-block-head"><h3>About</h3><button class="pf-edit" onclick="editProfileSection('about')">${PEN_ICON} Edit</button></div>
        ${p.bio?`<p>${_esc(p.bio).replace(/\n/g,'<br>')}</p>`:'<p class="pf-empty">Add a short bio so clients learn what makes you a great hire.</p>'}
      </div>
      <div class="pf-block">
        <div class="pf-block-head"><h3>Skills</h3><button class="pf-edit" onclick="editProfileSection('skills')">${PEN_ICON} Edit</button></div>
        <div class="chips">${skillsHtml}</div>
      </div>
      <div class="pf-block">
        <div class="pf-block-head"><h3>Education</h3><button class="pf-edit" onclick="editProfileSection('education')">${PEN_ICON} Edit</button></div>
        ${p.university ? `
          <div class="pf-meta-row"><span class="pf-meta-label">Institution</span><span>${_esc(p.university)}</span></div>
          <div class="pf-meta-row"><span class="pf-meta-label">Course</span><span>${_esc(p.course)}</span></div>
          ${(p.degreeYear && p.status==='student') ? `<div class="pf-meta-row"><span class="pf-meta-label">Year of study</span><span>${_esc(p.degreeYear)}</span></div>` : ''}
          ${(p.startYear && p.status==='student') ? `<div class="pf-meta-row"><span class="pf-meta-label">Started</span><span>${_esc(p.startYear)}</span></div>` : ''}
          <div class="pf-meta-row"><span class="pf-meta-label">${p.status==='grad'?'Graduated':'Expected graduation'}</span><span>${_esc(p.gradYear)}</span></div>` : '<p class="pf-empty">Add your education details.</p>'}
      </div>
      <div class="pf-block">
        <div class="pf-block-head"><h3>Title &amp; rate</h3><button class="pf-edit" onclick="editProfileSection('titleRate')">${PEN_ICON} Edit</button></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Title</span><span>${_esc(title)}</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Hourly rate</span><span>${rate?'R'+_esc(rate)+'/hr':'-'}</span></div>
      </div>
      <div class="pf-block">
        <div class="pf-block-head"><h3>Soft skills</h3><button class="pf-edit" onclick="editProfileSection('softSkills')">${PEN_ICON} Edit</button></div>
        <div class="chips">${(p.softSkills||[]).length?(p.softSkills.map(s=>`<span class="chip">${_esc(s)}</span>`).join('')):'<span class="pf-empty">No soft skills added yet.</span>'}</div>
      </div>
      <div class="pf-block">
        <div class="pf-block-head"><h3>Hobbies &amp; interests</h3><button class="pf-edit" onclick="editProfileSection('hobbies')">${PEN_ICON} Edit</button></div>
        ${p.hobbies?`<p>${_esc(p.hobbies).replace(/\n/g,'<br>')}</p>`:'<p class="pf-empty">Share what you enjoy outside of work.</p>'}
      </div>
      <div class="pf-block pf-block-wide">
        <div class="pf-block-head"><h3>Showcase your work</h3><button class="pf-edit" onclick="sessionStorage.setItem('workley_force_onboarding','1');location.href='onboarding.html?role=talent'">${PEN_ICON} Edit</button></div>
        ${(function(){
          const files = Array.isArray(p.portfolio)?p.portfolio.filter(f=>f&&f.url):[];
          let out='';
          if(files.length){
            out += `<div class="pf-files">`+files.slice(0,3).map(f=>{
              const isImg=/^image\//.test(f.type||'')||/\.(png|jpe?g|webp|gif)(\?|$)/i.test(f.url);
              const thumb=isImg?`<img src="${_esc(f.url)}" class="pf-file-thumb" alt="" loading="lazy">`:`<span class="pf-file-ic">${IC.port}</span>`;
              return `<a class="pf-file" href="${_esc(f.url)}" data-name="${_esc(f.name||'File')}" data-type="${_esc(f.type||'')}" target="_blank" rel="noopener noreferrer" onclick="event.preventDefault();previewFile(this.href,this.dataset.name,this.dataset.type)">${thumb}<span class="pf-file-name">${_esc(f.name||'File')}</span></a>`;
            }).join('')+`</div>`;
          }
          if(p.website){ const href=/^https?:\/\//i.test(p.website)?p.website:('https://'+p.website); out+=`<div class="pf-meta-row"><span class="pf-meta-label">Website</span><a href="${_esc(href)}" target="_blank" rel="noopener noreferrer">${_esc(p.website)}</a></div>`; }
          if(p.certifications){ out+=`<div class="pf-sub"><strong>Certifications</strong><p>${_esc(p.certifications).replace(/\n/g,'<br>')}</p></div>`; }
          if(p.workExperience){ out+=`<div class="pf-sub"><strong>Work experience</strong><p>${_esc(p.workExperience).replace(/\n/g,'<br>')}</p></div>`; }
          return out || '<p class="pf-empty">Add files, a link, certifications or work experience to stand out.</p>';
        })()}
      </div>
      <div class="pf-block">
        <h3>Focus area</h3>
        <div class="pf-meta-row"><span class="pf-meta-label">Field</span><span>${_esc(fieldName)}</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Status</span><span>${_esc(PROFILE_LABELS.status[p.status]||'-')}</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Experience</span><span>${_esc(PROFILE_LABELS.experience[p.experience]||'-')}</span></div>
      </div>
      <div class="pf-block">
        <h3>Account</h3>
        <div class="pf-meta-row"><span class="pf-meta-label">Email</span><span>${_esc(u.email)}</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Account type</span><span>ICT talent</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Joined</span><span>${p.completedAt?new Date(p.completedAt).toLocaleDateString():'-'}</span></div>
      </div>
    </div>`;
}

function renderClientProfile(u,p){
  const typeLabel = PROFILE_LABELS.clientType[p.clientType] || '-';
  const timingLabel = PROFILE_LABELS.timing[p.timing] || '-';
  const needs = p.needs || [];
  const needsHtml = needs.length
    ? needs.map(id=>`<span class="chip">${_esc(PROFILE_CATEGORIES[id]||id)}</span>`).join('')
    : '<span class="pf-empty">No hiring interests selected.</span>';
  const displayName = p.orgName || u.name;
  const photo = p.avatar || u.avatar;
  return `
    <div class="pf-card">
      <div class="pf-id">
        <div class="pf-av-wrap">
          <button class="pf-av pf-av-btn" onclick="openAvatarUpload()" aria-label="Change profile picture" title="Change profile picture">
            ${photo ? `<img src="${_esc(photo)}" alt="${_esc(displayName)}">` : u.initials}
          </button>
          <button class="pf-av-edit" onclick="openAvatarUpload()" aria-label="Change profile picture">${PEN_ICON}</button>
        </div>
        <div class="pf-id-main">
          <h1>${_esc(displayName)}</h1>
          <div class="pf-username">${p.username?'@'+_esc(p.username):'<span style="color:var(--muted)">No username yet</span>'}<button class="pf-uname-edit" onclick="editUsername()" aria-label="Edit username" title="Edit username">${PEN_ICON}</button></div>
          <div class="pf-title">${_esc(typeLabel)}${p.industry?' · '+_esc(p.industry):''}</div>
          <div class="pf-loc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>${_esc(p.location||u.location||'South Africa')}</div>
          <span class="pf-verified">${IC.check} Verified email</span>
        </div>
      </div>
      <div class="pf-actions">
        <div class="pf-actions-main">
          <button class="btn btn-primary btn-edit-profile" onclick="location.href='dashboard.html'">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
            Go to dashboard
          </button>
          <button class="btn btn-outline btn-edit-profile" onclick="sessionStorage.setItem('workley_force_onboarding','1');location.href='onboarding.html?role=client'">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Edit profile fully
          </button>
        </div>
        <button class="btn btn-signout" onclick="signOut()">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </div>
    </div>

    <div class="pf-grid">
      <div class="pf-block">
        <div class="pf-block-head"><h3>About</h3><button class="pf-edit" onclick="editProfileSection('clientAbout')">${PEN_ICON} Edit</button></div>
        ${p.description?`<p>${_esc(p.description).replace(/\n/g,'<br>')}</p>`:'<p class="pf-empty">Describe what you do and what you\'re hiring for.</p>'}
      </div>
      <div class="pf-block">
        <div class="pf-block-head"><h3>Looking to hire for</h3><button class="pf-edit" onclick="editProfileSection('clientNeeds')">${PEN_ICON} Edit</button></div>
        <div class="chips">${needsHtml}</div>
      </div>
      <div class="pf-block">
        <div class="pf-block-head"><h3>Organization</h3><button class="pf-edit" onclick="editProfileSection('clientOrg')">${PEN_ICON} Edit</button></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Name</span><span>${_esc(p.orgName||'-')}</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Industry</span><span>${_esc(p.industry||'-')}</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Location</span><span>${_esc(p.location||'-')}</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Type</span><span>${_esc(typeLabel)}</span></div>
      </div>
      <div class="pf-block">
        <div class="pf-block-head"><h3>Hiring timeline</h3><button class="pf-edit" onclick="editProfileSection('clientTiming')">${PEN_ICON} Edit</button></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Timing</span><span>${_esc(timingLabel)}</span></div>
      </div>
      <div class="pf-block">
        <h3>Account</h3>
        <div class="pf-meta-row"><span class="pf-meta-label">Email</span><span>${_esc(u.email)}</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Account type</span><span>Client</span></div>
        <div class="pf-meta-row"><span class="pf-meta-label">Joined</span><span>${p.completedAt?new Date(p.completedAt).toLocaleDateString():'-'}</span></div>
      </div>
    </div>`;
}

// ─── Profile picture upload ──────────────────────────────────────────
// Client-side resize keeps uploads cheap (cap at 512px, JPEG q=.9).
function _resizeImageToBlob(fileOrBlob, maxDim){
  maxDim = maxDim || 512;
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width  * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h); // flatten any transparency to white
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/jpeg', 0.9);
      };
      img.onerror = () => reject(new Error('Could not read this image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read this file'));
    reader.readAsDataURL(fileOrBlob);
  });
}

// All upload sources (file/paste/URL) flow through the crop UI first.
// On Apply, the cropped 512×512 JPEG is uploaded to Storage.
async function _uploadAvatarBlob(blob){
  if(!window.firebaseUser){ toast('Sign in first','Log in to upload a profile picture.'); return; }
  if(!window.firebaseStorage){ toast('Storage not ready','Refresh the page and try again.'); return; }
  const btn = document.getElementById('cropApplyBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Uploading…'; }
  try {
    const url = await window.firebaseStorage.uploadAvatar(window.firebaseUser.uid, blob);
    try { await window.firebaseAuth.updateProfile(window.firebaseUser, { photoURL: url }); } catch(e){}
    const p = _getProfileData() || {};
    p.avatar = url;
    _saveProfileData(p);
    if(USER){ USER.avatar = url; }
    closeModal();
    if(document.getElementById('profileMount')) renderProfileInto('profileMount');
    renderProfileBtn();
    toast('Photo updated','Your profile picture looks great.');
  } catch(err){
    console.error('[Workley] avatar upload failed:', err);
    if(btn){ btn.disabled = false; btn.textContent = 'Apply'; }
    toast('Upload failed', err && err.message || 'Please try a different image.');
  }
}

// Validate source, load it as an HTMLImageElement, then open the crop modal.
function _startCrop(fileOrBlob){
  if(!fileOrBlob || (fileOrBlob.type && !fileOrBlob.type.startsWith('image/'))){
    toast('Invalid file','Please choose an image (JPG, PNG, WebP).'); return;
  }
  if(fileOrBlob.size && fileOrBlob.size > 10 * 1024 * 1024){
    toast('Image too large','Pick something under 10MB.'); return;
  }
  const url = URL.createObjectURL(fileOrBlob);
  const img = new Image();
  img.onload = () => { openCropStage(img); /* keep the blob URL alive while cropping */ };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Couldn\'t read image','Please try a different file.'); };
  img.src = url;
}

// ─── Crop stage (WhatsApp-style 1:1 cropper) ─────────────────────────
const _crop = {
  img:null, natW:0, natH:0,
  stageSize:0, baseScale:1, zoom:1,
  tx:0, ty:0,
  dragging:false, startX:0, startY:0, startTx:0, startTy:0
};
function _applyCropTransform(){
  if(!_crop.img) return;
  const scale = _crop.baseScale * _crop.zoom;
  _crop.img.style.transform = `translate(${_crop.tx}px,${_crop.ty}px) scale(${scale})`;
}
function _clampCrop(){
  const scale = _crop.baseScale * _crop.zoom;
  const w = _crop.natW * scale;
  const h = _crop.natH * scale;
  _crop.tx = Math.min(0, Math.max(_crop.stageSize - w, _crop.tx));
  _crop.ty = Math.min(0, Math.max(_crop.stageSize - h, _crop.ty));
}
function openCropStage(srcImg){
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div id="cropWrap">
      <div class="modal-head"><div><h3 style="font-size:1.18rem">Position &amp; crop</h3><div style="font-size:.82rem;color:var(--muted);margin-top:3px">Drag to reposition · scroll or slide to zoom</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="auth-body" style="padding-top:6px">
        <div class="crop-stage" id="cropStage">
          <img id="cropImg" alt="" draggable="false">
          <div class="crop-overlay"></div>
        </div>
        <div class="crop-controls">
          <span class="crop-zoom-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </span>
          <input type="range" id="cropZoom" min="1" max="3" step="0.01" value="1" aria-label="Zoom">
          <span class="crop-zoom-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>
          </span>
        </div>
        <div class="crop-actions">
          <button class="btn btn-outline" onclick="openAvatarUpload()">← Change image</button>
          <button class="btn btn-primary" id="cropApplyBtn" onclick="applyCrop()">Apply</button>
        </div>
      </div>
    </div>`;
  showOverlay();

  const stage = document.getElementById('cropStage');
  const imgEl = document.getElementById('cropImg');
  const zoomEl = document.getElementById('cropZoom');
  imgEl.src = srcImg.src;

  _crop.img = imgEl;
  _crop.natW = srcImg.naturalWidth;
  _crop.natH = srcImg.naturalHeight;
  _crop.zoom = 1;
  // Wait one frame for the stage to lay out before measuring.
  requestAnimationFrame(()=>{
    _crop.stageSize = stage.clientWidth;
    _crop.baseScale = Math.max(_crop.stageSize / _crop.natW, _crop.stageSize / _crop.natH);
    const scaledW = _crop.natW * _crop.baseScale;
    const scaledH = _crop.natH * _crop.baseScale;
    _crop.tx = (_crop.stageSize - scaledW) / 2;
    _crop.ty = (_crop.stageSize - scaledH) / 2;
    _applyCropTransform();
  });

  // Drag
  stage.addEventListener('pointerdown', e => {
    _crop.dragging = true;
    try { stage.setPointerCapture(e.pointerId); } catch(_) {}
    _crop.startX = e.clientX; _crop.startY = e.clientY;
    _crop.startTx = _crop.tx; _crop.startTy = _crop.ty;
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', e => {
    if(!_crop.dragging) return;
    _crop.tx = _crop.startTx + (e.clientX - _crop.startX);
    _crop.ty = _crop.startTy + (e.clientY - _crop.startY);
    _clampCrop();
    _applyCropTransform();
  });
  const _endDrag = () => { _crop.dragging = false; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', _endDrag);
  stage.addEventListener('pointercancel', _endDrag);
  stage.addEventListener('pointerleave', _endDrag);

  // Slider zoom (keeps the stage center fixed)
  zoomEl.addEventListener('input', () => {
    const prev = _crop.zoom;
    const next = parseFloat(zoomEl.value);
    const cx = _crop.stageSize / 2;
    const cy = _crop.stageSize / 2;
    const ratio = next / prev;
    _crop.tx = cx - (cx - _crop.tx) * ratio;
    _crop.ty = cy - (cy - _crop.ty) * ratio;
    _crop.zoom = next;
    _clampCrop();
    _applyCropTransform();
  });

  // Wheel zoom (desktop)
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const next = Math.max(1, Math.min(3, _crop.zoom + delta));
    zoomEl.value = next;
    zoomEl.dispatchEvent(new Event('input'));
  }, { passive:false });
}

window.applyCrop = function(){
  if(!_crop.img){ return; }
  const scale = _crop.baseScale * _crop.zoom;
  const sx = -_crop.tx / scale;
  const sy = -_crop.ty / scale;
  const sw = _crop.stageSize / scale;
  const sh = _crop.stageSize / scale;
  const OUT = 512;
  const canvas = document.createElement('canvas');
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,OUT,OUT);
  // Use a fresh Image to avoid the in-DOM element's CSS transform.
  const cleanImg = new Image();
  cleanImg.crossOrigin = 'anonymous';
  cleanImg.onload = () => {
    try {
      ctx.drawImage(cleanImg, sx, sy, sw, sh, 0, 0, OUT, OUT);
      canvas.toBlob(b => {
        if(!b){ toast('Couldn\'t process image','Please try a different one.'); return; }
        _uploadAvatarBlob(b);
      }, 'image/jpeg', 0.9);
    } catch(err){
      // Tainted canvas (CORS) - fall back to drawing the in-DOM image which
      // shares the same blob: URL.
      try {
        ctx.drawImage(_crop.img, sx, sy, sw, sh, 0, 0, OUT, OUT);
        canvas.toBlob(b => b ? _uploadAvatarBlob(b) : toast('Couldn\'t process image','Try a different image.'), 'image/jpeg', 0.9);
      } catch(err2){
        toast('Couldn\'t crop','That image host blocks cross-origin access. Try downloading then uploading.');
      }
    }
  };
  cleanImg.onerror = () => {
    // Use the live DOM image as the canvas source
    try {
      ctx.drawImage(_crop.img, sx, sy, sw, sh, 0, 0, OUT, OUT);
      canvas.toBlob(b => b ? _uploadAvatarBlob(b) : toast('Couldn\'t process image','Try a different image.'), 'image/jpeg', 0.9);
    } catch(err){
      toast('Couldn\'t crop','Please try a different image.');
    }
  };
  cleanImg.src = _crop.img.src;
};

// Public alias kept for any external callers
function uploadAvatarFlow(file){ _startCrop(file); }

let _pasteAvatarBound = false;
function _avatarPasteHandler(e){
  // Only watch for paste while either the picker modal or the crop modal is open.
  if(!document.getElementById('avatarUploadModal') && !document.getElementById('cropWrap')){
    document.removeEventListener('paste', _avatarPasteHandler);
    _pasteAvatarBound = false;
    return;
  }
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for(const it of items){
    if(it.type && it.type.startsWith('image/')){
      const blob = it.getAsFile();
      if(blob){ e.preventDefault(); _startCrop(blob); }
      return;
    }
  }
}

function openAvatarUpload(){
  if(!USER){ openLogin(); return; }
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML = `
    <div id="avatarUploadModal">
    <div class="modal-head"><div><h3 style="font-size:1.18rem">Update profile picture</h3><div style="font-size:.82rem;color:var(--muted);margin-top:3px">JPG, PNG or WebP · we'll resize for you.</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:6px">
      <div class="av-drop" id="avDrop" tabindex="0">
        <div class="av-drop-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
        <div class="av-drop-title">Drop an image here</div>
        <div class="av-drop-sub">or pick one of the options below</div>
        <div id="avUploadStatus" class="av-drop-status"></div>
      </div>

      <div class="av-source-grid">
        <label class="av-source">
          <input type="file" accept="image/*" hidden onchange="handleAvatarFiles(event.target.files)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span>Choose from device</span>
        </label>
        <label class="av-source">
          <input type="file" accept="image/*" capture="user" hidden onchange="handleAvatarFiles(event.target.files)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Take a photo</span>
        </label>
      </div>

      <div class="av-url-row">
        <label for="avUrl">Or paste an image URL</label>
        <div style="display:flex;gap:8px">
          <input id="avUrl" type="url" placeholder="https://…" style="flex:1;border:1.5px solid var(--border);border-radius:10px;padding:.55rem .8rem;font-family:'Inter',sans-serif">
          <button class="btn btn-outline btn-sm" onclick="loadAvatarFromUrl()">Load</button>
        </div>
        <div class="av-help">Tip: you can also paste from clipboard with <kbd>Ctrl/⌘+V</kbd>. Some hosts block cross-origin loading - if a URL won't load, download then upload.</div>
      </div>

      ${ (USER.avatar || (USER.profileData && USER.profileData.avatar))
         ? `<div style="display:flex;gap:10px;margin-top:16px;">
              <button class="btn btn-outline" style="flex:1;border-radius:99px;" onclick="viewCurrentAvatar()">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px"><path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>View photo
              </button>
              <button class="btn av-remove-btn" style="flex:1;" onclick="removeAvatar()">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>Remove
              </button>
            </div>`
         : '' }
    </div></div>`;
  showOverlay();

  // Drag & drop
  const drop = document.getElementById('avDrop');
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if(files && files.length) uploadAvatarFlow(files[0]);
  });

  // Clipboard paste
  if(!_pasteAvatarBound){
    document.addEventListener('paste', _avatarPasteHandler);
    _pasteAvatarBound = true;
  }
}
window.handleAvatarFiles = function(files){
  if(files && files.length) _startCrop(files[0]);
};
window.loadAvatarFromUrl = function(){
  const url = (document.getElementById('avUrl') || {}).value;
  if(!url) return;
  const status = document.getElementById('avUploadStatus');
  if(status) status.textContent = 'Loading URL…';
  // Try CORS-permitting load → pipe straight into the crop UI.
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { if(status) status.textContent = ''; openCropStage(img); };
  img.onerror = () => {
    if(status) status.textContent = '';
    toast('Couldn\'t load URL','That image host likely blocks cross-origin downloads. Save the file and upload it instead.');
  };
  img.src = url;
};
window.viewCurrentAvatar = function(){
  const url = USER && (USER.avatar || (USER.profileData && USER.profileData.avatar));
  if(!url) return;
  const lb = document.createElement('div');
  lb.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  lb.innerHTML=`<img src="${_esc(url)}" style="max-width:min(88vw,520px);max-height:88vh;border-radius:14px;object-fit:contain;box-shadow:0 24px 64px rgba(0,0,0,.5);" alt="Profile photo">
    <button onclick="this.parentElement.remove()" aria-label="Close" style="position:absolute;top:18px;right:22px;background:rgba(255,255,255,.15);border:0;color:#fff;font-size:1.6rem;width:40px;height:40px;border-radius:50%;cursor:pointer;line-height:1;">×</button>`;
  lb.addEventListener('click', e=>{ if(e.target===lb) lb.remove(); });
  document.body.appendChild(lb);
};
window.removeAvatar = async function(){
  if(!window.firebaseUser) return;
  if(!confirm('Remove your current profile picture?')) return;
  try {
    if(window.firebaseStorage) await window.firebaseStorage.removeAvatar(window.firebaseUser.uid);
    try { await window.firebaseAuth.updateProfile(window.firebaseUser, { photoURL: '' }); } catch(e){}
    const p = _getProfileData() || {};
    delete p.avatar;
    _saveProfileData(p);
    if(USER) USER.avatar = null;
    closeModal();
    if(document.getElementById('profileMount')) renderProfileInto('profileMount');
    renderProfileBtn();
    toast('Removed','Profile picture cleared.');
  } catch(err){
    toast('Could not remove', err.message || 'Please try again.');
  }
};

// ─── Per-section profile edit modals ─────────────────────────────────
function _getProfileData(){
  const uid = (window.firebaseUser && window.firebaseUser.uid) || null;
  if(!uid) return null;
  try { return JSON.parse(localStorage.getItem('workley_profile_'+uid) || '{}'); }
  catch(e){ return {}; }
}
function _saveProfileData(p){
  const uid = (window.firebaseUser && window.firebaseUser.uid) || null;
  if(!uid) return;
  try { localStorage.setItem('workley_profile_'+uid, JSON.stringify(p)); } catch(e){}
  _pushProfileToCloud(p);
}
// One-time-per-session backfill: push the signed-in user's saved profile to
// Firestore if they have one. Makes pre-Firestore talent discoverable again.
let _profileBackfilled = false;
function _backfillProfileToCloud(){
  if(_profileBackfilled) return;
  if(!window.firebaseDB || !window.firebaseUser) return;
  const uid = window.firebaseUser.uid;
  let p = null;
  try { p = JSON.parse(localStorage.getItem('workley_profile_'+uid) || 'null'); } catch(e){}
  if(!p || !p.role) return;                 // nothing meaningful to publish yet
  _profileBackfilled = true;
  _pushProfileToCloud(p);
}
// Mirror a profile edit (incl. avatar) to Firestore so the catalog/discovery
// stays in sync. Fire-and-forget; localStorage remains the instant cache.
function _pushProfileToCloud(p){
  try {
    if(window.firebaseDB && window.firebaseUser && p){
      const data = Object.assign({}, p);
      if(!data.displayName){
        data.displayName = (USER && USER.name) || window.firebaseUser.displayName ||
          ((window.firebaseUser.email||'').split('@')[0]) || 'Workley member';
      }
      window.firebaseDB.saveProfile(window.firebaseUser.uid, data);
      if(window.firebaseUser.email) window.firebaseDB.savePrivateContact(window.firebaseUser.uid, window.firebaseUser.email);
    }
  } catch(e){ /* non-fatal */ }
  // Reflect the edit immediately wherever the talent appears in this session.
  _reflectProfileEverywhere();
}
// Refresh the signed-in talent's own catalog card + re-render any talent grids
// on the current page, and notify the dashboard, so profile edits show right away.
function _reflectProfileEverywhere(){
  try { if(typeof _mergeSelfIntoTalent==='function') _mergeSelfIntoTalent(); } catch(e){}
  try { if(document.getElementById('talentGrid') && typeof renderTalent==='function') renderTalent(); } catch(e){}
  try { if(document.getElementById('featGrid')   && typeof renderFeatured==='function') renderFeatured(); } catch(e){}
  try { document.dispatchEvent(new CustomEvent('workley:profileChanged')); } catch(e){}
}
function _afterSave(){
  loadSavedProfileIntoUser();
  closeModal();
  if(document.getElementById('profileMount')) renderProfileInto('profileMount');
  toast('Profile updated','Your changes are saved.');
}

// ── Username edit (unique, Instagram-style, once per month) ──
let _editUserOk=null, _editUserTimer=null, _editUserVal='';
function _validUname(u){ return /^[a-z0-9._]{3,30}$/.test(u) && u[0]!=='.' && u[u.length-1]!=='.' && u.indexOf('..')<0; }
function editUsername(){
  if(!USER || !window.firebaseUser){ openLogin(); return; }
  const p=_getProfileData()||{};
  const cur=(p.username||'').toLowerCase();
  let lastChanged=0; try{ lastChanged=parseInt(localStorage.getItem('workley_username_changed_'+window.firebaseUser.uid)||'0',10)||0; }catch(e){}
  const daysLeft = lastChanged ? Math.ceil((lastChanged + 30*864e5 - Date.now())/864e5) : 0;
  const locked = daysLeft>0;
  _editUserOk=null; _editUserVal=cur;
  document.getElementById('modal').classList.add('auth-modal');
  document.getElementById('modal').innerHTML=`
    <div class="modal-head"><div><h3 style="font-size:1.2rem">Your username</h3><div style="font-size:.85rem;color:var(--muted);margin-top:3px">${locked?('You can change it again in '+daysLeft+' day'+(daysLeft===1?'':'s')+'.'):'Letters, numbers, . and _ . You can change this once a month.'}</div></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:8px">
      <div class="form-field">
        <label for="unEdit">Username</label>
        <div class="un-input2"><span>@</span><input id="unEdit" type="text" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" value="${_esc(cur)}" ${locked?'disabled':''} oninput="onEditUsernameInput(this.value)"></div>
        <div class="un-status2" id="unEditStatus"></div>
      </div>
      ${locked?'':'<button class="btn btn-primary btn-block" id="unSaveBtn" disabled onclick="saveUsername()">Save username</button>'}
    </div>`;
  showOverlay();
}
function onEditUsernameInput(raw){
  const u=String(raw||'').trim().toLowerCase(); _editUserVal=u;
  const st=document.getElementById('unEditStatus'); const btn=document.getElementById('unSaveBtn');
  _editUserOk=null; if(btn) btn.disabled=true; clearTimeout(_editUserTimer);
  const cur=((_getProfileData()||{}).username||'').toLowerCase();
  if(!st) return;
  if(u===cur){ st.textContent='This is your current username.'; st.className='un-status2'; return; }
  if(!_validUname(u)){ st.textContent='3-30 chars: letters, numbers, . or _ (no leading/trailing or double dots).'; st.className='un-status2 bad'; _editUserOk=false; return; }
  st.textContent='Checking…'; st.className='un-status2';
  _editUserTimer=setTimeout(async ()=>{
    let owner=null; try{ owner=await window.firebaseDB.usernameOwner(u); }catch(e){}
    if(_editUserVal!==u) return;
    const el=document.getElementById('unEditStatus'); if(!el) return;
    if(owner && owner!==window.firebaseUser.uid){ el.textContent='@'+u+' is taken.'; el.className='un-status2 bad'; _editUserOk=false; }
    else { el.textContent='@'+u+' is available'; el.className='un-status2 good'; _editUserOk=true; }
    const b=document.getElementById('unSaveBtn'); if(b) b.disabled=!_editUserOk;
  },450);
}
function saveUsername(){
  if(!_editUserOk || !window.firebaseUser || !window.firebaseDB) return;
  const u=_editUserVal; const p=_getProfileData()||{}; const old=(p.username||'').toLowerCase();
  const btn=document.getElementById('unSaveBtn'); if(btn){ btn.disabled=true; btn.textContent='Saving…'; }
  window.firebaseDB.claimUsername(u, window.firebaseUser.uid).then(claimed=>{
    if(!claimed){ const st=document.getElementById('unEditStatus'); if(st){ st.textContent='@'+u+' is no longer available.'; st.className='un-status2 bad'; } if(btn){ btn.disabled=false; btn.textContent='Save username'; } return; }
    p.username=u;
    try{ localStorage.setItem('workley_profile_'+window.firebaseUser.uid, JSON.stringify(p)); }catch(e){}
    if(USER) USER.profileData=p;
    _pushProfileToCloud(p);
    if(old && old!==u){ try{ window.firebaseDB.releaseUsername(old); }catch(e){} }
    try{ localStorage.setItem('workley_username_changed_'+window.firebaseUser.uid, String(Date.now())); }catch(e){}
    closeModal();
    toast('Username updated','You\'re now @'+u+'.');
    if(document.getElementById('profileMount')) renderProfileInto('profileMount');
  });
}

function editProfileSection(section){
  const p = _getProfileData();
  if(!p) return;
  document.getElementById('modal').classList.add('auth-modal');
  let body = '';
  let onSave = ()=>{};

  if(section==='about'){
    body = `
      <h3>Edit about</h3>
      <div class="auth-sub">A short, honest bio earns trust fast.</div>
      <div class="form-field"><label for="eBio">About you</label>
        <textarea id="eBio" style="width:100%;min-height:140px;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif;resize:vertical;line-height:1.55">${_esc(p.bio||'')}</textarea>
      </div>`;
    onSave = ()=>{ p.bio = document.getElementById('eBio').value; _saveProfileData(p); _afterSave(); };
  }

  else if(section==='skills'){
    const cat = p.field;
    const skillsPool = (SKILL_POOL[cat] || []);
    const sel = new Set(p.skills||[]);
    body = `
      <h3>Edit skills</h3>
      <div class="auth-sub">Pick the skills you're strongest in (at least 3).</div>
      <div class="skill-pick" id="eSkills">
        ${skillsPool.map(s=>`<button type="button" class="spill ${sel.has(s)?'sel':''}" data-s="${_esc(s)}" onclick="this.classList.toggle('sel')">${_esc(s)}</button>`).join('')}
      </div>`;
    onSave = ()=>{
      p.skills = [...document.querySelectorAll('#eSkills .spill.sel')].map(b=>b.dataset.s);
      if(p.skills.length < 3){ toast('Pick more skills','Please select at least 3 skills.'); return; }
      _saveProfileData(p); _afterSave();
    };
  }

  else if(section==='education'){
    body = `
      <h3>Edit education</h3>
      <div class="auth-sub">Where you studied or are studying.</div>
      <div class="form-field"><label for="eUni">University / College</label>
        <input id="eUni" type="text" value="${_esc(p.university||'')}" style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif"></div>
      <div class="form-field"><label for="eCourse">Course / Qualification</label>
        <input id="eCourse" type="text" value="${_esc(p.course||'')}" style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif"></div>
      <div class="form-field"><label for="eYear">Year</label>
        <input id="eYear" type="number" min="1990" max="2035" value="${_esc(p.gradYear||'')}" style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif"></div>`;
    onSave = ()=>{
      p.university = document.getElementById('eUni').value.trim();
      p.course = document.getElementById('eCourse').value.trim();
      p.gradYear = document.getElementById('eYear').value.trim();
      _saveProfileData(p); _afterSave();
    };
  }

  else if(section==='titleRate'){
    body = `
      <h3>Edit title &amp; rate</h3>
      <div class="auth-sub">What clients see first.</div>
      <div class="form-field"><label for="eTitle">Professional title</label>
        <input id="eTitle" type="text" value="${_esc(p.title||'')}" style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif"></div>
      <div class="form-field"><label for="eRate">Hourly rate (ZAR)</label>
        <input id="eRate" type="number" min="50" max="2000" step="10" value="${_esc(p.rate||'')}" style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif"></div>`;
    onSave = ()=>{
      p.title = document.getElementById('eTitle').value.trim();
      p.rate = document.getElementById('eRate').value.trim();
      _saveProfileData(p); _afterSave();
    };
  }

  else if(section==='softSkills'){
    const sel = new Set(p.softSkills||[]);
    body = `
      <h3>Edit soft skills</h3>
      <div class="auth-sub">Pick at least 3 that describe how you work.</div>
      <div class="skill-pick" id="eSoft">
        ${SOFT_SKILLS.map(s=>`<button type="button" class="spill ${sel.has(s)?'sel':''}" data-s="${_esc(s)}" onclick="this.classList.toggle('sel')">${_esc(s)}</button>`).join('')}
      </div>`;
    onSave = ()=>{
      p.softSkills = [...document.querySelectorAll('#eSoft .spill.sel')].map(b=>b.dataset.s);
      if(p.softSkills.length < 3){ toast('Pick more','Please select at least 3 soft skills.'); return; }
      _saveProfileData(p); _afterSave();
    };
  }

  else if(section==='hobbies'){
    body = `
      <h3>Edit hobbies &amp; interests</h3>
      <div class="auth-sub">Share what you enjoy outside of work.</div>
      <div class="form-field"><label for="eHob">Hobbies &amp; interests</label>
        <textarea id="eHob" style="width:100%;min-height:130px;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif;resize:vertical;line-height:1.55" placeholder="e.g. Pickup soccer, hiking, mentoring younger students…">${_esc(p.hobbies||'')}</textarea>
      </div>`;
    onSave = ()=>{ p.hobbies = document.getElementById('eHob').value; _saveProfileData(p); _afterSave(); };
  }

  else if(section==='clientAbout'){
    body = `
      <h3>Edit description</h3>
      <div class="auth-sub">Help talent self-select for your projects.</div>
      <div class="form-field"><label for="eDesc">About your work and what you need</label>
        <textarea id="eDesc" style="width:100%;min-height:140px;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif;resize:vertical;line-height:1.55">${_esc(p.description||'')}</textarea>
      </div>`;
    onSave = ()=>{ p.description = document.getElementById('eDesc').value; _saveProfileData(p); _afterSave(); };
  }

  else if(section==='clientNeeds'){
    const sel = new Set(p.needs||[]);
    const items = Object.entries(PROFILE_CATEGORIES);
    body = `
      <h3>Edit hiring focus</h3>
      <div class="auth-sub">Areas you might hire for.</div>
      <div class="skill-pick" id="eNeeds">
        ${items.map(([id,name])=>`<button type="button" class="spill ${sel.has(id)?'sel':''}" data-i="${id}" onclick="this.classList.toggle('sel')">${_esc(name)}</button>`).join('')}
      </div>`;
    onSave = ()=>{
      p.needs = [...document.querySelectorAll('#eNeeds .spill.sel')].map(b=>b.dataset.i);
      _saveProfileData(p); _afterSave();
    };
  }

  else if(section==='clientOrg'){
    body = `
      <h3>Edit organization</h3>
      <div class="auth-sub">How talent sees you.</div>
      <div class="form-field"><label for="eOrg">Name</label>
        <input id="eOrg" type="text" value="${_esc(p.orgName||'')}" style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif"></div>
      <div class="form-field"><label for="eInd">Industry</label>
        <input id="eInd" type="text" value="${_esc(p.industry||'')}" style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif"></div>
      <div class="form-field"><label for="eLoc">Location</label>
        <select id="eLoc" style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:.6rem .85rem;font-family:'Inter',sans-serif">
          <option value="">Select your city…</option>
          ${['Cape Town','Johannesburg','Durban','Pretoria','Gqeberha','Bloemfontein','Other (South Africa)','Outside South Africa'].map(c=>`<option ${p.location===c?'selected':''}>${c}</option>`).join('')}
        </select></div>`;
    onSave = ()=>{
      p.orgName = document.getElementById('eOrg').value.trim();
      p.industry = document.getElementById('eInd').value.trim();
      p.location = document.getElementById('eLoc').value;
      _saveProfileData(p); _afterSave();
    };
  }

  else if(section==='clientTiming'){
    const opts = [['now','Ready to hire now'],['month','Within the next month'],['exploring','Just exploring']];
    body = `
      <h3>Edit hiring timeline</h3>
      <div class="auth-sub">No pressure - change this any time.</div>
      <div class="skill-pick" id="eTiming">
        ${opts.map(([v,l])=>`<button type="button" class="spill ${p.timing===v?'sel':''}" data-v="${v}" onclick="document.querySelectorAll('#eTiming .spill').forEach(b=>b.classList.remove('sel'));this.classList.add('sel')">${l}</button>`).join('')}
      </div>`;
    onSave = ()=>{
      const cur = document.querySelector('#eTiming .spill.sel');
      p.timing = cur ? cur.dataset.v : p.timing;
      _saveProfileData(p); _afterSave();
    };
  }

  window._editSave = onSave;
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><div style="flex:1"></div><button class="modal-x" onclick="closeModal()" aria-label="Close">×</button></div>
    <div class="auth-body" style="padding-top:0">
      ${body}
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" onclick="closeModal()" style="flex:1">Cancel</button>
        <button class="btn btn-primary" onclick="window._editSave()" style="flex:1">Save changes</button>
      </div>
    </div>`;
  showOverlay();
}
// Overlay version (used on landing/other pages where profile is a modal-style overlay)
function openProfilePage(){
  if(!USER){openLogin();return;}
  const ov=document.getElementById('profileOverlay');
  // If a standalone profile page exists in this document, just go there
  if(!ov){ location.href='profile.html'; return; }
  renderProfileInto('profileMount');
  ov.classList.add('open');
  document.body.style.overflow='hidden';
  ov.scrollTop=0;
}
function closeProfilePage(){
  const ov=document.getElementById('profileOverlay');
  if(ov)ov.classList.remove('open');
  document.body.style.overflow='';
}

// Wire profile/auth into existing modal cleanup (remove auth-modal class on close)
const _origCloseModal = closeModal;
closeModal = function(){document.getElementById('modal').classList.remove('auth-modal');_origCloseModal();};

// Escape also closes profile
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeProfilePage();toggleAuthSlider(false);}});

// ─────────────────────── PER-PAGE BOOTSTRAP ───────────────────────
// Each render fn is null-guarded, so calling them on any page is safe.
renderNavAuth();
renderCats();
renderWizCats();
renderFeatured();
renderFilterCats();
setWizStep(1);
setBudget(300);

// After email verification, verify-email.html sets this flag so we open login immediately
if(sessionStorage.getItem('workley_auto_login')){
  sessionStorage.removeItem('workley_auto_login');
  setTimeout(openLogin, 350);
}

// Deep-link: "Get started" CTAs on other pages link to index.html#signup.
// Open the signup modal on arrival, then clear the hash so refresh/back stays clean.
if(location.hash === '#signup'){
  history.replaceState(null, '', location.pathname + location.search);
  if(!USER || !window.firebaseUser){ setTimeout(openSignup, 300); }
}

// Catalog page: populate the talent grid on load (real page, not overlay)
if(document.getElementById('catalogPage')){ renderTalent(); }

// Profile page: render once we have a user. Firebase reports the session
// asynchronously, so we paint a quiet loader and let onFirebaseAuthChanged
// finalize the view when auth state lands.
if(document.getElementById('profilePage')){
  if(USER){
    renderProfileInto('profileMount');
  } else {
    const mount=document.getElementById('profileMount');
    if(mount){
      mount.innerHTML = '<div class="pf-card" style="text-align:center;padding:40px"><div class="pf-loading-spinner" style="width:36px;height:36px;border:3px solid var(--blue-50);border-top-color:var(--blue);border-radius:50%;margin:0 auto 14px;animation:spin .8s linear infinite"></div><p style="color:var(--muted);font-size:.9rem">Loading your profile…</p></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
    }
  }
}

// ── Flow section sequential animation (landing only) ──
(function(){
  var fl=document.querySelector('.flow');
  if(!fl)return;
  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  fl.classList.add('will-animate');
  var io=new IntersectionObserver(function(entries,obs){
    entries.forEach(function(e){
      if(e.isIntersecting){
        fl.classList.remove('will-animate');
        void fl.offsetWidth;
        fl.classList.add('animated');
        obs.disconnect();
      }
    });
  },{threshold:0.35});
  io.observe(fl);
})();
