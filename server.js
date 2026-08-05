const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
let sharp;
try { sharp = require('sharp'); } catch (e) { console.warn('sharp not installed, watermark disabled'); }
let NodeCache;
try { NodeCache = require('node-cache'); } catch (e) { console.warn('node-cache not installed, caching disabled'); }

// Cache setup
const apiCache = NodeCache ? new NodeCache({ stdTTL: 60, checkperiod: 120 }) : null;

function cacheMiddleware(duration = 60) {
  return (req, res, next) => {
    if (!apiCache) return next();
    const key = req.originalUrl;
    const cached = apiCache.get(key);
    if (cached) {
      return res.json(cached);
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      apiCache.set(key, body, duration);
      originalJson(body);
    };
    next();
  };
}

function clearApiCache(type) {
  if (!apiCache) return;
  if (type) {
    // Clear only related cache entries
    const keys = apiCache.keys();
    keys.forEach(key => {
      if (key.includes(type)) {
        apiCache.del(key);
      }
    });
  } else {
    apiCache.flushAll();
  }
}

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'f7goods_secret_2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'f7goods2026';

// Rate limiting for login endpoints
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const key = `${ip}_${req.path}`;
  const now = Date.now();
  const attempts = loginAttempts.get(key) || [];
  const recentAttempts = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '登录尝试过于频繁，请5分钟后再试' });
  }

  recentAttempts.push(now);
  loginAttempts.set(key, recentAttempts);
  next();
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of loginAttempts) {
    const recent = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) loginAttempts.delete(key);
    else loginAttempts.set(key, recent);
  }
}, 60000);

// Clean up like/want rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of likeWantAttempts) {
    const recent = attempts.filter(t => now - t < LIKE_WANT_RATE_LIMIT_WINDOW);
    if (recent.length === 0) likeWantAttempts.delete(key);
    else likeWantAttempts.set(key, recent);
  }
}, 60000);

// Clean up contact rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of contactAttempts) {
    const recent = attempts.filter(t => now - t < CONTACT_RATE_LIMIT_WINDOW);
    if (recent.length === 0) contactAttempts.delete(key);
    else contactAttempts.set(key, recent);
  }
}, 300000); // 5 minutes for contact (1 hour window)

// Clean up pageview rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of pageviewAttempts) {
    const recent = attempts.filter(t => now - t < PAGEVIEW_RATE_LIMIT_WINDOW);
    if (recent.length === 0) pageviewAttempts.delete(key);
    else pageviewAttempts.set(key, recent);
  }
}, 60000);

// Middleware
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public', { maxAge: '1d', etag: true }));
app.use('/admin', express.static('admin', { maxAge: '1d', etag: true }));
app.use('/uploads', express.static('uploads', { maxAge: '7d', etag: true }));

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
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

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
  // Clear related API cache when data changes
  const type = file.replace('.json', '');
  clearApiCache(type);
}

// Edit log system
function logEdit(user, action, target, details, imageUrl) {
  let log = [];
  try { log = readJSON('edit-log.json'); } catch {}
  if (!Array.isArray(log)) log = [];
  log.push({
    id: 'log' + Date.now(),
    time: new Date().toISOString(),
    user: user || '未知',
    action: action || '',
    target: target || '',
    details: details || '',
    imageUrl: imageUrl || ''
  });
  // Keep max 500 entries
  if (log.length > 500) log = log.slice(-500);
  writeJSON('edit-log.json', log);
}

// Author notifications system
function addAuthorNotification(circleId, type, title, message, rejectReason) {
  let notifications = [];
  try { notifications = readJSON('author-notifications.json'); } catch {}
  if (!Array.isArray(notifications)) notifications = [];
  notifications.push({
    id: 'notif' + Date.now(),
    circleId,
    type, // 'work', 'event', 'project', 'update'
    title,
    message,
    rejectReason: rejectReason || '',
    read: false,
    createdAt: new Date().toISOString()
  });
  // Keep max 200 notifications per author
  const authorNotifs = notifications.filter(n => n.circleId === circleId);
  if (authorNotifs.length > 200) {
    const toRemove = authorNotifs.slice(0, authorNotifs.length - 200);
    const removeIds = new Set(toRemove.map(n => n.id));
    notifications = notifications.filter(n => !removeIds.has(n.id) || n.circleId !== circleId);
  }
  writeJSON('author-notifications.json', notifications);
}

// Initialize admin password hash if placeholder
function initAdmin() {
  const admin = readJSON('admin.json');
  if (admin.passwordHash === '$2a$10$placeholder') {
    admin.passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    writeJSON('admin.json', admin);
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
app.post('/api/admin/login', rateLimitMiddleware, (req, res) => {
  const { username, password } = req.body;
  const admin = readJSON('admin.json');
  if (username !== admin.username || !bcrypt.compareSync(password, admin.passwordHash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// ===== Author Auth =====
function authorAuthMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未授权' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'author') return res.status(403).json({ error: '权限不足' });

    // Check if author account is still approved
    const circles = readJSON('circles.json');
    const circle = circles.find(c => c.id === decoded.circleId);
    if (!circle || circle.authorStatus !== 'approved') {
      return res.status(403).json({ error: '账号已被禁用，请重新申请', needReapply: true });
    }

    // Support X-Act-As header for switching author identity
    const actAs = req.headers['x-act-as'];
    if (actAs && actAs !== decoded.circleId) {
      const targetCircle = circles.find(c => c.id === actAs);
      if (!targetCircle) return res.status(404).json({ error: '目标作者不存在' });
      if (targetCircle.authorStatus !== 'approved') return res.status(403).json({ error: '目标作者账号未激活' });

      const isEditable = (targetCircle.editableBy || []).includes(decoded.circleId);
      if (!isEditable) return res.status(403).json({ error: '无权操作该作者后台' });

      req.author = { circleId: actAs, realCircleId: decoded.circleId };
    } else {
      req.author = { circleId: decoded.circleId };
    }

    next();
  } catch {
    res.status(401).json({ error: 'Token无效或已过期' });
  }
}

app.post('/api/author/register', rateLimitMiddleware, (req, res) => {
  const { circleId, username, password } = req.body;
  if (!circleId || !username || !password) return res.status(400).json({ error: '请填写完整信息' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === circleId);
  if (!circle) return res.status(404).json({ error: '作者未找到' });
  if (circle.username && circle.authorStatus !== 'rejected') return res.status(400).json({ error: '该作者已注册' });

  // 被拒绝的圈子重新注册时，清除旧数据
  if (circle.authorStatus === 'rejected') {
    delete circle.username;
    delete circle.passwordHash;
    delete circle.authorStatus;
  }

  // Check username uniqueness
  if (circles.some(c => c.username === username)) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  circle.username = username;
  circle.passwordHash = bcrypt.hashSync(password, 10);
  circle.authorStatus = 'pending';
  writeJSON('circles.json', circles);
  res.json({ success: true, message: '注册成功，等待管理员审批' });
});

app.post('/api/author/login', rateLimitMiddleware, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请填写完整信息' });

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.username === username);
  if (!circle) return res.status(401).json({ error: '用户名或密码错误' });
  if (!bcrypt.compareSync(password, circle.passwordHash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (circle.authorStatus !== 'approved') {
    return res.status(403).json({ error: '账号待审批，请联系管理员' });
  }

  const token = jwt.sign({ circleId: circle.id, role: 'author' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, circleId: circle.id, circleName: circle.name });
});

// Author: get own profile
app.get('/api/author/profile', authorAuthMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  if (!circle) return res.status(404).json({ error: '作者未找到' });
  // Return safe fields only
  const { passwordHash, ...safe } = circle;
  res.json(safe);
});

// Get accessible author accounts
app.get('/api/author/accessible-accounts', authorAuthMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const realCircleId = req.author.realCircleId || req.author.circleId;
  const currentCircle = circles.find(c => c.id === realCircleId);
  if (!currentCircle) return res.json([]);

  const accounts = [];

  // Own account
  accounts.push({
    id: currentCircle.id,
    name: currentCircle.name,
    isOwner: true,
    isActive: req.author.circleId === currentCircle.id
  });

  // Authorized accounts
  circles.forEach(c => {
    if (c.id !== realCircleId && (c.editableBy || []).includes(realCircleId) && c.authorStatus === 'approved') {
      accounts.push({
        id: c.id,
        name: c.name,
        isOwner: false,
        isActive: req.author.circleId === c.id
      });
    }
  });

  res.json(accounts);
});

// Author: update own profile
app.put('/api/author/profile', authorAuthMiddleware, (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.author.circleId);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const old = { ...circles[index] };

  // Only allow updating specific fields
  const allowed = ['name', 'description', 'category', 'logo', 'images', 'socialLinks'];
  const updates = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  circles[index] = { ...circles[index], ...updates };
  writeJSON('circles.json', circles);

  // Log specific changes
  const changes = [];
  if (updates.name && updates.name !== old.name) changes.push('修改了名称');
  if (updates.description !== undefined && updates.description !== old.description) changes.push('修改了简介');
  if (updates.logo && updates.logo !== old.logo) changes.push('更新了头像');
  if (updates.images) {
    const oldCount = (old.images || []).length;
    const newCount = (updates.images || []).length;
    if (newCount > oldCount) changes.push('新增了' + (newCount - oldCount) + '张图片');
    else if (newCount < oldCount) changes.push('删除了' + (oldCount - newCount) + '张图片');
  }
  if (updates.category && updates.category !== old.category) changes.push('修改了分类');
  logEdit(circles[index].name || '作者', '修改资料', '', changes.join('、') || '更新了资料');

  const { passwordHash, ...safe } = circles[index];
  res.json(safe);
});

// Author: change password
app.post('/api/author/change-password', authorAuthMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写完整信息' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });

  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.author.circleId);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  if (!bcrypt.compareSync(oldPassword, circles[index].passwordHash)) {
    return res.status(401).json({ error: '旧密码错误' });
  }

  circles[index].passwordHash = bcrypt.hashSync(newPassword, 10);
  writeJSON('circles.json', circles);
  res.json({ success: true });
});

