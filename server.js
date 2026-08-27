require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── App & Server ───────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  },
});
const PORT = process.env.PORT || 3000;

// ─── Uploads directory ──────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ─── Multer config ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ─── Database ───────────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'edugen.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE,
    name TEXT,
    email TEXT,
    avatar TEXT,
    role TEXT,
    theme_preferences TEXT DEFAULT '{}',
    streak_count INTEGER DEFAULT 0,
    last_login_date TEXT
  );

  CREATE TABLE IF NOT EXISTS classrooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    banner_url TEXT,
    teacher_id INTEGER,
    otp TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(teacher_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS classroom_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER,
    user_id INTEGER,
    role TEXT,
    FOREIGN KEY(classroom_id) REFERENCES classrooms(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER,
    user_id INTEGER,
    text TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS padlet_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER,
    user_id INTEGER,
    title TEXT,
    text TEXT,
    image_url TEXT,
    link_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER,
    teacher_id INTEGER,
    title TEXT,
    description TEXT,
    due_date TEXT,
    file_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    student_id INTEGER,
    submission_text TEXT,
    file_url TEXT,
    status TEXT DEFAULT 'submitted',
    grade TEXT,
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tutorials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER,
    youtube_url TEXT,
    title TEXT,
    added_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tutorial_watched (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tutorial_id INTEGER,
    user_id INTEGER,
    watched_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS teacher_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    teacher_id INTEGER,
    sender_id INTEGER,
    text TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER,
    title TEXT,
    description TEXT,
    event_date TEXT,
    start_time TEXT,
    end_time TEXT,
    location TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

function safeAlter(sql) {
  try {
    db.prepare(sql).run();
  } catch (e) {
    // column already exists
  }
}

safeAlter("ALTER TABLE classrooms ADD COLUMN otp TEXT");
safeAlter("ALTER TABLE tutorials ADD COLUMN material_type TEXT DEFAULT 'youtube'");
safeAlter("ALTER TABLE tutorials ADD COLUMN file_url TEXT");
safeAlter("ALTER TABLE tutorials ADD COLUMN description TEXT");
safeAlter("ALTER TABLE task_submissions ADD COLUMN feedback TEXT");

db.prepare(`
  UPDATE tutorials
  SET material_type = 'youtube'
  WHERE material_type IS NULL OR material_type = ''
`).run();

// ─── Session middleware (shared between Express & Socket.io) ─────────────────
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'edugen-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
});

// ─── Express middleware ─────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const clientDist = path.join(__dirname, 'client', 'dist');
const hasClientDist = fs.existsSync(clientDist);
if (hasClientDist) {
  app.use(express.static(clientDist));
}

// ─── Auth middleware ────────────────────────────────────────────────────────────
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.originalUrl.startsWith('/api') || req.path.startsWith('/api')) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  res.redirect('/');
}

// ─── Streak logic ───────────────────────────────────────────────────────────────
function updateStreak(user) {
  const today = new Date().toISOString().slice(0, 10);
  const lastLogin = user.last_login_date;

  if (lastLogin === today) {
    return user;
  }

  let newStreak = 1;
  if (lastLogin) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    if (lastLogin === yesterdayStr) {
      newStreak = (user.streak_count || 0) + 1;
    }
  }

  db.prepare('UPDATE users SET streak_count = ?, last_login_date = ? WHERE id = ?')
    .run(newStreak, today, user.id);
  // Broadcast leaderboard after streak update
  broadcastLeaderboard();

  user.streak_count = newStreak;
  user.last_login_date = today;
  return user;
}

// ─── Passport setup ─────────────────────────────────────────────────────────────
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  done(null, user || null);
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
    passReqToCallback: true
  }, (req, accessToken, refreshToken, profile, done) => {
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id);
    const role = req.session.pendingRole || 'student';

    if (!user) {
      const result = db.prepare(
        'INSERT INTO users (google_id, name, email, avatar, role) VALUES (?, ?, ?, ?, ?)'
      ).run(
        profile.id,
        profile.displayName,
        profile.emails && profile.emails[0] ? profile.emails[0].value : '',
        profile.photos && profile.photos[0] ? profile.photos[0].value : '',
        role
      );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    user = updateStreak(user);
    done(null, user);
  }));
}

