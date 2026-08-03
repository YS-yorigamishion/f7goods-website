const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'f7goods_secret_2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'f7goods2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));
app.use('/uploads', express.static('uploads'));

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9\u4e00-\u9fff\-_]/g, '_').substring(0, 60);
    const name = baseName + ext;
    // If file exists, add timestamp to avoid conflict
    const filePath = path.join(__dirname, 'uploads', name);
    if (fs.existsSync(filePath)) {
      cb(null, Date.now() + '-' + baseName + ext);
    } else {
      cb(null, name);
    }
  }
});
const fileFilter = (req, file, cb) => {
  const allowedImages = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const allowedExcel = ['.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedImages.includes(ext) || allowedExcel.includes(ext)) cb(null, true);
  else cb(new Error('只允许上传图片或Excel文件'), false);
};
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter });

// Helper: read/write JSON files
function readJSON(file) {
  const filePath = path.join(__dirname, 'data', file);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`Failed to read ${file}:`, e.message);
    return file.endsWith('s.json') ? [] : {};
  }
}

function writeJSON(file, data) {
  const filePath = path.join(__dirname, 'data', file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Initialize admin password hash if placeholder
function initAdmin() {
  const admin = readJSON('admin.json');
  if (admin.passwordHash === '$2a$10$placeholder') {
    admin.passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    writeJSON('admin.json', admin);
    console.log('Admin password initialized. Username: admin, Password: ' + ADMIN_PASSWORD);
  }
}
initAdmin();

// JWT Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未授权' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token无效或已过期' });
  }
}

// ===== Admin Auth =====
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = readJSON('admin.json');
  if (username !== admin.username || !bcrypt.compareSync(password, admin.passwordHash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// ===== Public API =====
// Works
app.get('/api/works', (req, res) => {
  let works = readJSON('works.json');
  if (ensureOrder(works)) writeJSON('works.json', works);
  const { category, search, status } = req.query;
  if (category) works = works.filter(w => w.category === category);
  if (status) works = works.filter(w => w.status === status);
  if (search) {
    const s = search.toLowerCase();
    works = works.filter(w =>
      w.title.toLowerCase().includes(s) ||
      (w.titleEn && w.titleEn.toLowerCase().includes(s)) ||
      w.tags.some(t => t.toLowerCase().includes(s))
    );
  }
  works.sort((a, b) => a.order - b.order);
  res.json(works);
});

app.get('/api/works/:id', (req, res) => {
  const works = readJSON('works.json');
  const work = works.find(w => w.id === req.params.id);
  if (!work) return res.status(404).json({ error: '作品未找到' });
  res.json(work);
});

// ===== Like System (in-memory + file sync) =====
let likesCache = {};
try { likesCache = readJSON('likes.json'); } catch {}

function saveLikes() {
  writeJSON('likes.json', likesCache);
}

// ===== Want System (我想要) =====
let wantsCache = {};
try { wantsCache = readJSON('wants.json'); } catch {}

function saveWants() {
  writeJSON('wants.json', wantsCache);
}

app.post('/api/works/:id/like', (req, res) => {
  const workId = req.params.id;
  const uid = req.body.uid;
  if (!uid) return res.status(400).json({ error: 'missing uid' });

  if (!likesCache[workId]) likesCache[workId] = [];

  if (likesCache[workId].includes(uid)) {
    const works = readJSON('works.json');
    const w = works.find(w => w.id === workId);
    return res.json({ likes: w ? (w.likes || 0) : 0, alreadyLiked: true });
  }

  const works = readJSON('works.json');
  const index = works.findIndex(w => w.id === workId);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });
  if (!works[index].likes) works[index].likes = 0;

  likesCache[workId].push(uid);
  saveLikes();
  works[index].likes++;
  writeJSON('works.json', works);
  console.log('[LIKE] workId=%s uid=%s count=%d', workId, uid, works[index].likes);
  res.json({ likes: works[index].likes });
});