// Author: get own works
app.get('/api/author/works', authorAuthMiddleware, (req, res) => {
  const works = readJSON('works.json');
  const circleWorks = works.filter(w => (w.circles || []).includes(req.author.circleId));
  res.json(circleWorks);
});

// Author: reorder works
app.post('/api/author/works/reorder', authorAuthMiddleware, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: '无效的排序数据' });

  let works = readJSON('works.json');
  orderedIds.forEach((id, index) => {
    const work = works.find(w => w.id === id);
    if (work && (work.circles || []).includes(req.author.circleId)) {
      work.order = index;
    }
  });
  writeJSON('works.json', works);
  res.json({ success: true });
});

// Author: import works from Excel
app.post('/api/author/works/import', authorAuthMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });

  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    let works = readJSON('works.json');
    let categories = { works: [], workStatus: [] };
    try { categories = readJSON('categories.json'); } catch {}

    const CATEGORY_MAP = {};
    categories.works.forEach(c => { CATEGORY_MAP[c.name] = c.id; CATEGORY_MAP[c.id] = c.id; });
    const STATUS_MAP = {};
    categories.workStatus.forEach(c => { STATUS_MAP[c.name] = c.id; STATUS_MAP[c.id] = c.id; });

    let added = 0, updated = 0;

    rows.forEach(row => {
      const title = row['作品名称'] || row['标题'] || '';
      if (!title) return;

      const existing = works.find(w => w.title === title && (w.circles || []).includes(req.author.circleId));
      const isCommissioned = (row['约稿作品'] || '').toString().trim() === '是';
      const contactType = (row['联系方式类型'] || '').toString().trim();
      const contactValue = (row['联系方式'] || '').toString().trim();
      const socialLinks = {};
      if (contactType === 'QQ' && contactValue) socialLinks.qq = contactValue;
      else if (contactType === 'QQ群' && contactValue) socialLinks.qqGroup = contactValue;

      const workData = {
        title,
        category: CATEGORY_MAP[row['分类']] || 'other',
        status: STATUS_MAP[row['状态']] || 'on_sale',
        price: row['价格'] || '',
        releaseDate: row['发售日期'] || '',
        tags: (row['标签'] || '').split(',').map(t => t.trim()).filter(Boolean),
        description: row['作品描述'] || row['描述'] || '',
        isCommissioned,
        commissionedBy: isCommissioned ? (row['约稿作者'] || '') : '',
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined
      };

      if (existing) {
        Object.assign(existing, workData);
        if (workData.socialLinks) existing.socialLinks = workData.socialLinks;
        updated++;
      } else {
        works.push({
          id: 'w' + Date.now() + Math.random().toString(36).substr(2, 5),
          ...workData,
          circles: [req.author.circleId],
          images: [],
          moreImages: [],
          likes: 0,
          wants: 0,
          order: works.length,
          createdAt: new Date().toISOString()
        });
        added++;
      }
    });

    writeJSON('works.json', works);
    fs.unlinkSync(req.file.path);

    const circles = readJSON('circles.json');
    const circle = circles.find(c => c.id === req.author.circleId);
    logEdit(circle?.name || '作者', '导入作品', '', `新增${added}个，更新${updated}个`);

    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

// Author: get own edit history
app.get('/api/author/history', authorAuthMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  if (!circle) return res.json([]);

  let log = [];
  try { log = readJSON('edit-log.json'); } catch {}
  if (!Array.isArray(log)) log = [];

  const authorLog = log.filter(entry => entry.user === circle.name);
  res.json(authorLog.reverse().slice(0, 100));
});

// Author: get notifications
app.get('/api/author/notifications', authorAuthMiddleware, (req, res) => {
  let notifications = [];
  try { notifications = readJSON('author-notifications.json'); } catch {}
  if (!Array.isArray(notifications)) notifications = [];

  const authorNotifs = notifications
    .filter(n => n.circleId === req.author.circleId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
  res.json(authorNotifs);
});

// Author: mark notification as read
app.put('/api/author/notifications/:id/read', authorAuthMiddleware, (req, res) => {
  let notifications = [];
  try { notifications = readJSON('author-notifications.json'); } catch {}
  if (!Array.isArray(notifications)) notifications = [];

  const index = notifications.findIndex(n => n.id === req.params.id && n.circleId === req.author.circleId);
  if (index === -1) return res.status(404).json({ error: '通知未找到' });

  notifications[index].read = true;
  writeJSON('author-notifications.json', notifications);
  res.json({ success: true });
});

// Author: update own work
app.put('/api/author/works/:id', authorAuthMiddleware, (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });

  // Verify the work belongs to this author
  if (!(works[index].circles || []).includes(req.author.circleId)) {
    return res.status(403).json({ error: '无权编辑此作品' });
  }

  const oldTitle = works[index].title;
  const oldImages = works[index].images || [];
  const oldMoreImages = works[index].moreImages || [];

  // Only allow updating specific fields
  const allowed = ['title', 'description', 'category', 'status', 'price', 'releaseDate', 'tags', 'images', 'moreImages', 'socialLinks', 'isCommissioned', 'commissionedBy'];
  const updates = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  works[index] = { ...works[index], ...updates };
  writeJSON('works.json', works);

  // Handle project associations if provided
  if (req.body.relatedProjects !== undefined) {
    let projects = readJSON('projects.json');
    const newProjectIds = req.body.relatedProjects || [];
    projects.forEach(proj => {
      const hasWork = (proj.works || []).includes(req.params.id);
      const shouldHave = newProjectIds.includes(proj.id);
      if (hasWork && !shouldHave) {
        proj.works = proj.works.filter(id => id !== req.params.id);
      } else if (!hasWork && shouldHave) {
        if (!proj.works) proj.works = [];
        proj.works.push(req.params.id);
      }
    });
    writeJSON('projects.json', projects);
  }

  // Log changes
  const newImages = works[index].images || [];
  const newMoreImages = works[index].moreImages || [];
  const details = [];
  if (newImages.length > oldImages.length) details.push('上传了' + (newImages.length - oldImages.length) + '张展示图片');
  if (newImages.length < oldImages.length) details.push('删除了' + (oldImages.length - newImages.length) + '张展示图片');
  if (newMoreImages.length > oldMoreImages.length) details.push('上传了' + (newMoreImages.length - oldMoreImages.length) + '张更多图片');
  if (newMoreImages.length < oldMoreImages.length) details.push('删除了' + (oldMoreImages.length - newMoreImages.length) + '张更多图片');
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '编辑作品', oldTitle || req.params.id, details.join('、'));

  res.json(works[index]);
});

// Author: create new work
app.post('/api/author/works', authorAuthMiddleware, (req, res) => {
  let works = readJSON('works.json');
  const maxOrder = works.reduce((max, w) => Math.max(max, w.order ?? 0), 0);
  // Check if work approval is required
  let settings = {};
  try { settings = readJSON('settings.json'); } catch {}
  const requireApproval = settings.site?.requireWorkApproval !== false;
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'titleEn', 'category', 'price', 'status', 'releaseDate', 'tags', 'description', 'images', 'moreImages', 'isCommissioned', 'commissionedBy', 'socialLinks'];
  const workData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) workData[field] = req.body[field];
  });
  const work = {
    id: 'w' + Date.now(),
    circles: [req.author.circleId],
    images: [],
    moreImages: [],
    tags: [],
    likes: 0,
    wants: 0,
    order: maxOrder + 1,
    createdAt: new Date().toISOString(),
    approvalStatus: requireApproval ? 'pending' : 'approved',
    submittedBy: req.author.circleId,
    ...workData
  };
  works.push(work);
  writeJSON('works.json', works);

  // Handle project associations
  if (req.body.relatedProjects && req.body.relatedProjects.length > 0) {
    let projects = readJSON('projects.json');
    req.body.relatedProjects.forEach(pid => {
      const proj = projects.find(p => p.id === pid);
      if (proj) {
        if (!proj.works) proj.works = [];
        proj.works.push(work.id);
      }
    });
    writeJSON('projects.json', projects);
  }

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '创建作品', work.title || work.id, '');

  res.json(work);
});

// Author: delete own work
app.delete('/api/author/works/:id', authorAuthMiddleware, (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });

  // Verify the work belongs to this author
  if (!(works[index].circles || []).includes(req.author.circleId)) {
    return res.status(403).json({ error: '无权删除此作品' });
  }

  const workTitle = works[index].title;
  works.splice(index, 1);
  writeJSON('works.json', works);

  // Log the deletion
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '删除作品', workTitle || req.params.id, '');

  res.json({ success: true });
});

