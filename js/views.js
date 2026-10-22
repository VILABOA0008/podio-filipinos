'use strict';
/* Pantallas y eventos. */
var CARET = '<svg class="caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var armT = 0, hdrCache = '';
function $(id) { return document.getElementById(id); }

function viewKey() {
  if (S.mode === 'landing') return 'landing';
  if (!S.hasState) return 'loading';
  if (S.room.phase === 'results') return 'results';
  if (!S.myKey) return 'picker';
  if (S.room.phase === 'open') return 'vote:' + S.room.round;
  return S.mode === 'host' ? 'ownerclosed' : 'wait';
}
function softRender() {
  renderHeader();
  var k = viewKey();
  if (k !== S.view) {
    if (drag) endDrag();
    S.view = k; S.sel = 0; S.resSig = '';
    renderMain();
  } else updateLive();
  updateBanner();
}
function onNetChange() {
  renderHeader();
  updateBanner();
  if (S.view === 'loading') updateLoading();
  updateSend();
}

/* ---------- cabecera, estado de conexión, avisos ---------- */
function guestCount() { return NET.conns.filter(function (c) { return c.open && c._cid; }).length; }
function netPill() {
  var st = NET.status;
  if (S.mode === 'guest') {
    if (st === 'online') return '<span class="net">Conectado</span>';
    if (st === 'broken') return '<span class="net bad">Sin conexión</span>';
    return '<span class="net off">' + (st === 'waiting' ? 'Esperando' : st === 'connecting' ? 'Conectando' : 'Reconectando') + '</span>';
  }
  if (S.mode === 'host') {
    if (st === 'online') { var n = guestCount(); return '<span class="net">' + n + (n === 1 ? ' conectado' : ' conectados') + '</span>'; }
    return '<span class="net ' + (st === 'broken' ? 'bad' : 'off') + '">' + (st === 'connecting' ? 'Abriendo' : 'Sin enlace') + '</span>';
  }
  return '';
}
function renderHeader() {
  var chips = netPill();
  if (S.hasState && S.room.phase !== 'closed') chips += '<span class="chip">Sala ' + S.room.round + '</span>';
  if (S.myKey) chips += '<span class="chip' + (S.mode === 'host' ? ' host' : '') + '">' + esc(NAMEOF[S.myKey]) + '</span>';
  if (S.myKey && S.mode === 'guest') chips += '<button type="button" class="linkbtn" data-act="change">' + (S.armChange ? 'Confirmar cambio' : 'Cambiar nombre') + '</button>';
  var html = '<div><h1>Podio de Filipinos</h1><p class="sub">Cata a ciegas de seis cajas</p></div><div class="chips">' + chips + '</div>';
  if (html !== hdrCache) { hdrCache = html; $('hdr').innerHTML = html; }
}
function updateBanner() {
  var b = $('banner'), msg = '', st = NET.status;
  if (S.mode === 'guest' && S.hasState && st !== 'online') {
    if (st === 'broken') msg = 'Este navegador no permite conectar móviles entre sí. Prueba con Chrome o Safari actualizados.';
    else if (NET.why === 'host') msg = 'El móvil de Vilaboa no responde (¿pantalla bloqueada o sin cobertura?). Reintentando cada pocos segundos. Tu podio y tus notas siguen guardados aquí.';
    else msg = 'Se ha cortado la conexión. Reconectando sola. Tu podio y tus notas siguen guardados en este móvil.';
  } else if (S.mode === 'host' && st !== 'online' && st !== 'connecting') {
    if (st === 'broken') msg = 'Este navegador no permite conectar móviles entre sí. Prueba con Chrome o Safari actualizados.';
    else if (NET.why === 'busy') msg = 'La sala parece abierta en otra pestaña, o todavía se está liberando tras recargar. Reintentando...';
    else msg = 'Sin conexión al servidor de enlace. Los que ya están dentro siguen conectados; los nuevos podrán entrar cuando vuelva. Reintentando...';
  }
  b.hidden = !msg;
  if (b.textContent !== msg) b.textContent = msg;
}
function loadingText() {
  var st = NET.status, why = NET.why;
  if (st === 'broken') return why === 'nolib' ? 'No se pudo cargar la parte de conexión. Recarga la página.' : 'Este navegador no permite conectar móviles entre sí. Prueba con Chrome o Safari actualizados.';
  if (st === 'waiting') return 'Esperando a Vilaboa. Su móvil tiene que tener la sala abierta; en cuanto aparezca, entras solo.';
  if (why === 'signal-slow') return 'No hay conexión a internet o al servidor de enlace. Reintentando...';
  return 'Conectando con la sala ' + esc(S.code) + '...';
}
function updateLoading() { var l = $('loadmsg'); if (l) l.innerHTML = loadingText(); }