app.post('/api/works/:id/unlike', (req, res) => {
  const workId = req.params.id;
  const uid = req.body.uid;
  if (!uid) return res.status(400).json({ error: 'missing uid' });

  if (!likesCache[workId]) likesCache[workId] = [];

  const idx = likesCache[workId].indexOf(uid);
  if (idx === -1) {
    const works = readJSON('works.json');
    const w = works.find(w => w.id === workId);
    return res.json({ likes: w ? (w.likes || 0) : 0 });
  }

  const works = readJSON('works.json');
  const index = works.findIndex(w => w.id === workId);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });

  likesCache[workId].splice(idx, 1);
  saveLikes();
  works[index].likes = Math.max(0, (works[index].likes || 0) - 1);
  writeJSON('works.json', works);
  console.log('[UNLIKE] workId=%s uid=%s count=%d', workId, uid, works[index].likes);
  res.json({ likes: works[index].likes });
});

app.post('/api/works/:id/want', (req, res) => {
  const workId = req.params.id;
  const uid = req.body.uid;
  if (!uid) return res.status(400).json({ error: 'missing uid' });

  if (!wantsCache[workId]) wantsCache[workId] = [];

  if (wantsCache[workId].includes(uid)) {
    const works = readJSON('works.json');
    const w = works.find(w => w.id === workId);
    return res.json({ wants: w ? (w.wants || 0) : 0, alreadyWanted: true });
  }

  const works = readJSON('works.json');
  const index = works.findIndex(w => w.id === workId);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });
  if (!works[index].wants) works[index].wants = 0;

  wantsCache[workId].push(uid);
  saveWants();
  works[index].wants++;
  writeJSON('works.json', works);
  console.log('[WANT] workId=%s uid=%s count=%d', workId, uid, works[index].wants);
  res.json({ wants: works[index].wants });
});

app.get('/api/works/:id/want-status', (req, res) => {
  const workId = req.params.id;
  const uid = req.query.uid;
  if (!uid) return res.json({ wanted: false });
  const wanted = wantsCache[workId] ? wantsCache[workId].includes(uid) : false;
  res.json({ wanted });
});

app.post('/api/works/:id/unwant', (req, res) => {
  const workId = req.params.id;
  const uid = req.body.uid;
  if (!uid) return res.status(400).json({ error: 'missing uid' });

  if (!wantsCache[workId]) wantsCache[workId] = [];

  const idx = wantsCache[workId].indexOf(uid);
  if (idx === -1) {
    const works = readJSON('works.json');
    const w = works.find(w => w.id === workId);
    return res.json({ wants: w ? (w.wants || 0) : 0 });
  }

  const works = readJSON('works.json');
  const index = works.findIndex(w => w.id === workId);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });

  wantsCache[workId].splice(idx, 1);
  saveWants();
  works[index].wants = Math.max(0, (works[index].wants || 0) - 1);
  writeJSON('works.json', works);
  console.log('[UNWANT] workId=%s uid=%s count=%d', workId, uid, works[index].wants);
  res.json({ wants: works[index].wants });
});

// Events
app.get('/api/events', (req, res) => {
  let events = readJSON('events.json');
  if (ensureOrder(events)) writeJSON('events.json', events);
  events.sort((a, b) => a.order - b.order);
  res.json(events);
});

app.get('/api/events/:id', (req, res) => {
  const events = readJSON('events.json');
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: '活动未找到' });
  res.json(event);
});

// Circles
// Ensure all items have order values
function ensureOrder(items) {
  let changed = false;
  items.forEach((item, i) => {
    if (item.order === undefined || item.order === null) {
      item.order = i;
      changed = true;
    }
  });
  return changed;
}

// Reindex order values to be sequential 0, 1, 2...
function reindexOrder(items) {
  items.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  items.forEach((item, i) => item.order = i);
}

app.get('/api/circles', (req, res) => {
  let circles = readJSON('circles.json');
  if (ensureOrder(circles)) writeJSON('circles.json', circles);
  const { search } = req.query;
  if (search) {
    const s = search.toLowerCase();
    circles = circles.filter(c =>
      c.name.toLowerCase().includes(s)
    );
  }
  circles.sort((a, b) => a.order - b.order);
  res.json(circles);
});

