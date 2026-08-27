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
  feedback TEXT,
  submitted_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tutorials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classroom_id INTEGER,
  youtube_url TEXT,
  title TEXT,
  added_by INTEGER,
  material_type TEXT DEFAULT 'youtube',
  file_url TEXT,
  description TEXT,
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
