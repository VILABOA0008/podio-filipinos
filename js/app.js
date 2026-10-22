'use strict';
/* Estado, almacenamiento local y reglas de la sala.
   El anfitrión guarda la sala entera en su móvil (localStorage) y la reparte a los invitados.
   Cada móvil guarda su propio podio y sus notas; las notas nunca salen del móvil. */

/* ---------- almacenamiento ---------- */
function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function rid(n, abc) {
  abc = abc || 'abcdefghijkmnpqrstuvwxyz23456789';
  var b = new Uint8Array(n), s = '';
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  for (var j = 0; j < n; j++) s += abc[b[j] % abc.length];
  return s;
}
var CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var CID_RE = /^[a-z0-9]{6,40}$/;

/* ---------- estado ---------- */
var S = {
  mode: 'landing', code: null, cid: null, hasState: false,
  room: { phase: 'closed', round: 1 }, claims: {}, online: {}, voted: {}, votes: null,
  myKey: null, mySent: null, pending: null, pendingSentAt: 0,
  draft: { slots: [0, 0, 0, 0, 0, 0], notes: {} }, draftFor: '',
  view: '', sel: 0, sort: 'mean', rosterOpen: false, resSig: '',
  armNew: false, armFree: '', armChange: false, armResults: false, armCreate: false, armTake: ''
};
var H = null;   // solo en el anfitrión: la sala de verdad

/* ---------- podio y notas propios (en este móvil) ---------- */
var saveTimer = 0;
function draftKey() { return 'podio:draft:' + S.code + ':' + S.room.round; }
function pendKey() { return 'podio:pending:' + S.code; }
function resetDraft() {
  var d = lsGet(draftKey()) || {};
  S.draft = { slots: cleanSlots(d.slots), notes: cleanNotes(d.notes) };
  S.draftFor = S.code + ':' + S.room.round;
  S.sel = 0;
}
function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 250); }
function flushSave() {
  clearTimeout(saveTimer);
  if (!S.code) return;
  lsSet(draftKey(), { slots: S.draft.slots, notes: S.draft.notes, at: Date.now() });
}
function applyRoom(phase, round) {
  S.room = { phase: phase, round: round };
  if (S.draftFor !== S.code + ':' + round) resetDraft();
}
function setPending(p) {
  S.pending = p;
  if (p) lsSet(pendKey(), p); else lsDel(pendKey());
}