app.get('/api/circles/:id', (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.params.id);
  if (!circle) return res.status(404).json({ error: '作者未找到' });
  res.json(circle);
});

// Projects
app.get('/api/projects', (req, res) => {
  let projects = readJSON('projects.json');
  if (ensureOrder(projects)) writeJSON('projects.json', projects);
  const { category, status, search } = req.query;
  if (category) projects = projects.filter(p => p.category === category);
  if (status) projects = projects.filter(p => p.status === status);
  if (search) {
    const s = search.toLowerCase();
    projects = projects.filter(p =>
      p.title.toLowerCase().includes(s) ||
      p.description.toLowerCase().includes(s) ||
      p.tags.some(t => t.toLowerCase().includes(s))
    );
  }
  projects.sort((a, b) => a.order - b.order);
  res.json(projects);
});

app.get('/api/projects/:id', (req, res) => {
  const projects = readJSON('projects.json');
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: '企划未找到' });
  res.json(project);
});

// Categories
app.get('/api/categories', (req, res) => {
  res.json(readJSON('categories.json'));
});

// Contact form
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!message) {
    return res.status(400).json({ error: '请填写消息内容' });
  }
  // Save to contact.json
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];
  contacts.push({
    id: 'ct' + Date.now(),
    name, email, subject, message,
    createdAt: new Date().toISOString()
  });
  writeJSON('contact.json', contacts);
  res.json({ success: true, message: '消息已发送，我们会尽快回复！' });
});

// ===== Page View Tracking =====
let pageviews = {};
try { pageviews = readJSON('pageviews.json'); } catch {}
if (!pageviews.daily) pageviews = { daily: {} };

function savePageviews() {
  writeJSON('pageviews.json', pageviews);
}

app.post('/api/pageview', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  pageviews.daily[today] = (pageviews.daily[today] || 0) + 1;
  savePageviews();
  res.json({ ok: true });
});

app.get('/api/admin/pageviews', authMiddleware, (req, res) => {
  res.json(pageviews);
});

// Settings
app.get('/api/settings', (req, res) => {
  try {
    const settings = readJSON('settings.json');
    res.json(settings);
  } catch (e) {
    res.json({ pages: {} });
  }
});

app.put('/api/admin/settings', authMiddleware, (req, res) => {
  const settings = req.body;
  writeJSON('settings.json', settings);
  res.json({ success: true });
});

// ===== Announcements =====
// Public: get published announcements (publishDate <= today)
app.get('/api/announcements', (req, res) => {
  try {
    let announcements = readJSON('announcements.json');
    const today = new Date().toISOString().split('T')[0];
    announcements = announcements.filter(a => a.publishDate <= today);
    announcements.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.publishDate) - new Date(a.publishDate);
    });
    res.json(announcements);
  } catch (e) {
    res.json([]);
  }
});

// Public: get popup announcements
app.get('/api/announcements/popup', (req, res) => {
  try {
    let announcements = readJSON('announcements.json');
    const today = new Date().toISOString().split('T')[0];
    announcements = announcements.filter(a => a.popup && a.publishDate <= today);
    announcements.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    res.json(announcements);
  } catch (e) {
    res.json([]);
  }
});

// Admin: get all announcements
app.get('/api/admin/announcements', authMiddleware, (req, res) => {
  try {
    const announcements = readJSON('announcements.json');
    res.json(announcements);
  } catch (e) {
    res.json([]);
  }
});

// Admin: create announcement
app.post('/api/admin/announcements', authMiddleware, (req, res) => {
  let announcements = [];
  try { announcements = readJSON('announcements.json'); } catch {}
  const announcement = {
    id: 'ann' + Date.now(),
    title: req.body.title || '',
    content: req.body.content || '',
    publishDate: req.body.publishDate || new Date().toISOString().split('T')[0],
    popup: req.body.popup || false,
    createdAt: new Date().toISOString()
  };
  announcements.push(announcement);
  writeJSON('announcements.json', announcements);
  res.json(announcement);
});