// Author: get images list
app.get('/api/author/images', authorAuthMiddleware, (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  let meta = {};
  try { meta = readJSON('uploads-meta.json'); } catch {}
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  const authorName = circle?.name || '未知作者';
  try {
    const files = fs.readdirSync(uploadsDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
      .filter(f => (meta[f]?.uploader || '') === authorName)
      .map(f => ({
        name: f,
        url: '/uploads/' + f,
        size: fs.statSync(path.join(uploadsDir, f)).size,
        time: fs.statSync(path.join(uploadsDir, f)).mtime,
        uploader: meta[f]?.uploader || '未知',
        uploadedAt: meta[f]?.uploadedAt || null
      }))
      .sort((a, b) => b.time - a.time);
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

// Author: delete own image
app.delete('/api/author/images/:filename', authorAuthMiddleware, (req, res) => {
  const filename = req.params.filename;
  let meta = {};
  try { meta = readJSON('uploads-meta.json'); } catch {}
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  const authorName = circle?.name || '未知作者';
  const safeFilename = path.basename(filename); // Prevent path traversal
  if ((meta[safeFilename]?.uploader || '') !== authorName) {
    return res.status(403).json({ error: '只能删除自己上传的图片' });
  }
  const uploadsDir = path.join(__dirname, 'uploads');
  const filePath = path.join(uploadsDir, safeFilename);
  if (!filePath.startsWith(uploadsDir)) return res.status(403).json({ error: '禁止访问' });
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    delete meta[filename];
    writeJSON('uploads-meta.json', meta);
    logEdit(authorName, '删除图片', filename, '');
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '文件不存在' });
  }
});

// Author: get projects list
app.get('/api/author/projects', authorAuthMiddleware, (req, res) => {
  const projects = readJSON('projects.json');
  res.json(projects);
});

// Author: get events list
app.get('/api/author/events', authorAuthMiddleware, (req, res) => {
  const events = readJSON('events.json');
  res.json(events);
});

// Author: toggle event association
app.put('/api/author/events/:id/toggle', authorAuthMiddleware, (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });

  const circleId = req.author.circleId;
  if (!events[index].relatedCircles) events[index].relatedCircles = [];

  const idx = events[index].relatedCircles.indexOf(circleId);
  if (idx === -1) {
    events[index].relatedCircles.push(circleId);
  } else {
    events[index].relatedCircles.splice(idx, 1);
  }

  writeJSON('events.json', events);
  res.json(events[index]);
});

// Author: toggle project association
app.put('/api/author/projects/:id/toggle', authorAuthMiddleware, (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });

  const circleId = req.author.circleId;
  if (!projects[index].circles) projects[index].circles = [];

  const idx = projects[index].circles.indexOf(circleId);
  if (idx === -1) {
    projects[index].circles.push(circleId);
  } else {
    projects[index].circles.splice(idx, 1);
  }

  writeJSON('projects.json', projects);
  res.json(projects[index]);
});

// ===== Author: Create Events/Projects/Updates (with approval) =====

// Author: get own events
app.get('/api/author/my-events', authorAuthMiddleware, (req, res) => {
  const events = readJSON('events.json');
  const circleId = req.author.circleId;
  const myEvents = events.filter(e =>
    e.submittedBy === circleId ||
    (e.editableBy || []).includes(circleId)
  );
  res.json(myEvents);
});

// Author: create event
app.post('/api/author/my-events', authorAuthMiddleware, (req, res) => {
  let events = readJSON('events.json');
  const maxOrder = events.reduce((max, e) => Math.max(max, e.order ?? 0), 0);
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'date', 'endDate', 'location', 'description', 'coverImage', 'images', 'booth', 'status'];
  const eventData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) eventData[field] = req.body[field];
  });
  const event = {
    id: 'e' + Date.now(),
    ...eventData,
    relatedCircles: [req.author.circleId],
    approvalStatus: 'pending',
    submittedBy: req.author.circleId,
    order: maxOrder + 1
  };
  events.push(event);
  writeJSON('events.json', events);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '提交活动', event.title || event.id, '待审核');

  res.json(event);
});

// Author: update own event (re-approval required)
app.put('/api/author/my-events/:id', authorAuthMiddleware, (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  const circleId = req.author.circleId;
  const isOwner = events[index].submittedBy === circleId;
  const isEditable = (events[index].editableBy || []).includes(circleId);
  if (!isOwner && !isEditable) return res.status(403).json({ error: '无权编辑此活动' });

  const allowed = ['title', 'date', 'endDate', 'location', 'description', 'coverImage', 'images', 'booth', 'status', 'socialLinks'];
  const updates = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  events[index] = { ...events[index], ...updates, approvalStatus: 'pending' };
  writeJSON('events.json', events);
  res.json(events[index]);
});

// Author: delete own event (any status)
app.delete('/api/author/my-events/:id', authorAuthMiddleware, (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  if (events[index].submittedBy !== req.author.circleId) return res.status(403).json({ error: '无权删除此活动' });

  const eventTitle = events[index].title;
  events.splice(index, 1);
  writeJSON('events.json', events);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '删除活动', eventTitle || req.params.id, '');

  res.json({ success: true });
});

// Author: get own projects
app.get('/api/author/my-projects', authorAuthMiddleware, (req, res) => {
  const projects = readJSON('projects.json');
  const circleId = req.author.circleId;
  const myProjects = projects.filter(p =>
    p.submittedBy === circleId ||
    (p.editableBy || []).includes(circleId)
  );
  res.json(myProjects);
});

// Author: create project
app.post('/api/author/my-projects', authorAuthMiddleware, (req, res) => {
  let projects = readJSON('projects.json');
  const maxOrder = projects.reduce((max, p) => Math.max(max, p.order ?? 0), 0);
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'description', 'status', 'category', 'images', 'tags', 'contactInfo', 'startDate', 'endDate', 'socialLinks', 'coverImage'];
  const projectData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) projectData[field] = req.body[field];
  });
  const project = {
    id: 'p' + Date.now(),
    ...projectData,
    circles: [req.author.circleId],
    approvalStatus: 'pending',
    submittedBy: req.author.circleId,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  projects.push(project);
  writeJSON('projects.json', projects);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '提交企划', project.title || project.id, '待审核');

  res.json(project);
});

// Author: update own project (re-approval required)
app.put('/api/author/my-projects/:id', authorAuthMiddleware, (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  const circleId = req.author.circleId;
  const isOwner = projects[index].submittedBy === circleId;
  const isEditable = (projects[index].editableBy || []).includes(circleId);
  if (!isOwner && !isEditable) return res.status(403).json({ error: '无权编辑此企划' });

  const allowed = ['title', 'description', 'status', 'category', 'images', 'tags', 'contactInfo', 'startDate', 'endDate', 'socialLinks', 'coverImage'];
  const updates = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  projects[index] = { ...projects[index], ...updates, approvalStatus: 'pending' };
  writeJSON('projects.json', projects);
  res.json(projects[index]);
});

// Author: delete own project (any status)
app.delete('/api/author/my-projects/:id', authorAuthMiddleware, (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  if (projects[index].submittedBy !== req.author.circleId) return res.status(403).json({ error: '无权删除此企划' });

  const projectTitle = projects[index].title;
  projects.splice(index, 1);
  writeJSON('projects.json', projects);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '删除企划', projectTitle || req.params.id, '');

  res.json({ success: true });
});

// Author: get own updates
app.get('/api/author/my-updates', authorAuthMiddleware, (req, res) => {
  const updates = readJSON('updates.json');
  const circleId = req.author.circleId;
  const myUpdates = updates.filter(u =>
    u.submittedBy === circleId ||
    (u.editableBy || []).includes(circleId)
  );
  res.json(myUpdates);
});

// Author: create update
app.post('/api/author/my-updates', authorAuthMiddleware, (req, res) => {
  let updates = readJSON('updates.json');
  const update = {
    id: 'upd' + Date.now(),
    title: req.body.title || '',
    content: req.body.content || '',
    publishDate: req.body.publishDate || new Date().toISOString().split('T')[0],
    pinned: false,
    coverImage: req.body.coverImage || '',
    images: req.body.images || [],
    relatedCircles: [req.author.circleId],
    relatedEvents: req.body.relatedEvents || [],
    relatedProjects: req.body.relatedProjects || [],
    approvalStatus: 'pending',
    submittedBy: req.author.circleId,
    createdAt: new Date().toISOString()
  };
  updates.push(update);
  writeJSON('updates.json', updates);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '提交动态', update.title || update.id, '待审核');

  res.json(update);
});

// Author: update own update (re-approval required)
app.put('/api/author/my-updates/:id', authorAuthMiddleware, (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  const circleId = req.author.circleId;
  const isOwner = updates[index].submittedBy === circleId;
  const isEditable = (updates[index].editableBy || []).includes(circleId);
  if (!isOwner && !isEditable) return res.status(403).json({ error: '无权编辑此动态' });

  const allowed = ['title', 'content', 'publishDate', 'coverImage', 'images', 'relatedEvents', 'relatedProjects'];
  const updates2 = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates2[field] = req.body[field];
  });

  updates[index] = { ...updates[index], ...updates2, approvalStatus: 'pending' };
  writeJSON('updates.json', updates);
  res.json(updates[index]);
});