/* ---------- anfitrión ---------- */
function sanitizeHost(h) {
  var out = {
    code: String(h.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
    phase: h.phase === 'open' || h.phase === 'results' ? h.phase : 'closed',
    round: typeof h.round === 'number' && h.round >= 1 ? Math.floor(h.round) : 1,
    claims: {}, votes: {}, at: h.at || Date.now()
  };
  var k;
  for (k in (h.claims || {})) if (NAMEOF[k] && k !== HOST.key && typeof h.claims[k] === 'string') out.claims[k] = h.claims[k];
  for (var r in (h.votes || {})) {
    var rv = h.votes[r] || {}, clean = {};
    for (k in rv) if (NAMEOF[k] && rv[k] && validOrder(rv[k].order)) clean[k] = { order: rv[k].order.slice(), at: rv[k].at || 0 };
    out.votes[r] = clean;
  }
  return out;
}
function hostLoad(code) { var h = lsGet('podio:host'); return h && String(h.code).toUpperCase() === code ? sanitizeHost(h) : null; }
function hostSave() { lsSet('podio:host', H); }
function roundVotes() { return H.votes[H.round] || (H.votes[H.round] = {}); }
function cidOnline(cid) { return NET.conns.some(function (c) { return c.open && c._cid === cid; }); }
function keyOfCid(cid) { for (var k in H.claims) if (H.claims[k] === cid) return k; return null; }
function hostOnlineKeys() {
  var m = {};
  m[HOST.key] = true;
  NET.conns.forEach(function (c) { if (c.open && c._cid) { var k = keyOfCid(c._cid); if (k) m[k] = true; } });
  return m;
}
function hostSync() {
  applyRoom(H.phase, H.round);
  var rv = roundVotes(), k;
  S.claims = {}; for (k in H.claims) S.claims[k] = true;
  S.voted = {}; for (k in rv) S.voted[k] = true;
  S.votes = null;
  if (H.phase === 'results') { S.votes = {}; for (k in rv) S.votes[k] = { order: rv[k].order.slice() }; }
  S.online = hostOnlineKeys();
  S.myKey = HOST.key;
  S.mySent = rv[HOST.key] ? rv[HOST.key].order.slice() : null;
  S.hasState = true;
}
function stateFor(c) {
  var rv = roundVotes(), you = c._cid ? keyOfCid(c._cid) : null, votes = null, k;
  if (H.phase === 'results') { votes = {}; for (k in rv) votes[k] = rv[k].order; }
  return {
    t: 'state', v: 1, code: H.code, phase: H.phase, round: H.round,
    taken: Object.keys(H.claims), online: Object.keys(hostOnlineKeys()), voted: Object.keys(rv),
    votes: votes, you: you, yourVote: you && rv[you] ? rv[you].order : null
  };
}
function hostBroadcast() { NET.conns.forEach(function (c) { if (c.open && c._cid) hostSend(c, stateFor(c)); }); }
function hostChanged() { hostSave(); hostSync(); hostBroadcast(); softRender(); }
function onHostConnsChange() { if (!H) return; hostSync(); hostBroadcast(); softRender(); }
function onGuestMsg(c, m) {
  if (!m || typeof m !== 'object' || typeof m.t !== 'string' || !H) return;
  if (m.t === 'ping') { hostSend(c, { t: 'pong' }); return; }
  if (m.t === 'pong') return;
  if (m.t === 'hello') {
    if (typeof m.cid !== 'string' || !CID_RE.test(m.cid)) return;
    NET.conns.slice().forEach(function (o) { if (o !== c && o._cid === m.cid) hostRemove(o); });   // el mismo móvil reconectando
    c._cid = m.cid;
    onHostConnsChange();
    return;
  }
  if (!c._cid) return;
  var mine = keyOfCid(c._cid);
  if (m.t === 'claim') {
    var k = m.key;
    if (!NAMEOF[k] || k === HOST.key) return;
    if (H.claims[k] && H.claims[k] !== c._cid && !(m.takeover === true && !cidOnline(H.claims[k]))) {
      hostSend(c, { t: 'err', code: 'taken', key: k }); hostSend(c, stateFor(c)); return;
    }
    if (mine && mine !== k) { delete H.claims[mine]; delete roundVotes()[mine]; }
    H.claims[k] = c._cid;
    hostChanged();
    return;
  }
  if (m.t === 'release') {
    if (mine) { delete H.claims[mine]; delete roundVotes()[mine]; hostChanged(); }
    return;
  }
  if (m.t === 'vote') {
    if (H.phase !== 'open') { hostSend(c, { t: 'err', code: 'closed', round: m.round }); return; }
    if (m.round !== H.round) { hostSend(c, { t: 'err', code: 'round', round: m.round }); return; }
    if (!mine) { hostSend(c, { t: 'err', code: 'noname' }); return; }
    if (!validOrder(m.order)) return;
    roundVotes()[mine] = { order: m.order.slice(), at: Date.now() };
    hostSend(c, { t: 'ack', round: H.round, order: m.order.slice() });
    hostChanged();
  }
}

/* ---------- invitado ---------- */
function arr(x) { return Array.isArray(x) ? x : []; }
function onHostMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'ping') { guestSend({ t: 'pong' }); return; }
  if (m.t === 'state') { onState(m); return; }
  if (m.t === 'ack') {
    if (S.pending && S.pending.round === m.round && validOrder(m.order) && sameSlots(S.pending.order, m.order)) setPending(null);
    if (validOrder(m.order) && m.round === S.room.round) S.mySent = m.order.slice();
    toast('Voto enviado.');
    updateLive();
    return;
  }
  if (m.t === 'err') {
    if (m.code === 'taken') toast((NAMEOF[m.key] || 'Ese nombre') + ' ya está elegido.');
    else if (m.code === 'closed') { setPending(null); toast('La votación ya estaba cerrada y tu voto no llegó a tiempo.'); }
    else if (m.code === 'round') setPending(null);
    else if (m.code === 'noname') toast('Elige tu nombre antes de votar.');
    updateLive();
  }
}
function onState(m) {
  var phase = m.phase === 'open' || m.phase === 'results' ? m.phase : 'closed';
  var round = typeof m.round === 'number' && m.round >= 1 ? Math.floor(m.round) : 1;
  var first = !S.hasState, prev = S.room.round;
  applyRoom(phase, round);
  if (!first && round > prev) toast('Vilaboa ha abierto la sala ' + round + '.');
  S.claims = {}; arr(m.taken).forEach(function (k) { if (NAMEOF[k] && k !== HOST.key) S.claims[k] = true; });
  S.online = {}; arr(m.online).forEach(function (k) { if (NAMEOF[k]) S.online[k] = true; });
  S.voted = {}; arr(m.voted).forEach(function (k) { if (NAMEOF[k]) S.voted[k] = true; });
  S.votes = null;
  if (phase === 'results' && m.votes && typeof m.votes === 'object') {
    S.votes = {};
    for (var k in m.votes) if (NAMEOF[k] && validOrder(m.votes[k])) S.votes[k] = { order: m.votes[k].slice() };
  }
  S.myKey = NAMEOF[m.you] && m.you !== HOST.key ? m.you : null;
  S.mySent = validOrder(m.yourVote) ? m.yourVote.slice() : null;
  S.hasState = true;
  // un voto que se quedó en este móvil mientras no había conexión
  var p = S.pending;
  if (p) {
    if (S.mySent && p.round === round && sameSlots(S.mySent, p.order)) setPending(null);
    else if (p.round !== round || phase !== 'open') {
      if (p.round === round && phase === 'results') toast('La votación se cerró antes de que llegara tu voto.');
      setPending(null);
    } else if (S.myKey && Date.now() - S.pendingSentAt > 2500) {
      if (guestSend({ t: 'vote', round: p.round, order: p.order })) S.pendingSentAt = Date.now();
    }
  }
  softRender();
}