// ─── Auth routes ────────────────────────────────────────────────────────────────
app.get('/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).send('Google OAuth is not configured on this server. Please use Dev Mode.');
  }
  const role = req.query.role;
  if (role === 'student' || role === 'teacher') {
    req.session.pendingRole = role;
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect('/');
  }
  passport.authenticate('google', (err, user) => {
    if (err || !user) {
      return res.redirect('/');
    }
    req.login(user, (loginErr) => {
      if (loginErr) {
        return res.redirect('/');
      }
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        streak_count: user.streak_count,
        theme_preferences: user.theme_preferences
      };
      delete req.session.pendingRole;
      res.redirect('/dashboard');
    });
  })(req, res, next);
});

app.post('/auth/set-role', (req, res) => {
  req.session.pendingRole = req.body.role;
  res.json({ success: true });
});

function createDevSession(req, res, role, redirectTo = '/dashboard') {
  let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get('dev-user');

  if (!user) {
    const result = db.prepare(
      'INSERT INTO users (google_id, name, email, avatar, role) VALUES (?, ?, ?, ?, ?)'
    ).run('dev-user', 'Dev User', 'dev@edugen.test', '', role);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  } else {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
    user.role = role;
  }

  user = updateStreak(user);

  req.login(user, (loginErr) => {
    if (loginErr) {
      console.error('Dev login error:', loginErr);
      return res.status(500).json({ error: 'Login failed' });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      streak_count: user.streak_count,
      theme_preferences: user.theme_preferences,
    };

    req.session.save(() => {
      if (res.req && res.req.method === 'GET' && res.req.path === '/dev-login') {
        return res.redirect(redirectTo);
      }
      res.json({ success: true, redirect: redirectTo });
    });
  });
}

// Dev login route – creates or fetches a dev user and logs them in via Passport
app.get('/dev-login', (req, res) => {
  const role = req.query.role || 'student';
  createDevSession(req, res, role);
});

app.get('/api/dev-login', (req, res) => {
  const role = req.query.role || 'student';
  createDevSession(req, res, role);
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('auth_token');
    res.redirect('/');
  });
});

app.get('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('auth_token');
    res.json({ success: true });
  });
});

// ─── Page routes ────────────────────────────────────────────────────────────────
const sendClientIndex = (req, res) => {
  if (hasClientDist) {
    return res.sendFile(path.join(clientDist, 'index.html'));
  }
  return res.sendFile(path.join(__dirname, 'views', 'index.html'));
};

app.get('/', (req, res) => {
  return sendClientIndex(req, res);
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  return sendClientIndex(req, res);
});

app.get('/tutorials', isAuthenticated, (req, res) => {
  return sendClientIndex(req, res);
});

app.get('/discussions', isAuthenticated, (req, res) => {
  return sendClientIndex(req, res);
});

app.get('/tasks', isAuthenticated, (req, res) => {
  return sendClientIndex(req, res);
});

app.get('/grades', isAuthenticated, (req, res) => {
  return sendClientIndex(req, res);
});

app.get('/schedule', isAuthenticated, (req, res) => {
  return sendClientIndex(req, res);
});

// ─── API: Me ────────────────────────────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json(null);
  res.json(req.session.user);
});

// ─── API: OAuth Status ──────────────────────────────────────────────────────────
app.get('/api/oauth-status', (req, res) => {
  const isConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  res.json({ google: isConfigured, configured: isConfigured });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, role: requestedRole } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential' });
    }

    const allowedAudiences = Array.from(
      new Set(
        [process.env.GOOGLE_CLIENT_ID, process.env.VITE_GOOGLE_CLIENT_ID]
          .filter(Boolean)
          .filter((id) => !id.includes('your_google_client_id'))
      )
    );

    if (allowedAudiences.length === 0) {
      return res.status(500).json({ error: 'Google client ID is not configured on the server' });
    }

    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: allowedAudiences,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ error: 'Invalid Google token payload' });
    }

    const googleId = payload.sub;
    const name = payload.name || '';
    const email = payload.email || '';
    const avatar = payload.picture || '';
    const role = requestedRole === 'teacher' ? 'teacher' : 'student';

    if (!googleId || !email) {
      return res.status(400).json({ error: 'Google token is missing required user fields' });
    }

    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
    if (!user) {
      const result = db.prepare(
        'INSERT INTO users (google_id, name, email, avatar, role) VALUES (?, ?, ?, ?, ?)'
      ).run(googleId, name, email, avatar, role);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    user = updateStreak(user);
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      streak_count: user.streak_count,
      theme_preferences: user.theme_preferences,
    };

    const jwtSecret = process.env.JWT_SECRET || 'edugen-jwt-secret';
    const authToken = jwt.sign(
      {
        id: user.id,
        google_id: user.google_id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.cookie('auth_token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
        return res.status(500).json({ error: 'Failed to persist login session' });
      }
      res.json({ user: req.session.user });
    });
  } catch (err) {
    console.error('Google auth error:', err);
    const detail = err instanceof Error ? err.message : 'Google authentication failed';
    res.status(401).json({ error: `Google auth failed: ${detail}` });
  }
});


