// ═══════════════════════════════════════════════════════════════════════
// Firebase - Authentication, Storage & Firestore.
// Auth keeps the session; Storage holds avatars; Firestore is the real data
// backend for profiles, the talent catalog and profile-view analytics.
// (No Analytics SDK.)
// ═══════════════════════════════════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  linkWithPhoneNumber,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  getMultiFactorResolver,
  GoogleAuthProvider,
  signInWithPopup,
  deleteUser,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-storage.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  collectionGroup,
  addDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
  onSnapshot,
  increment,
  serverTimestamp,
  deleteField,
  arrayUnion,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCJLwKUwKjre9exI6ON3iVgsNakofYE2EY",
  authDomain: "ispani-site.firebaseapp.com",
  projectId: "ispani-site",
  storageBucket: "ispani-site.firebasestorage.app",
  messagingSenderId: "699948368481",
  appId: "1:699948368481:web:26933afe641e09fc3e6020"
  // measurementId/Analytics intentionally omitted.
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

// Exposed for the rest of the (non-module) site to call.
window.firebaseAuth = {
  auth,
  signUp:  (email, password) => createUserWithEmailAndPassword(auth, email, password),
  signIn:  (email, password) => signInWithEmailAndPassword(auth, email, password),
  logout:  () => signOut(auth),
  sendVerificationEmail: (user, actionCodeSettings) => sendEmailVerification(user, actionCodeSettings || undefined),
  sendPasswordReset: (email, actionCodeSettings) => sendPasswordResetEmail(auth, email, actionCodeSettings || undefined),
  updateProfile: (user, data) => updateProfile(user, data),
  currentUser: () => auth.currentUser,

  // ─── Phone / SMS verification (Firebase Phone Auth) ─────────────────
  // Each verifier renders into a BRAND-NEW element. reCAPTCHA's clear() leaves
  // the old element marked "already rendered", so reusing a container throws
  // "reCAPTCHA has already been rendered in this element" - and recreating a
  // verifier without a fresh render triggers auth/invalid-app-credential.
  // Rendering once into a throwaway div, then removing it on reset, avoids both.
  _recaptcha: null,
  _recaptchaReady: null,
  _recaptchaElId: null,
  _makeRecaptchaEl: () => {
    let host = document.getElementById('recaptcha-host');
    if(!host){
      host = document.createElement('div');
      host.id = 'recaptcha-host';
      host.style.position='fixed'; host.style.bottom='0'; host.style.right='0'; host.style.zIndex='2147483647';
      document.body.appendChild(host);
    }
    const id = 'recaptcha-el-' + Date.now() + '-' + Math.floor(Math.random()*1e4);
    const el = document.createElement('div'); el.id = id;
    host.appendChild(el);
    return id;
  },
  _getRecaptcha: async () => {
    const fa = window.firebaseAuth;
    if (fa._recaptcha && fa._recaptchaReady) { await fa._recaptchaReady; return fa._recaptcha; }
    const elId = fa._makeRecaptchaEl();
    fa._recaptchaElId = elId;
    const v = new RecaptchaVerifier(auth, elId, { size: 'invisible' });
    fa._recaptcha = v;
    fa._recaptchaReady = v.render();   // render once so its token is valid before use
    await fa._recaptchaReady;
    return v;
  },
  // Tear down the verifier AND its element so the next request renders cleanly.
  // Call before a resend/retry (a consumed reCAPTCHA token can't be reused).
  resetRecaptcha: () => {
    const fa = window.firebaseAuth;
    try { if (fa._recaptcha) fa._recaptcha.clear(); } catch(e){}
    try { if (fa._recaptchaElId){ const el=document.getElementById(fa._recaptchaElId); if(el) el.remove(); } } catch(e){}
    fa._recaptcha = null; fa._recaptchaReady = null; fa._recaptchaElId = null;
  },
  // Send an OTP to a phone number for a standalone sign-in (used at login when
  // the user verifies by SMS instead of email). Returns a confirmationResult.
  sendPhoneOtp: async (phoneE164) => {
    const verifier = await window.firebaseAuth._getRecaptcha();
    return signInWithPhoneNumber(auth, phoneE164, verifier);
  },
  // Link a phone number to the currently signed-in account (used at signup so
  // the number is verified once and attached to the email/password account).
  linkPhoneOtp: async (phoneE164) => {
    if (!auth.currentUser) throw new Error('not-signed-in');
    const verifier = await window.firebaseAuth._getRecaptcha();
    return linkWithPhoneNumber(auth.currentUser, phoneE164, verifier);
  },

  // ─── SMS Multi-Factor Authentication (second factor) ────────────────
  // Requires the user to be signed in WITH A VERIFIED EMAIL (Firebase rejects
  // enrolment otherwise). Returns the enrolled phone factors (or []).
  getEnrolledFactors: () => {
    try { return auth.currentUser ? multiFactor(auth.currentUser).enrolledFactors : []; }
    catch(e){ return []; }
  },
  // Begin enrolling the current user's phone as a 2nd factor. Sends an SMS and
  // returns a verificationId to pair with the code the user types.
  startMfaEnrollment: async (phoneE164) => {
    const user = auth.currentUser;
    if (!user) throw new Error('not-signed-in');
    const session = await multiFactor(user).getSession();
    const verifier = await window.firebaseAuth._getRecaptcha();
    const provider = new PhoneAuthProvider(auth);
    return provider.verifyPhoneNumber({ phoneNumber: phoneE164, session }, verifier);
  },
  // Finish enrolment: turn the SMS code into a factor assertion and enroll it.
  confirmMfaEnrollment: async (verificationId, code, label) => {
    const cred = PhoneAuthProvider.credential(verificationId, code);
    const assertion = PhoneMultiFactorGenerator.assertion(cred);
    await multiFactor(auth.currentUser).enroll(assertion, label || 'My phone');
    return true;
  },
  // At sign-in, when signIn throws auth/multi-factor-auth-required, build the
  // resolver from the error so we can challenge the enrolled phone factor.
  getMfaResolver: (error) => getMultiFactorResolver(auth, error),
  // Send the SMS challenge for an enrolled phone factor. Returns a verificationId.
  startMfaSignIn: async (resolver, hintIndex) => {
    const hint = resolver.hints[hintIndex || 0];
    const verifier = await window.firebaseAuth._getRecaptcha();
    const provider = new PhoneAuthProvider(auth);
    return provider.verifyPhoneNumber({ multiFactorHint: hint, session: resolver.session }, verifier);
  },
  // Complete MFA sign-in with the typed code → resolves to a userCredential.
  confirmMfaSignIn: async (resolver, verificationId, code) => {
    const cred = PhoneAuthProvider.credential(verificationId, code);
    const assertion = PhoneMultiFactorGenerator.assertion(cred);
    return resolver.resolveSignIn(assertion);
  },

  // ─── Google sign-in (Firebase native popup) ────────────────────────
  // No OAuth client id / callback page / backend needed - Firebase handles
  // the token exchange. Google accounts come email-verified, so they skip
  // our email-verification gate. (Enable Google in Firebase Console →
  // Authentication → Sign-in method, and authorise the domain.)
  signInWithGoogle: () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return signInWithPopup(auth, provider);
  },
  // The current account's first sign-in provider ('google.com' | 'password' | …).
  providerId: () => {
    const u = auth.currentUser;
    return (u && u.providerData && u.providerData[0] && u.providerData[0].providerId) || '';
  },

  // ─── Account deletion ───────────────────────────────────────────────
  // Deletes the Auth user. A Cloud Function (onUserDeleted) then purges the
  // user's Firestore profile + storage so they leave the talent catalog -
  // the same path covers an admin deleting them from the Firebase console.
  // Firestore rules forbid a client from deleting its own profile doc, which
  // is why the Admin-SDK Function does the cleanup.
  deleteAccount: () => deleteUser(auth.currentUser),
  // Firebase requires a recent login before deletion; re-authenticate first
  // if it throws auth/requires-recent-login. Provider-aware.
  reauthGoogle: () => reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider()),
  reauthPassword: (password) => {
    const u = auth.currentUser;
    return reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
  }
};