// Admin: update announcement
app.put('/api/admin/announcements/:id', authMiddleware, (req, res) => {
  let announcements = readJSON('announcements.json');
  const index = announcements.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '公告未找到' });
  announcements[index] = { ...announcements[index], ...req.body };
  writeJSON('announcements.json', announcements);
  res.json(announcements[index]);
});

// Admin: delete announcement
app.delete('/api/admin/announcements/:id', authMiddleware, (req, res) => {
  let announcements = readJSON('announcements.json');
  announcements = announcements.filter(a => a.id !== req.params.id);
  writeJSON('announcements.json', announcements);
  res.json({ success: true });
});

// --- Admin Contacts ---
app.get('/api/admin/contacts', authMiddleware, (req, res) => {
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];
  res.json(contacts);
});

app.delete('/api/admin/contacts/:id', authMiddleware, (req, res) => {
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];
  contacts = contacts.filter(c => c.id !== req.params.id);
  writeJSON('contact.json', contacts);
  res.json({ success: true });
});

// ===== Admin CRUD =====
// --- Works ---
app.get('/api/admin/works', authMiddleware, (req, res) => {
  let works = readJSON('works.json');
  if (ensureOrder(works)) writeJSON('works.json', works);
  works.sort((a, b) => a.order - b.order);
  res.json(works);
});

app.post('/api/admin/works', authMiddleware, (req, res) => {
  const works = readJSON('works.json');
  const maxOrder = works.reduce((max, w) => Math.max(max, w.order ?? 0), 0);
  const work = {
    id: 'w' + Date.now(),
    ...req.body,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  works.push(work);
  writeJSON('works.json', works);
  res.json(work);
});

app.put('/api/admin/works/:id', authMiddleware, (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });
  delete req.body.id;
  works[index] = { ...works[index], ...req.body };
  writeJSON('works.json', works);
  res.json(works[index]);
});

app.delete('/api/admin/works/:id', authMiddleware, (req, res) => {
  const workId = req.params.id;
  let works = readJSON('works.json');
  works = works.filter(w => w.id !== workId);
  writeJSON('works.json', works);
  // Cascade: remove from events.relatedWorks
  let events = readJSON('events.json');
  events.forEach(e => { e.relatedWorks = (e.relatedWorks || []).filter(id => id !== workId); });
  writeJSON('events.json', events);
  // Cascade: remove from projects.works
  let projects = readJSON('projects.json');
  projects.forEach(p => { p.works = (p.works || []).filter(id => id !== workId); });
  writeJSON('projects.json', projects);
  // Cascade: remove from likes.json
  let likesData = {};
  try { likesData = readJSON('likes.json'); } catch {}
  delete likesData[workId];
  writeJSON('likes.json', likesData);
  // Cascade: remove from wants.json
  let wantsData = {};
  try { wantsData = readJSON('wants.json'); } catch {}
  delete wantsData[workId];
  writeJSON('wants.json', wantsData);
  res.json({ success: true });
});

// --- Events ---
app.get('/api/admin/events', authMiddleware, (req, res) => {
  let events = readJSON('events.json');
  if (ensureOrder(events)) writeJSON('events.json', events);
  events.sort((a, b) => a.order - b.order);
  res.json(events);
});

app.post('/api/admin/events', authMiddleware, (req, res) => {
  const events = readJSON('events.json');
  const maxOrder = events.reduce((max, e) => Math.max(max, e.order ?? 0), 0);
  const event = {
    id: 'e' + Date.now(),
    ...req.body,
    order: maxOrder + 1
  };
  events.push(event);
  writeJSON('events.json', events);
  res.json(event);
});

app.put('/api/admin/events/:id', authMiddleware, (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  delete req.body.id;
  events[index] = { ...events[index], ...req.body };
  writeJSON('events.json', events);
  res.json(events[index]);
});

app.delete('/api/admin/events/:id', authMiddleware, (req, res) => {
  const eventId = req.params.id;
  let events = readJSON('events.json');
  events = events.filter(e => e.id !== eventId);
  writeJSON('events.json', events);
  // Cascade: remove from projects.events
  let projects = readJSON('projects.json');
  projects.forEach(p => { p.events = (p.events || []).filter(id => id !== eventId); });
  writeJSON('projects.json', projects);
  res.json({ success: true });
});

