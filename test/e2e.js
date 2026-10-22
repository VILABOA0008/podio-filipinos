// Prueba de extremo a extremo con WebRTC real entre varios "móviles" (contextos de navegador separados)
// y un servidor de señalización PeerJS local que se apaga y se vuelve a encender.
// Uso: cd test && npm install && node e2e.js     (PODIO_FONTS_DIR opcional para capturas con las fuentes reales)
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), SHOTS = path.join(__dirname, 'shots'), PEER_PORT = 9311, WEB_PORT = 8311;
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

// ---- servidor web estático
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const web = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(WEB_PORT);
const URL0 = `http://127.0.0.1:${WEB_PORT}/`;

// ---- servidor de señalización (proceso aparte para poder "cortarlo")
let peerProc = null;
function peerUp() {
  peerProc = spawn(process.execPath, ['-e', `require(${JSON.stringify(require.resolve('peer'))}).PeerServer({port:${PEER_PORT},path:'/',host:'0.0.0.0'})`], { stdio: 'ignore' });
  return wait(900);
}
function peerDown() { if (peerProc) { peerProc.kill('SIGKILL'); peerProc = null; } return wait(300); }

const PEER_CFG = { host: '127.0.0.1', port: PEER_PORT, path: '/', secure: false, key: 'peerjs', config: { iceServers: [] }, debug: 0 };
let browser;
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript((cfg) => { window.PODIO_PEER = cfg; }, PEER_CFG);
  const fontDir = process.env.PODIO_FONTS_DIR;
  await ctx.route('https://fonts.googleapis.com/**', (r) => fontDir
    ? r.fulfill({ contentType: 'text/css', body: '@font-face{font-family:"Lilita One";src:url(https://fonts.gstatic.com/l.woff2)}' + [400, 600, 800].map((w) => `@font-face{font-family:"Figtree";font-weight:${w};src:url(https://fonts.gstatic.com/f${w}.woff2)}`).join('') })
    : r.abort());
  await ctx.route('https://fonts.gstatic.com/**', (r) => {
    const u = r.request().url(), m = u.match(/\/(l|f(\d+))\.woff2$/);
    if (!fontDir || !m) return r.abort();
    const f = m[1] === 'l' ? path.join(fontDir, 'lilita-one/files/lilita-one-latin-400-normal.woff2') : path.join(fontDir, `figtree/files/figtree-latin-${m[2]}-normal.woff2`);
    r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(f) });
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(name + ': ' + e.message));
  page.devName = name;
  return page;
}
const st = (p, expr) => p.evaluate(expr);
const until = (p, fn, arg, timeout = 20000) => p.waitForFunction(fn, arg, { timeout, polling: 200 });
const tok = (c) => `#board .token[data-caja="${c}"]`, slot = (n) => `#board .slot[data-place="${n}"] .slot-btn`;
async function fill(p, order) { for (let i = 0; i < 6; i++) { await p.click(tok(order[i])); await p.click(slot(i + 1)); } }
async function shot(p, name, full) { await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full }); }

