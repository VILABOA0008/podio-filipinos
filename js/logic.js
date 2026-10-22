'use strict';
/* ---------- constants ---------- */
var N = 6;
var HOST = { key: 'vilaboa', name: 'Vilaboa' };
var PEOPLE = [
  { key: 'skipy', name: 'Skipy' }, { key: 'adrian', name: 'Adrian' }, { key: 'saul', name: 'Saul' },
  { key: 'diana', name: 'Diana' }, { key: 'raquel', name: 'Raquel' }, { key: 'juan', name: 'Juan' }
];
var ALL = [HOST].concat(PEOPLE);
var NAMEOF = {};
ALL.forEach(function (p) { NAMEOF[p.key] = p.name; });
var NOTE_MAX = 280;

/* ---------- pure helpers (also loaded by the Node tests) ---------- */
function validOrder(o) {
  if (!Array.isArray(o) || o.length !== N) return false;
  var seen = {};
  for (var i = 0; i < N; i++) {
    var v = o[i];
    if (typeof v !== 'number' || v < 1 || v > N || v % 1 !== 0 || seen[v]) return false;
    seen[v] = 1;
  }
  return true;
}
function cleanSlots(s) {
  var out = [0, 0, 0, 0, 0, 0], seen = {};
  if (!Array.isArray(s)) return out;
  for (var i = 0; i < N; i++) {
    var v = s[i];
    if (typeof v === 'number' && v >= 1 && v <= N && v % 1 === 0 && !seen[v]) { out[i] = v; seen[v] = 1; }
  }
  return out;
}
function cleanNotes(n) {
  var out = {};
  if (!n || typeof n !== 'object') return out;
  for (var c = 1; c <= N; c++) {
    if (typeof n[c] === 'string' && n[c]) out[c] = n[c].slice(0, NOTE_MAX);
  }
  return out;
}
function placeToken(slots, caja, toIdx) {
  var s = slots.slice(), from = s.indexOf(caja), occ = s[toIdx] || 0;
  if (from === toIdx) return s;
  if (from >= 0) s[from] = occ;
  s[toIdx] = caja;
  return s;
}
function returnToken(slots, caja) {
  var s = slots.slice(), i = s.indexOf(caja);
  if (i >= 0) s[i] = 0;
  return s;
}
function sameSlots(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function placedCount(slots) { return slots.filter(function (v) { return v > 0; }).length; }

/* stats over valid orders: order[i] = caja put at place i+1 */
function computeStats(orders) {
  var rows = [];
  for (var c = 1; c <= N; c++) {
    var pos = orders.map(function (o) { return o.indexOf(c) + 1; });
    var n = pos.length, sum = pos.reduce(function (a, b) { return a + b; }, 0);
    var counts = {}, max = 0;
    pos.forEach(function (p) { counts[p] = (counts[p] || 0) + 1; if (counts[p] > max) max = counts[p]; });
    var modes = max > 1
      ? Object.keys(counts).filter(function (k) { return counts[k] === max; }).map(Number).sort(function (a, b) { return a - b; })
      : [];
    rows.push({ caja: c, n: n, sum: sum, mean: n ? sum / n : null, modes: modes, modeCount: max, pos: pos });
  }
  return rows;
}
function modeKey(r) { return r.modes.length ? r.modes[0] : 99; }
function rankRows(rows, by) {
  var arr = rows.slice();
  if (by === 'mode') {
    arr.sort(function (a, b) { return modeKey(a) - modeKey(b) || a.sum - b.sum || a.caja - b.caja; });
    return arr.map(function (r, i) { return Object.assign({}, r, { rank: i + 1 }); });
  }
  arr.sort(function (a, b) { return a.sum - b.sum || modeKey(a) - modeKey(b) || a.caja - b.caja; });
  return arr.map(function (r) {
    var better = rows.filter(function (x) { return x.sum < r.sum; }).length;
    return Object.assign({}, r, { rank: better + 1 });
  });
}
function fmtMean(x) { return x == null ? '-' : x.toFixed(2).replace('.', ','); }
function ordTxt(n) { return n + 'º'; }
function modeTxt(modes) {
  if (!modes.length) return '-';
  var t = modes.map(ordTxt);
  return t.length > 2 ? t.slice(0, -1).join(', ') + ' y ' + t[t.length - 1] : t.join(' y ');
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function joinNames(list) {
  if (list.length < 2) return list.join('');
  return list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1];
}
if (typeof module !== 'undefined') {
  module.exports = { validOrder: validOrder, cleanSlots: cleanSlots, cleanNotes: cleanNotes, placeToken: placeToken, returnToken: returnToken,
    sameSlots: sameSlots, placedCount: placedCount, computeStats: computeStats, rankRows: rankRows, fmtMean: fmtMean, modeTxt: modeTxt, joinNames: joinNames };
}
