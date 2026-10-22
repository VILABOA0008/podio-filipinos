const assert = require('assert');
const L = require('../js/logic.js');

// validOrder / cleanSlots / cleanNotes
assert(L.validOrder([1,2,3,4,5,6]) && L.validOrder([6,5,4,3,2,1]));
assert(!L.validOrder([1,2,3,4,5]) && !L.validOrder([1,1,3,4,5,6]) && !L.validOrder([0,1,2,3,4,5]) && !L.validOrder([1,2,3,4,5,7]) && !L.validOrder('x') && !L.validOrder([1,2,3,4,5,'6']) && !L.validOrder([1,2,3,4,5,6.5]));
assert.deepStrictEqual(L.cleanSlots([3,3,0,9,'a',2]), [3,0,0,0,0,2]);
assert.deepStrictEqual(L.cleanSlots(null), [0,0,0,0,0,0]);
assert.deepStrictEqual(L.cleanNotes({1:'a',2:'',3:5,7:'x'}), {1:'a'});
assert.strictEqual(Object.keys(L.cleanNotes({1:'x'.repeat(999)}))[0], '1');
assert.strictEqual(L.cleanNotes({1:'x'.repeat(999)})[1].length, 280);

// placeToken: tray -> empty, tray -> occupied (occupant returns to tray), slot -> slot swap, slot -> same slot
let s = [0,0,0,0,0,0];
s = L.placeToken(s, 3, 0);            assert.deepStrictEqual(s, [3,0,0,0,0,0]);
s = L.placeToken(s, 5, 0);            assert.deepStrictEqual(s, [5,0,0,0,0,0]);   // 3 goes back to the tray
s = L.placeToken(s, 3, 2);            assert.deepStrictEqual(s, [5,0,3,0,0,0]);
s = L.placeToken(s, 5, 2);            assert.deepStrictEqual(s, [3,0,5,0,0,0]);   // swap
s = L.placeToken(s, 5, 2);            assert.deepStrictEqual(s, [3,0,5,0,0,0]);   // same slot: no change
s = L.placeToken(s, 3, 1);            assert.deepStrictEqual(s, [0,3,5,0,0,0]);   // move to an empty slot
s = L.returnToken(s, 5);              assert.deepStrictEqual(s, [0,3,0,0,0,0]);
assert.strictEqual(L.placedCount(s), 1);
assert(L.sameSlots([1,2],[1,2]) && !L.sameSlots([1,2],[2,1]));

// computeStats / rankRows with a hand-checked example (3 voters)
// order[i] = caja at place i+1
const orders = [
  [1,2,3,4,5,6],
  [1,3,2,4,6,5],
  [2,1,3,5,4,6],
];
const st = L.computeStats(orders);
const by = c => st.find(r => r.caja === c);
assert.deepStrictEqual(by(1).pos, [1,1,2]);  assert.strictEqual(by(1).sum, 4);  assert.deepStrictEqual(by(1).modes, [1]);
assert.deepStrictEqual(by(2).pos, [2,3,1]);  assert.strictEqual(by(2).sum, 6);  assert.deepStrictEqual(by(2).modes, []);   // all different: no mode
assert.deepStrictEqual(by(3).pos, [3,2,3]);  assert.strictEqual(by(3).sum, 8);  assert.deepStrictEqual(by(3).modes, [3]);
assert.deepStrictEqual(by(4).pos, [4,4,5]);  assert.deepStrictEqual(by(4).modes, [4]);
assert.deepStrictEqual(by(5).pos, [5,6,4]);  assert.deepStrictEqual(by(5).modes, []);
assert.deepStrictEqual(by(6).pos, [6,5,6]);  assert.deepStrictEqual(by(6).modes, [6]);
assert.strictEqual(L.fmtMean(by(1).mean), '1,33');
assert.strictEqual(L.fmtMean(by(2).mean), '2,00');

const rm = L.rankRows(st, 'mean');
assert.deepStrictEqual(rm.map(r => r.caja), [1,2,3,4,5,6].sort((a,b)=> by(a).sum-by(b).sum || a-b).length ? rm.map(r=>r.caja) : []);
assert.deepStrictEqual(rm.map(r => r.caja), [1,2,3,4,5,6]);   // sums 4,6,8,13,15,17
assert.deepStrictEqual(rm.map(r => r.rank), [1,2,3,4,5,6]);

// ties in the mean share the rank (competition ranking: 1,2,2,4)
const tie = L.computeStats([[1,2,3,4,5,6],[2,1,3,4,5,6]]);   // cajas 1 and 2 both sum 3
const rt = L.rankRows(tie, 'mean');
assert.deepStrictEqual(rt.map(r => r.rank), [1,1,3,4,5,6]);
assert.deepStrictEqual(rt.map(r => r.caja), [1,2,3,4,5,6]);

// a mode tie is reported with every tied place; the sort-by-mode key is the best tied place
const mt = L.computeStats([[1,2,3,4,5,6],[2,1,3,4,5,6],[1,2,3,4,5,6],[2,1,3,4,5,6]]);
assert.deepStrictEqual(mt.find(r=>r.caja===1).modes, [1,2]);
assert.strictEqual(L.modeTxt([1,2]), '1º y 2º');
assert.strictEqual(L.modeTxt([1,2,3]), '1º, 2º y 3º');
assert.strictEqual(L.modeTxt([]), '-');
const rmode = L.rankRows(st, 'mode');
assert.deepStrictEqual(rmode.map(r => r.caja), [1,3,4,6,2,5]);  // modes 1,3,4,6 first; cajas without mode by mean afterwards
assert.deepStrictEqual(rmode.map(r => r.rank), [1,2,3,4,5,6]);

// a single voter: no repeated positions, so no modes anywhere
const one = L.computeStats([[4,3,2,1,5,6]]);
assert(one.every(r => r.modes.length === 0));
assert.deepStrictEqual(L.rankRows(one,'mean').map(r=>r.caja), [4,3,2,1,5,6]);

// seven voters, same ballot: every box has a mode equal to its position
const seven = L.computeStats(Array(7).fill([6,5,4,3,2,1]));
assert.deepStrictEqual(L.rankRows(seven,'mean').map(r=>r.caja), [6,5,4,3,2,1]);
assert.strictEqual(seven.find(r=>r.caja===6).modeCount, 7);

assert.strictEqual(L.joinNames(['a']), 'a');
assert.strictEqual(L.joinNames(['a','b','c']), 'a, b y c');
// desvelar: cada súper en una sola caja, y elegir uno ya usado lo intercambia
assert.deepStrictEqual(L.cleanReveal({1:'lidl',2:'lidl',3:'nope',7:'froiz'}), {1:'lidl'});
let r = L.assignReveal({}, 1, 'mercadona');  assert.deepStrictEqual(r, {1:'mercadona'});
r = L.assignReveal(r, 2, 'lidl');             assert.deepStrictEqual(r, {1:'mercadona', 2:'lidl'});
r = L.assignReveal(r, 2, 'mercadona');        assert.deepStrictEqual(r, {1:'lidl', 2:'mercadona'});
r = L.assignReveal(r, 3, 'lidl');             assert.deepStrictEqual(r, {2:'mercadona', 3:'lidl'});
r = L.assignReveal(r, 2, '');                 assert.deepStrictEqual(r, {3:'lidl'});
r = L.assignReveal(r, 1, 'nope');             assert.deepStrictEqual(r, {3:'lidl'});
assert.strictEqual(L.PRODUCTS.map((p) => p.store).join(','), 'Auchan,Eroski,Mercadona,Carrefour,Lidl,Froiz');
console.log('logic tests passed');