/* ---------- invitar: enlace, copiar, compartir, QR ---------- */
function qrSVG(text) {
  try {
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return '<svg class="qr" viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" role="img" aria-label="Código QR con el enlace de la sala" shape-rendering="crispEdges">' +
      '<rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#13222C"/></svg>';
  } catch (e) { return ''; }
}
function shareHTML() {
  var link = roomLink();
  return '<div class="share"><div class="sharetext"><h2>Invita a tus amigos</h2>' +
    '<p>Que abran este enlace en su móvil o escaneen el código. No hace falta registrarse. Sala <b>' + esc(S.code) + '</b>.</p>' +
    '<p class="link">' + esc(link) + '</p><div class="sharebtns"><button type="button" class="btn" data-act="copy">Copiar enlace</button>' +
    (navigator.share ? '<button type="button" class="btn" data-act="share">Compartir</button>' : '') + '</div></div>' + qrSVG(link) + '</div>';
}
function copyLink() {
  var link = roomLink();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { toast('Enlace copiado.'); }, selectLink);
  else selectLink();
}
function selectLink() {
  var el = document.querySelector('.link');
  if (!el) return;
  var r = document.createRange(); r.selectNodeContents(el);
  var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  toast('Enlace seleccionado. Cópialo con el menú del móvil.');
}
function shareLink() {
  if (!navigator.share) return copyLink();
  navigator.share({ title: 'Podio de Filipinos', text: 'Entra en la sala de la cata', url: roomLink() }).catch(function () {});
}

