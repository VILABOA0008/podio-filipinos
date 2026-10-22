'use strict';
/* Conexión entre móviles (PeerJS / WebRTC).
   El móvil del anfitrión ES la sala: se registra con un id fijo derivado del código de sala
   y los invitados se conectan a él. Nada depende de que un evento llegue: un supervisor
   revisa cada segundo el enlace con el servidor, el objeto Peer y la conexión de datos,
   y repara lo que esté roto con esperas crecientes. Latidos cada 4 s detectan conexiones
   que se han muerto sin avisar (pantalla bloqueada, cambio de red). */

var PEER_OPTS = Object.assign({ debug: 0 }, window.PODIO_PEER || {});
var NET = {
  role: null, hostId: null, started: false, startAt: 0,
  peer: null, peerAt: 0, nextAt: 0, retry: 0, busy: false,
  conns: [],                                           // anfitrión: conexiones de invitados
  conn: null, connAt: 0, connNext: 0, connRetry: 0,    // invitado: conexión con el anfitrión
  lastHost: 0, lastPing: 0, hostMissing: false, everOnline: false,
  status: 'connecting', why: ''
};
var HEARTBEAT_MS = 4000, SILENT_MS = 13000, CONN_TIMEOUT_MS = 9000, PEER_TIMEOUT_MS = 15000;

function hostIdFor(code) { return 'podiofilipinos-' + String(code).toLowerCase(); }
function backoff(n) { return Math.min(8000, 600 * Math.pow(1.8, n)) + Math.random() * 400; }
function setNet(status, why) {
  why = why || '';
  if (NET.status === status && NET.why === why) return;
  NET.status = status; NET.why = why;
  if (typeof onNetChange === 'function') onNetChange();
}