// Author: delete own update (any status)
app.delete('/api/author/my-updates/:id', authorAuthMiddleware, (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  if (updates[index].submittedBy !== req.author.circleId) return res.status(403).json({ error: '无权删除此动态' });

  const updateTitle = updates[index].title;
  updates.splice(index, 1);
  writeJSON('updates.json', updates);

  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  logEdit(circle?.name || '作者', '删除动态', updateTitle || req.params.id, '');

  res.json({ success: true });
});

// Admin: approve author
app.post('/api/admin/circles/:id/approve-author', authMiddleware, (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });
  if (!circles[index].username) return res.status(400).json({ error: '该作者未注册' });

  circles[index].authorStatus = 'approved';
  writeJSON('circles.json', circles);
  res.json({ success: true });
});

// Admin: reject author
app.post('/api/admin/circles/:id/reject-author', authMiddleware, (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const authorName = circles[index].username;
  delete circles[index].username;
  delete circles[index].passwordHash;
  delete circles[index].authorStatus;
  writeJSON('circles.json', circles);

  logEdit('管理员', '拒绝作者账号', circles[index].name, `原账号: ${authorName || '无'}`);
  res.json({ success: true });
});

// Admin: remove author account
app.post('/api/admin/circles/:id/remove-author', authMiddleware, (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const authorName = circles[index].username;
  delete circles[index].username;
  delete circles[index].passwordHash;
  delete circles[index].authorStatus;
  writeJSON('circles.json', circles);

  logEdit('管理员', '删除作者账号', circles[index].name, `原账号: ${authorName || '无'}`);
  res.json({ success: true });
});

// Admin: set editors for author
app.post('/api/admin/circles/:id/set-editors', authMiddleware, (req, res) => {
  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  const { editorIds } = req.body;
  circles[index].editableBy = Array.isArray(editorIds) ? editorIds : [];
  writeJSON('circles.json', circles);

  logEdit('管理员', '修改作者编辑者', circles[index].name, `编辑者数量: ${circles[index].editableBy.length}`);
  res.json({ success: true });
});

// Admin: reset author password
app.post('/api/admin/circles/:id/reset-password', authMiddleware, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: '密码至少6位' });

  let circles = readJSON('circles.json');
  const index = circles.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作者未找到' });

  circles[index].passwordHash = bcrypt.hashSync(newPassword, 10);
  writeJSON('circles.json', circles);
  res.json({ success: true });
});

// ===== Public API =====
// Works
app.get('/api/works', cacheMiddleware(60), (req, res) => {
  let works = readJSON('works.json');
  // Only return approved works (or legacy works without approvalStatus)
  works = works.filter(w => !w.approvalStatus || w.approvalStatus === 'approved');
  const { category, search, status, circleId, eventId } = req.query;
  if (category) works = works.filter(w => w.category === category);
  if (status) works = works.filter(w => w.status === status);
  if (circleId) works = works.filter(w => (w.circles || []).includes(circleId));
  if (eventId) {
    const events = readJSON('events.json');
    const event = events.find(e => e.id === eventId);
    if (event && event.relatedWorks) {
      works = works.filter(w => event.relatedWorks.includes(w.id));
    } else {
      works = [];
    }
  }
  if (search) {
    const s = search.toLowerCase();
    works = works.filter(w =>
      (w.title || '').toLowerCase().includes(s) ||
      (w.titleEn && w.titleEn.toLowerCase().includes(s)) ||
      (w.tags || []).some(t => (t || '').toLowerCase().includes(s))
    );
  }
  works.sort((a, b) => a.order - b.order);
  res.json(works);
});

app.get('/api/works/:id', (req, res) => {
  const works = readJSON('works.json');
  const work = works.find(w => w.id === req.params.id);
  if (!work) return res.status(404).json({ error: '作品未找到' });
  // Only return approved works (or legacy works without approvalStatus)
  if (work.approvalStatus && work.approvalStatus !== 'approved') {
    return res.status(404).json({ error: '作品未找到' });
  }
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

// Rate limiting for like/want endpoints
const likeWantAttempts = new Map();
const LIKE_WANT_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const LIKE_WANT_RATE_LIMIT_MAX = 10; // max 10 operations per minute per IP

function likeWantRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const attempts = likeWantAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => now - t < LIKE_WANT_RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= LIKE_WANT_RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
  }

  recentAttempts.push(now);
  likeWantAttempts.set(ip, recentAttempts);
  next();
}

app.post('/api/works/:id/like', likeWantRateLimit, (req, res) => {
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
  res.json({ likes: works[index].likes });
});

app.post('/api/works/:id/unlike', likeWantRateLimit, (req, res) => {
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
  res.json({ likes: works[index].likes });
});

app.post('/api/works/:id/want', likeWantRateLimit, (req, res) => {
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
  res.json({ wants: works[index].wants });
});

app.get('/api/works/:id/want-status', (req, res) => {
  const workId = req.params.id;
  const uid = req.query.uid;
  if (!uid) return res.json({ wanted: false });
  const wanted = wantsCache[workId] ? wantsCache[workId].includes(uid) : false;
  res.json({ wanted });
});

app.post('/api/works/:id/unwant', likeWantRateLimit, (req, res) => {
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
  res.json({ wants: works[index].wants });
});

// Events
app.get('/api/events', cacheMiddleware(60), (req, res) => {
  let events = readJSON('events.json');
  // Only return approved events (or legacy events without approvalStatus)
  events = events.filter(e => !e.approvalStatus || e.approvalStatus === 'approved');
  const { circleId } = req.query;
  if (circleId) events = events.filter(e => (e.relatedCircles || []).includes(circleId));
  events.sort((a, b) => a.order - b.order);
  res.json(events);
});

app.get('/api/events/:id', (req, res) => {
  const events = readJSON('events.json');
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: '活动未找到' });
  // Only return approved events (or legacy events without approvalStatus)
  if (event.approvalStatus && event.approvalStatus !== 'approved') {
    return res.status(404).json({ error: '活动未找到' });
  }
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

// Ensure order on startup (not during public GET requests)
function ensureAllOrders() {
  ['works.json', 'events.json', 'circles.json', 'projects.json'].forEach(file => {
    try {
      const items = readJSON(file);
      if (ensureOrder(items)) writeJSON(file, items);
    } catch {}
  });
}
ensureAllOrders();

app.get('/api/circles', cacheMiddleware(60), (req, res) => {
  let circles = readJSON('circles.json');
  const { search } = req.query;
  if (search) {
    const s = search.toLowerCase();
    circles = circles.filter(c =>
      (c.name || '').toLowerCase().includes(s)
    );
  }
  circles.sort((a, b) => a.order - b.order);
  // Remove sensitive fields
  const safeCircles = circles.map(c => {
    const { passwordHash, username, authorStatus, editableBy, ...safe } = c;
    return safe;
  });
  res.json(safeCircles);
});

app.get('/api/circles/:id', (req, res) => {
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.params.id);
  if (!circle) return res.status(404).json({ error: '作者未找到' });
  // Remove sensitive fields
  const { passwordHash, username, authorStatus, editableBy, ...safe } = circle;
  res.json(safe);
});

// Circles available for registration (no username or rejected)
app.get('/api/circles/registrable', (req, res) => {
  const circles = readJSON('circles.json');
  const registrable = circles
    .filter(c => !c.username || c.authorStatus !== 'approved')
    .sort((a, b) => a.order - b.order)
    .map(c => ({ id: c.id, name: c.name, logo: c.logo }));
  res.json(registrable);
});

// Projects
app.get('/api/projects', cacheMiddleware(60), (req, res) => {
  let projects = readJSON('projects.json');
  // Only return approved projects (or legacy projects without approvalStatus)
  projects = projects.filter(p => !p.approvalStatus || p.approvalStatus === 'approved');
  const { category, status, search } = req.query;
  if (category) projects = projects.filter(p => p.category === category);
  if (status) projects = projects.filter(p => p.status === status);
  if (search) {
    const s = search.toLowerCase();
    projects = projects.filter(p =>
      (p.title || '').toLowerCase().includes(s) ||
      (p.description || '').toLowerCase().includes(s) ||
      (p.tags || []).some(t => (t || '').toLowerCase().includes(s))
    );
  }
  projects.sort((a, b) => a.order - b.order);
  res.json(projects);
});

app.get('/api/projects/:id', (req, res) => {
  const projects = readJSON('projects.json');
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: '企划未找到' });
  // Only return approved projects (or legacy projects without approvalStatus)
  if (project.approvalStatus && project.approvalStatus !== 'approved') {
    return res.status(404).json({ error: '企划未找到' });
  }
  res.json(project);
});

// Categories
app.get('/api/categories', (req, res) => {
  res.json(readJSON('categories.json'));
});

// Contact form with rate limiting
const contactAttempts = new Map();
const CONTACT_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const CONTACT_RATE_LIMIT_MAX = 5; // max 5 submissions per hour

function contactRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const attempts = contactAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => now - t < CONTACT_RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= CONTACT_RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '提交过于频繁，请1小时后再试' });
  }

  recentAttempts.push(now);
  contactAttempts.set(ip, recentAttempts);
  next();
}

app.post('/api/contact', contactRateLimit, (req, res) => {
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
if (!pageviews.visitors) pageviews.visitors = {};

function savePageviews() {
  writeJSON('pageviews.json', pageviews);
}

// Helper: get current date in Chinese time (UTC+8)
function getChinaDate() {
  const now = new Date();
  // China is UTC+8, so add 8 hours
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.toISOString().slice(0, 10);
}

// Helper: get date string N days ago in Chinese time
function getChinaDateDaysAgo(days) {
  const now = new Date();
  const target = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const chinaTime = new Date(target.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.toISOString().slice(0, 10);
}

// Auto-cleanup: remove data older than 365 days (Chinese time)
function cleanupOldPageviews() {
  const cutoffStr = getChinaDateDaysAgo(365);
  let cleaned = false;

  // Clean daily views
  for (const date of Object.keys(pageviews.daily)) {
    if (date < cutoffStr) {
      delete pageviews.daily[date];
      cleaned = true;
    }
  }

  // Clean visitor data
  for (const date of Object.keys(pageviews.visitors)) {
    if (date < cutoffStr) {
      delete pageviews.visitors[date];
      cleaned = true;
    }
  }

  if (cleaned) {
    savePageviews();
    console.log('[Pageviews] Cleaned up data older than', cutoffStr);
  }
}

// Run cleanup on server start
cleanupOldPageviews();

// Schedule cleanup to run daily at Chinese midnight (00:05 AM UTC+8)
function scheduleDailyCleanup() {
  const now = new Date();
  // Calculate next Chinese midnight (00:05 AM UTC+8 = 16:05 UTC previous day)
  const utcNow = now.getTime();
  // Current UTC hour
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  // Chinese midnight is 16:00 UTC
  let msUntilChineseMidnight;
  if (utcHour < 16 || (utcHour === 16 && utcMinute < 5)) {
    // Before 16:05 UTC today, schedule for today 16:05 UTC
    const target = new Date(now);
    target.setUTCHours(16, 5, 0, 0);
    msUntilChineseMidnight = target - now;
  } else {
    // After 16:05 UTC, schedule for tomorrow 16:05 UTC
    const target = new Date(now);
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(16, 5, 0, 0);
    msUntilChineseMidnight = target - now;
  }

  setTimeout(() => {
    cleanupOldPageviews();
    // Then run every 24 hours
    setInterval(cleanupOldPageviews, 24 * 60 * 60 * 1000);
  }, msUntilChineseMidnight);
}
scheduleDailyCleanup();

// Rate limiting for pageview tracking
const pageviewAttempts = new Map();
const PAGEVIEW_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const PAGEVIEW_RATE_LIMIT_MAX = 30; // max 30 pageviews per minute per IP

function pageviewRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const attempts = pageviewAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => now - t < PAGEVIEW_RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= PAGEVIEW_RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '请求过于频繁' });
  }

  recentAttempts.push(now);
  pageviewAttempts.set(ip, recentAttempts);
  next();
}

app.post('/api/pageview', pageviewRateLimit, (req, res) => {
  const today = getChinaDate(); // Use Chinese time
  pageviews.daily[today] = (pageviews.daily[today] || 0) + 1;
  // Track unique visitors by IP
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!pageviews.visitors[today]) pageviews.visitors[today] = [];
  if (!pageviews.visitors[today].includes(ip)) {
    pageviews.visitors[today].push(ip);
  }
  savePageviews();
  res.json({ ok: true });
});

app.get('/api/admin/pageviews', authMiddleware, (req, res) => {
  res.json(pageviews);
});

// Manual trigger cleanup for admin
app.post('/api/admin/pageviews/cleanup', authMiddleware, (req, res) => {
  const before = {
    dailyCount: Object.keys(pageviews.daily).length,
    visitorCount: Object.keys(pageviews.visitors).length
  };
  cleanupOldPageviews();
  const after = {
    dailyCount: Object.keys(pageviews.daily).length,
    visitorCount: Object.keys(pageviews.visitors).length
  };
  res.json({
    success: true,
    message: '清理完成',
    before,
    after
  });
});

// Edit log
app.get('/api/admin/edit-log', authMiddleware, (req, res) => {
  let log = [];
  try { log = readJSON('edit-log.json'); } catch {}
  if (!Array.isArray(log)) log = [];
  res.json(log.reverse().slice(0, 200));
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
    const today = getChinaDate();
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
    const today = getChinaDate();
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
  // Whitelist allowed fields
  const allowedFields = ['title', 'content', 'publishDate', 'pinned', 'popup'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  announcements[index] = { ...announcements[index], ...updates };
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

// ===== Author Announcements (Admin to Author) =====

// Helper: get author announcement reads
function getAuthorAnnouncementReads() {
  try { return readJSON('author-announcement-reads.json'); } catch { return {}; }
}
function saveAuthorAnnouncementReads(reads) {
  writeJSON('author-announcement-reads.json', reads);
}

// Admin: send announcement to authors
app.post('/api/admin/author-announcements', authMiddleware, (req, res) => {
  const { title, content, circleIds, pinned, popup } = req.body;
  if (!title || !content) return res.status(400).json({ error: '请填写标题和内容' });

  const circles = readJSON('circles.json');
  let targetCircles;

  if (circleIds && circleIds.length > 0) {
    // Send to specific authors
    targetCircles = circles.filter(c => circleIds.includes(c.id) && c.authorStatus === 'approved');
  } else {
    // Send to all approved authors
    targetCircles = circles.filter(c => c.authorStatus === 'approved');
  }

  if (targetCircles.length === 0) return res.status(400).json({ error: '没有目标作者' });

  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}

  const announcement = {
    id: 'aa' + Date.now(),
    title,
    content,
    sentTo: targetCircles.map(c => c.id),
    pinned: pinned || false,
    popup: popup || false,
    sentAt: new Date().toISOString()
  };

  announcements.push(announcement);
  writeJSON('author-announcements.json', announcements);

  res.json({ success: true, sentTo: targetCircles.length, announcement });
});

// Admin: get all author announcements
app.get('/api/admin/author-announcements', authMiddleware, (req, res) => {
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}
  announcements.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  res.json(announcements);
});

// Admin: get read status for an announcement
app.get('/api/admin/author-announcements/:id/read-status', authMiddleware, (req, res) => {
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}
  const announcement = announcements.find(a => a.id === req.params.id);
  if (!announcement) return res.status(404).json({ error: '公告不存在' });

  const reads = getAuthorAnnouncementReads();
  const readCircleIds = reads[announcement.id] || [];

  const circles = readJSON('circles.json');
  const sentCircles = circles.filter(c => announcement.sentTo.includes(c.id));
  const readAuthors = sentCircles.filter(c => readCircleIds.includes(c.id));
  const unreadAuthors = sentCircles.filter(c => !readCircleIds.includes(c.id));

  res.json({
    total: sentCircles.length,
    read: readAuthors.map(c => ({ id: c.id, name: c.name })),
    unread: unreadAuthors.map(c => ({ id: c.id, name: c.name }))
  });
});

// Admin: delete author announcement
app.delete('/api/admin/author-announcements/:id', authMiddleware, (req, res) => {
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}
  const idx = announcements.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '公告不存在' });
  announcements.splice(idx, 1);
  writeJSON('author-announcements.json', announcements);
  // Also clean up read records
  const reads = getAuthorAnnouncementReads();
  delete reads[req.params.id];
  saveAuthorAnnouncementReads(reads);
  res.json({ success: true });
});

// Author: get own announcements
app.get('/api/author/announcements', authorAuthMiddleware, (req, res) => {
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}

  const circleId = req.author.circleId;
  const reads = getAuthorAnnouncementReads();

  // All announcements visible to all approved authors
  const myAnnouncements = announcements.map(a => ({
    ...a,
    read: (reads[a.id] || []).includes(circleId)
  }));

  myAnnouncements.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.sentAt) - new Date(a.sentAt);
  });

  res.json(myAnnouncements);
});

// Author: get popup announcements
app.get('/api/author/announcements/popup', authorAuthMiddleware, (req, res) => {
  let announcements = [];
  try { announcements = readJSON('author-announcements.json'); } catch {}

  const circleId = req.author.circleId;
  const reads = getAuthorAnnouncementReads();

  const popupAnnouncements = announcements
    .filter(a => a.popup && !(reads[a.id] || []).includes(circleId));

  popupAnnouncements.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  res.json(popupAnnouncements);
});

// Author: mark announcement as read
app.put('/api/author/announcements/:id/read', authorAuthMiddleware, (req, res) => {
  const circleId = req.author.circleId;
  const reads = getAuthorAnnouncementReads();

  if (!reads[req.params.id]) reads[req.params.id] = [];
  if (!reads[req.params.id].includes(circleId)) {
    reads[req.params.id].push(circleId);
    saveAuthorAnnouncementReads(reads);
  }

  res.json({ success: true });
});