/* ---------- pantallas ---------- */
function dotsHTML() {
  return PEOPLE.map(function (p) {
    var cls = S.claims[p.key] ? (S.online[p.key] ? ' in' : ' in away') : '';
    return '<span class="dot' + cls + '">' + esc(p.name) + '</span>';
  }).join('');
}
function namesHTML() {
  return PEOPLE.map(function (p) {
    var taken = !!S.claims[p.key], away = taken && !S.online[p.key];
    if (away) return '<button type="button" class="name away" data-act="take" data-key="' + p.key + '">' +
      '<span><span class="n">' + esc(p.name) + '</span><small>' + (S.armTake === p.key ? 'Toca otra vez para recuperarlo' : 'Sin conexión. ¿Eres tú?') + '</small></span></button>';
    return '<button type="button" class="name' + (taken ? ' taken' : '') + '" data-act="name" data-key="' + p.key + '"' + (taken ? ' disabled' : '') + '>' +
      '<span><span class="n">' + esc(p.name) + '</span>' + (taken ? '<small>ocupado</small>' : '') + '</span></button>';
  }).join('');
}
function landingHTML() {
  var h = lsGet('podio:host'), mine = h && h.code ? String(h.code).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
  var b = mine
    ? '<button type="button" class="btn primary big" data-act="resume">Volver a la sala ' + esc(mine) + '</button>' +
      '<button type="button" class="linkbtn" data-act="create">' + (S.armCreate ? 'Toca otra vez: se borra la sala ' + esc(mine) + ' y se crea otra' : 'Crear una sala nueva') + '</button>'
    : '<button type="button" class="btn primary big" data-act="create">Crear sala</button>';
  return stageHTML([0, 0, 0, 0, 0, 0], {}) +
    '<div class="card state"><h2>Crea la sala de la cata</h2>' +
    '<p>Tu móvil hace de sala: tus amigos entran con un enlace o un código QR, sin registrarse. Mantén esta página abierta y la pantalla encendida mientras dure la cata.</p>' +
    b + '</div><p class="hint">¿Te han pasado un enlace? Ábrelo tal cual y entrarás en esa sala.</p>';
}
function renderMain() {
  var k = S.view, m = $('main'), h = '';
  if (k === 'landing') h = landingHTML();
  else if (k === 'loading') {
    h = stageHTML([0, 0, 0, 0, 0, 0], { dim: true }) + '<p class="hint" id="loadmsg" role="status">' + loadingText() + '</p>';
  } else if (k === 'picker') {
    h = '<div class="card"><h2>¿Quién eres?</h2><p>Toca tu nombre. Cada nombre solo puede tenerlo una persona.</p><div class="names" id="names">' + namesHTML() + '</div></div>';
  } else if (k === 'wait') {
    h = '<div class="card state"><h2>Hola, ' + esc(NAMEOF[S.myKey]) + '</h2><p>Vilaboa todavía no ha abierto la sala. Esta pantalla se actualiza sola.</p>' +
      '<div class="dots" id="dots" aria-label="Quién está dentro">' + dotsHTML() + '</div></div>' + stageHTML([0, 0, 0, 0, 0, 0], { dim: true });
  } else if (k === 'ownerclosed') {
    h = shareHTML() +
      '<div class="card state"><h2>Sala cerrada</h2><p>Cuando estén todos dentro, abre la sala para empezar a votar.</p>' +
      '<div class="dots" id="dots" aria-label="Quién está dentro">' + dotsHTML() + '</div>' +
      '<button type="button" class="btn primary big" data-act="open">Abrir sala</button>' +
      '<p class="hostnote">Tu móvil es la sala: deja esta página abierta y la pantalla encendida hasta que acabéis. Si se corta algo, todos se reconectan solos.</p></div>';
  } else if (k.indexOf('vote') === 0) {
    h = '<div class="board" id="board">' + boardInner(S.draft.slots) + '</div>' +
      '<div class="sendrow"><button type="button" id="send" class="btn primary big" data-act="send"></button><p id="hint" class="hint"></p><p id="progress" class="hint"></p></div>' +
      notesHTML() + (S.mode === 'host' ? '<div class="ownerbar" id="ownerbar"></div>' : '');
  } else if (k === 'results') {
    h = '<div id="res"></div>' + (S.mode === 'host' ? '<div class="ownerbar" id="ownerbar"></div>' : '');
  }
  m.innerHTML = h;
  if (k.indexOf('vote') === 0) { fillNotes(); updateSend(); }
  updateLive();
}
function updateLive() {
  var k = S.view;
  if (k === 'picker') { if ($('names')) $('names').innerHTML = namesHTML(); }
  else if (k === 'wait' || k === 'ownerclosed') { if ($('dots')) $('dots').innerHTML = dotsHTML(); }
  else if (k.indexOf('vote') === 0) { updateSend(); updateProgress(); updateOwnerBar(); }
  else if (k === 'results') { updateResults(); updateOwnerBar(); }
  else if (k === 'loading') updateLoading();
}
function votedCount() { return ALL.filter(function (p) { return S.voted[p.key]; }).length; }
function pendingVoters() { return ALL.filter(function (p) { return (p.key === HOST.key || S.claims[p.key]) && !S.voted[p.key]; }); }
function updateProgress() {
  var p = $('progress');
  if (p) p.textContent = S.mode === 'host' ? '' : votedCount() + ' de ' + ALL.length + ' han votado.';
}
function updateSend() {
  var btn = $('send'), hint = $('hint');
  if (!btn || !hint) return;
  var placed = placedCount(S.draft.slots), left = N - placed, mine = S.mySent;
  var pend = S.pending && S.pending.round === S.room.round ? S.pending : null;
  btn.classList.remove('sent');
  if (placed < N) {
    btn.disabled = true; btn.textContent = 'Faltan ' + left + (left === 1 ? ' caja' : ' cajas');
    hint.textContent = mine ? 'Tu voto anterior sigue enviado hasta que lo cambies.' : 'Arrastra cada caja a su puesto, o toca una caja y luego un puesto.';
  } else if (pend && sameSlots(pend.order, S.draft.slots)) {
    btn.disabled = true; btn.textContent = NET.status === 'online' ? 'Enviando...' : 'Se enviará al reconectar';
    hint.textContent = 'Tu voto está guardado en este móvil y llegará en cuanto haya conexión.';
  } else if (mine && sameSlots(mine, S.draft.slots)) {
    btn.disabled = true; btn.classList.add('sent'); btn.innerHTML = TICK + 'Voto enviado';
    hint.textContent = 'Puedes cambiarlo hasta que Vilaboa pase a resultados.';
  } else {
    btn.disabled = false; btn.textContent = mine ? 'Actualizar voto' : 'Enviar voto';
    hint.textContent = 'Ya están las seis. Cuando estés seguro, envía.';
  }
}