// ─── API: Classrooms ────────────────────────────────────────────────────────────
app.get('/api/classrooms', isAuthenticated, (req, res) => {
  const classrooms = db.prepare(`
    SELECT c.*, u.name AS teacher_name,
      (SELECT COUNT(*) FROM classroom_members WHERE classroom_id = c.id) AS member_count
    FROM classrooms c
    JOIN classroom_members cm ON cm.classroom_id = c.id
    LEFT JOIN users u ON u.id = c.teacher_id
    WHERE cm.user_id = ?
    ORDER BY c.created_at DESC
  `).all(req.session.user.id);
  res.json(classrooms);
});

function generateOTP() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

app.post('/api/classrooms', isAuthenticated, (req, res) => {
  const { name } = req.body;
  const userId = req.session.user.id;
  const role = req.session.user.role;

  if (role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can create classrooms' });
  }
  const teacherId = userId;

  // Generate a unique 6-character OTP
  let otp;
  let isUnique = false;
  while (!isUnique) {
    otp = generateOTP();
    const existing = db.prepare('SELECT id FROM classrooms WHERE otp = ?').get(otp);
    if (!existing) {
      isUnique = true;
    }
  }

  const result = db.prepare(
    'INSERT INTO classrooms (name, teacher_id, otp) VALUES (?, ?, ?)'
  ).run(name, teacherId, otp);

  const classroomId = result.lastInsertRowid;

  db.prepare(
    'INSERT INTO classroom_members (classroom_id, user_id, role) VALUES (?, ?, ?)'
  ).run(classroomId, userId, role);

  const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(classroomId);
  res.json(classroom);
});

app.post('/api/classrooms/:id/join', isAuthenticated, (req, res) => {
  const classroomIdOrOtp = req.params.id;
  const userId = req.session.user.id;
  const role = req.session.user.role;

  // Resolve classroom by ID or OTP
  let classroom;
  if (/^\d+$/.test(classroomIdOrOtp)) {
    classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(parseInt(classroomIdOrOtp));
  }
  if (!classroom) {
    classroom = db.prepare('SELECT * FROM classrooms WHERE otp = ?').get(classroomIdOrOtp.toUpperCase());
  }

  if (!classroom) {
    return res.status(404).json({ error: 'Classroom not found' });
  }

  const existing = db.prepare(
    'SELECT * FROM classroom_members WHERE classroom_id = ? AND user_id = ?'
  ).get(classroom.id, userId);

  if (existing) {
    return res.json({ message: 'Already a member', classroomId: classroom.id });
  }

  db.prepare(
    'INSERT INTO classroom_members (classroom_id, user_id, role) VALUES (?, ?, ?)'
  ).run(classroom.id, userId, role);

  res.json({ success: true, classroomId: classroom.id });
});

app.post('/api/classrooms/:id/banner', isAuthenticated, upload.single('banner'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const bannerUrl = '/uploads/' + req.file.filename;
  db.prepare('UPDATE classrooms SET banner_url = ? WHERE id = ?')
    .run(bannerUrl, req.params.id);

  res.json({ url: bannerUrl, banner_url: bannerUrl });
});

app.get('/api/classrooms/:id', isAuthenticated, (req, res) => {
  const classroom = db.prepare(`
    SELECT c.*, u.name AS teacher_name
    FROM classrooms c
    LEFT JOIN users u ON u.id = c.teacher_id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
  res.json(classroom);
});

// ─── API: Messages (classroom chat) ─────────────────────────────────────────────
app.get('/api/classrooms/:id/messages', isAuthenticated, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*,
      u.name AS user_name,
      u.name AS name,
      u.avatar AS user_avatar,
      u.avatar AS avatar
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.classroom_id = ?
    ORDER BY m.timestamp DESC
    LIMIT 100
  `).all(req.params.id);

  res.json(messages.reverse());
});