// --- Admin Contacts ---
app.get('/api/admin/contacts', authMiddleware, (req, res) => {
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];

  // Search filter
  const { search } = req.query;
  if (search) {
    const s = search.toLowerCase();
    contacts = contacts.filter(c =>
      (c.name && c.name.toLowerCase().includes(s)) ||
      (c.email && c.email.toLowerCase().includes(s)) ||
      (c.subject && c.subject.toLowerCase().includes(s)) ||
      (c.message && c.message.toLowerCase().includes(s))
    );
  }

  // Sort by date descending
  contacts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(contacts);
});

app.put('/api/admin/contacts/:id/read', authMiddleware, (req, res) => {
  let contacts = [];
  try { contacts = readJSON('contact.json'); } catch {}
  if (!Array.isArray(contacts)) contacts = [];
  const index = contacts.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '消息未找到' });
  contacts[index].read = true;
  writeJSON('contact.json', contacts);
  res.json({ success: true });
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

  // Pagination (only if page/limit params provided)
  if (req.query.page || req.query.limit) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const total = works.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = works.slice(start, start + limit);
    return res.json({ items, total, page, limit, totalPages });
  }

  res.json(works);
});

app.post('/api/admin/works', authMiddleware, (req, res) => {
  const works = readJSON('works.json');
  const maxOrder = works.reduce((max, w) => Math.max(max, w.order ?? 0), 0);
  // Whitelist allowed fields
  const allowedFields = ['title', 'titleEn', 'category', 'price', 'status', 'releaseDate', 'tags', 'description', 'images', 'moreImages', 'circles', 'isCommissioned', 'commissionedBy', 'socialLinks'];
  const workData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) workData[field] = req.body[field];
  });
  const work = {
    id: 'w' + Date.now(),
    ...workData,
    likes: 0,
    wants: 0,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  works.push(work);
  writeJSON('works.json', works);
  logEdit('管理员', '创建作品', work.title || work.id, '');
  res.json(work);
});

// Admin: import works from Excel
app.post('/api/admin/works/import', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });

  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    let works = readJSON('works.json');
    let categories = { works: [], workStatus: [] };
    try { categories = readJSON('categories.json'); } catch {}

    const CATEGORY_MAP = {};
    categories.works.forEach(c => { CATEGORY_MAP[c.name] = c.id; CATEGORY_MAP[c.id] = c.id; });
    const STATUS_MAP = {};
    categories.workStatus.forEach(c => { STATUS_MAP[c.name] = c.id; STATUS_MAP[c.id] = c.id; });

    // Build circles name->id map
    const circles = readJSON('circles.json');
    const circlesNameMap = {};
    circles.forEach(c => { circlesNameMap[c.name] = c.id; });

    let added = 0, updated = 0;

    rows.forEach(row => {
      const title = row['作品名称'] || row['标题'] || '';
      if (!title) return;

      const authorName = row['作者'] || '';
      const circleIds = authorName.split(',').map(name => {
        const trimmed = name.trim();
        return circlesNameMap[trimmed] || null;
      }).filter(Boolean);

      const existing = works.find(w => w.title === title);
      const workData = {
        title,
        category: CATEGORY_MAP[row['分类']] || 'other',
        status: STATUS_MAP[row['状态']] || 'on_sale',
        price: row['价格'] || '',
        releaseDate: row['发售日期'] || '',
        tags: (row['标签'] || '').split(',').map(t => t.trim()).filter(Boolean),
        description: row['描述'] || ''
      };

      if (existing) {
        Object.assign(existing, workData);
        if (circleIds.length > 0) existing.circles = circleIds;
        updated++;
      } else {
        works.push({
          id: 'w' + Date.now() + Math.random().toString(36).substr(2, 5),
          ...workData,
          circles: circleIds.length > 0 ? circleIds : [],
          images: [],
          moreImages: [],
          likes: 0,
          wants: 0,
          order: works.length,
          createdAt: new Date().toISOString()
        });
        added++;
      }
    });

    writeJSON('works.json', works);
    fs.unlinkSync(req.file.path);

    logEdit('管理员', '导入作品', '', `新增${added}个，更新${updated}个`);
    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

// Admin: approve work
app.post('/api/admin/works/:id/approve', authMiddleware, (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });
  works[index].approvalStatus = 'approved';
  writeJSON('works.json', works);
  logEdit('管理员', '批准作品', works[index].title || req.params.id, '');
  // Notify author
  if (works[index].submittedBy) {
    addAuthorNotification(works[index].submittedBy, 'work', works[index].title, '已通过审核');
  }
  res.json({ success: true });
});

// Admin: reject work
app.post('/api/admin/works/:id/reject', authMiddleware, (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });
  works[index].approvalStatus = 'rejected';
  if (req.body.reason) works[index].rejectReason = req.body.reason;
  writeJSON('works.json', works);
  logEdit('管理员', '拒绝作品', works[index].title || req.params.id, req.body.reason || '');
  // Notify author
  if (works[index].submittedBy) {
    addAuthorNotification(works[index].submittedBy, 'work', works[index].title, '未通过审核', req.body.reason);
  }
  res.json({ success: true });
});

app.put('/api/admin/works/:id', authMiddleware, (req, res) => {
  let works = readJSON('works.json');
  const index = works.findIndex(w => w.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '作品未找到' });
  const oldTitle = works[index].title;
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'titleEn', 'category', 'price', 'status', 'releaseDate', 'tags', 'description', 'images', 'moreImages', 'circles', 'likes', 'wants', 'order', 'isCommissioned', 'commissionedBy', 'socialLinks', 'approvalStatus', 'rejectReason', 'submittedBy'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  works[index] = { ...works[index], ...updates };
  writeJSON('works.json', works);
  logEdit('管理员', '编辑作品', oldTitle || req.params.id, '');
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

  // Pagination (only if page/limit params provided)
  if (req.query.page || req.query.limit) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const total = events.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = events.slice(start, start + limit);
    return res.json({ items, total, page, limit, totalPages });
  }

  res.json(events);
});

app.post('/api/admin/events', authMiddleware, (req, res) => {
  const events = readJSON('events.json');
  const maxOrder = events.reduce((max, e) => Math.max(max, e.order ?? 0), 0);
  // Whitelist allowed fields
  const allowedFields = ['title', 'date', 'endDate', 'location', 'description', 'coverImage', 'images', 'booth', 'status', 'relatedWorks', 'relatedCircles', 'relatedProjects', 'editableBy'];
  const eventData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) eventData[field] = req.body[field];
  });
  const event = {
    id: 'e' + Date.now(),
    ...eventData,
    order: maxOrder + 1
  };
  events.push(event);
  writeJSON('events.json', events);
  res.json(event);
});