/* ---------- barra del anfitrión ---------- */
function rosterRow(p) {
  var st = S.voted[p.key] ? '<span class="st voted">votó</span>'
    : S.online[p.key] ? '<span class="st in">conectado</span>'
    : S.claims[p.key] ? '<span class="st off">desconectado</span>'
    : '<span class="st">sin entrar</span>';
  var act = '';
  if (p.key !== HOST.key && S.claims[p.key])
    act = '<button type="button" class="linkbtn" data-act="free" data-key="' + p.key + '">' + (S.armFree === p.key ? 'Confirmar' : 'Liberar') + '</button>';
  return '<div class="rr"><span class="who">' + esc(p.name) + (p.key === S.myKey ? ' (tú)' : '') + '</span><span class="who">' + st + act + '</span></div>';
}
function ownerBarHTML() {
  var inCount = ALL.filter(function (p) { return p.key === HOST.key || S.claims[p.key]; }).length, h = '';
  if (S.rosterOpen) h += '<div class="panel">' + shareHTML() + '<div class="roster">' + ALL.map(rosterRow).join('') + '</div></div>';
  if (S.armNew) h += '<p class="foot barnote">Empieza la sala ' + (S.room.round + 1) + ' con el podio vacío. Los votos de esta sala se quedan guardados.</p>';
  if (S.armResults) h += '<p class="foot barnote">Aún no han votado: ' + joinNames(pendingVoters().map(function (p) { return p.name; })) + '.</p>';
  h += '<div class="row"><button type="button" class="count" data-act="roster" aria-expanded="' + S.rosterOpen + '">' + CARET +
    '<span>' + votedCount() + ' de ' + ALL.length + ' han votado<small>' + inCount + ' dentro. Toca para invitar o ver quién.</small></span></button>' +
    '<button type="button" class="btn' + (S.armNew ? ' armed' : '') + '" data-act="new">' + (S.armNew ? 'Confirmar sala ' + (S.room.round + 1) : 'Nueva sala') + '</button></div>' +
    (S.room.phase === 'open'
      ? '<button type="button" class="btn primary' + (S.armResults ? ' armed' : '') + '" data-act="results">' + (S.armResults ? 'Pasar igualmente' : 'Pasar a resultados') + '</button>'
      : '<button type="button" class="btn primary" data-act="back">Volver a votar</button>');
  return h;
}
function updateOwnerBar() {
  var el = $('ownerbar');
  if (!el || S.mode !== 'host') return;
  var html = ownerBarHTML();
  if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; }
}
function arm(prop, val) {
  S[prop] = val;
  updateOwnerBar(); renderHeader();
  if (S.view === 'landing') renderMain(); else if (S.view === 'picker') updateLive();
  clearTimeout(armT);
  armT = setTimeout(function () {
    S.armNew = false; S.armFree = ''; S.armChange = false; S.armResults = false; S.armCreate = false; S.armTake = '';
    updateOwnerBar(); renderHeader();
    if (S.view === 'landing') renderMain(); else if (S.view === 'picker') updateLive();
  }, 4500);
}

