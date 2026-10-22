/* ---------- board markup ---------- */
var TICK = '<svg class="tick" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function tokenHTML(c, o) {
  o = o || {};
  var label = 'Caja ' + c + (o.place ? ', en el puesto ' + o.place : ', sin colocar');
  var inner = '<span class="ring"></span><span class="hole"><b>' + c + '</b></span>';
  if (o.static) return '<span class="token static" style="--c:var(--c' + c + ')" role="img" aria-label="' + label + '">' + inner + '</span>';
  return '<button type="button" class="token" data-caja="' + c + '" style="--c:var(--c' + c + ')" aria-label="' + label + '">' + inner + '</button>';
}
function stageHTML(slots, o) {
  o = o || {};
  function col(p) {
    var c = slots[p - 1] || 0, inner;
    if (c) inner = tokenHTML(c, { place: p, static: !o.interactive });
    else if (o.interactive) inner = '<button type="button" class="slot-btn" data-place="' + p + '" aria-label="Puesto ' + p + ', vacío"></button>';
    else inner = '<span class="slot-btn" aria-hidden="true"></span>';
    return '<div class="col"><div class="slot' + (c ? ' full' : '') + '" data-place="' + p + '">' + inner + '</div>' +
      '<div class="step s' + p + '"><span class="ord">' + p + '<i>º</i></span>' + (c ? '<span class="cap">Caja ' + c + '</span>' : '') + '</div></div>';
  }
  return '<div class="stage' + (o.dim ? ' dim' : '') + '" id="' + (o.id || 'stage') + '" role="group" aria-label="Podio">' +
    '<div class="tier">' + col(2) + col(1) + col(3) + '</div><div class="floor"></div><div class="tier">' + col(4) + col(5) + col(6) + '</div></div>';
}
function trayHTML(slots) {
  var h = '';
  for (var c = 1; c <= N; c++) {
    var at = slots.indexOf(c);
    h += '<div class="ti">' + (at < 0 ? tokenHTML(c) : '<span class="ghostring" aria-hidden="true">' + (at + 1) + 'º</span>') + '<span class="cap">Caja ' + c + '</span></div>';
  }
  return h;
}
function boardInner(slots) {
  return stageHTML(slots, { interactive: true }) +
    '<div class="trayhead"><h2>Tus cajas</h2><span>' + placedCount(slots) + ' de ' + N + ' en el podio</span></div>' +
    '<div class="tray" id="tray">' + trayHTML(slots) + '</div>';
}
function notesHTML() {
  var h = '<section class="notes"><div><h2>Tus notas</h2><p class="lead">' +
    'Solo las ves tú: se guardan en este móvil y no se envían a nadie.' + '</p></div>';
  for (var c = 1; c <= N; c++) {
    h += '<div class="note"><span class="cj" style="--c:var(--c' + c + ')" aria-hidden="true">' + c + '</span><div>' +
      '<label for="note' + c + '">Caja ' + c + '</label>' +
      '<textarea id="note' + c + '" data-note="' + c + '" rows="2" maxlength="' + NOTE_MAX + '" placeholder="¿Qué tal sabía?"></textarea></div></div>';
  }
  return h + '</section>';
}

/* ---------- board updates (local changes only, never from db snapshots) ---------- */
function updateBoard(landed) {
  var b = document.getElementById('board');
  if (!b) return;
  var ae = document.activeElement, sig = null;
  if (ae && ae.closest && ae.closest('#board')) sig = ae.classList.contains('slot-btn') ? '.slot-btn[data-place="' + ae.dataset.place + '"]' : (ae.dataset && ae.dataset.caja ? '.token[data-caja="' + ae.dataset.caja + '"]' : null);
  b.innerHTML = boardInner(S.draft.slots);
  b.classList.toggle('armed', !!S.sel);
  if (S.sel) { var s = b.querySelector('.token[data-caja="' + S.sel + '"]'); if (s) s.classList.add('sel'); }
  if (landed) { var l = b.querySelector('.token[data-caja="' + landed + '"]'); if (l) l.classList.add('landed'); }
  if (sig) { var f = b.querySelector(sig) || b.querySelector('.token[data-caja="' + (landed || '') + '"]'); if (f) f.focus({ preventScroll: true }); }
  updateSend();
}
function commit(slots, landed) {
  S.draft.slots = slots; S.sel = 0;
  queueSave();
  updateBoard(landed);
}
function tapToken(c) {
  if (S.sel && S.sel !== c) {
    var at = S.draft.slots.indexOf(c);
    if (at >= 0) return commit(placeToken(S.draft.slots, S.sel, at), S.sel);
    S.sel = c;
    return updateBoard();
  }
  S.sel = S.sel === c ? 0 : c;
  updateBoard();
}
function tapSlot(p) { if (S.sel) commit(placeToken(S.draft.slots, S.sel, p - 1), S.sel); }
function tapTray() { if (S.sel && S.draft.slots.indexOf(S.sel) >= 0) commit(returnToken(S.draft.slots, S.sel), 0); }