app.post('/api/classrooms/:id/messages', isAuthenticated, (req, res) => {
  const { text } = req.body;
  const userId = req.session.user.id;
  const classroomId = req.params.id;

  const result = db.prepare(
    'INSERT INTO messages (classroom_id, user_id, text) VALUES (?, ?, ?)'
  ).run(classroomId, userId, text);

  const message = db.prepare(`
    SELECT m.*,
      u.name AS user_name,
      u.name AS name,
      u.avatar AS user_avatar,
      u.avatar AS avatar
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  res.json(message);
});

// ─── API: Padlet notes ──────────────────────────────────────────────────────────
app.get('/api/classrooms/:id/padlet', isAuthenticated, (req, res) => {
  const notes = db.prepare(`
    SELECT p.*, u.name AS user_name
    FROM padlet_notes p
    JOIN users u ON u.id = p.user_id
    WHERE p.classroom_id = ?
    ORDER BY p.created_at DESC
  `).all(req.params.id);

  res.json(notes);
});

app.post('/api/classrooms/:id/padlet', isAuthenticated, (req, res) => {
  const { title, text, image_url, link_url } = req.body;
  const userId = req.session.user.id;
  const classroomId = req.params.id;

  const result = db.prepare(
    'INSERT INTO padlet_notes (classroom_id, user_id, title, text, image_url, link_url) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(classroomId, userId, title, text, image_url || null, link_url || null);

  const note = db.prepare(`
    SELECT p.*, u.name AS user_name
    FROM padlet_notes p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(result.lastInsertRowid);

  res.json(note);
});

app.delete('/api/padlet/:id', isAuthenticated, (req, res) => {
  const note = db.prepare('SELECT * FROM padlet_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  if (note.user_id !== req.session.user.id && req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM padlet_notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── API: Tasks ─────────────────────────────────────────────────────────────────
app.get('/api/classrooms/:id/tasks', isAuthenticated, (req, res) => {
  const userId = req.session.user.id;
  const classroomId = req.params.id;
  const role = req.session.user.role;

  const tasks = db.prepare(`
    SELECT t.*,
      ts.id AS submission_id,
      ts.status AS submission_status,
      ts.submission_text AS submission_text,
      ts.file_url AS submission_file_url,
      ts.grade AS submission_grade,
      ts.grade AS grade,
      ts.feedback AS feedback,
      ts.submitted_at AS submission_date
    FROM tasks t
    LEFT JOIN task_submissions ts ON ts.task_id = t.id AND ts.student_id = ?
    WHERE t.classroom_id = ?
    ORDER BY t.created_at DESC
  `).all(userId, classroomId);

  // Add overdue flag for students
  if (role === 'student') {
    const today = new Date().toISOString().split('T')[0];
    tasks.forEach(task => {
      task.overdue = task.due_date && task.due_date < today;
    });
  }
  res.json(tasks);
});

app.post('/api/classrooms/:id/tasks', isAuthenticated, upload.single('file'), (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can create tasks' });
  }

  const { title, description, due_date } = req.body;
  const classroomId = req.params.id;
  const teacherId = req.session.user.id;
  const fileUrl = req.file ? '/uploads/' + req.file.filename : null;

  const result = db.prepare(
    'INSERT INTO tasks (classroom_id, teacher_id, title, description, due_date, file_url) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(classroomId, teacherId, title, description, due_date || null, fileUrl);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.json(task);
});

app.delete('/api/tasks/:id', isAuthenticated, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.session.user.role !== 'teacher' || task.teacher_id !== req.session.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM task_submissions WHERE task_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/tasks/:id/submit', isAuthenticated, upload.single('file'), (req, res) => {
  const taskId = req.params.id;
  const studentId = req.session.user.id;
  const role = req.session.user.role;
  if (role !== 'student') {
    return res.status(403).json({ error: 'Only students can submit tasks' });
  }
  const { submission_text } = req.body;
  const fileUrl = req.file ? '/uploads/' + req.file.filename : null;

  const existing = db.prepare(
    'SELECT * FROM task_submissions WHERE task_id = ? AND student_id = ?'
  ).get(taskId, studentId);

  if (existing) {
    db.prepare(
      'UPDATE task_submissions SET submission_text = ?, file_url = ?, status = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(submission_text || existing.submission_text, fileUrl || existing.file_url, 'submitted', existing.id);
    const updated = db.prepare('SELECT * FROM task_submissions WHERE id = ?').get(existing.id);
    return res.json(updated);
  }

  const result = db.prepare(
    'INSERT INTO task_submissions (task_id, student_id, submission_text, file_url) VALUES (?, ?, ?, ?)'
  ).run(taskId, studentId, submission_text || null, fileUrl);

  const submission = db.prepare('SELECT * FROM task_submissions WHERE id = ?').get(result.lastInsertRowid);
  res.json(submission);
});

app.get('/api/tasks/:id/submissions', isAuthenticated, (req, res) => {
  const submissions = db.prepare(`
    SELECT ts.*,
      u.name AS student_name,
      u.name AS name,
      u.email AS student_email,
      u.avatar AS student_avatar
    FROM task_submissions ts
    JOIN users u ON u.id = ts.student_id
    WHERE ts.task_id = ?
    ORDER BY ts.submitted_at DESC
  `).all(req.params.id);

  res.json(submissions);
});

app.put('/api/submissions/:id/grade', isAuthenticated, (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can grade submissions' });
  }

  const { grade, feedback } = req.body;

  db.prepare(
    'UPDATE task_submissions SET grade = ?, feedback = ?, status = ? WHERE id = ?'
  ).run(grade, feedback || null, 'graded', req.params.id);

  const submission = db.prepare('SELECT * FROM task_submissions WHERE id = ?').get(req.params.id);
  res.json(submission);
});

// ─── API: Materials ─────────────────────────────────────────────────────────────
app.get('/api/classrooms/:id/materials', isAuthenticated, (req, res) => {
  const userId = req.session.user.id;
  const classroomId = req.params.id;

  const materials = db.prepare(`
    SELECT t.*,
      u.name AS added_by_name,
      CASE WHEN tw.id IS NOT NULL THEN 1 ELSE 0 END AS watched
    FROM tutorials t
    LEFT JOIN tutorial_watched tw ON tw.tutorial_id = t.id AND tw.user_id = ?
    LEFT JOIN users u ON u.id = t.added_by
    WHERE t.classroom_id = ?
    ORDER BY t.created_at DESC
  `).all(userId, classroomId);

  res.json(materials);
});

app.post('/api/classrooms/:id/materials', isAuthenticated, upload.single('file'), (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can add materials' });
  }

  const { youtube_url, title, description } = req.body;
  const classroomId = req.params.id;
  const addedBy = req.session.user.id;
  const fileUrl = req.file ? '/uploads/' + req.file.filename : null;
  const materialType = fileUrl ? 'file' : 'youtube';

  if (!title || (!youtube_url && !fileUrl)) {
    return res.status(400).json({ error: 'A title and file or YouTube URL are required' });
  }

  const result = db.prepare(
    `INSERT INTO tutorials
      (classroom_id, youtube_url, title, added_by, material_type, file_url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(classroomId, youtube_url || null, title, addedBy, materialType, fileUrl, description || null);

  const material = db.prepare('SELECT * FROM tutorials WHERE id = ?').get(result.lastInsertRowid);
  res.json(material);
});

app.post('/api/materials/:id/view', isAuthenticated, (req, res) => {
  const materialId = req.params.id;
  const userId = req.session.user.id;

  const existing = db.prepare(
    'SELECT * FROM tutorial_watched WHERE tutorial_id = ? AND user_id = ?'
  ).get(materialId, userId);

  if (existing) {
    return res.json({ success: true, message: 'Already marked as viewed' });
  }

  db.prepare(
    'INSERT INTO tutorial_watched (tutorial_id, user_id) VALUES (?, ?)'
  ).run(materialId, userId);

  res.json({ success: true });
});

app.delete('/api/materials/:id', isAuthenticated, (req, res) => {
  const material = db.prepare('SELECT * FROM tutorials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Material not found' });

  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM tutorial_watched WHERE tutorial_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tutorials WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Backward-compatible tutorial aliases
// ─── API: Grades ────────────────────────────────────────────────────────────────
app.get('/api/classrooms/:id/grades', isAuthenticated, (req, res) => {
  const classroomId = req.params.id;
  const userId = req.session.user.id;

  if (req.session.user.role === 'teacher') {
    const gradebook = db.prepare(`
      SELECT
        ts.id AS submission_id,
        ts.status,
        ts.grade,
        ts.feedback,
        ts.submitted_at,
        t.id AS task_id,
        t.title AS task_title,
        t.due_date,
        u.name AS student_name
      FROM tasks t
      LEFT JOIN task_submissions ts ON ts.task_id = t.id
      LEFT JOIN users u ON u.id = ts.student_id
      WHERE t.classroom_id = ?
      ORDER BY t.created_at DESC, ts.submitted_at DESC
    `).all(classroomId);

    return res.json(gradebook);
  }

  const grades = db.prepare(`
    SELECT
      t.id AS task_id,
      t.title AS task_title,
      t.description,
      t.due_date,
      ts.status,
      ts.grade,
      ts.feedback,
      ts.submitted_at
    FROM tasks t
    LEFT JOIN task_submissions ts ON ts.task_id = t.id AND ts.student_id = ?
    WHERE t.classroom_id = ?
    ORDER BY t.created_at DESC
  `).all(userId, classroomId);

  res.json(grades);
});

// ─── API: Schedule ──────────────────────────────────────────────────────────────
app.get('/api/classrooms/:id/schedule', isAuthenticated, (req, res) => {
  const items = db.prepare(`
    SELECT s.*, u.name AS creator_name
    FROM schedules s
    LEFT JOIN users u ON u.id = s.created_by
    WHERE s.classroom_id = ?
    ORDER BY s.event_date ASC, s.start_time ASC
  `).all(req.params.id);

  res.json(items);
});

app.post('/api/classrooms/:id/schedule', isAuthenticated, (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can add schedule items' });
  }

  const {
    title,
    description,
    event_date,
    start_time,
    end_time,
    location
  } = req.body;

  if (!title || !event_date) {
    return res.status(400).json({ error: 'Title and date are required' });
  }

  const result = db.prepare(`
    INSERT INTO schedules
      (classroom_id, title, description, event_date, start_time, end_time, location, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.id,
    title,
    description || null,
    event_date,
    start_time || null,
    end_time || null,
    location || null,
    req.session.user.id
  );

  const item = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid);
  res.json(item);
});

app.delete('/api/schedule/:id', isAuthenticated, (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can delete schedule items' });
  }

  const item = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Schedule item not found' });

  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── API: Teacher messages (DM) ─────────────────────────────────────────────────
app.get('/api/teacher-messages', isAuthenticated, (req, res) => {
  const userId = req.session.user.id;

  const conversations = db.prepare(`
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.avatar AS user_avatar,
      tm.text AS last_message,
      tm.timestamp AS last_timestamp
    FROM teacher_messages tm
    JOIN users u ON u.id = CASE
      WHEN tm.student_id = ? THEN tm.teacher_id
      WHEN tm.teacher_id = ? THEN tm.student_id
      ELSE NULL
    END
    WHERE tm.student_id = ? OR tm.teacher_id = ?
    GROUP BY u.id
    ORDER BY tm.timestamp DESC
  `).all(userId, userId, userId, userId);

  // Deduplicate and get the latest message per user
  const seen = new Map();
  for (const conv of conversations) {
    if (!seen.has(conv.user_id)) {
      seen.set(conv.user_id, conv);
    }
  }

  res.json(Array.from(seen.values()));
});

app.get('/api/teacher-messages/:otherUserId', isAuthenticated, (req, res) => {
  const userId = req.session.user.id;
  const otherUserId = parseInt(req.params.otherUserId);

  const messages = db.prepare(`
    SELECT tm.*, u.name AS sender_name, u.avatar AS sender_avatar
    FROM teacher_messages tm
    JOIN users u ON u.id = tm.sender_id
    WHERE (tm.student_id = ? AND tm.teacher_id = ?)
       OR (tm.student_id = ? AND tm.teacher_id = ?)
    ORDER BY tm.timestamp ASC
  `).all(userId, otherUserId, otherUserId, userId);

  res.json(messages);
});

app.post('/api/teacher-messages/:otherUserId', isAuthenticated, (req, res) => {
  const userId = req.session.user.id;
  const otherUserId = parseInt(req.params.otherUserId);
  const { text } = req.body;
  const userRole = req.session.user.role;

  let studentId, teacherId;
  if (userRole === 'teacher') {
    teacherId = userId;
    studentId = otherUserId;
  } else {
    studentId = userId;
    teacherId = otherUserId;
  }

  const result = db.prepare(
    'INSERT INTO teacher_messages (student_id, teacher_id, sender_id, text) VALUES (?, ?, ?, ?)'
  ).run(studentId, teacherId, userId, text);

  const message = db.prepare(`
    SELECT tm.*, u.name AS sender_name, u.avatar AS sender_avatar
    FROM teacher_messages tm
    JOIN users u ON u.id = tm.sender_id
    WHERE tm.id = ?
  `).get(result.lastInsertRowid);

  res.json(message);
});

// ─── API: Preferences ──────────────────────────────────────────────────────────
app.get('/api/preferences', isAuthenticated, (req, res) => {
  const user = db.prepare('SELECT theme_preferences FROM users WHERE id = ?').get(req.session.user.id);
  let prefs = {};
  try {
    prefs = JSON.parse(user.theme_preferences || '{}');
  } catch (e) {
    prefs = {};
  }
  res.json(prefs);
});

app.put('/api/preferences', isAuthenticated, (req, res) => {
  const prefs = JSON.stringify(req.body);
  db.prepare('UPDATE users SET theme_preferences = ? WHERE id = ?')
    .run(prefs, req.session.user.id);

  req.session.user.theme_preferences = prefs;
  res.json({ success: true });
});

// ─── API: Streak ────────────────────────────────────────────────────────────────
app.get('/api/streak', isAuthenticated, (req, res) => {
  const user = db.prepare('SELECT streak_count, last_login_date FROM users WHERE id = ?')
    .get(req.session.user.id);
  res.json(user);
});

// ─── Leaderboard ────────────────────────────────────────────────────────────────
// Get leaderboard data
app.get('/api/leaderboard', isAuthenticated, (req, res) => {
  const leaderboard = db.prepare('SELECT id, name, avatar, streak_count FROM users ORDER BY streak_count DESC, name ASC').all();
  res.json(leaderboard);
});

// Broadcast leaderboard to all clients
function broadcastLeaderboard() {
  const leaderboard = db.prepare('SELECT id, name, avatar, streak_count FROM users ORDER BY streak_count DESC, name ASC').all();
  io.emit('leaderboard-update', leaderboard);
}


// ─── API: Classroom members ─────────────────────────────────────────────────────
app.get('/api/classroom-members/:id', isAuthenticated, (req, res) => {
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, cm.role
    FROM classroom_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.classroom_id = ?
  `).all(req.params.id);

  res.json(members);
});

// ─── Socket.io ──────────────────────────────────────────────────────────────────
// Share session middleware with Socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Track connected users: userId → socketId
const connectedUsers = new Map();

io.on('connection', (socket) => {
  const session = socket.request.session;
  const user = session && session.user;

  if (user) {
    connectedUsers.set(user.id, socket.id);
  }

  socket.on('join-classroom', (classroomId) => {
    socket.join('classroom-' + classroomId);
  });

  socket.on('chat-message', ({ classroomId, text }) => {
    if (!user) return;

    const result = db.prepare(
      'INSERT INTO messages (classroom_id, user_id, text) VALUES (?, ?, ?)'
    ).run(classroomId, user.id, text);

    const message = db.prepare(`
      SELECT m.*, u.name AS user_name, u.avatar AS user_avatar
      FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);

    io.to('classroom-' + classroomId).emit('chat-message', message);
  });

  socket.on('teacher-message', ({ toUserId, text }) => {
    if (!user) return;

    const userRole = user.role;
    let studentId, teacherId;
    if (userRole === 'teacher') {
      teacherId = user.id;
      studentId = toUserId;
    } else {
      studentId = user.id;
      teacherId = toUserId;
    }

    const result = db.prepare(
      'INSERT INTO teacher_messages (student_id, teacher_id, sender_id, text) VALUES (?, ?, ?, ?)'
    ).run(studentId, teacherId, user.id, text);

    const message = db.prepare(`
      SELECT tm.*, u.name AS sender_name, u.avatar AS sender_avatar
      FROM teacher_messages tm
      JOIN users u ON u.id = tm.sender_id
      WHERE tm.id = ?
    `).get(result.lastInsertRowid);

    // Send to recipient if they're online
    const recipientSocketId = connectedUsers.get(toUserId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('teacher-message', message);
    }

    // Also send back to sender for confirmation
    socket.emit('teacher-message', message);
  });

  socket.on('disconnect', () => {
    if (user) {
      connectedUsers.delete(user.id);
    }
  });
});

// SPA fallback — must be registered after all API routes
if (hasClientDist) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ─── Start server ───────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ORIGIN server running on port ${PORT}`);
});