/* ---------- resultados ---------- */
function prodOf(c) { var k = S.reveal && S.reveal[c]; return k ? PRODUCT[k] : null; }
function boxLabel(c) {
  var p = prodOf(c);
  if (!p) return 'Caja ' + c;
  return '<span class="bx"><b>' + esc(p.name) + '</b><small>' + esc(p.store) + ', caja ' + c + '</small></span>';
}
function revealEditorHTML() {
  var rows = '';
  for (var c = 1; c <= N; c++) {
    var cur = (S.reveal && S.reveal[c]) || '';
    rows += '<div class="rv"><span class="cj" style="--c:var(--c' + c + ')" aria-hidden="true">' + c + '</span>' +
      '<label for="rv' + c + '">Caja ' + c + '</label><select id="rv' + c + '" data-reveal="' + c + '">' +
      '<option value="">Sin desvelar</option>' +
      PRODUCTS.map(function (p) { return '<option value="' + p.key + '"' + (cur === p.key ? ' selected' : '') + '>' + esc(p.store) + ': ' + esc(p.name) + '</option>'; }).join('') +
      '</select></div>';
  }
  return '<section class="card sec reveal"><h2>¿Qué había en cada caja?</h2>' +
    '<p>Lo ven todos en cuanto lo eliges. Si pones un súper que ya estaba en otra caja, se intercambian.</p>' + rows + '</section>';
}
function resultsHTML() {
  var voters = ALL.filter(function (p) { return S.votes && S.votes[p.key]; });
  var h = '<div class="res"><div><h2>Resultados de la sala ' + S.room.round + '</h2><p class="foot">' + voters.length + ' de ' + ALL.length + ' han votado.</p></div>';
  if (S.mode === 'host') h += revealEditorHTML();
  if (!voters.length) return h + '<div class="card"><h2>Nadie votó en esta sala</h2><p>' + (S.mode === 'host' ? 'Puedes volver a abrir la votación con «Volver a votar».' : 'Vilaboa puede volver a abrir la votación.') + '</p></div></div>';
  var stats = computeStats(voters.map(function (p) { return S.votes[p.key].order; }));
  var byMean = rankRows(stats, 'mean'), rows = S.sort === 'mode' ? rankRows(stats, 'mode') : byMean;
  h += '<section class="sec"><h2>Podio del grupo</h2>' + stageHTML(byMean.map(function (r) { return r.caja; }), { id: 'gstage', label: function (c) { var p = prodOf(c); return p ? p.store : 'Caja ' + c; } }) +
    '<p class="foot">Ordenado por la media. Si empatan, decide la moda y después el número de caja.</p></section>';
  h += '<section class="sec"><h2>Ranking</h2><div class="seg" role="group" aria-label="Ordenar por">' +
    '<button type="button" data-act="sort" data-by="mean" aria-pressed="' + (S.sort !== 'mode') + '">Por media</button>' +
    '<button type="button" data-act="sort" data-by="mode" aria-pressed="' + (S.sort === 'mode') + '">Por moda</button></div>' +
    '<div class="scroll"><table class="tbl"><thead><tr><th>Puesto</th><th>Caja</th><th class="num">Media</th><th>Moda</th></tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr' + (r.rank === 1 ? ' class="win"' : '') + '><td class="rank">' + r.rank + 'º</td>' +
        '<td><span class="boxcell"><span class="cj" style="--c:var(--c' + r.caja + ')">' + r.caja + '</span>' + boxLabel(r.caja) + '</span></td>' +
        '<td class="num">' + fmtMean(r.mean) + '</td><td class="mode' + (r.modes.length ? '' : ' muted') + '">' + modeTxt(r.modes) + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<p class="foot"><b>Media</b>: el puesto medio que le dieron. Cuanto más bajo, mejor. <b>Moda</b>: el puesto que más se repite. Aparece «-» si ninguno se repite.</p>' +
    (S.mode !== 'host' && !Object.keys(S.reveal || {}).length ? '<p class="foot">Vilaboa todavía no ha desvelado qué había en cada caja. Aparecerá aquí en cuanto lo haga.</p>' : '') + '</section>';
  h += '<section class="sec"><h2>Qué votó cada uno</h2><div class="scroll"><table class="tbl vt"><thead><tr><th>Quién</th>' +
    [1, 2, 3, 4, 5, 6].map(function (p) { return '<th class="pl">' + p + 'º</th>'; }).join('') + '</tr></thead><tbody>' +
    ALL.map(function (p) {
      var v = S.votes[p.key];
      if (!v) return '<tr class="novote"><td class="nm">' + esc(p.name) + '</td><td colspan="6">sin voto</td></tr>';
      return '<tr><td class="nm">' + esc(p.name) + '</td>' + v.order.map(function (c) {
        return '<td class="pc"><span class="cj" style="--c:var(--c' + c + ')">' + c + '</span></td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div></section>';
  var notes = [];
  for (var c = 1; c <= N; c++) if (S.draft.notes[c]) notes.push('<li><span class="cj" style="--c:var(--c' + c + ')">' + c + '</span><span>' + (prodOf(c) ? '<b>' + esc(prodOf(c).name) + ' (' + esc(prodOf(c).store) + ')</b><br>' : '') + esc(S.draft.notes[c]) + '</span></li>');
  if (notes.length) h += '<details class="mynotes"><summary>Tus notas de esta sala</summary><ul>' + notes.join('') + '</ul></details>';
  return h + '</div>';
}
function updateResults() {
  var el = $('res');
  if (!el) return;
  var sig = JSON.stringify([S.sort, S.room.round, S.votes, S.draft.notes, S.mode, S.reveal]);
  if (sig === S.resSig) return;
  var open = el.querySelector('.mynotes[open]');
  S.resSig = sig;
  el.innerHTML = resultsHTML();
  if (open) { var d = el.querySelector('.mynotes'); if (d) d.open = true; }
}

/* ---------- avisos breves ---------- */
var toastTimer = 0;
function toast(msg) {
  var t = $('toast');
  if (!t) return;
  t.textContent = msg;
  var bar = $('ownerbar');
  t.style.bottom = bar ? (bar.offsetHeight + 12) + 'px' : '';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3600);
}

/* ---------- eventos ---------- */
function act(name, a) {
  var key = a.dataset.key;
  keepAwake();
  if (name === 'name') claimName(key);
  else if (name === 'send') submitVote();
  else if (name === 'open') openRoom();
  else if (name === 'results') { if (pendingVoters().length && !S.armResults) arm('armResults', true); else toResults(); }
  else if (name === 'back') backToVote();
  else if (name === 'roster') { S.rosterOpen = !S.rosterOpen; updateOwnerBar(); }
  else if (name === 'sort') { S.sort = a.dataset.by === 'mode' ? 'mode' : 'mean'; updateResults(); }
  else if (name === 'new') { if (S.armNew) newRoom(); else arm('armNew', true); }
  else if (name === 'free') { if (S.armFree === key) freeName(key); else arm('armFree', key); }
  else if (name === 'change') { if (S.armChange) freeName(S.myKey); else arm('armChange', true); }
  else if (name === 'take') { if (S.armTake === key) claimName(key, true); else arm('armTake', key); }
  else if (name === 'copy') copyLink();
  else if (name === 'share') shareLink();
  else if (name === 'resume') { var h = lsGet('podio:host'); if (h) { var hh = sanitizeHost(h); try { history.replaceState(null, '', location.pathname + '?sala=' + hh.code); } catch (e) {} startHost(hh); } }
  else if (name === 'create') { if (lsGet('podio:host') && !S.armCreate) arm('armCreate', true); else { S.armCreate = false; createRoom(); } }
}
document.addEventListener('click', function (e) {
  if (Date.now() < suppressClickUntil) { e.preventDefault(); return; }
  var t = e.target;
  if (!t || !t.closest) return;
  var tok = t.closest('#board .token[data-caja]');
  if (tok) return tapToken(+tok.dataset.caja);
  var sb = t.closest('#board .slot-btn[data-place]');
  if (sb) return tapSlot(+sb.dataset.place);
  if (t.closest('#tray')) return tapTray();
  var a = t.closest('[data-act]');
  if (a && !a.disabled) act(a.dataset.act, a);
});
document.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove, { passive: false });
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerCancel);
document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('#board .token')) e.preventDefault(); });
document.addEventListener('change', function (e) { var t = e.target; if (t && t.matches && t.matches('select[data-reveal]')) setReveal(+t.dataset.reveal, t.value); });
document.addEventListener('input', function (e) { var t = e.target; if (t && t.matches && t.matches('textarea[data-note]')) onNoteInput(t); });
document.addEventListener('focusout', function (e) { var t = e.target; if (t && t.matches && t.matches('textarea[data-note]')) flushSave(); });
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSave(); });
window.addEventListener('pagehide', flushSave);
boot();