// --- Circles ---
app.get('/api/admin/circles', authMiddleware, (req, res) => {
  let circles = readJSON('circles.json');
  if (ensureOrder(circles)) writeJSON('circles.json', circles);
  circles.sort((a, b) => a.order - b.order);
  res.json(circles);
});

app.post('/api/admin/circles', authMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const maxOrder = circles.reduce((max, c) => Math.max(max, c.order ?? 0), 0);
  const circle = {
    id: 'c' + Date.now(),
    ...req.body,
    order: maxOrder + 1
  };
  circles.push(circle);
  writeJSON('circles.json', circles);
  res.json(circle);
});

app.put('/api/admin/circles/:id', authMiddleware, (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });
  delete req.body.id;
  circles[index] = { ...circles[index], ...req.body };
  writeJSON('circles.json', circles);
  res.json(circles[index]);
});

app.delete('/api/admin/circles/:id', authMiddleware, (req, res) => {
  const circleId = req.params.id;
  let circles = readJSON('circles.json');
  circles = circles.filter(c => c.id !== circleId);
  writeJSON('circles.json', circles);
  // Cascade: remove circle from work.circles references
  let works = readJSON('works.json');
  works.forEach(w => { w.circles = (w.circles || []).filter(id => id !== circleId); });
  writeJSON('works.json', works);
  // Cascade: remove from events.relatedCircles and projects.circles
  let events = readJSON('events.json');
  events.forEach(e => { e.relatedCircles = (e.relatedCircles || []).filter(id => id !== circleId); });
  writeJSON('events.json', events);
  let projects = readJSON('projects.json');
  projects.forEach(p => { p.circles = (p.circles || []).filter(id => id !== circleId); });
  writeJSON('projects.json', projects);
  res.json({ success: true });
});