function fillNotes() {
  document.querySelectorAll('textarea[data-note]').forEach(function (t) {
    var v = S.draft.notes[t.dataset.note] || '';
    if (v && !t.value && document.activeElement !== t) t.value = v;
  });
}
function onNoteInput(t) {
  var c = t.dataset.note, v = t.value.slice(0, NOTE_MAX);
  if (v) S.draft.notes[c] = v; else delete S.draft.notes[c];
  queueSave();
}
/* ---------- drag with the finger (pointer events) ---------- */
var drag = null, suppressClickUntil = 0;
function onPointerDown(e) {
  if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  var t = e.target.closest ? e.target.closest('#board .token[data-caja]') : null;
  if (!t) return;
  drag = { id: e.pointerId, caja: +t.dataset.caja, el: t, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
    active: false, lift: e.pointerType === 'mouse' ? 0 : 46, ghost: null, half: 0, over: null, raf: 0 };
  try { t.setPointerCapture(e.pointerId); } catch (_) {}
}
function startDrag() {
  drag.active = true; S.sel = 0;
  drag.el.classList.remove('sel');
  drag.el.classList.add('dragging');
  var g = document.createElement('div');
  g.className = 'ghost';
  g.innerHTML = tokenHTML(drag.caja, { static: true });
  document.body.appendChild(g);
  drag.ghost = g; drag.half = g.offsetWidth / 2;
  document.getElementById('board').classList.add('armed');
  drag.raf = requestAnimationFrame(edgeLoop);
}
function dropTarget() {
  var el = document.elementFromPoint(drag.x, drag.y - drag.lift);
  if (!el || !el.closest) return null;
  var tray = el.closest('#tray');
  if (tray) return { type: 'tray', node: tray };
  var col = el.closest('#board .col');
  if (col) { var sl = col.querySelector('.slot'); return { type: 'slot', place: +sl.dataset.place, node: sl }; }
  return null;
}
function moveGhost() {
  if (!drag || !drag.ghost) return;
  drag.ghost.style.transform = 'translate3d(' + (drag.x - drag.half) + 'px,' + (drag.y - drag.half - drag.lift) + 'px,0)';
  var t = dropTarget(), node = t ? t.node : null;
  if (node !== drag.over) {
    if (drag.over) drag.over.classList.remove('over');
    if (node) node.classList.add('over');
    drag.over = node;
  }
}
function edgeLoop() {
  if (!drag || !drag.active) return;
  var vh = window.innerHeight, zone = 90, dy = 0;
  if (drag.y < zone) dy = -Math.ceil((zone - drag.y) / 5);
  else if (drag.y > vh - zone) dy = Math.ceil((drag.y - (vh - zone)) / 5);
  if (dy) { window.scrollBy(0, dy); moveGhost(); }
  drag.raf = requestAnimationFrame(edgeLoop);
}
function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.active) {
    if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 7) return;
    startDrag();
  }
  moveGhost();
  if (e.cancelable) e.preventDefault();
}
function endDrag() {
  if (!drag) return null;
  var d = drag;
  cancelAnimationFrame(d.raf);
  if (d.ghost) d.ghost.remove();
  if (d.over) d.over.classList.remove('over');
  d.el.classList.remove('dragging');
  try { d.el.releasePointerCapture(d.id); } catch (_) {}
  var b = document.getElementById('board');
  if (b) b.classList.toggle('armed', !!S.sel);
  drag = null;
  return d;
}
function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  var d = drag, tgt = d.active ? dropTarget() : null;
  endDrag();
  if (!d.active) return;
  suppressClickUntil = Date.now() + 80;
  if (tgt && tgt.type === 'slot') commit(placeToken(S.draft.slots, d.caja, tgt.place - 1), d.caja);
  else if (tgt && tgt.type === 'tray' && S.draft.slots.indexOf(d.caja) >= 0) commit(returnToken(S.draft.slots, d.caja), 0);
  else updateBoard();
}
function onPointerCancel(e) {
  if (!drag || e.pointerId !== drag.id) return;
  var was = drag.active;
  endDrag();
  if (was) updateBoard();
}
