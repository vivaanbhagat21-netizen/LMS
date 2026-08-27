import { useMemo, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLocalStorageState } from '../utils/useLocalStorageState';

interface Classroom {
  id: string;
  name: string;
  code: string;
  createdBy: string;
  creatorName: string;
  members: string[];
  createdAt: string;
}

interface TaskItem {
  id: string;
  title: string;
  dueDate: string;
  classroomId?: string;
  classroomName?: string;
}

interface TaskSubmission {
  id: string;
  taskId: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  status: 'submitted' | 'graded';
  grade?: string;
  feedback?: string;
}

interface Notification {
  id: string;
  type: 'grade' | 'task' | 'overdue' | 'submission' | 'classroom' | 'info';
  title: string;
  body: string;
  link?: string;
  time: string;
  read: boolean;
}

const TYPE_STYLE: Record<Notification['type'], { icon: string; accent: string; bg: string }> = {
  grade:      { icon: '🎓', accent: '#4f46e5', bg: '#ede9fe' },
  task:       { icon: '📋', accent: '#f59e0b', bg: '#fef3c7' },
  overdue:    { icon: '🚨', accent: '#dc2626', bg: '#fee2e2' },
  submission: { icon: '📥', accent: '#0891b2', bg: '#cffafe' },
  classroom:  { icon: '🏫', accent: '#10b981', bg: '#dcfce7' },
  info:       { icon: '💡', accent: '#6b7280', bg: '#f3f4f6' },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return 'recently';
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const userId = String(user?.id ?? '');
  const isTeacher = user?.role === 'teacher';

  const [classrooms] = useLocalStorageState<Classroom[]>('edugen_classrooms', []);
  const [tasks] = useLocalStorageState<TaskItem[]>('edugen_tasks', []);
  const [submissions] = useLocalStorageState<TaskSubmission[]>('edugen_task_submissions', []);
  const [readIds, setReadIds] = useLocalStorageState<string[]>('edugen_notif_read', []);

  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visibleClassrooms = useMemo(
    () => classrooms.filter((cls) => String(cls.createdBy) === userId || cls.members.map(String).includes(userId)),
    [classrooms, userId]
  );

  const visibleClassroomIds = useMemo(
    () => new Set(visibleClassrooms.map((cls) => cls.id)),
    [visibleClassrooms]
  );

  const visibleTasks = useMemo(
    () => tasks.filter((t) => !t.classroomId || visibleClassroomIds.has(t.classroomId)),
    [tasks, visibleClassroomIds]
  );

  // Auto-generate notifications from live app data
  const notifications = useMemo<Notification[]>(() => {
    const list: Notification[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isTeacher) {
      // New ungraded submissions for teacher's classrooms
      const ungraded = submissions.filter((s) => s.status === 'submitted');
      if (ungraded.length > 0) {
        list.push({
          id: 'ungraded-summary',
          type: 'submission',
          title: `${ungraded.length} Submission${ungraded.length > 1 ? 's' : ''} Awaiting Review`,
          body: `Students have submitted work that needs to be graded.`,
          link: '/tasks',
          time: ungraded[0]?.submittedAt ?? today.toISOString(),
          read: false,
        });
      }

      // Tasks due soon (next 3 days)
      const soon = visibleTasks.filter((t) => {
        const due = new Date(t.dueDate);
        const diff = (due.getTime() - today.getTime()) / 86400000;
        return diff >= 0 && diff <= 3;
      });
      soon.forEach((t) => {
        list.push({
          id: `due-soon-${t.id}`,
          type: 'task',
          title: `Assignment Due Soon`,
          body: `"${t.title}" is due on ${t.dueDate}.`,
          link: '/tasks',
          time: today.toISOString(),
          read: false,
        });
      });

      // Overdue tasks (past due)
      const overdue = visibleTasks.filter((t) => new Date(t.dueDate) < today);
      if (overdue.length > 0) {
        list.push({
          id: 'overdue-tasks-teacher',
          type: 'overdue',
          title: `${overdue.length} Assignment${overdue.length > 1 ? 's' : ''} Past Due Date`,
          body: `Some assignments have passed their deadline without all students submitting.`,
          link: '/tasks',
          time: today.toISOString(),
          read: false,
        });
      }

      // Classroom count
      const myRooms = classrooms.filter((c) => String(c.createdBy) === userId);
      if (myRooms.length > 0) {
        list.push({
          id: 'classroom-info',
          type: 'classroom',
          title: `${myRooms.length} Active Classroom${myRooms.length > 1 ? 's' : ''}`,
          body: `You are managing ${myRooms.length} classroom${myRooms.length > 1 ? 's' : ''}. ${myRooms.reduce((a, c) => a + c.members.length, 0)} students enrolled.`,
          link: '/classrooms',
          time: today.toISOString(),
          read: false,
        });
      }

    } else {
      // STUDENT notifications

      // Newly graded submissions
      const graded = submissions.filter((s) => s.studentId === userId && s.status === 'graded' && s.grade);
      graded.slice(0, 5).forEach((s) => {
        const task = tasks.find((t) => t.id === s.taskId);
        list.push({
          id: `graded-${s.id}`,
          type: 'grade',
          title: `Assignment Graded!`,
          body: `"${task?.title ?? 'Assignment'}" received a grade of ${s.grade}.${s.feedback ? ' Teacher left feedback.' : ''}`,
          link: '/grades',
          time: s.submittedAt,
          read: false,
        });
      });

      // Overdue tasks for student
      const studentOverdue = tasks.filter((t) => {
        const due = new Date(t.dueDate);
        const alreadySubmitted = submissions.some((s) => s.taskId === t.id && s.studentId === userId);
        return due < today && !alreadySubmitted;
      });
      if (studentOverdue.length > 0) {
        list.push({
          id: 'student-overdue',
          type: 'overdue',
          title: `${studentOverdue.length} Overdue Assignment${studentOverdue.length > 1 ? 's' : ''}`,
          body: `You have ${studentOverdue.length} assignment${studentOverdue.length > 1 ? 's' : ''} past the deadline. Submit as soon as possible.`,
          link: '/tasks',
          time: today.toISOString(),
          read: false,
        });
      }

      // Upcoming tasks (next 3 days)
      const upcoming = tasks.filter((t) => {
        const due = new Date(t.dueDate);
        const diff = (due.getTime() - today.getTime()) / 86400000;
        const alreadySubmitted = submissions.some((s) => s.taskId === t.id && s.studentId === userId);
        return diff >= 0 && diff <= 3 && !alreadySubmitted;
      });
      upcoming.forEach((t) => {
        list.push({
          id: `upcoming-${t.id}`,
          type: 'task',
          title: `Assignment Due Soon`,
          body: `"${t.title}" is due on ${t.dueDate}. Don't forget to submit!`,
          link: '/tasks',
          time: today.toISOString(),
          read: false,
        });
      });

      // Enrolled classrooms
      if (visibleClassrooms.length > 0) {
        list.push({
          id: 'enrolled-classrooms',
          type: 'classroom',
          title: `Enrolled in ${visibleClassrooms.length} Classroom${visibleClassrooms.length > 1 ? 's' : ''}`,
          body: visibleClassrooms.map((c) => c.name).join(', '),
          link: '/classrooms',
          time: today.toISOString(),
          read: false,
        });
      }
    }

    // Welcome notification if nothing else
    if (list.length === 0) {
      list.push({
        id: 'welcome',
        type: 'info',
        title: 'Welcome to Edugen!',
        body: 'Your workspace is ready. Create or join classrooms to get started.',
        link: '/classrooms',
        time: today.toISOString(),
        read: false,
      });
    }

    // Merge read state
    return list.map((n) => ({ ...n, read: readIds.includes(n.id) }));
  }, [classrooms, tasks, submissions, userId, isTeacher, visibleClassrooms, readIds]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setReadIds(notifications.map((n) => n.id));
  };

  const markOneRead = (id: string) => {
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  return (
    <section className="page-section dashboard-page">
      {/* Welcome Banner with Bell */}
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>👋 Welcome back, {user?.name || 'Learner'}!</h2>
          <p>
            You are logged in as a <strong>{user?.role ? user.role.toUpperCase() : 'USER'}</strong>. Here is your learning workspace overview.
          </p>
        </div>

        {/* 🔔 Notification Bell */}
        <div ref={bellRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => { setBellOpen((v) => !v); }}
            style={{
              position: 'relative',
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: bellOpen ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'var(--surface)',
              color: bellOpen ? 'white' : 'var(--text)',
              fontSize: '1.3rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: bellOpen ? '0 4px 14px rgba(79,70,229,0.35)' : '0 2px 8px rgba(0,0,0,0.08)',
              transition: 'all 0.2s ease',
            }}
            title="Notifications"
          >
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: '#dc2626',
                color: 'white',
                borderRadius: '999px',
                fontSize: '0.65rem',
                fontWeight: '800',
                minWidth: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                boxShadow: '0 2px 6px rgba(220,38,38,0.5)',
                animation: 'pulse-dot 2s infinite',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown Panel */}
          {bellOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: '360px',
              maxHeight: '480px',
              overflowY: 'auto',
              borderRadius: '20px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
              zIndex: 999,
              animation: 'dropdown-in 0.18s ease',
            }}>
              {/* Panel Header */}
              <div style={{
                padding: '16px 18px 12px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                background: 'var(--surface)',
                zIndex: 1,
                borderRadius: '20px 20px 0 0',
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800' }}>🔔 Notifications</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '999px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: '#4f46e5',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    ✓ Mark all read
                  </button>
                )}
              </div>

              {/* Notification Items */}
              <div style={{ padding: '8px 0' }}>
                {notifications.map((n) => {
                  const style = TYPE_STYLE[n.type];
                  return (
                    <div
                      key={n.id}
                      onClick={() => markOneRead(n.id)}
                      style={{
                        display: 'flex',
                        gap: '12px',
                        padding: '12px 18px',
                        cursor: 'pointer',
                        background: n.read ? 'transparent' : `${style.bg}55`,
                        borderLeft: n.read ? '3px solid transparent' : `3px solid ${style.accent}`,
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `${style.bg}88`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = n.read ? 'transparent' : `${style.bg}55`; }}
                    >
                      {/* Icon bubble */}
                      <div style={{
                        flexShrink: 0,
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        background: style.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        border: `1px solid ${style.accent}33`,
                      }}>
                        {style.icon}
                      </div>

                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                          <p style={{ margin: 0, fontWeight: n.read ? '600' : '800', fontSize: '0.85rem', color: 'var(--text)' }}>
                            {n.title}
                          </p>
                          {!n.read && (
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: style.accent, flexShrink: 0, marginTop: '4px' }} />
                          )}
                        </div>
                        <p style={{ margin: '2px 0 4px', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                          {n.body}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{timeAgo(n.time)}</span>
                          {n.link && (
                            <Link
                              to={n.link}
                              onClick={() => { markOneRead(n.id); setBellOpen(false); }}
                              style={{
                                fontSize: '0.72rem',
                                color: style.accent,
                                fontWeight: '700',
                                textDecoration: 'none',
                              }}
                            >
                              View →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{
                padding: '10px 18px',
                borderTop: '1px solid var(--border)',
                textAlign: 'center',
              }}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Notifications are generated from your live workspace data.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Keyframe for badge pulse + dropdown */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes dropdown-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Quick Metrics */}
      <div className="panel-grid">
        <div className="stat-card" style={{ borderTopColor: '#4f46e5' }}>
          <span className="stat-label">Active Classrooms</span>
          <strong>{visibleClassrooms.length}</strong>
        </div>
        <div className="stat-card" style={{ borderTopColor: '#f59e0b' }}>
          <span className="stat-label">Active Assignments</span>
          <strong>{visibleTasks.length}</strong>
        </div>
        <div className="stat-card" style={{ borderTopColor: '#10b981' }}>
          <span className="stat-label">Account Role</span>
          <strong style={{ fontSize: '1.2rem', textTransform: 'capitalize' }}>
            {user?.role || 'Student'}
          </strong>
        </div>
        <div className="stat-card" style={{ borderTopColor: '#dc2626', cursor: 'pointer' }} onClick={() => setBellOpen(true)}>
          <span className="stat-label">🔔 Unread Alerts</span>
          <strong style={{ color: unreadCount > 0 ? '#dc2626' : 'var(--text)' }}>{unreadCount}</strong>
        </div>
      </div>

      {/* Profile & Focus Cards */}
      <div className="panel-grid">
        <div className="panel-card">
          <h3>👤 User Profile</h3>
          <div className="profile-card">
            <img
              src={user?.avatar || '/default-avatar.svg'}
              alt={user?.name ?? 'Profile'}
              className="avatar"
            />
            <div>
              <p style={{ margin: '0 0 6px 0' }}>
                <strong>Name:</strong> {user?.name}
              </p>
              <p style={{ margin: '0 0 6px 0' }}>
                <strong>Email:</strong> {user?.email}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Role:</strong> {user?.role ? user.role.toUpperCase() : 'STUDENT'}
              </p>
            </div>
          </div>
        </div>

        <div className="panel-card">
          <h3>🏫 Classroom Focus</h3>
          <p style={{ marginBottom: '14px' }}>
            {visibleClassrooms.length > 0
              ? `You are currently participating in ${visibleClassrooms.length} classroom${
                  visibleClassrooms.length === 1 ? '' : 's'
                }.`
              : isTeacher
              ? 'Create your first classroom to start inviting students.'
              : 'Join a classroom using a class code from your teacher.'}
          </p>
          <Link
            to="/classrooms"
            className="primary-button"
            style={{ display: 'inline-flex', width: 'auto', padding: '10px 20px' }}
          >
            {isTeacher ? '🏫 Create Classroom' : '🔗 Join Classroom'}
          </Link>
        </div>
      </div>

      {/* Quick Access Apps Grid */}
      <div className="panel-card" style={{ marginTop: '12px' }}>
        <h3>🚀 Quick Shortcuts</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginTop: '16px',
          }}
        >
          <Link to="/tasks" className="secondary-button" style={{ justifyContent: 'flex-start', padding: '14px 18px', textDecoration: 'none' }}>
            📋 <span style={{ marginLeft: '8px' }}>Assignments Center</span>
          </Link>
          <Link to="/classrooms" className="secondary-button" style={{ justifyContent: 'flex-start', padding: '14px 18px', textDecoration: 'none' }}>
            🏫 <span style={{ marginLeft: '8px' }}>My Classrooms</span>
          </Link>
          <Link to="/tutorials" className="secondary-button" style={{ justifyContent: 'flex-start', padding: '14px 18px', textDecoration: 'none' }}>
            📚 <span style={{ marginLeft: '8px' }}>Handouts & Reading</span>
          </Link>
          <Link to="/grades" className="secondary-button" style={{ justifyContent: 'flex-start', padding: '14px 18px', textDecoration: 'none' }}>
            🎓 <span style={{ marginLeft: '8px' }}>Gradebook</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