(async () => {
  browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
  await peerUp();

  // 1. el anfitrión crea la sala
  const host = await device('host');
  await host.goto(URL0); await until(host, () => S.view === 'landing');
  await shot(host, 'p01-landing');
  await host.click('[data-act="create"]');
  await until(host, () => S.view === 'ownerclosed' && NET.status === 'online');
  const code = await st(host, () => S.code);
  ok(/^[A-Z0-9]{5}$/.test(code) && host.url().includes('?sala=' + code), 'sala creada con código en la URL: ' + host.url());
  ok(await host.$('.qr'), 'QR visible');
  await shot(host, 'p02-host-closed');
  const LINK = URL0 + '?sala=' + code;
  log('sala ' + code);

  // 2. invitados en móviles distintos; carrera por el mismo nombre
  const diana = await device('diana'), juan = await device('juan'), saul = await device('saul');
  await Promise.all([diana, juan, saul].map((p) => p.goto(LINK)));
  await Promise.all([diana, juan, saul].map((p) => until(p, () => S.view === 'picker' && NET.status === 'online')));
  await shot(diana, 'p03-guest-picker');
  await Promise.all([juan.evaluate(() => claimName('raquel')), saul.evaluate(() => claimName('raquel'))]);
  await wait(800);
  const rq = await st(host, () => H.claims.raquel);
  const jk = await st(juan, () => S.myKey), sk = await st(saul, () => S.myKey);
  ok(!!rq && [jk, sk].filter((k) => k === 'raquel').length === 1, 'solo uno se queda con Raquel: ' + jk + '/' + sk);
  const loser = jk === 'raquel' ? saul : juan;
  await loser.evaluate(() => claimName('juan'));
  await diana.click('.name[data-key="diana"]');
  await until(diana, () => S.view === 'wait');
  await until(host, () => S.claims.diana && S.online.diana);
  ok(true, 'el anfitrión ve a Diana dentro y conectada');
  await shot(diana, 'p04-guest-wait');

  // 3. abrir sala, votar
  await host.click('[data-act="open"]');
  await Promise.all([diana, juan, saul].map((p) => until(p, () => S.view.indexOf('vote') === 0)));
  await fill(diana, [3, 1, 2, 6, 5, 4]);
  await diana.fill('#note3', 'la más crujiente');
  await diana.click('#send');
  await until(diana, () => S.mySent && !S.pending);
  ok(JSON.stringify(await st(host, () => H.votes[1].diana.order)) === '[3,1,2,6,5,4]', 'el voto de Diana llega al anfitrión');
  ok((await diana.textContent('#send')).includes('Voto enviado'), 'Diana ve su voto enviado');
  await shot(diana, 'p05-guest-voted');

  // 4. el invitado recarga: mismo nombre, mismo podio, mismas notas
  await diana.reload(); await until(diana, () => S.view.indexOf('vote') === 0 && NET.status === 'online');
  await wait(400);
  ok((await st(diana, () => S.myKey)) === 'diana', 'tras recargar sigue siendo Diana');
  ok((await diana.inputValue('#note3')) === 'la más crujiente', 'las notas siguen en el móvil');
  ok((await diana.textContent('#send')).includes('Voto enviado'), 'tras recargar, el voto aparece enviado');

  // 5. el anfitrión recarga: los invitados se reconectan solos y no se pierde nada
  log('recarga del anfitrión');
  await host.reload();
  await until(host, () => S.mode === 'host' && NET.status === 'online', null, 30000);
  const t0 = Date.now();
  await Promise.all([diana, juan, saul].map((p) => until(p, () => NET.status === 'online' && S.hasState, null, 40000)));
  log('reconectados en ' + (Date.now() - t0) + ' ms');
  await until(host, () => S.online.diana && S.online.raquel && S.online.juan, null, 20000);
  ok((await st(host, () => !!H.votes[1].diana)), 'el voto de Diana sobrevive a la recarga del anfitrión');

  // 6. se cae el servidor de señalización: las conexiones abiertas siguen; al volver entra gente nueva
  log('corte del servidor de enlace');
  await peerDown();
  await until(host, () => NET.status === 'reconnecting', null, 20000);
  await shot(host, 'p06-host-no-signal');
  ok(!(await host.isHidden('#banner')), 'el anfitrión ve el aviso de sin enlace');
  await saul.evaluate(() => { S.draft.slots = [1, 2, 3, 4, 5, 6]; updateBoard(); });
  await saul.click('#send');
  await until(host, () => S.voted.juan || S.voted.raquel, null, 10000);
  ok(true, 'con el servidor caído, los ya conectados siguen votando');
  await peerUp();
  await until(host, () => NET.status === 'online', null, 40000);
  const adrian = await device('adrian');
  await adrian.goto(LINK);
  await until(adrian, () => S.view === 'picker' && NET.status === 'online', null, 30000);
  await adrian.click('.name[data-key="adrian"]');
  await until(host, () => S.claims.adrian);
  ok(true, 'cuando vuelve el servidor, entra gente nueva');

  // 7. anfitrión "colgado" (no contesta): los invitados lo detectan y se reconectan al volver
  log('anfitrión mudo');
  await host.evaluate(() => { window.PODIO_MUTE = true; });
  await until(diana, () => NET.status !== 'online', null, 25000);
  await shot(diana, 'p07-guest-reconnecting');
  ok(!(await diana.isHidden('#banner')), 'Diana ve el aviso de reconexión');
  await host.evaluate(() => { window.PODIO_MUTE = false; });
  await until(diana, () => NET.status === 'online', null, 30000);
  ok(true, 'Diana vuelve sola cuando el anfitrión responde');

  // 8. voto con el anfitrión fuera: queda guardado y se entrega al volver
  log('anfitrión cerrado, voto en cola');
  const hostCtx = host.context();
  const hostState = await hostCtx.storageState();
  await hostCtx.close();
  await until(juan, () => NET.status !== 'online', null, 25000);
  const jk2 = await st(juan, () => S.myKey);
  await juan.evaluate(() => { S.draft.slots = [6, 5, 4, 3, 2, 1]; updateBoard(); });
  await juan.click('#send');
  ok((await juan.textContent('#send')).includes('Se enviará al reconectar'), 'el voto queda en cola: ' + (await juan.textContent('#send')));
  ok(!!(await st(juan, () => JSON.parse(localStorage.getItem('podio:pending:' + S.code)))), 'la cola se guarda en el móvil');
  await shot(juan, 'p08-guest-queued');
  await juan.reload();   // incluso recargando el invitado, la cola sigue
  const host2ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, storageState: hostState });
  await host2ctx.addInitScript((cfg) => { window.PODIO_PEER = cfg; }, PEER_CFG);
  await host2ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const host2 = await host2ctx.newPage(); host2.errors = []; host2.on('pageerror', (e) => host2.errors.push('host2: ' + e.message));
  await host2.goto(LINK);
  await until(host2, () => S.mode === 'host' && NET.status === 'online', null, 40000);
  await until(host2, (k) => H.votes[1][k] && H.votes[1][k].order.join('') === '654321', jk2, 40000);
  await until(juan, () => !S.pending && S.mySent, null, 20000);
  ok(true, 'el voto en cola llega cuando vuelve el anfitrión');

  // 9. resultados (con aviso porque falta gente), comprobación de la media
  await host2.evaluate(() => { S.draft.slots = [1, 3, 2, 4, 5, 6]; updateBoard(); });
  await host2.click('#send');
  await host2.click('[data-act="results"]');
  ok((await st(host2, () => H.phase)) === 'open', 'primer toque en resultados solo avisa');
  await host2.click('[data-act="results"]');
  await Promise.all([diana, juan, saul, adrian].map((p) => until(p, () => S.view === 'results')));
  const orders = await st(host2, () => Object.values(H.votes[1]).map((v) => v.order));
  const mean = (c) => orders.reduce((s, o) => s + o.indexOf(c) + 1, 0) / orders.length;
  const cells = await diana.$$eval('.tbl:not(.vt) tbody tr', (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.trim())));
  ok(cells.length === 6 && cells.every((r) => r[2] === mean(+r[1].match(/Caja (\d)/)[1]).toFixed(2).replace('.', ',')), 'medias correctas en el móvil de Diana');
  ok((await diana.textContent('.mynotes')).includes('la más crujiente'), 'Diana ve sus notas en resultados');
  await shot(diana, 'p09-results', true);

  // 9b. Diana cambia de navegador (p. ej. abre el enlace fuera de WhatsApp): recupera su nombre y su voto sigue
  await diana.context().close();
  await until(host2, () => !S.online.diana, null, 25000);
  const diana2 = await device('diana-otro-navegador');
  await diana2.goto(LINK); await until(diana2, () => S.view === 'results' && NET.status === 'online', null, 30000);
  ok(true, 'en resultados se ven sin elegir nombre');
  await host2.click('[data-act="back"]');
  await until(diana2, () => S.view === 'picker');
  ok(await diana2.isEnabled('.name[data-key="diana"]'), 'el nombre de un móvil desconectado se puede recuperar');
  await diana2.click('.name[data-key="diana"]'); await diana2.click('.name[data-key="diana"]');
  await until(diana2, () => S.myKey === 'diana' && S.mySent && S.mySent.join('') === '312654');
  ok(true, 'Diana recupera su nombre y su voto enviado');
  await shot(diana2, 'p09b-recovered');
  await host2.click('[data-act="results"]'); await host2.click('[data-act="results"]');
  await until(diana2, () => S.view === 'results');

  // 10. nueva sala y liberar nombre
  await host2.click('[data-act="new"]'); await host2.click('[data-act="new"]');
  await until(diana2, () => S.view === 'vote:2');
  ok(JSON.stringify(await st(diana2, () => S.draft.slots)) === '[0,0,0,0,0,0]', 'la sala 2 empieza vacía');
  await host2.click('.count');
  await shot(host2, 'p10-host-panel');
  await host2.click('.rr:has-text("Adrian") [data-act="free"]'); await host2.click('.rr:has-text("Adrian") [data-act="free"]');
  await until(adrian, () => S.view === 'picker');
  ok(true, 'liberar devuelve a Adrian a elegir nombre');

  const errs = [host, host2, diana, diana2, juan, saul, adrian].flatMap((p) => p.errors);
  ok(errs.length === 0, 'sin errores de página: ' + errs.slice(0, 5).join(' | '));
  console.log(`passed ${pass}, failed ${fail}`);
  await browser.close(); await peerDown(); web.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('ERROR', e); try { await peerDown(); } catch (_) {} process.exit(1); });