// --- Circle Excel Export/Import ---
app.get('/api/admin/circles/:id/export', authMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.params.id);
  if (!circle) return res.status(404).json({ error: '作者未找到' });

  const works = readJSON('works.json');
  const events = readJSON('events.json');
  const circleWorks = works.filter(w => (w.circles || []).includes(circle.id));

  // Use categories.json for labels
  let categories = { works: [], workStatus: [] };
  try { categories = readJSON('categories.json'); } catch {}
  const catMap = {};
  categories.works.forEach(c => catMap[c.id] = c.name);
  const statusMap = {};
  categories.workStatus.forEach(c => statusMap[c.id] = c.name);

  // Build events map
  const eventMap = {};
  events.forEach(e => eventMap[e.id] = e.title);

  const data = circleWorks.map(w => {
    // Find events that reference this work
    const relatedEventTitles = events
      .filter(e => (e.relatedWorks || []).includes(w.id))
      .map(e => e.title);
    return {
      '作品名称': w.title,
      '分类': catMap[w.category] || w.category,
      '价格': w.price || '',
      '状态': statusMap[w.status] || w.status,
      '发售日期': w.releaseDate || '',
      '标签': (w.tags || []).join(', '),
      '图片': (w.images || []).map(img => img.replace('/uploads/', '')).join(', '),
      '更多图片': (w.moreImages || []).map(img => img.replace('/uploads/', '')).join(', '),
      '关联活动': relatedEventTitles.join(', '),
      '作品描述': w.description || ''
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);

  ws['!cols'] = [
    { wch: 30 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 25 },
    { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 50 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, `${circle.name} - 作品列表`);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(circle.name)}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

app.post('/api/admin/circles/:id/import', authMiddleware, upload.single('file'), (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.params.id);
  if (!circle) return res.status(404).json({ error: '作者未找到' });
  if (!req.file) return res.status(400).json({ error: '请上传Excel文件' });

  // Use categories.json for mapping
  let categories = { works: [], workStatus: [] };
  try { categories = readJSON('categories.json'); } catch {}
  const CATEGORY_MAP = {};
  categories.works.forEach(c => { CATEGORY_MAP[c.name] = c.id; CATEGORY_MAP[c.id] = c.id; });
  const STATUS_MAP = {};
  categories.workStatus.forEach(c => { STATUS_MAP[c.name] = c.id; STATUS_MAP[c.id] = c.id; });

  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    let works = readJSON('works.json');
    let events = readJSON('events.json');
    const circleWorks = works.filter(w => (w.circles || []).includes(circle.id));
    const otherWorks = works.filter(w => !(w.circles || []).includes(circle.id));

    // Build event title -> id map
    const eventTitleMap = {};
    events.forEach(e => eventTitleMap[e.title] = e.id);

    const importTitles = new Set();
    const result = { added: 0, updated: 0, deleted: 0, eventLinks: 0, details: [] };

    const newCircleWorks = rows.map(row => {
      const title = row['作品名称'] || row['标题'] || '';
      if (!title) return null;
      importTitles.add(title);

      const existing = circleWorks.find(w => w.title === title);
      const workData = {
        title,
        category: CATEGORY_MAP[row['分类']] || 'other',
        price: row['价格'] || '',
        status: STATUS_MAP[row['状态']] || 'on_sale',
        releaseDate: row['发售日期'] || row['发售日'] || '',
        tags: (row['标签'] || '').split(',').map(t => t.trim()).filter(Boolean),
        description: row['作品描述'] || row['描述'] || '',
        images: (row['图片'] || '').split(',').map(f => f.trim()).filter(Boolean).map(f => f.startsWith('/uploads/') ? f : '/uploads/' + f),
        moreImages: (row['更多图片'] || '').split(',').map(f => f.trim()).filter(Boolean).map(f => f.startsWith('/uploads/') ? f : '/uploads/' + f)
      };

      // Handle event association from Excel
      const eventTitles = (row['关联活动'] || '').split(',').map(t => t.trim()).filter(Boolean);
      const workId = existing ? existing.id : ('w' + Date.now() + Math.random().toString(36).substr(2, 5));
      if (eventTitles.length > 0) {
        eventTitles.forEach(eventTitle => {
          const eventId = eventTitleMap[eventTitle];
          if (eventId) {
            const ev = events.find(e => e.id === eventId);
            if (ev && !(ev.relatedWorks || []).includes(workId)) {
              if (!ev.relatedWorks) ev.relatedWorks = [];
              ev.relatedWorks.push(workId);
              result.eventLinks++;
            }
          }
        });
      }

      if (existing) {
        result.updated++;
        result.details.push(`更新: ${title}`);
        // If image column is empty, keep existing images
        if (!workData.images || workData.images.length === 0) {
          workData.images = existing.images || [];
        }
        if (!workData.moreImages || workData.moreImages.length === 0) {
          workData.moreImages = existing.moreImages || [];
        }
        return { ...existing, ...workData };
      } else {
        result.added++;
        result.details.push(`新增: ${title}`);
        return { id: workId, ...workData, circles: [circle.id], images: workData.images || [], moreImages: workData.moreImages || [], createdAt: new Date().toISOString() };
      }
    }).filter(Boolean);

    // Find deleted works
    circleWorks.forEach(w => {
      if (!importTitles.has(w.title)) {
        result.deleted++;
        result.details.push(`删除: ${w.title}`);
      }
    });

    works = [...otherWorks, ...newCircleWorks];
    writeJSON('works.json', works);
    writeJSON('events.json', events);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json(result);
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

// --- Projects ---
app.get('/api/admin/projects', authMiddleware, (req, res) => {
  let projects = readJSON('projects.json');
  if (ensureOrder(projects)) writeJSON('projects.json', projects);
  projects.sort((a, b) => a.order - b.order);
  res.json(projects);
});

app.post('/api/admin/projects', authMiddleware, (req, res) => {
  const projects = readJSON('projects.json');
  const maxOrder = projects.reduce((max, p) => Math.max(max, p.order ?? 0), 0);
  const project = {
    id: 'p' + Date.now(),
    ...req.body,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  projects.push(project);
  writeJSON('projects.json', projects);
  res.json(project);
});

app.put('/api/admin/projects/:id', authMiddleware, (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  delete req.body.id;
  projects[index] = { ...projects[index], ...req.body };
  writeJSON('projects.json', projects);
  res.json(projects[index]);
});

app.delete('/api/admin/projects/:id', authMiddleware, (req, res) => {
  const projectId = req.params.id;
  let projects = readJSON('projects.json');
  projects = projects.filter(p => p.id !== projectId);
  writeJSON('projects.json', projects);
  // Cascade: remove from events.relatedProjects
  let events = readJSON('events.json');
  events.forEach(e => { e.relatedProjects = (e.relatedProjects || []).filter(id => id !== projectId); });
  writeJSON('events.json', events);
  res.json({ success: true });
});

// ===== Updates (同人动态) =====
// Public: get published updates
app.get('/api/updates', (req, res) => {
  try {
    let updates = readJSON('updates.json');
    const today = new Date().toISOString().split('T')[0];
    updates = updates.filter(u => u.publishDate <= today);
    updates.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.publishDate) - new Date(a.publishDate);
    });
    res.json(updates);
  } catch (e) { res.json([]); }
});

app.get('/api/updates/:id', (req, res) => {
  try {
    const updates = readJSON('updates.json');
    const update = updates.find(u => u.id === req.params.id);
    if (!update) return res.status(404).json({ error: '动态未找到' });
    res.json(update);
  } catch (e) { res.status(404).json({ error: '动态未找到' }); }
});

// Admin: CRUD for updates
app.get('/api/admin/updates', authMiddleware, (req, res) => {
  try {
    const updates = readJSON('updates.json');
    res.json(updates);
  } catch (e) { res.json([]); }
});

app.post('/api/admin/updates', authMiddleware, (req, res) => {
  let updates = [];
  try { updates = readJSON('updates.json'); } catch {}
  const update = {
    id: 'upd' + Date.now(),
    title: req.body.title || '',
    content: req.body.content || '',
    publishDate: req.body.publishDate || new Date().toISOString().split('T')[0],
    pinned: req.body.pinned || false,
    relatedEvents: req.body.relatedEvents || [],
    relatedProjects: req.body.relatedProjects || [],
    createdAt: new Date().toISOString()
  };
  updates.push(update);
  writeJSON('updates.json', updates);
  res.json(update);
});

app.put('/api/admin/updates/:id', authMiddleware, (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  delete req.body.id;
  updates[index] = { ...updates[index], ...req.body };
  writeJSON('updates.json', updates);
  res.json(updates[index]);
});

app.delete('/api/admin/updates/:id', authMiddleware, (req, res) => {
  const updateId = req.params.id;
  let updates = readJSON('updates.json');
  updates = updates.filter(u => u.id !== updateId);
  writeJSON('updates.json', updates);
  res.json({ success: true });
});

// --- Categories ---
app.get('/api/admin/categories', authMiddleware, (req, res) => {
  res.json(readJSON('categories.json'));
});

app.put('/api/admin/categories', authMiddleware, (req, res) => {
  const categories = req.body;
  if (!categories.works || !categories.projects) {
    return res.status(400).json({ error: '无效的分类数据' });
  }
  writeJSON('categories.json', categories);
  res.json({ success: true, categories });
});

// --- Reorder ---
app.post('/api/admin/reorder/:type', authMiddleware, (req, res) => {
  const { type } = req.params;
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: '无效的排序数据' });

  const fileMap = { works: 'works.json', events: 'events.json', circles: 'circles.json', projects: 'projects.json' };
  const file = fileMap[type];
  if (!file) return res.status(400).json({ error: '不支持的类型' });

  let items = readJSON(file);
  orderedIds.forEach((id, index) => {
    const item = items.find(i => i.id === id);
    if (item) item.order = index;
  });
  writeJSON(file, items);
  res.json({ success: true });
});