function netStart(role, code) {
  if (NET.started) return;
  NET.started = true; NET.role = role; NET.hostId = hostIdFor(code); NET.startAt = Date.now();
  if (typeof Peer === 'undefined') { setNet('broken', 'nolib'); return; }
  createPeer();
  setInterval(supervise, 1000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') netKick(); });
  window.addEventListener('online', netKick);
  window.addEventListener('pageshow', function (e) { if (e.persisted) netKick(); });
  window.addEventListener('pagehide', function () {
    // libera el id en el servidor cuanto antes para que la sala se pueda reabrir al recargar
    if (NET.role === 'host') destroyPeer();
  });
}
// vuelta al primer plano o a la red: reintentar ya, sin esperas
function netKick() {
  NET.nextAt = 0; NET.retry = 0; NET.connNext = 0; NET.connRetry = 0;
  supervise();
}

/* ---------- objeto Peer (enlace con el servidor de señalización) ---------- */
function createPeer() {
  destroyPeer();
  var p;
  try { p = NET.role === 'host' ? new Peer(NET.hostId, PEER_OPTS) : new Peer(PEER_OPTS); }
  catch (e) { NET.nextAt = Date.now() + backoff(NET.retry++); refreshStatus(); return; }
  NET.peer = p; NET.peerAt = Date.now();
  p.on('open', function () {
    if (p !== NET.peer) return;
    NET.retry = 0; NET.busy = false;
    if (NET.role === 'host') NET.everOnline = true;
    refreshStatus();
    if (NET.role === 'guest') supervise();
  });
  p.on('connection', function (c) { if (p === NET.peer && NET.role === 'host') hostAccept(c); });
  p.on('disconnected', function () {
    if (p !== NET.peer) return;
    NET.nextAt = Math.max(NET.nextAt, Date.now() + 500);
    refreshStatus();
  });
  p.on('close', function () {
    if (p !== NET.peer) return;
    NET.peer = null; NET.nextAt = Date.now() + backoff(NET.retry++);
    refreshStatus();
  });
  p.on('error', function (e) { if (p === NET.peer) onPeerError(p, e); });
}
function destroyPeer() {
  var p = NET.peer;
  NET.peer = null;
  if (p) { try { p.destroy(); } catch (e) {} }
}
function onPeerError(p, e) {
  var t = e && e.type;
  if (t === 'peer-unavailable') {          // invitado: el móvil del anfitrión no está ahora mismo
    dropConn();
    NET.hostMissing = true;
    NET.connNext = Date.now() + Math.min(5000, backoff(NET.connRetry++));
    refreshStatus();
    return;
  }
  if (t === 'unavailable-id') {            // anfitrión: el servidor aún guarda nuestro id (recarga u otra pestaña)
    destroyPeer();
    NET.busy = true;
    NET.nextAt = Date.now() + 3000 + Math.random() * 1500;
    refreshStatus();
    return;
  }
  if (t === 'browser-incompatible') { destroyPeer(); NET.nextAt = Infinity; setNet('broken', 'browser'); return; }
  // network, server-error, socket-error, socket-closed, disconnected, webrtc...: el supervisor lo rehace
  if (p.destroyed) NET.peer = null;
  NET.nextAt = Date.now() + backoff(NET.retry++);
  refreshStatus();
}

/* ---------- supervisor ---------- */
function supervise() {
  if (!NET.started || NET.status === 'broken') return;
  var now = Date.now(), p = NET.peer;
  if (!p || p.destroyed) {
    if (now >= NET.nextAt) createPeer();
  } else if (p.disconnected) {
    if (now >= NET.nextAt) {
      NET.nextAt = now + backoff(NET.retry++);
      try { p.reconnect(); } catch (e) { destroyPeer(); }
    }
  } else if (!p.open && now - NET.peerAt > PEER_TIMEOUT_MS) {
    destroyPeer();
    NET.nextAt = now + backoff(NET.retry++);
  }
  if (NET.role === 'host') hostTick(now); else guestTick(now);
  refreshStatus();
}
function peerReady() { var p = NET.peer; return !!(p && p.open && !p.disconnected && !p.destroyed); }
function refreshStatus() {
  if (NET.status === 'broken') return;
  var now = Date.now(), slow = now - NET.startAt > 6000;
  if (NET.role === 'host') {
    if (peerReady()) setNet('online');
    else if (NET.everOnline || slow || NET.busy) setNet('reconnecting', NET.busy ? 'busy' : 'signal');
    else setNet('connecting', 'signal');
    return;
  }
  var c = NET.conn;
  if (c && c.open && now - NET.lastHost <= SILENT_MS) setNet('online');
  else if (!peerReady()) setNet(NET.everOnline ? 'reconnecting' : 'connecting', slow ? 'signal-slow' : 'signal');
  else if (NET.hostMissing) setNet(NET.everOnline ? 'reconnecting' : 'waiting', 'host');
  else setNet(NET.everOnline ? 'reconnecting' : 'connecting', '');
}

/* ---------- invitado ---------- */
function guestTick(now) {
  var c = NET.conn;
  if (c && c.open) {
    if (now - NET.lastHost > SILENT_MS) { dropConn(); NET.connNext = now; }       // anfitrión mudo: rehacer
    else if (now - NET.lastPing >= HEARTBEAT_MS) { NET.lastPing = now; guestSend({ t: 'ping' }); }
    return;
  }
  if (c) {                                                                         // conectando
    if (now - NET.connAt > CONN_TIMEOUT_MS) { dropConn(); NET.connNext = now + backoff(NET.connRetry++); }
    return;
  }
  if (peerReady() && now >= NET.connNext) openConn();
}
function openConn() {
  var c;
  try { c = NET.peer.connect(NET.hostId, { reliable: true, serialization: 'json' }); }
  catch (e) { c = null; }
  if (!c) { NET.connNext = Date.now() + backoff(NET.connRetry++); return; }
  NET.conn = c; NET.connAt = Date.now();
  c.on('open', function () {
    if (c !== NET.conn) { try { c.close(); } catch (e) {} return; }
    NET.connRetry = 0; NET.hostMissing = false; NET.everOnline = true;
    NET.lastHost = Date.now(); NET.lastPing = Date.now();
    guestSend({ t: 'hello', cid: S.cid, v: 1 });
    refreshStatus();
  });
  c.on('data', function (d) {
    if (c !== NET.conn) return;
    NET.lastHost = Date.now();
    if (typeof onHostMsg === 'function') onHostMsg(d);
  });
  c.on('close', function () {
    if (c !== NET.conn) return;
    NET.conn = null; NET.connNext = Date.now() + 400;
    refreshStatus();
  });
  c.on('error', function () {
    if (c !== NET.conn) return;
    dropConn(); NET.connNext = Date.now() + backoff(NET.connRetry++);
    refreshStatus();
  });
}
function dropConn() {
  var c = NET.conn;
  NET.conn = null;
  if (c) { try { c.close(); } catch (e) {} }
}
function guestSend(m) {
  var c = NET.conn;
  if (!c || !c.open) return false;
  try { c.send(m); return true; } catch (e) { return false; }
}

/* ---------- anfitrión ---------- */
function hostAccept(c) {
  c._at = Date.now(); c._seen = Date.now(); c._ping = 0; c._cid = null;
  NET.conns.push(c);
  c.on('open', function () { c._seen = Date.now(); });
  c.on('data', function (d) {
    if (window.PODIO_MUTE) return;                      // solo para pruebas: simula un anfitrión colgado
    c._seen = Date.now();
    if (typeof onGuestMsg === 'function') onGuestMsg(c, d);
  });
  c.on('close', function () { hostRemove(c); });
  c.on('error', function () { hostRemove(c); });
}
function hostRemove(c) {
  var i = NET.conns.indexOf(c);
  if (i < 0) return;
  NET.conns.splice(i, 1);
  try { c.close(); } catch (e) {}
  if (typeof onHostConnsChange === 'function') onHostConnsChange();
}
function hostSend(c, m) {
  if (!c || !c.open || window.PODIO_MUTE) return;
  try { c.send(m); } catch (e) {}
}
function hostTick(now) {
  NET.conns.slice().forEach(function (c) {
    if (!c.open && now - c._at > CONN_TIMEOUT_MS) hostRemove(c);           // nunca llegó a abrirse
    else if (c.open && now - c._seen > SILENT_MS) hostRemove(c);           // invitado mudo
    else if (c.open && now - c._ping >= HEARTBEAT_MS) { c._ping = now; hostSend(c, { t: 'ping' }); }
  });
}
