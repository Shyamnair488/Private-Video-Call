// Static site + WebSocket signaling. Video/audio never pass through here.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/home.js': ['home.js', 'text/javascript; charset=utf-8'],
  '/call.js': ['call.js', 'text/javascript; charset=utf-8'],
};

const HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  let entry = FILES[url];
  if (!entry && /^\/room\/[A-Za-z0-9_-]{16,64}$/.test(url)) entry = ['call.html', 'text/html; charset=utf-8'];
  if (req.method !== 'GET' || !entry) {
    res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  fs.readFile(path.join(PUBLIC, entry[0]), (err, data) => {
    if (err) { res.writeHead(500, HEADERS); return res.end('Error'); }
    res.writeHead(200, { ...HEADERS, 'Content-Type': entry[1] });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const rooms = new Map();

wss.on('connection', (ws) => {
  let room = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!room) {
      if (m.type !== 'join' || !ID_RE.test(m.room || '')) return ws.close();
      const set = rooms.get(m.room) || new Set();
      if (set.size >= 2) { ws.send(JSON.stringify({ type: 'full' })); return ws.close(); }
      const first = [...set][0];
      set.add(ws); rooms.set(m.room, set); room = m.room;
      if (first) first.send(JSON.stringify({ type: 'peer' }));
      return;
    }
    if (!['offer', 'answer', 'ice'].includes(m.type)) return;
    for (const p of rooms.get(room) || []) if (p !== ws && p.readyState === 1) p.send(JSON.stringify(m));
  });
  ws.on('close', () => {
    const set = room && rooms.get(room);
    if (!set) return;
    set.delete(ws);
    for (const p of set) p.send(JSON.stringify({ type: 'left' }));
    if (!set.size) rooms.delete(room);
  });
});

server.listen(PORT, '127.0.0.1', () => console.log('Running on http://localhost:' + PORT));