// Admin: import events from Excel
app.post('/api/admin/events/import', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    let events = readJSON('events.json');
    let added = 0, updated = 0;
    rows.forEach(row => {
      const title = row['活动名称'] || row['标题'] || '';
      if (!title) return;
      const existing = events.find(e => e.title === title);
      const eventData = {
        title,
        date: row['开始日期'] || row['日期'] || '',
        endDate: row['结束日期'] || '',
        location: row['地点'] || '',
        description: row['描述'] || '',
        status: row['状态'] || ''
      };
      if (existing) {
        Object.assign(existing, eventData);
        updated++;
      } else {
        events.push({ id: 'e' + Date.now() + Math.random().toString(36).substr(2, 5), ...eventData, order: events.length });
        added++;
      }
    });
    writeJSON('events.json', events);
    fs.unlinkSync(req.file.path);
    logEdit('管理员', '导入活动', '', `新增${added}个，更新${updated}个`);
    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

app.put('/api/admin/events/:id', authMiddleware, (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['title', 'date', 'endDate', 'location', 'description', 'coverImage', 'images', 'booth', 'status', 'relatedWorks', 'relatedCircles', 'relatedProjects', 'order', 'approvalStatus', 'rejectReason', 'submittedBy', 'editableBy'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  events[index] = { ...events[index], ...updates };
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

// Admin: approve event
app.post('/api/admin/events/:id/approve', authMiddleware, (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  events[index].approvalStatus = 'approved';
  writeJSON('events.json', events);
  logEdit('管理员', '批准活动', events[index].title || req.params.id, '');
  // Notify author
  if (events[index].submittedBy) {
    addAuthorNotification(events[index].submittedBy, 'event', events[index].title, '已通过审核');
  }
  res.json({ success: true });
});

// Admin: reject event
app.post('/api/admin/events/:id/reject', authMiddleware, (req, res) => {
  let events = readJSON('events.json');
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '活动未找到' });
  events[index].approvalStatus = 'rejected';
  if (req.body.reason) events[index].rejectReason = req.body.reason;
  writeJSON('events.json', events);
  logEdit('管理员', '拒绝活动', events[index].title || req.params.id, req.body.reason || '');
  // Notify author
  if (events[index].submittedBy) {
    addAuthorNotification(events[index].submittedBy, 'event', events[index].title, '未通过审核', req.body.reason);
  }
  res.json({ success: true });
});

// Admin: approve project
app.post('/api/admin/projects/:id/approve', authMiddleware, (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  projects[index].approvalStatus = 'approved';
  writeJSON('projects.json', projects);
  logEdit('管理员', '批准企划', projects[index].title || req.params.id, '');
  // Notify author
  if (projects[index].submittedBy) {
    addAuthorNotification(projects[index].submittedBy, 'project', projects[index].title, '已通过审核');
  }
  res.json({ success: true });
});

// Admin: reject project
app.post('/api/admin/projects/:id/reject', authMiddleware, (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  projects[index].approvalStatus = 'rejected';
  if (req.body.reason) projects[index].rejectReason = req.body.reason;
  writeJSON('projects.json', projects);
  logEdit('管理员', '拒绝企划', projects[index].title || req.params.id, req.body.reason || '');
  // Notify author
  if (projects[index].submittedBy) {
    addAuthorNotification(projects[index].submittedBy, 'project', projects[index].title, '未通过审核', req.body.reason);
  }
  res.json({ success: true });
});

// Admin: approve update
app.post('/api/admin/updates/:id/approve', authMiddleware, (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  updates[index].approvalStatus = 'approved';
  writeJSON('updates.json', updates);
  logEdit('管理员', '批准动态', updates[index].title || req.params.id, '');
  // Notify author
  if (updates[index].submittedBy) {
    addAuthorNotification(updates[index].submittedBy, 'update', updates[index].title, '已通过审核');
  }
  res.json({ success: true });
});

// Admin: reject update
app.post('/api/admin/updates/:id/reject', authMiddleware, (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  updates[index].approvalStatus = 'rejected';
  if (req.body.reason) updates[index].rejectReason = req.body.reason;
  writeJSON('updates.json', updates);
  logEdit('管理员', '拒绝动态', updates[index].title || req.params.id, req.body.reason || '');
  // Notify author
  if (updates[index].submittedBy) {
    addAuthorNotification(updates[index].submittedBy, 'update', updates[index].title, '未通过审核', req.body.reason);
  }
  res.json({ success: true });
});

// --- Circles ---
app.get('/api/admin/circles', authMiddleware, (req, res) => {
  let circles = readJSON('circles.json');
  if (ensureOrder(circles)) writeJSON('circles.json', circles);
  circles.sort((a, b) => a.order - b.order);

  // Pagination (only if page/limit params provided)
  if (req.query.page || req.query.limit) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const total = circles.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = circles.slice(start, start + limit);
    return res.json({ items, total, page, limit, totalPages });
  }

  res.json(circles);
});

app.post('/api/admin/circles', authMiddleware, (req, res) => {
  const circles = readJSON('circles.json');
  const maxOrder = circles.reduce((max, c) => Math.max(max, c.order ?? 0), 0);
  // Whitelist allowed fields - NEVER allow passwordHash, username, authorStatus
  const allowedFields = ['name', 'description', 'category', 'logo', 'images', 'socialLinks', 'editableBy'];
  const circleData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) circleData[field] = req.body[field];
  });
  const circle = {
    id: 'c' + Date.now(),
    ...circleData,
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
  // Whitelist allowed fields - NEVER allow passwordHash, username, authorStatus to be set directly
  const allowedFields = ['name', 'description', 'category', 'logo', 'images', 'socialLinks', 'order', 'editableBy'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  circles[index] = { ...circles[index], ...updates };
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
  const projects = readJSON('projects.json');
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

  // Build projects map
  const projectMap = {};
  projects.forEach(p => projectMap[p.id] = p.title);

  const data = circleWorks.map(w => {
    // Find events that reference this work
    const relatedEventTitles = events
      .filter(e => (e.relatedWorks || []).includes(w.id))
      .map(e => e.title);
    // Find projects that reference this work
    const relatedProjectTitles = projects
      .filter(p => (p.works || []).includes(w.id))
      .map(p => p.title);
    return {
      '作品名称': w.title,
      '分类': catMap[w.category] || w.category,
      '价格': w.price || '',
      '状态': statusMap[w.status] || w.status,
      '发售日期': w.releaseDate || '',
      '标签': (w.tags || []).join(', '),
      '图片': (w.images || []).map(img => img.replace('/uploads/', '')).join(', '),
      '更多图片': (w.moreImages || []).map(img => img.replace('/uploads/', '')).join(', '),
      '联系方式类型': w.socialLinks?.qq ? 'QQ' : w.socialLinks?.qqGroup ? 'QQ群' : '',
      '联系方式': w.socialLinks?.qq || w.socialLinks?.qqGroup || '',
      '联系显示名': w.socialLinks?.contactLabel || '',
      '网站链接': w.socialLinks?.website || '',
      '网站显示名': w.socialLinks?.websiteLabel || '',
      '关联活动': relatedEventTitles.join(', '),
      '关联企划': relatedProjectTitles.join(', '),
      '作品描述': w.description || ''
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);

  ws['!cols'] = [
    { wch: 30 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 25 },
    { wch: 25 }, { wch: 25 }, { wch: 10 }, { wch: 15 },
    { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 50 }
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
    let projects = readJSON('projects.json');
    const circleWorks = works.filter(w => (w.circles || []).includes(circle.id));
    const otherWorks = works.filter(w => !(w.circles || []).includes(circle.id));

    // Build event title -> id map
    const eventTitleMap = {};
    events.forEach(e => eventTitleMap[e.title] = e.id);

    // Build project title -> id map
    const projectTitleMap = {};
    projects.forEach(p => projectTitleMap[p.title] = p.id);

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
        moreImages: (row['更多图片'] || '').split(',').map(f => f.trim()).filter(Boolean).map(f => f.startsWith('/uploads/') ? f : '/uploads/' + f),
        socialLinks: (() => {
          const sl = {
            contactLabel: row['联系显示名'] || '',
            website: row['网站链接'] || '',
            websiteLabel: row['网站显示名'] || ''
          };
          const contactType = (row['联系方式类型'] || '').includes('群') ? 'qqGroup' : 'qq';
          const contactValue = row['联系方式'] || '';
          if (contactValue) sl[contactType] = contactValue;
          return sl;
        })()
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

      // Handle project association from Excel
      const projectTitles = (row['关联企划'] || '').split(',').map(t => t.trim()).filter(Boolean);
      if (projectTitles.length > 0) {
        projectTitles.forEach(projectTitle => {
          const projectId = projectTitleMap[projectTitle];
          if (projectId) {
            const proj = projects.find(p => p.id === projectId);
            if (proj && !(proj.works || []).includes(workId)) {
              if (!proj.works) proj.works = [];
              proj.works.push(workId);
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
        // Keep existing socialLinks if Excel has empty values
        const hasContact = workData.socialLinks && (workData.socialLinks.qq || workData.socialLinks.qqGroup || workData.socialLinks.website);
        if (!hasContact && existing.socialLinks) {
          workData.socialLinks = existing.socialLinks;
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
    writeJSON('projects.json', projects);

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

  // Pagination (only if page/limit params provided)
  if (req.query.page || req.query.limit) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const total = projects.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = projects.slice(start, start + limit);
    return res.json({ items, total, page, limit, totalPages });
  }

  res.json(projects);
});

app.post('/api/admin/projects', authMiddleware, (req, res) => {
  const projects = readJSON('projects.json');
  const maxOrder = projects.reduce((max, p) => Math.max(max, p.order ?? 0), 0);
  // Whitelist allowed fields
  const allowedFields = ['title', 'description', 'status', 'category', 'images', 'circles', 'events', 'works', 'tags', 'contactInfo', 'startDate', 'endDate', 'socialLinks', 'coverImage', 'editableBy'];
  const projectData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) projectData[field] = req.body[field];
  });
  const project = {
    id: 'p' + Date.now(),
    ...projectData,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  };
  projects.push(project);
  writeJSON('projects.json', projects);
  res.json(project);
});

// Admin: import projects from Excel
app.post('/api/admin/projects/import', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    let projects = readJSON('projects.json');
    let added = 0, updated = 0;
    rows.forEach(row => {
      const title = row['企划名称'] || row['标题'] || '';
      if (!title) return;
      const existing = projects.find(p => p.title === title);
      const projectData = {
        title,
        category: row['分类'] || '',
        status: row['状态'] || '',
        description: row['描述'] || ''
      };
      if (existing) {
        Object.assign(existing, projectData);
        updated++;
      } else {
        projects.push({ id: 'p' + Date.now() + Math.random().toString(36).substr(2, 5), ...projectData, order: projects.length, createdAt: new Date().toISOString() });
        added++;
      }
    });
    writeJSON('projects.json', projects);
    fs.unlinkSync(req.file.path);
    logEdit('管理员', '导入企划', '', `新增${added}个，更新${updated}个`);
    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

app.put('/api/admin/projects/:id', authMiddleware, (req, res) => {
  let projects = readJSON('projects.json');
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '企划未找到' });
  // Whitelist allowed fields
  const allowedFields = ['title', 'description', 'status', 'category', 'images', 'circles', 'events', 'works', 'tags', 'contactInfo', 'startDate', 'endDate', 'order', 'socialLinks', 'coverImage', 'approvalStatus', 'rejectReason', 'submittedBy', 'editableBy'];
  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  projects[index] = { ...projects[index], ...updates };
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
app.get('/api/updates', cacheMiddleware(60), (req, res) => {
  try {
    let updates = readJSON('updates.json');
    const today = getChinaDate();
    // Only return approved updates (or legacy updates without approvalStatus)
    updates = updates.filter(u => (!u.approvalStatus || u.approvalStatus === 'approved') && u.publishDate <= today);
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
    // Only return approved updates (or legacy updates without approvalStatus)
    if (update.approvalStatus && update.approvalStatus !== 'approved') {
      return res.status(404).json({ error: '动态未找到' });
    }
    res.json(update);
  } catch (e) { res.status(404).json({ error: '动态未找到' }); }
});

// Admin: CRUD for updates
app.get('/api/admin/updates', authMiddleware, (req, res) => {
  try {
    let updates = readJSON('updates.json');

    // Pagination (only if page/limit params provided)
    if (req.query.page || req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const total = updates.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const items = updates.slice(start, start + limit);
      return res.json({ items, total, page, limit, totalPages });
    }

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
    coverImage: req.body.coverImage || '',
    images: req.body.images || [],
    relatedCircles: req.body.relatedCircles || [],
    relatedEvents: req.body.relatedEvents || [],
    relatedProjects: req.body.relatedProjects || [],
    createdAt: new Date().toISOString()
  };
  updates.push(update);
  writeJSON('updates.json', updates);
  res.json(update);
});

// Admin: import updates from Excel
app.post('/api/admin/updates/import', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    let updates = [];
    try { updates = readJSON('updates.json'); } catch {}
    let added = 0, updated = 0;
    rows.forEach(row => {
      const title = row['标题'] || '';
      if (!title) return;
      const existing = updates.find(u => u.title === title);
      const updateData = {
        title,
        content: row['内容'] || '',
        publishDate: row['发布日期'] || new Date().toISOString().split('T')[0]
      };
      if (existing) {
        Object.assign(existing, updateData);
        updated++;
      } else {
        updates.push({ id: 'upd' + Date.now() + Math.random().toString(36).substr(2, 5), ...updateData, createdAt: new Date().toISOString() });
        added++;
      }
    });
    writeJSON('updates.json', updates);
    fs.unlinkSync(req.file.path);
    logEdit('管理员', '导入动态', '', `新增${added}个，更新${updated}个`);
    res.json({ success: true, added, updated });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

app.put('/api/admin/updates/:id', authMiddleware, (req, res) => {
  let updates = readJSON('updates.json');
  const index = updates.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '动态未找到' });
  // Whitelist allowed fields
  const allowedFields = ['title', 'content', 'publishDate', 'pinned', 'coverImage', 'images', 'relatedCircles', 'relatedEvents', 'relatedProjects', 'approvalStatus', 'rejectReason', 'submittedBy', 'editableBy'];
  const updates2 = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updates2[field] = req.body[field];
  });
  updates[index] = { ...updates[index], ...updates2 };
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
function saveUploadMeta(filename, uploader) {
  let meta = {};
  try { meta = readJSON('uploads-meta.json'); } catch {}
  meta[filename] = { uploader, uploadedAt: new Date().toISOString() };
  writeJSON('uploads-meta.json', meta);
}

app.post('/api/admin/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  saveUploadMeta(req.file.filename, '管理员');
  logEdit('管理员', '上传图片', req.file.filename, '', '/uploads/' + req.file.filename);
  res.json({ url: '/uploads/' + req.file.filename });
});

// Author upload
app.post('/api/author/upload', authorAuthMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  const circles = readJSON('circles.json');
  const circle = circles.find(c => c.id === req.author.circleId);
  const authorName = circle?.name || '未知作者';

  // Add watermark if requested
  const addWatermark = req.body.addWatermark === 'true';
  if (addWatermark && sharp) {
    const filePath = path.join(__dirname, 'uploads', req.file.filename);
    const ext = path.extname(req.file.filename).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      try {
        const image = sharp(filePath);
        const metadata = await image.metadata();
        const { width, height } = metadata;
        const fontSize = Math.round(width / 20);
        const smallFontSize = Math.round(width / 40);
        const padding = Math.round(width / 50);
        const watermarkText = `@${authorName}`;
        const xmlEscapedText = watermarkText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const svgWatermark = `<svg width="${width}" height="${height}">
          <style>
            .wm-center { font-size: ${fontSize}px; fill: rgba(255,255,255,1); font-family: sans-serif; }
            .wm-corner { font-size: ${smallFontSize}px; fill: rgba(255,255,255,1); font-family: sans-serif; }
          </style>
          <text class="wm-center" x="${width/2}" y="${height/2}" text-anchor="middle" dominant-baseline="middle">${xmlEscapedText}</text>
          <text class="wm-corner" x="${width - padding}" y="${height - padding}" text-anchor="end" dominant-baseline="auto">${xmlEscapedText}</text>
          <text class="wm-corner" x="${padding}" y="${padding + smallFontSize}" text-anchor="start" dominant-baseline="auto">f7goods.com</text>
        </svg>`;
        await image.composite([{ input: Buffer.from(svgWatermark) }]).toFile(filePath + '.tmp');
        fs.renameSync(filePath + '.tmp', filePath);
      } catch (e) {
        console.error('Watermark failed:', e.message);
      }
    }
  }

  // Compress image: target 400-600KB range
  if (sharp) {
    const filePath = path.join(__dirname, 'uploads', req.file.filename);
    const ext = path.extname(req.file.filename).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.size > 500 * 1024) {
          const image = sharp(filePath);
          const targetMax = 600 * 1024; // 600KB max
          let quality = 90;
          let compressed = false;

          while (quality >= 70) {
            await image.jpeg({ quality }).toFile(filePath + '.tmp');
            const resultSize = fs.statSync(filePath + '.tmp').size;
            if (resultSize <= targetMax) {
              fs.renameSync(filePath + '.tmp', filePath);
              compressed = true;
              console.log(`Compressed ${req.file.filename}: ${(stats.size / 1024).toFixed(0)}KB -> ${(resultSize / 1024).toFixed(0)}KB (quality: ${quality})`);
              break;
            }
            quality -= 5;
          }

          if (!compressed) {
            // Use quality 70 as fallback
            await image.jpeg({ quality: 70 }).toFile(filePath + '.tmp');
            fs.renameSync(filePath + '.tmp', filePath);
            const finalSize = fs.statSync(filePath).size;
            console.log(`Compressed ${req.file.filename}: ${(stats.size / 1024).toFixed(0)}KB -> ${(finalSize / 1024).toFixed(0)}KB (quality: 70)`);
          }
        }
      } catch (e) {
        console.error('Compression failed:', e.message);
      }
    }
  }

  saveUploadMeta(req.file.filename, authorName);
  logEdit(authorName, '上传图片', req.file.filename, '', '/uploads/' + req.file.filename);
  res.json({ url: '/uploads/' + req.file.filename });
});