// Build a Content-Disposition header so a downloaded file keeps its ORIGINAL
// name (its purpose) instead of the sanitised storage token (cf_…/pf_…). Images
// use `inline` so they still preview in the browser; everything else downloads.
// This is an HTTP-level field, not custom metadata, so the Storage rules allow it.
function _dispositionHeader(name, inline){
  const clean = String(name || 'file').replace(/[\r\n"\\]/g, '').slice(0, 180) || 'file';
  const ascii = clean.replace(/[^\x20-\x7E]/g, '_');           // safe fallback
  const utf8  = encodeURIComponent(clean);                      // RFC 5987 (unicode names)
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// Firebase Storage - profile picture uploads.
// Path convention: users/<uid>/avatar/profile.jpg (one current avatar per user,
// matching storage.rules).
window.firebaseStorage = {
  uploadAvatar: async (uid, blob) => {
    const r = storageRef(storage, `users/${uid}/avatar/profile.jpg`);
    await uploadBytes(r, blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=3600' });
    return await getDownloadURL(r);
  },
  removeAvatar: async (uid) => {
    try { await deleteObject(storageRef(storage, `users/${uid}/avatar/profile.jpg`)); } catch(e){ /* no-op if missing */ }
  },

  // ─── Portfolio files (CV / certificates / work samples) ─────────────
  // Stores under users/<uid>/portfolio/<safeName>. Returns {name,url,type,path}.
  // The displayed name keeps the original filename; the stored name is sanitised
  // to satisfy the Storage rules' strict filename pattern.
  uploadPortfolioFile: async (uid, file) => {
    if(!uid || !file) throw new Error('missing-file');
    const ext = (String(file.name||'').split('.').pop() || 'pdf').toLowerCase();
    const safe = 'pf_' + Date.now() + '_' + Math.floor(Math.random()*1e5) + '.' + ext;
    const r = storageRef(storage, `users/${uid}/portfolio/${safe}`);
    // Inline preview for raster images + PDF (the onboarding doc preview iframes
    // PDFs; browsers render them in a sandboxed viewer). SVG and everything else
    // must download (attachment) - SVG can carry scripts on the storage origin.
    const t = String(file.type||'');
    const meta = { contentDisposition: _dispositionHeader(file.name, (/^image\//i.test(t) && !/svg/i.test(t)) || t === 'application/pdf') };
    if(file.type) meta.contentType = file.type;
    await uploadBytes(r, file, meta);
    const url = await getDownloadURL(r);
    return { name: String(file.name||'file').slice(0,120), url, type: file.type || ext, path: `users/${uid}/portfolio/${safe}` };
  },
  deletePortfolioFile: async (path) => {
    if(!path) return;
    try { await deleteObject(storageRef(storage, path)); } catch(e){ /* no-op if missing */ }
  },

  // ─── Chat attachments (any file type, ≤10 MB) ───────────────────────
  // Stores under chat/<cid>/<uid>/<safeName>. Returns {url,name,size,type} -
  // exactly the shape the message doc's `file` field expects.
  uploadChatFile: async (cid, uid, file) => {
    if(!cid || !uid || !file) throw new Error('missing-file');
    if(file.size > 10 * 1024 * 1024) throw new Error('too-large');
    const ext = (String(file.name||'').split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8) || 'bin';
    const safe = 'cf_' + Date.now() + '_' + Math.floor(Math.random()*1e5) + '.' + ext;
    const r = storageRef(storage, `chat/${cid}/${uid}/${safe}`);
    // Keep the original filename on download. Raster images + PDF stay inline so
    // they preview; SVG is excluded - it can carry scripts, so it must download.
    const ct = String(file.type||'');
    const meta = { contentDisposition: _dispositionHeader(file.name, (/^image\//i.test(ct) && !/svg/i.test(ct)) || ct === 'application/pdf') };
    if(file.type) meta.contentType = file.type;
    await uploadBytes(r, file, meta);
    const url = await getDownloadURL(r);
    return { url, name: String(file.name||'file').slice(0,180), size: file.size, type: file.type || ('application/'+ext) };
  }
};

// ─────────────────────────────────────────────────────────────────────
// Firestore - real data backend.
// Public profile doc: users/{uid}. NO personal contact info lives here -
// email/phone go in users/{uid}/private_settings (owner-only, see rules).
// The field whitelist below mirrors firestore.rules so writes aren't rejected.
// ─────────────────────────────────────────────────────────────────────
const PUBLIC_TALENT_KEYS = ['field','status','experience','university','course','gradYear','degreeYear','startYear','title','rate','skills','softSkills','hobbies','bio','website','certifications','workExperience'];
const PUBLIC_CLIENT_KEYS = ['clientType','needs','timing','orgName','industry','location','description'];

// Strip a localStorage profile down to the public, rules-approved field set.
function toPublicProfile(p){
  const role = (p.role === 'client') ? 'client' : 'talent';
  const out = { role };
  if(p.displayName != null) out.displayName = String(p.displayName).slice(0,80);
  else if(p.orgName && role==='client') out.displayName = String(p.orgName).slice(0,80);
  if(p.username) out.username = String(p.username).toLowerCase().slice(0,30);
  if(p.avatar) out.avatar = String(p.avatar);
  const keys = role==='client' ? PUBLIC_CLIENT_KEYS : PUBLIC_TALENT_KEYS;
  keys.forEach(k=>{
    const v = p[k];
    if(v === undefined || v === null || v === '') return;
    if(Array.isArray(v)) out[k] = v.slice(0,60).map(x=>String(x).slice(0,80));
    else if(typeof v === 'number') out[k] = v;
    else out[k] = String(v).slice(0, (k==='bio'||k==='description'||k==='workExperience') ? 2000 : 400);
  });
  // Portfolio is an array of {name,url,type} objects - keep its shape (max 3).
  if(role==='talent' && Array.isArray(p.portfolio)){
    const pf = p.portfolio.slice(0,3).map(f=>({
      name: String((f && f.name) || 'file').slice(0,120),
      url:  String((f && f.url) || ''),
      type: String((f && f.type) || '').slice(0,80)
    })).filter(f=>f.url);
    if(pf.length) out.portfolio = pf;
  }
  return out;
}

window.firebaseDB = {
  // Create/merge the caller's own public profile. Returns true on success.
  saveProfile: async (uid, profile) => {
    if(!uid || !profile) return false;
    try {
      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      const data = toPublicProfile(profile);
      data.updatedAt = serverTimestamp();
      if(!snap.exists()) data.createdAt = serverTimestamp();
      data.displayName = data.displayName || 'Workley member';
      await setDoc(ref, data, { merge: true });
      return true;
    } catch(e){ console.warn('[Workley] saveProfile (Firestore) skipped:', e.code || e.message); return false; }
  },

  // ─── Unique usernames (handle registry) ─────────────────────────────
  // Returns the uid that owns a handle, or null if free.
  usernameOwner: async (handle) => {
    const h = String(handle||'').toLowerCase();
    if(!h) return null;
    try { const s = await getDoc(doc(db,'usernames',h)); return s.exists() ? (s.data().uid||null) : null; }
    catch(e){ return null; }
  },
  // Claim a free handle for uid (create-only; fails if already taken).
  claimUsername: async (handle, uid) => {
    const h = String(handle||'').toLowerCase();
    if(!h || !uid) return false;
    try { await setDoc(doc(db,'usernames',h), { uid, createdAt: serverTimestamp() }); return true; }
    catch(e){ console.warn('[Workley] claimUsername failed:', e.code||e.message); return false; }
  },
  // Release a handle you own (used when changing username).
  releaseUsername: async (handle) => {
    const h = String(handle||'').toLowerCase();
    if(!h) return false;
    try { await deleteDoc(doc(db,'usernames',h)); return true; }
    catch(e){ return false; }
  },

  // Store the caller's email in their private subcollection (owner-only).
  savePrivateContact: async (uid, email, contactNumber) => {
    if(!uid || !email) return false;
    try {
      const ref = doc(db, 'users', uid, 'private_settings', 'contact');
      const data = { email: String(email) };
      if(contactNumber) data.contactNumber = String(contactNumber).slice(0,20);
      await setDoc(ref, data, { merge: true });
      return true;
    } catch(e){ console.warn('[Workley] savePrivateContact skipped:', e.code || e.message); return false; }
  },

  // Read a single public profile. Returns {id, ...data} or null.
  getProfile: async (uid) => {
    if(!uid) return null;
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch(e){ console.warn('[Workley] getProfile failed:', e.code || e.message); return null; }
  },

  // List talent for the catalog / Smart Match. Capped to slow bulk scraping.
  // Returns an array of {id, ...data} (may be empty). Sorting/filtering is
  // done client-side against this capped page.
  listTalent: async (max) => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'talent'), fbLimit(Math.min(max||60, 60)));
      const snap = await getDocs(q);
      const out = [];
      snap.forEach(d => out.push({ id: d.id, ...d.data() }));
      return out;
    } catch(e){ console.warn('[Workley] listTalent failed:', e.code || e.message); return []; }
  },

  // Record one profile-view event under the viewed user. Best-effort.
  recordProfileView: async (viewedUid, viewer) => {
    if(!viewedUid || !viewer || !viewer.viewerUid) return false;
    if(viewer.viewerUid === viewedUid) return false; // never self-count
    try {
      const data = { viewerUid: viewer.viewerUid, at: serverTimestamp() };
      data.viewerRole = (viewer.viewerRole === 'client') ? 'client' : 'talent';
      data.viewerLocation = String(viewer.viewerLocation || 'Unknown').slice(0,80);
      await addDoc(collection(db, 'users', viewedUid, 'profile_views'), data);
      return true;
    } catch(e){ console.warn('[Workley] recordProfileView skipped:', e.code || e.message); return false; }
  },

  // Read the caller's own view events since a JS Date. Returns array of
  // {viewerRole, viewerLocation, at:Date}. Owner-only per rules.
  getProfileViews: async (uid, sinceDate) => {
    if(!uid) return [];
    try {
      const col = collection(db, 'users', uid, 'profile_views');
      const q = sinceDate
        ? query(col, where('at', '>=', Timestamp.fromDate(sinceDate)), fbLimit(1000))
        : query(col, fbLimit(1000));
      const snap = await getDocs(q);
      const out = [];
      snap.forEach(d => {
        const v = d.data();
        out.push({
          viewerRole: v.viewerRole || 'talent',
          viewerLocation: v.viewerLocation || 'Unknown',
          at: (v.at && typeof v.at.toDate === 'function') ? v.at.toDate() : new Date()
        });
      });
      return out;
    } catch(e){ console.warn('[Workley] getProfileViews failed:', e.code || e.message); return []; }
  },

  // ─── Reviews (clients rate talent they've worked with) ──────────────
  // Stored at users/{talentUid}/reviews/{clientUid} - the doc id is the
  // client's uid, so a client has exactly ONE (editable) review per talent.
  addReview: async (talentUid, review) => {
    if(!talentUid || !review || !review.clientUid) return false;
    if(review.clientUid === talentUid) return false;     // can't review yourself
    const rating = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 0)));
    if(!rating) return false;
    try {
      const ref = doc(db, 'users', talentUid, 'reviews', review.clientUid);
      await setDoc(ref, {
        clientUid: review.clientUid,
        clientName: String(review.clientName || 'Workley client').slice(0,120),
        rating,
        comment: String(review.comment || '').slice(0,1000),
        at: serverTimestamp()
      });
      return true;
    } catch(e){ console.warn('[Workley] addReview failed:', e.code || e.message); return false; }
  },
  // All reviews for one talent, newest first → [{clientUid,clientName,rating,comment,at:Date}].
  getReviews: async (talentUid) => {
    if(!talentUid) return [];
    try {
      const snap = await getDocs(collection(db, 'users', talentUid, 'reviews'));
      const out = [];
      snap.forEach(d => {
        const v = d.data();
        out.push({
          clientUid: v.clientUid || d.id,
          clientName: v.clientName || 'Workley client',
          rating: Number(v.rating) || 0,
          comment: v.comment || '',
          at: (v.at && typeof v.at.toDate === 'function') ? v.at.toDate() : null
        });
      });
      out.sort((a,b)=> (b.at?b.at.getTime():0) - (a.at?a.at.getTime():0));
      return out;
    } catch(e){ console.warn('[Workley] getReviews failed:', e.code || e.message); return []; }
  },
  // One collection-group read → Map(talentUid → {avg, count}) for catalog stars.
  getAllRatings: async () => {
    const map = {};
    try {
      const snap = await getDocs(collectionGroup(db, 'reviews'));
      const agg = {};
      snap.forEach(d => {
        const tid = d.ref.parent.parent && d.ref.parent.parent.id;
        const r = Number(d.data().rating) || 0;
        if(!tid || !r) return;
        (agg[tid] = agg[tid] || { sum:0, count:0 });
        agg[tid].sum += r; agg[tid].count += 1;
      });
      Object.keys(agg).forEach(tid => {
        map[tid] = { avg: agg[tid].sum / agg[tid].count, count: agg[tid].count };
      });
    } catch(e){ console.warn('[Workley] getAllRatings failed:', e.code || e.message); }
    return map;
  },

  // ─── Jobs (clients post; talent browses) ───────────────────────────
  postJob: async (clientUid, job) => {
    if(!clientUid || !job) return null;
    try {
      const data = {
        clientUid,
        clientName: String(job.clientName || 'Workley client').slice(0,120),
        title: String(job.title || '').slice(0,120),
        field: String(job.field || ''),
        description: String(job.description || '').slice(0,2000),
        budget: Number(job.budget) || 0,
        budgetType: (job.budgetType === 'hourly') ? 'hourly' : 'fixed',
        timeline: String(job.timeline || '').slice(0,40),
        skills: Array.isArray(job.skills) ? job.skills.slice(0,30).map(s=>String(s).slice(0,80)) : [],
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if(job.clientOrg) data.clientOrg = String(job.clientOrg).slice(0,160);
      // Every job belongs to a project (clients pick/create one at post time).
      if(job.projectId){ data.projectId = String(job.projectId).slice(0,200); data.projectName = String(job.projectName||'').slice(0,140); }
      const ref = await addDoc(collection(db, 'jobs'), data);
      return ref.id;
    } catch(e){ console.warn('[Workley] postJob failed:', e.code || e.message); return null; }
  },
  // Open jobs for the talent catalog of work. Capped; sorted client-side.
  listJobs: async (max) => {
    try {
      const q = query(collection(db, 'jobs'), where('status', '==', 'open'), fbLimit(Math.min(max||60, 60)));
      const snap = await getDocs(q);
      const out = []; snap.forEach(d => out.push(_jobOut(d)));
      return out;
    } catch(e){ console.warn('[Workley] listJobs failed:', e.code || e.message); return []; }
  },
  // A client's own posts (any status).
  myJobs: async (clientUid) => {
    if(!clientUid) return [];
    try {
      const q = query(collection(db, 'jobs'), where('clientUid', '==', clientUid), fbLimit(60));
      const snap = await getDocs(q);
      const out = []; snap.forEach(d => out.push(_jobOut(d)));
      return out;
    } catch(e){ console.warn('[Workley] myJobs failed:', e.code || e.message); return []; }
  },
  getJob: async (jobId) => {
    if(!jobId) return null;
    try { const s = await getDoc(doc(db, 'jobs', jobId)); return s.exists() ? _jobOut(s) : null; }
    catch(e){ console.warn('[Workley] getJob failed:', e.code || e.message); return null; }
  },
  closeJob: async (jobId) => {
    if(!jobId) return false;
    try { await updateDoc(doc(db, 'jobs', jobId), { status:'closed', updatedAt: serverTimestamp() }); return true; }
    catch(e){ console.warn('[Workley] closeJob failed:', e.code || e.message); return false; }
  },
  deleteJob: async (jobId) => {
    if(!jobId) return false;
    try { await deleteDoc(doc(db, 'jobs', jobId)); return true; }
    catch(e){ console.warn('[Workley] deleteJob failed:', e.code || e.message); return false; }
  },

  // ─── Proposals (talent applies to a job) ───────────────────────────
  submitProposal: async (prop) => {
    if(!prop || !prop.jobId || !prop.clientUid || !prop.talentUid) return null;
    try {
      const data = {
        jobId: prop.jobId, clientUid: prop.clientUid, talentUid: prop.talentUid,
        talentName: String(prop.talentName || 'Workley talent').slice(0,120),
        talentField: String(prop.talentField || ''),
        jobTitle: String(prop.jobTitle || '').slice(0,120),
        note: String(prop.note || '').slice(0,1000),
        status: 'submitted',
        createdAt: serverTimestamp()
      };
      const ref = await addDoc(collection(db, 'proposals'), data);
      return ref.id;
    } catch(e){ console.warn('[Workley] submitProposal failed:', e.code || e.message); return null; }
  },
  myProposals: async (talentUid) => {
    if(!talentUid) return [];
    try {
      const q = query(collection(db, 'proposals'), where('talentUid', '==', talentUid), fbLimit(100));
      const snap = await getDocs(q);
      const out = []; snap.forEach(d => out.push(_propOut(d)));
      return out;
    } catch(e){ console.warn('[Workley] myProposals failed:', e.code || e.message); return []; }
  },
  proposalsForClient: async (clientUid) => {
    if(!clientUid) return [];
    try {
      const q = query(collection(db, 'proposals'), where('clientUid', '==', clientUid), fbLimit(200));
      const snap = await getDocs(q);
      const out = []; snap.forEach(d => out.push(_propOut(d)));
      return out;
    } catch(e){ console.warn('[Workley] proposalsForClient failed:', e.code || e.message); return []; }
  },
  // Has this talent already applied to this job?
  hasApplied: async (jobId, talentUid) => {
    if(!jobId || !talentUid) return false;
    try {
      const q = query(collection(db, 'proposals'), where('talentUid', '==', talentUid), where('jobId', '==', jobId), fbLimit(1));
      const snap = await getDocs(q);
      return !snap.empty;
    } catch(e){ return false; }
  },
  updateProposalStatus: async (proposalId, status) => {
    if(!proposalId) return false;
    const allowed = ['submitted','viewed','interview','offer','accepted','declined'];
    if(allowed.indexOf(status) < 0) return false;
    try { await updateDoc(doc(db, 'proposals', proposalId), { status, respondedAt: serverTimestamp() }); return true; }
    catch(e){ console.warn('[Workley] updateProposalStatus failed:', e.code || e.message); return false; }
  },
  // Accept an applicant: add them to the job's project as an ACCEPTED member and
  // mark the proposal accepted. They are NOT onboarded yet - onboarding still
  // requires both parties to sign the standard Service Agreement (see
  // clientSignContract / talentSignContract), and the talent has no obligation
  // to work until that is complete.
  acceptApplicant: async (clientUid, proposal, job) => {
    if(!clientUid || !proposal || !proposal.talentUid || !job || !job.projectId) return false;
    try {
      const ref = doc(db,'users',clientUid,'projects',job.projectId,'members',proposal.talentUid);
      await setDoc(ref, {
        studentUid: proposal.talentUid,
        studentName: String(proposal.talentName || 'Student').slice(0,120),
        studentField: String(proposal.talentField || ''),
        studentStatus: '', studentAvatar: '',
        projectTitle: String(job.projectName || job.title || '').slice(0,140),
        projectDescription: '',
        clientUid, clientName: String(job.clientName || 'Client').slice(0,120),
        inviteStatus: 'accepted', memberState: 'active', paid: false,
        meetingLink: '', meetingAt: null, studentEmail: '', studentPhone: '',
        jobId: String(job.id || proposal.jobId || '').slice(0,200),
        jobTitle: String(job.title || proposal.jobTitle || '').slice(0,140),
        invitedAt: serverTimestamp(), respondedAt: serverTimestamp(), acceptedAt: serverTimestamp()
      }, { merge: true });
      await updateDoc(doc(db,'proposals',proposal.id), { status:'accepted', respondedAt: serverTimestamp() });
      return true;
    } catch(e){ console.warn('[Workley] acceptApplicant failed:', e.code || e.message); return false; }
  },
  // ── Standard Service Agreement signing (gates onboarding) ──
  // The client signs first (when they choose to onboard); this records their
  // signature but does NOT onboard. The talent then signs, which completes
  // onboarding. Names are recorded with a server timestamp for the record.
  clientSignContract: async (clientUid, projectId, studentUid, signerName) => {
    if(!clientUid || !projectId || !studentUid) return false;
    try {
      await updateDoc(doc(db,'users',clientUid,'projects',projectId,'members',studentUid), {
        clientSignedAt: serverTimestamp(),
        clientSignerName: String(signerName || '').slice(0,120)
      });
      return true;
    } catch(e){ console.warn('[Workley] clientSignContract failed:', e.code || e.message); return false; }
  },
  // Talent counter-signs → onboarding completes (only permitted once the client
  // has already signed; enforced in firestore.rules).
  talentSignContract: async (member, signerName) => {
    if(!member || !member.clientUid || !member.projectId || !member.studentUid) return false;
    try {
      await updateDoc(doc(db,'users',member.clientUid,'projects',member.projectId,'members',member.studentUid), {
        talentSignedAt: serverTimestamp(),
        talentSignerName: String(signerName || '').slice(0,120),
        memberState: 'onboarded',
        onboardedAt: serverTimestamp()
      });
      return true;
    } catch(e){ console.warn('[Workley] talentSignContract failed:', e.code || e.message); return false; }
  },

  // ─── Messaging (client ↔ talent, real-time) ────────────────────────
  // Deterministic 1:1 conversation id so the same pair always shares a thread.
  conversationId: (a, b) => [String(a), String(b)].sort().join('__'),

  // Ensure a conversation doc exists between me and other; returns its id.
  // me/other = { uid, name, role }.
  openConversation: async (me, other) => {
    if(!me || !other || !me.uid || !other.uid || me.uid === other.uid) return null;
    const cid = [me.uid, other.uid].sort().join('__');
    try {
      const ref = doc(db, 'conversations', cid);
      // A get() on a not-yet-created conversation can be refused by rules; treat
      // any read failure as "doesn't exist yet" and go ahead and create it.
      let exists = false;
      try { const snap = await getDoc(ref); exists = snap.exists(); } catch(e){ exists = false; }
      if(!exists){
        const names = {}; names[me.uid] = String(me.name||'Member').slice(0,80); names[other.uid] = String(other.name||'Member').slice(0,80);
        const roles = {}; roles[me.uid] = (me.role==='client')?'client':'talent'; roles[other.uid] = (other.role==='client')?'client':'talent';
        const unread = {}; unread[me.uid] = 0; unread[other.uid] = 0;
        await setDoc(ref, {
          participants: [me.uid, other.uid].sort(),
          names, roles, unread,
          lastText: '', lastSender: '', lastAt: serverTimestamp(), createdAt: serverTimestamp()
        });
      }
      return cid;
    } catch(e){ console.warn('[Workley] openConversation failed:', e.code || e.message); return null; }
  },

  // Fetch a single conversation doc (or null). Used to confirm a client has an
  // established relationship with a talent before letting them leave a review.
  getConversation: async (cid) => {
    if(!cid) return null;
    try {
      const snap = await getDoc(doc(db, 'conversations', cid));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch(e){ return null; }
  },

  // Live list of my conversations (newest activity first). Returns unsubscribe().
  listenConversations: (uid, cb) => {
    if(!uid || typeof cb !== 'function') return () => {};
    try {
      const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid), fbLimit(50));
      return onSnapshot(q, snap => {
        const out = [];
        snap.forEach(d => { const v = d.data();
          const readAt = {}; if(v.readAt){ Object.keys(v.readAt).forEach(k=>{ readAt[k] = _ts(v.readAt[k]) || null; }); }
          out.push({
            id: d.id, participants: v.participants||[], names: v.names||{}, roles: v.roles||{},
            unread: v.unread||{}, lastText: v.lastText||'', lastSender: v.lastSender||'',
            lastAt: _ts(v.lastAt) || new Date(0), readAt
          });
        });
        out.sort((a,b)=> b.lastAt - a.lastAt);
        cb(out);
      }, err => { console.warn('[Workley] listenConversations:', err.code || err.message); cb([]); });
    } catch(e){ console.warn('[Workley] listenConversations failed:', e.code || e.message); return () => {}; }
  },

  // Live message stream for one conversation (oldest → newest). Returns unsubscribe().
  listenMessages: (cid, cb) => {
    if(!cid || typeof cb !== 'function') return () => {};
    try {
      const q = query(collection(db, 'conversations', cid, 'messages'), orderBy('at', 'asc'), fbLimit(500));
      return onSnapshot(q, snap => {
        const out = [];
        snap.forEach(d => { const v = d.data(); out.push({
          id: d.id, senderUid: v.senderUid, text: v.text || '', at: _ts(v.at) || new Date(),
          file: v.file || null, files: Array.isArray(v.files) ? v.files : null,
          hiddenFor: Array.isArray(v.hiddenFor) ? v.hiddenFor : [],
          deleted: !!v.deleted, editedAt: _ts(v.editedAt) || null
        }); });
        cb(out);
      }, err => { console.warn('[Workley] listenMessages:', err.code || err.message); cb([]); });
    } catch(e){ console.warn('[Workley] listenMessages failed:', e.code || e.message); return () => {}; }
  },

  // Send a message. Updates conversation metadata + reply-time stats. Returns true/false.
  sendMessage: async (cid, senderUid, text, participants, files) => {
    const hasText = !!(text && text.trim());
    // `files` = array of {url,name,size,type} metas (max 5); a single meta is
    // wrapped for backward compatibility.
    const list = Array.isArray(files) ? files : (files ? [files] : []);
    const metas = list.filter(f => f && f.url).slice(0, 5).map(f => ({
      url: String(f.url), name: String(f.name||'file').slice(0,180),
      size: Number(f.size)||0, type: String(f.type||'')
    }));
    if(!cid || !senderUid || (!hasText && !metas.length)) return false;
    const body = String(text || '').slice(0, 4000);
    try {
      const convRef = doc(db, 'conversations', cid);
      const convSnap = await getDoc(convRef);
      const conv = convSnap.exists() ? convSnap.data() : null;
      const parts = (conv && conv.participants) || participants || [];
      // 1) append the message (with optional file attachments)
      const msgDoc = { senderUid, text: body, at: serverTimestamp(), participants: parts };
      if(metas.length){ msgDoc.files = metas; }
      await addDoc(collection(db, 'conversations', cid, 'messages'), msgDoc);
      // 2) update conversation summary + bump the recipient's unread count
      const other = parts.find(u => u !== senderUid);
      const preview = body.slice(0,140) || (metas.length ? ('📎 ' + (metas.length === 1 ? metas[0].name : metas.length + ' files')) : '');
      const upd = { lastText: preview, lastSender: senderUid, lastAt: serverTimestamp() };
      if(other) upd['unread.' + other] = increment(1);
      upd['unread.' + senderUid] = 0;
      await updateDoc(convRef, upd);
      // 3) reply-time: if I'm replying to the other person, fold the latency into my rolling average
      if(conv && conv.lastSender && conv.lastSender !== senderUid && conv.lastAt && typeof conv.lastAt.toDate === 'function'){
        const latencyMins = Math.max(0, (Date.now() - conv.lastAt.toDate().getTime()) / 60000);
        // ignore absurd gaps (> 14 days) so a single stale thread doesn't skew the average
        if(latencyMins <= 14*24*60){
          try {
            const meRef = doc(db, 'users', senderUid);
            const meSnap = await getDoc(meRef);
            const cur = meSnap.exists() ? meSnap.data() : {};
            const count = Number(cur.replyCount) || 0;
            const avg = Number(cur.replyAvgMins) || 0;
            const newCount = count + 1;
            const newAvg = Math.round((avg * count + latencyMins) / newCount);
            await updateDoc(meRef, { replyAvgMins: newAvg, replyCount: newCount, updatedAt: serverTimestamp() });
          } catch(e){ /* stats are best-effort; never block the message */ }
        }
      }
      return true;
    } catch(e){ console.warn('[Workley] sendMessage failed:', e.code || e.message); return false; }
  },

  // Clear my unread counter on a conversation.
  markConversationRead: async (cid, uid) => {
    if(!cid || !uid) return false;
    // Record a read timestamp too, so the sender can show a "Seen" receipt.
    try { const upd = {}; upd['unread.' + uid] = 0; upd['readAt.' + uid] = serverTimestamp(); await updateDoc(doc(db, 'conversations', cid), upd); return true; }
    catch(e){ return false; }
  },

  // Edit my own message (allowed within 60s by rules). Optionally refresh the
  // conversation preview when it's the latest message.
  editMessage: async (cid, mid, uid, text, isLast) => {
    const body = String(text||'').slice(0,4000);
    if(!cid || !mid || !uid || !body.trim()) return false;
    try {
      await updateDoc(doc(db,'conversations',cid,'messages',mid), { text: body, editedAt: serverTimestamp() });
      if(isLast){ try{ await updateDoc(doc(db,'conversations',cid), { lastText: body.slice(0,140) }); }catch(e){} }
      return true;
    } catch(e){ console.warn('[Workley] editMessage failed:', e.code || e.message); return false; }
  },

  // Soft-delete my own message FOR EVERYONE: leaves a tombstone for both sides.
  deleteMessage: async (cid, mid, uid, isLast) => {
    if(!cid || !mid || !uid) return false;
    try {
      await updateDoc(doc(db,'conversations',cid,'messages',mid), { deleted: true, text: '', file: deleteField(), files: deleteField() });
      if(isLast){ try{ await updateDoc(doc(db,'conversations',cid), { lastText: 'Message deleted' }); }catch(e){} }
      return true;
    } catch(e){ console.warn('[Workley] deleteMessage failed:', e.code || e.message); return false; }
  },

  // Delete-for-me: hide a message for THIS user only - the other participant
  // still sees it. Works on any message in the thread (mine or theirs).
  hideMessageForMe: async (cid, mid, uid) => {
    if(!cid || !mid || !uid) return false;
    try { await updateDoc(doc(db,'conversations',cid,'messages',mid), { hiddenFor: arrayUnion(uid) }); return true; }
    catch(e){ console.warn('[Workley] hideMessageForMe failed:', e.code || e.message); return false; }
  },

  // ─── Presence (online / last-seen) ──────────────────────────────────
  // Firestore has no onDisconnect, so presence is heartbeat-based: the app
  // stamps presence/{uid}.lastActive every ~45s while open. A user counts as
  // "online" if their lastActive is within the last 60s.
  heartbeat: async (uid) => {
    if(!uid) return;
    try { await setDoc(doc(db,'presence',uid), { lastActive: serverTimestamp() }, { merge:true }); } catch(e){}
  },
  // Live presence for one user → cb(Date|null) on each change.
  listenPresence: (uid, cb) => {
    if(!uid || typeof cb !== 'function') return () => {};
    try {
      return onSnapshot(doc(db,'presence',uid), snap => {
        const v = snap.exists() ? snap.data() : null;
        cb(v ? (_ts(v.lastActive) || null) : null);
      }, () => cb(null));
    } catch(e){ return () => {}; }
  },
  // One-shot presence read → Date|null.
  getPresence: async (uid) => {
    if(!uid) return null;
    try { const snap = await getDoc(doc(db,'presence',uid)); return snap.exists() ? (_ts(snap.data().lastActive) || null) : null; }
    catch(e){ return null; }
  },

  // ─── Projects (client project management) ───────────────────────────
  // Stored under the owner: users/{clientUid}/projects/{projectId}; invited
  // students live in a `members` subcollection. Member docs are DENORMALISED
  // (carry project title/description + client name) so an invited student can
  // read their own invites via a collection-group query without read access to
  // the client's project document.
  createProject: async (clientUid, clientName, data) => {
    if(!clientUid || !data || !data.title) return null;
    try {
      const ref = await addDoc(collection(db, 'users', clientUid, 'projects'), {
        clientUid, clientName: String(clientName || 'Client').slice(0,120),
        title: String(data.title).slice(0,140),
        description: String(data.description || '').slice(0,3000),
        status: 'ongoing',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      return ref.id;
    } catch(e){ console.warn('[Workley] createProject failed:', e.code || e.message); return null; }
  },
  listProjects: async (clientUid) => {
    if(!clientUid) return [];
    try {
      const snap = await getDocs(query(collection(db, 'users', clientUid, 'projects'), fbLimit(100)));
      const out = []; snap.forEach(d => out.push(_projOut(d)));
      out.sort((a,b)=> b.createdAt - a.createdAt);
      return out;
    } catch(e){ console.warn('[Workley] listProjects failed:', e.code || e.message); return []; }
  },
  updateProjectStatus: async (clientUid, projectId, status) => {
    const allowed = ['ongoing','complete','archived'];
    if(!clientUid || !projectId || allowed.indexOf(status) < 0) return false;
    try { await updateDoc(doc(db,'users',clientUid,'projects',projectId), { status, updatedAt: serverTimestamp() }); return true; }
    catch(e){ console.warn('[Workley] updateProjectStatus failed:', e.code || e.message); return false; }
  },
  updateProject: async (clientUid, projectId, data) => {
    if(!clientUid || !projectId || !data) return false;
    const upd = { updatedAt: serverTimestamp() };
    if(data.title != null) upd.title = String(data.title).slice(0,140);
    if(data.description != null) upd.description = String(data.description).slice(0,3000);
    try { await updateDoc(doc(db,'users',clientUid,'projects',projectId), upd); return true; }
    catch(e){ return false; }
  },
  deleteProject: async (clientUid, projectId) => {
    if(!clientUid || !projectId) return false;
    try {
      const ms = await getDocs(collection(db,'users',clientUid,'projects',projectId,'members'));
      await Promise.all(ms.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db,'users',clientUid,'projects',projectId));
      return true;
    } catch(e){ console.warn('[Workley] deleteProject failed:', e.code || e.message); return false; }
  },
  // Close a project: snapshot each member as a "receipt" (who was on it + their
  // onboarded date), REMOVE the live members, then archive it. Reopening later
  // starts with a clean slate so the same talent can be invited afresh.
  closeProject: async (clientUid, projectId) => {
    if(!clientUid || !projectId) return false;
    try {
      const ms = await getDocs(collection(db,'users',clientUid,'projects',projectId,'members'));
      const receipts = [];
      ms.forEach(d => { const v = d.data(); receipts.push({
        studentUid: v.studentUid || d.id,
        studentName: String(v.studentName || 'Student').slice(0,120),
        studentField: String(v.studentField || ''),
        studentAvatar: v.studentAvatar ? String(v.studentAvatar) : '',
        inviteStatus: v.inviteStatus || 'pending',
        memberState: v.memberState || 'active',
        paid: !!v.paid,
        onboardedAt: v.onboardedAt || null,
        invitedAt: v.invitedAt || null
      }); });
      await Promise.all(ms.docs.map(d => deleteDoc(d.ref)));
      await updateDoc(doc(db,'users',clientUid,'projects',projectId), {
        status: 'archived', receipts, closedAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      return true;
    } catch(e){ console.warn('[Workley] closeProject failed:', e.code || e.message); return false; }
  },
  // Reopen an archived project: back to ongoing, clear the closing receipts so it
  // behaves like a fresh project (talent can be re-invited).
  reopenProject: async (clientUid, projectId) => {
    if(!clientUid || !projectId) return false;
    try {
      await updateDoc(doc(db,'users',clientUid,'projects',projectId), {
        status: 'ongoing', receipts: deleteField(), closedAt: deleteField(), updatedAt: serverTimestamp()
      });
      return true;
    } catch(e){ console.warn('[Workley] reopenProject failed:', e.code || e.message); return false; }
  },
  inviteToProject: async (clientUid, projectId, project, student) => {
    if(!clientUid || !projectId || !student || !student.uid) return false;
    try {
      const ref = doc(db,'users',clientUid,'projects',projectId,'members',student.uid);
      await setDoc(ref, {
        studentUid: student.uid,
        studentName: String(student.name || 'Student').slice(0,120),
        studentField: String(student.field || ''),
        studentStatus: String(student.status || ''),
        studentAvatar: student.avatar ? String(student.avatar) : '',
        projectTitle: String((project && project.title) || '').slice(0,140),
        projectDescription: String((project && project.description) || '').slice(0,3000),
        clientUid, clientName: String((project && project.clientName) || 'Client').slice(0,120),
        inviteStatus: 'pending', memberState: 'active', paid: false,
        meetingLink: '', meetingAt: null, studentEmail: '', studentPhone: '',
        invitedAt: serverTimestamp()
      }, { merge: true });
      return true;
    } catch(e){ console.warn('[Workley] inviteToProject failed:', e.code || e.message); return false; }
  },
  listProjectMembers: async (clientUid, projectId) => {
    if(!clientUid || !projectId) return [];
    try {
      const snap = await getDocs(collection(db,'users',clientUid,'projects',projectId,'members'));
      const out = []; snap.forEach(d => out.push(_memberOut(d))); return out;
    } catch(e){ console.warn('[Workley] listProjectMembers failed:', e.code || e.message); return []; }
  },
  updateMemberState: async (clientUid, projectId, studentUid, memberState) => {
    // 'onboarded' is NOT settable here - that state is only reached through the
    // two-party Service Agreement signing (talentSignContract), and the security
    // rules enforce it server-side.
    const allowed = ['active','dismissed'];
    if(!clientUid || !projectId || !studentUid || allowed.indexOf(memberState) < 0) return false;
    try { await updateDoc(doc(db,'users',clientUid,'projects',projectId,'members',studentUid), { memberState }); return true; }
    catch(e){ return false; }
  },
  setMemberPaid: async (clientUid, projectId, studentUid, paid) => {
    if(!clientUid || !projectId || !studentUid) return false;
    try { await updateDoc(doc(db,'users',clientUid,'projects',projectId,'members',studentUid), { paid: !!paid }); return true; }
    catch(e){ return false; }
  },
  setMemberMeeting: async (clientUid, projectId, studentUid, meeting) => {
    if(!clientUid || !projectId || !studentUid) return false;
    // Normalise the link to a safe https URL (rules reject anything else).
    let link = String((meeting && meeting.link) || '').trim().slice(0,400);
    if(link){
      if(/^http:\/\//i.test(link)) link = link.replace(/^http:\/\//i, 'https://');
      else if(!/^https:\/\//i.test(link)) link = 'https://' + link;
    }
    const platform = String((meeting && meeting.platform) || '').slice(0,40);
    const hasMeeting = !!(meeting && meeting.at);
    try {
      await updateDoc(doc(db,'users',clientUid,'projects',projectId,'members',studentUid), {
        meetingLink: link,
        meetingPlatform: platform,
        meetingAt: hasMeeting ? Timestamp.fromDate(new Date(meeting.at)) : null,
        // Bump on set/edit so the talent gets a "meeting scheduled/updated" notice;
        // clear it when the meeting is removed.
        meetingUpdatedAt: hasMeeting ? serverTimestamp() : deleteField()
      });
      return true;
    } catch(e){ console.warn('[Workley] setMemberMeeting failed:', e.code || e.message); return false; }
  },
  removeMember: async (clientUid, projectId, studentUid) => {
    if(!clientUid || !projectId || !studentUid) return false;
    try { await deleteDoc(doc(db,'users',clientUid,'projects',projectId,'members',studentUid)); return true; }
    catch(e){ return false; }
  },
  // ── Talent side: my project invitations (collection-group across clients) ──
  listMyInvites: async (studentUid) => {
    if(!studentUid) return [];
    try {
      const snap = await getDocs(query(collectionGroup(db,'members'), where('studentUid','==',studentUid), fbLimit(100)));
      const out = []; snap.forEach(d => out.push(_memberOut(d)));
      out.sort((a,b)=> b.invitedAt - a.invitedAt);
      return out;
    } catch(e){ console.warn('[Workley] listMyInvites failed:', e.code || e.message); return []; }
  },
  respondToInvite: async (member, accept, contact) => {
    if(!member || !member.clientUid || !member.projectId || !member.studentUid) return false;
    try {
      const ref = doc(db,'users',member.clientUid,'projects',member.projectId,'members',member.studentUid);
      const upd = { inviteStatus: accept ? 'accepted' : 'declined', respondedAt: serverTimestamp() };
      if(accept && contact){
        if(contact.email) upd.studentEmail = String(contact.email).slice(0,160);
        if(contact.phone) upd.studentPhone = String(contact.phone).slice(0,40);
      }
      await updateDoc(ref, upd);
      return true;
    } catch(e){ console.warn('[Workley] respondToInvite failed:', e.code || e.message); return false; }
  }
};

// ── Firestore doc → plain object mappers (timestamps → JS Date) ──
function _ts(v){ return (v && typeof v.toDate === 'function') ? v.toDate() : null; }
function _jobOut(d){ const v = d.data(); return {
  id: d.id, clientUid: v.clientUid, clientName: v.clientName || 'Client', clientOrg: v.clientOrg || '',
  title: v.title || '', field: v.field || '', description: v.description || '',
  budget: (typeof v.budget === 'number') ? v.budget : 0, budgetType: v.budgetType || 'fixed',
  timeline: v.timeline || '', skills: Array.isArray(v.skills) ? v.skills : [],
  projectId: v.projectId || '', projectName: v.projectName || '',
  status: v.status || 'open', createdAt: _ts(v.createdAt) || new Date()
}; }
function _propOut(d){ const v = d.data(); return {
  id: d.id, jobId: v.jobId, clientUid: v.clientUid, talentUid: v.talentUid,
  talentName: v.talentName || 'Talent', talentField: v.talentField || '', jobTitle: v.jobTitle || '',
  note: v.note || '', status: v.status || 'submitted', createdAt: _ts(v.createdAt) || new Date(),
  respondedAt: _ts(v.respondedAt)
}; }
function _projOut(d){ const v = d.data(); return {
  id: d.id, clientUid: v.clientUid, clientName: v.clientName || 'Client',
  title: v.title || '', description: v.description || '', status: v.status || 'ongoing',
  createdAt: _ts(v.createdAt) || new Date(0), updatedAt: _ts(v.updatedAt) || new Date(0),
  closedAt: _ts(v.closedAt),
  receipts: Array.isArray(v.receipts) ? v.receipts.map(r => ({
    studentUid: r.studentUid || '', studentName: r.studentName || 'Student',
    studentField: r.studentField || '', studentAvatar: r.studentAvatar || '',
    inviteStatus: r.inviteStatus || 'pending', memberState: r.memberState || 'active',
    paid: !!r.paid, onboardedAt: _ts(r.onboardedAt), invitedAt: _ts(r.invitedAt)
  })) : []
}; }
function _memberOut(d){ const v = d.data();
  // path: users/{clientUid}/projects/{projectId}/members/{studentUid}
  const projectId = (d.ref.parent && d.ref.parent.parent) ? d.ref.parent.parent.id : '';
  return {
    id: d.id, studentUid: v.studentUid || d.id, projectId,
    studentName: v.studentName || 'Student', studentField: v.studentField || '', studentStatus: v.studentStatus || '',
    studentAvatar: v.studentAvatar || '', studentEmail: v.studentEmail || '', studentPhone: v.studentPhone || '',
    projectTitle: v.projectTitle || '', projectDescription: v.projectDescription || '',
    clientUid: v.clientUid || '', clientName: v.clientName || 'Client',
    inviteStatus: v.inviteStatus || 'pending', memberState: v.memberState || 'active', paid: !!v.paid,
    meetingLink: v.meetingLink || '', meetingAt: _ts(v.meetingAt),
    meetingPlatform: v.meetingPlatform || '', meetingUpdatedAt: _ts(v.meetingUpdatedAt),
    jobId: v.jobId || '', jobTitle: v.jobTitle || '',
    invitedAt: _ts(v.invitedAt) || new Date(0), respondedAt: _ts(v.respondedAt), acceptedAt: _ts(v.acceptedAt),
    onboardedAt: _ts(v.onboardedAt),
    clientSignedAt: _ts(v.clientSignedAt), talentSignedAt: _ts(v.talentSignedAt),
    clientSignerName: v.clientSignerName || '', talentSignerName: v.talentSignerName || ''
  };
}

// Let non-module code know the Firestore helpers are ready (firebase-config is
// a deferred module, so it runs after the classic app.js bootstrap).
if (typeof window.onFirebaseDBReady === "function") {
  try { window.onFirebaseDBReady(); } catch(e){ /* no-op */ }
}

// Keep the existing nav UI (profile button, guest/user states, dashboard guard)
// in sync with the REAL Firebase session. Defined in js/app.js, which loads
// before this module executes.
onAuthStateChanged(auth, (user) => {
  window.firebaseUser = user || null;
  // Refresh the ID token so security rules see the CURRENT email_verified claim.
  // Right after a user verifies their email the cached token is stale, so
  // verified() would wrongly deny reads/writes (e.g. messaging) until it rotates.
  if (user && user.emailVerified) { try { user.getIdToken(true); } catch(e){} }
  if (typeof window.onFirebaseAuthChanged === "function") {
    window.onFirebaseAuthChanged(user);
  }
});
