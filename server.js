const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'store.json');
const ADMIN_USERNAME = 'Admin';
const ADMIN_PASSWORD = '4609295Jg?';
const PEAK_START = 7;  // 7 AM
const PEAK_END = 19;   // 7 PM
const MAX_PEAK_HOURS = 21;
const BAYS = 5;

const app = express();
app.use(express.json({ limit: '1mb' }));

const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// Explicit home page so Render never shows "Cannot GET /"
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

function emptyStore() {
  return { users: [], bookings: [], messages: [], sessions: [] };
}

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return emptyStore();
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

function publicUser(u) {
  return {
    username: u.username,
    email: u.email || '',
    phone: u.phone || '',
    address: u.address || '',
    role: u.role
  };
}

function ensureAdmin(store) {
  let admin = store.users.find(u => u.username.toLowerCase() === ADMIN_USERNAME.toLowerCase());
  if (!admin) {
    store.users.push({
      username: ADMIN_USERNAME,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      email: '',
      phone: '',
      address: '',
      role: 'admin'
    });
  } else {
    admin.username = ADMIN_USERNAME;
    admin.role = 'admin';
    admin.passwordHash = hashPassword(ADMIN_PASSWORD);
  }
}

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.query.token || '';
}

function authUser(req) {
  const store = loadStore();
  const token = getToken(req);
  const session = store.sessions.find(s => s.token === token);
  if (!session) return { store, user: null };
  const user = store.users.find(u => u.username === session.username);
  return { store, user: user || null };
}

function requireAuth(req, res) {
  const ctx = authUser(req);
  if (!ctx.user) {
    res.status(401).json({ error: 'Please sign in.' });
    return null;
  }
  return ctx;
}

function requireAdmin(req, res) {
  const ctx = requireAuth(req, res);
  if (!ctx) return null;
  if (ctx.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin only.' });
    return null;
  }
  return ctx;
}

function timesOverlap(s1, d1, s2, d2) {
  return s1 < s2 + d2 && s2 < s1 + d1;
}

function calculatePeakHours(start, duration) {
  let peak = 0;
  for (let h = start; h < start + duration; h++) {
    if (h >= PEAK_START && h < PEAK_END) peak++;
  }
  return peak;
}

function peakUsedThisMonth(store, username) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return store.bookings
    .filter(b => {
      if (b.username !== username) return false;
      const [y, m] = b.date.split('-').map(Number);
      return y === year && m - 1 === month;
    })
    .reduce((sum, b) => sum + (b.peakHours || 0), 0);
}

function bayConflict(store, date, bay, start, duration, excludeId) {
  return store.bookings.some(b =>
    b.date === date &&
    String(b.bay) === String(bay) &&
    b.id !== excludeId &&
    timesOverlap(b.start, b.duration, start, duration)
  );
}

app.post('/api/login', (req, res) => {
  const store = loadStore();
  ensureAdmin(store);
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = store.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    saveStore(store);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  store.sessions = store.sessions.filter(s => s.username !== user.username);
  store.sessions.push({ token, username: user.username, createdAt: Date.now() });
  saveStore(store);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  const store = loadStore();
  const token = getToken(req);
  store.sessions = store.sessions.filter(s => s.token !== token);
  saveStore(store);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  res.json({
    user: publicUser(ctx.user),
    peakHoursLeft: Math.max(0, MAX_PEAK_HOURS - peakUsedThisMonth(ctx.store, ctx.user.username)),
    peakHoursMax: MAX_PEAK_HOURS
  });
});

app.put('/api/profile', (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const user = ctx.store.users.find(u => u.username === ctx.user.username);
  user.email = String(req.body.email || '').trim();
  user.phone = String(req.body.phone || '').trim();
  user.address = String(req.body.address || '').trim();
  saveStore(ctx.store);
  res.json({ user: publicUser(user) });
});

app.post('/api/accounts', (req, res) => {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  if (ctx.store.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'That username already exists.' });
  }
  ctx.store.users.push({
    username,
    passwordHash: hashPassword(password),
    email: String(req.body.email || '').trim(),
    phone: String(req.body.phone || '').trim(),
    address: String(req.body.address || '').trim(),
    role: 'member'
  });
  saveStore(ctx.store);
  res.json({ ok: true, username });
});

app.get('/api/accounts', (req, res) => {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  res.json({ users: ctx.store.users.map(publicUser) });
});

app.get('/api/bookings', (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const date = req.query.date;
  const list = date
    ? ctx.store.bookings.filter(b => b.date === date)
    : ctx.store.bookings;
  const safe = list.map(b => ({
    id: b.id,
    date: b.date,
    start: b.start,
    duration: b.duration,
    bay: b.bay,
    username: b.username,
    peakHours: b.peakHours
  }));
  res.json({ bookings: safe });
});