// List all uploaded images
app.get('/api/admin/images', authMiddleware, (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  let meta = {};
  try { meta = readJSON('uploads-meta.json'); } catch {}
  try {
    const files = fs.readdirSync(uploadsDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
      .map(f => ({
        name: f,
        url: '/uploads/' + f,
        size: fs.statSync(path.join(uploadsDir, f)).size,
        time: fs.statSync(path.join(uploadsDir, f)).mtime,
        uploader: meta[f]?.uploader || '未知',
        uploadedAt: meta[f]?.uploadedAt || null
      }))
      .sort((a, b) => b.time - a.time);
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

// Delete an uploaded image
app.delete('/api/admin/images/:filename', authMiddleware, (req, res) => {
  const filename = path.basename(req.params.filename); // Prevent path traversal
  const uploadsDir = path.join(__dirname, 'uploads');
  const filePath = path.join(uploadsDir, filename);
  if (!filePath.startsWith(uploadsDir)) return res.status(403).json({ error: '禁止访问' });
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    // Clean up uploads-meta.json
    try {
      const meta = readJSON('uploads-meta.json');
      delete meta[req.params.filename];
      writeJSON('uploads-meta.json', meta);
    } catch {}
    logEdit('管理员', '删除图片', req.params.filename, '');
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
    const dataFiles = ['works.json', 'events.json', 'circles.json', 'projects.json', 'updates.json'];
    dataFiles.forEach(file => {
      try {
        const items = readJSON(file);
        items.forEach(item => {
          if (item.images) item.images.forEach(img => { const f = extractFilename(img); if (f) referencedFiles.add(f); });
          if (item.moreImages) item.moreImages.forEach(img => { const f = extractFilename(img); if (f) referencedFiles.add(f); });
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
    const dataFiles = ['works.json', 'events.json', 'circles.json', 'projects.json', 'updates.json'];
    dataFiles.forEach(file => {
      try {
        const items = readJSON(file);
        items.forEach(item => {
          // Check images array
          if (item.images) item.images.forEach(img => { const f = extractFilename(img); if (f) referencedFiles.add(f); });
          // Check moreImages array (works)
          if (item.moreImages) item.moreImages.forEach(img => { const f = extractFilename(img); if (f) referencedFiles.add(f); });
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

// Error handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(500).json({ error: err.message });
  next();
});

// 404 handler for HTML pages
app.get('*', (req, res) => {
  if (req.accepts('html')) {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } else {
    res.status(404).json({ error: '未找到' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  f7goods server running at http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin`);
  console.log(`  Default credentials: admin / ${ADMIN_PASSWORD}\n`);
});