// --- Upload ---
app.post('/api/admin/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// List all uploaded images
app.get('/api/admin/images', authMiddleware, (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  try {
    const files = fs.readdirSync(uploadsDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
      .map(f => ({
        name: f,
        url: '/uploads/' + f,
        size: fs.statSync(path.join(uploadsDir, f)).size,
        time: fs.statSync(path.join(uploadsDir, f)).mtime
      }))
      .sort((a, b) => b.time - a.time);
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

// Delete an uploaded image
app.delete('/api/admin/images/:filename', authMiddleware, (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '文件不存在' });
  }
});

// Preview unused images (GET - no deletion)
app.get('/api/admin/images/unused', authMiddleware, (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  try {
    const referencedFiles = new Set();
    function extractFilename(imgPath) {
      if (!imgPath) return null;
      const match = imgPath.match(/\/uploads\/([^/?#]+)/);
      return match ? match[1] : null;
    }
    try {
      const settings = readJSON('settings.json');
      const f = extractFilename(settings.site?.favicon);
      if (f) referencedFiles.add(f);
    } catch {}
    const dataFiles = ['works.json', 'events.json', 'circles.json', 'projects.json'];
    dataFiles.forEach(file => {
      try {
        const items = readJSON(file);
        items.forEach(item => {
          if (item.images) item.images.forEach(img => { const f = extractFilename(img); if (f) referencedFiles.add(f); });
          if (item.logo) { const f = extractFilename(item.logo); if (f) referencedFiles.add(f); }
          if (item.coverImage) { const f = extractFilename(item.coverImage); if (f) referencedFiles.add(f); }
        });
      } catch {}
    });
    const files = fs.readdirSync(uploadsDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));
    const unused = files.filter(f => !referencedFiles.has(f)).map(f => ({
      name: f,
      url: '/uploads/' + f
    }));
    res.json({ total: files.length, unused, count: unused.length });
  } catch (e) {
    res.status(500).json({ error: '查询失败: ' + e.message });
  }
});

// Cleanup unused images
app.post('/api/admin/images/cleanup', authMiddleware, (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  try {
    // Collect all referenced image filenames from data files
    const referencedFiles = new Set();

    function extractFilename(imgPath) {
      if (!imgPath) return null;
      // Handle both relative paths and full URLs
      const match = imgPath.match(/\/uploads\/([^/?#]+)/);
      return match ? match[1] : null;
    }

    // Check settings.json for favicon
    try {
      const settings = readJSON('settings.json');
      const f = extractFilename(settings.site?.favicon);
      if (f) referencedFiles.add(f);
    } catch {}

    // Check all entity files for image references
    const dataFiles = ['works.json', 'events.json', 'circles.json', 'projects.json'];
    dataFiles.forEach(file => {
      try {
        const items = readJSON(file);
        items.forEach(item => {
          // Check images array
          if (item.images) item.images.forEach(img => { const f = extractFilename(img); if (f) referencedFiles.add(f); });
          // Check logo field
          if (item.logo) { const f = extractFilename(item.logo); if (f) referencedFiles.add(f); }
          // Check coverImage field
          if (item.coverImage) { const f = extractFilename(item.coverImage); if (f) referencedFiles.add(f); }
        });
      } catch {}
    });

    // Get all files in uploads directory
    const files = fs.readdirSync(uploadsDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));

    // Find unused files
    const unused = files.filter(f => !referencedFiles.has(f));

    // Delete unused files
    let deleted = 0;
    unused.forEach(f => {
      fs.unlinkSync(path.join(uploadsDir, f));
      deleted++;
    });

    res.json({ success: true, total: files.length, deleted, kept: files.length - deleted });
  } catch (e) {
    res.status(500).json({ error: '清理失败: ' + e.message });
  }
});

// --- Change password ---
app.post('/api/admin/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: '新密码至少6个字符' });
  }
  const admin = readJSON('admin.json');
  if (!bcrypt.compareSync(oldPassword, admin.passwordHash)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  admin.passwordHash = bcrypt.hashSync(newPassword, 10);
  writeJSON('admin.json', admin);
  res.json({ success: true, message: '密码修改成功' });
});

// SPA fallback for admin
app.get('/admin/*', (req, res) => {
  if (!req.path.includes('.')) {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`\n  f7goods server running at http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin`);
  console.log(`  Default credentials: admin / ${ADMIN_PASSWORD}\n`);
});