app.get('/api/bookings/mine', (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const mine = ctx.store.bookings.filter(b => b.username === ctx.user.username);
  res.json({ bookings: mine });
});

app.post('/api/bookings', async (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const date = String(req.body.date || '');
  const start = Number(req.body.start);
  const duration = Number(req.body.duration);
  const bay = String(req.body.bay || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date.' });
  if (![1, 2, 3].includes(duration)) return res.status(400).json({ error: 'Duration must be 1, 2, or 3 hours.' });
  if (!Number.isInteger(start) || start < 6 || start + duration > 22) {
    return res.status(400).json({ error: 'Invalid start time.' });
  }
  if (!['1', '2', '3', '4', '5'].includes(bay)) return res.status(400).json({ error: 'Invalid bay.' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = date.split('-').map(Number);
  if (new Date(y, m - 1, d) < today) return res.status(400).json({ error: 'Cannot book a past date.' });

  if (bayConflict(ctx.store, date, bay, start, duration)) {
    return res.status(409).json({ error: 'That bay is already booked for that time.' });
  }

  const peakHours = calculatePeakHours(start, duration);
  const used = peakUsedThisMonth(ctx.store, ctx.user.username);
  if (peakHours > 0 && used + peakHours > MAX_PEAK_HOURS) {
    return res.status(400).json({
      error: `Not enough peak hours. You only have ${MAX_PEAK_HOURS - used} left this month.`
    });
  }

  const booking = {
    id: Date.now(),
    username: ctx.user.username,
    date,
    start,
    duration,
    bay,
    peakHours
  };
  ctx.store.bookings.push(booking);
  saveStore(ctx.store);

  // Notify GymmyNJ@yahoo.com of new booking
  try {
    const startLabel = booking.start >= 12
      ? ((booking.start % 12) || 12) + ':00 PM'
      : booking.start + ':00 AM';
    await fetch('https://formsubmit.co/ajax/GymmyNJ@yahoo.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: 'Gymmy — new simulator booking',
        member: ctx.user.username,
        date: booking.date,
        time: startLabel + ' · ' + booking.duration + 'h · Bay ' + booking.bay,
        peakHours: booking.peakHours,
        _template: 'table'
      })
    });
  } catch (e) {
    console.error('Booking email failed:', e.message);
  }

  res.json({ booking, peakHoursLeft: Math.max(0, MAX_PEAK_HOURS - used - peakHours) });
});

app.delete('/api/bookings/:id', (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const id = Number(req.params.id);
  const booking = ctx.store.bookings.find(b => b.id === id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.username !== ctx.user.username && ctx.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only cancel your own bookings.' });
  }
  ctx.store.bookings = ctx.store.bookings.filter(b => b.id !== id);
  saveStore(ctx.store);
  res.json({ ok: true });
});

app.post('/api/contact', async (req, res) => {
  const store = loadStore();
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const phone = String(req.body.phone || '').trim();
  const message = String(req.body.message || '').trim();
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  store.messages.push({
    id: Date.now(),
    name,
    email,
    phone,
    message,
    createdAt: new Date().toISOString()
  });
  saveStore(store);

  // Email GymmyNJ@yahoo.com via FormSubmit (no API key required)
  try {
    await fetch('https://formsubmit.co/ajax/GymmyNJ@yahoo.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name,
        email,
        phone: phone || 'Not provided',
        message,
        _subject: 'Gymmy website — new contact message',
        _template: 'table'
      })
    });
  } catch (e) {
    console.error('Contact email failed:', e.message);
  }

  res.json({ ok: true });
});

app.get('/api/messages', (req, res) => {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  res.json({ messages: ctx.store.messages.slice().reverse() });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Try to serve matching HTML file from /public, else home
  const candidate = path.join(PUBLIC_DIR, req.path.replace(/^\//, ''));
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return res.sendFile(candidate);
  }
  const html = path.join(PUBLIC_DIR, req.path.replace(/^\//, '') + '.html');
  if (fs.existsSync(html)) {
    return res.sendFile(html);
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const bootStore = loadStore();
ensureAdmin(bootStore);
saveStore(bootStore);

app.listen(PORT, () => {
  console.log(`Gymmy is running on port ${PORT}`);
  console.log(`Public folder: ${PUBLIC_DIR}`);
  console.log(`Public files: ${fs.existsSync(PUBLIC_DIR) ? fs.readdirSync(PUBLIC_DIR).join(', ') : 'MISSING'}`);
  console.log(`Admin login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
});