/* ---------- acciones ---------- */
function claimName(key, takeover) {
  S.armTake = '';
  if (S.mode !== 'guest') return;
  if (!guestSend({ t: 'claim', key: key, takeover: !!takeover })) toast('Sin conexión con el móvil de Vilaboa. Prueba en unos segundos.');
}
function freeName(key) {
  S.armFree = ''; S.armChange = false;
  if (S.mode === 'host') {
    if (!NAMEOF[key] || key === HOST.key) return;
    delete H.claims[key]; delete roundVotes()[key];
    hostChanged();
    return;
  }
  if (!guestSend({ t: 'release' })) { toast('Sin conexión ahora mismo. Prueba en unos segundos.'); renderHeader(); }
}
function submitVote() {
  if (!S.myKey || S.room.phase !== 'open' || placedCount(S.draft.slots) < N) return;
  var order = S.draft.slots.slice();
  flushSave();
  if (S.mode === 'host') {
    roundVotes()[HOST.key] = { order: order, at: Date.now() };
    hostChanged();
    toast('Voto enviado.');
    return;
  }
  setPending({ round: S.room.round, order: order });
  if (guestSend({ t: 'vote', round: S.room.round, order: order })) S.pendingSentAt = Date.now();
  else toast('Sin conexión ahora mismo. Tu voto se enviará solo al reconectar.');
  updateLive();
}
function openRoom() { H.phase = 'open'; hostChanged(); keepAwake(); }
function toResults() { S.armResults = false; H.phase = 'results'; hostChanged(); }
function backToVote() { H.phase = 'open'; hostChanged(); }
function newRoom() { S.armNew = false; H.round += 1; H.phase = 'open'; hostChanged(); }

/* ---------- pantalla encendida en el anfitrión ---------- */
var wakeLock = null;
function keepAwake() {
  if (S.mode !== 'host' || wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  navigator.wakeLock.request('screen').then(function (l) {
    wakeLock = l;
    l.addEventListener('release', function () { wakeLock = null; });
  }).catch(function () {});
}
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') keepAwake(); });

/* ---------- arranque ---------- */
function readCode() {
  var m = /[?&]sala=([A-Za-z0-9]{4,8})(?:&|$)/.exec(location.search);
  return m ? m[1].toUpperCase() : null;
}
function roomLink() { return location.origin + location.pathname + '?sala=' + S.code; }
function startHost(h) {
  H = h; S.mode = 'host'; S.code = H.code;
  setPending(null);
  hostSync();
  netStart('host', H.code);
  softRender();
  keepAwake();
}
function startGuest(code) {
  S.mode = 'guest'; S.code = code;
  var p = lsGet(pendKey());
  S.pending = p && typeof p.round === 'number' && validOrder(p.order) ? p : null;
  resetDraft();
  netStart('guest', code);
  softRender();
}
function createRoom() {
  var h = sanitizeHost({ code: rid(5, CODE_ABC), phase: 'closed', round: 1 });
  H = h; hostSave();
  try { history.replaceState(null, '', location.pathname + '?sala=' + h.code); } catch (e) {}
  startHost(h);
}
function boot() {
  S.cid = lsGet('podio:cid');
  if (typeof S.cid !== 'string' || !CID_RE.test(S.cid)) { S.cid = rid(16); lsSet('podio:cid', S.cid); }
  var code = readCode();
  if (!code) { S.mode = 'landing'; softRender(); return; }
  var h = hostLoad(code);
  if (h) startHost(h); else startGuest(code);
}
