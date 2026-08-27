import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLocalStorageState } from '../utils/useLocalStorageState';

export interface Classroom {
  id: string | number;
  name: string;
  code: string;
  otp?: string;
  teacher_id?: number | string;
  createdBy?: string;
  creatorName: string;
  teacher_name?: string;
  members: string[];
  member_count?: number;
  createdAt: string;
  created_at?: string;
}

const STORAGE_KEY = 'edugen_classrooms';

const INITIAL_CLASSROOMS: Classroom[] = [
  {
    id: 'class-1',
    name: 'AP Computer Science',
    code: 'CS2026',
    createdBy: 'preview-teacher',
    creatorName: 'Teacher Preview',
    members: ['preview-teacher', 'preview-student'],
    createdAt: '2026-08-01',
  },
  {
    id: 'class-2',
    name: 'Web Development Bootcamp',
    code: 'WEB101',
    createdBy: 'preview-teacher',
    creatorName: 'Teacher Preview',
    members: ['preview-teacher', 'preview-student'],
    createdAt: '2026-08-02',
  },
];

const randomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

export function ClassroomsPage() {
  const { user } = useAuth();
  const userId = String(user?.id ?? 'preview-student');
  const isTeacher = user?.role === 'teacher';

  const [localClassrooms, setLocalClassrooms] = useLocalStorageState<Classroom[]>(
    STORAGE_KEY,
    INITIAL_CLASSROOMS
  );
  const [apiClassrooms, setApiClassrooms] = useState<Classroom[]>([]);
  const [, setLoading] = useState(true);

  const [className, setClassName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | number | null>(null);

  const fetchClassrooms = async () => {
    try {
      const res = await fetch('/api/classrooms', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const formatted: Classroom[] = data.map((c: any) => ({
            id: c.id,
            name: c.name,
            code: c.otp || c.code || 'NOCODE',
            otp: c.otp,
            teacher_id: c.teacher_id,
            createdBy: String(c.teacher_id),
            creatorName: c.teacher_name || 'Teacher',
            teacher_name: c.teacher_name,
            members: [],
            member_count: c.member_count || 1,
            createdAt: c.created_at ? new Date(c.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
          }));
          setApiClassrooms(formatted);
        }
      }
    } catch (e) {
      console.warn('Backend unavailable, using local classrooms store');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const classrooms = useMemo(() => {
    if (apiClassrooms.length > 0) {
      return apiClassrooms;
    }
    return localClassrooms;
  }, [apiClassrooms, localClassrooms]);

  const createdClasses = useMemo(
    () => classrooms.filter((cls) => String(cls.createdBy || cls.teacher_id) === userId || isTeacher),
    [classrooms, userId, isTeacher]
  );

  const joinedClasses = useMemo(
    () => classrooms,
    [classrooms]
  );

  const normalizeCode = (input: string) => input.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Create Classroom (Teacher Only)
  const createClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacher) return;
    if (!className.trim()) {
      setStatus('Please enter a classroom name to create.');
      return;
    }

    try {
      const res = await fetch('/api/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: className.trim() }),
      });

      if (res.ok) {
        const newDbRoom = await res.json();
        const code = newDbRoom.otp || 'NOCODE';
        setStatus(`✅ Classroom "${newDbRoom.name}" created! Join Code: ${code}`);
        setClassName('');
        fetchClassrooms();
        return;
      }
    } catch (e) {
      console.warn('Backend unavailable, saving locally');
    }

    // Fallback to local storage
    const code = randomCode();
    const newRoom: Classroom = {
      id: `class-${Date.now()}`,
      name: className.trim(),
      code,
      createdBy: userId,
      creatorName: user?.name ?? 'Teacher',
      members: [userId],
      createdAt: new Date().toLocaleDateString(),
    };

    setLocalClassrooms((prev) => [newRoom, ...prev]);
    setClassName('');
    setStatus(`✅ Classroom "${newRoom.name}" created! Join Code: ${code}`);
  };

  // Join Classroom (Teacher & Student)
  const joinClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(joinCode);
    if (!code) {
      setStatus('Enter a classroom code to join.');
      return;
    }

    try {
      const res = await fetch(`/api/classrooms/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        const json = await res.json();
        if (json.message === 'Already a member') {
          setStatus(`ℹ️ You are already enrolled in this classroom.`);
        } else {
          setStatus(`🎉 Successfully joined classroom!`);
        }
        setJoinCode('');
        fetchClassrooms();
        return;
      } else {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error === 'Classroom not found') {
          // Check local classrooms fallback
          const localMatch = localClassrooms.find((cls) => normalizeCode(cls.code) === code);
          if (localMatch) {
            if (localMatch.members.map(String).includes(userId)) {
              setStatus(`ℹ️ You are already enrolled in ${localMatch.name}.`);
              setJoinCode('');
              return;
            }
            setLocalClassrooms((prev) =>
              prev.map((cls) =>
                cls.id === localMatch.id
                  ? { ...cls, members: [...cls.members.map(String), userId] }
                  : cls
              )
            );
            setStatus(`🎉 Successfully joined ${localMatch.name}!`);
            setJoinCode('');
            return;
          }
          setStatus('❌ Classroom code not found. Please check with your teacher.');
          return;
        }
      }
    } catch (e) {
      console.warn('Backend join failed, checking local classrooms fallback');
    }

    // Local fallback
    const match = localClassrooms.find((cls) => normalizeCode(cls.code) === code);
    if (!match) {
      setStatus('❌ Classroom code not found. Please check with your teacher.');
      return;
    }

    if (match.members.map(String).includes(userId)) {
      setStatus(`ℹ️ You are already enrolled in ${match.name}.`);
      setJoinCode('');
      return;
    }

    setLocalClassrooms((prev) =>
      prev.map((cls) =>
        cls.id === match.id
          ? { ...cls, members: [...cls.members.map(String), userId] }
          : cls
      )
    );

    setStatus(`🎉 Successfully joined ${match.name}!`);
    setJoinCode('');
  };

  // Delete Classroom (Teacher Only Interface)
  const handleDeleteClassroom = (classroomId: string | number, name: string) => {
    if (!isTeacher) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete classroom "${name}"?\n\nThis will permanently remove the classroom and revokes access for all enrolled students.`
    );

    if (confirmDelete) {
      setLocalClassrooms((prev) => prev.filter((cls) => cls.id !== classroomId));
      setApiClassrooms((prev) => prev.filter((cls) => cls.id !== classroomId));
      setStatus(`🗑️ Classroom "${name}" has been deleted.`);
    }
  };

  // Copy code helper
  const handleCopyCode = (code: string, id: string | number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  return (
    <section className="page-section classrooms-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>🏫 Classroom Hub</h2>
          <p>
            {isTeacher
              ? 'Create classrooms, share join codes with learners, or join other classes.'
              : 'Join classrooms using secure join codes provided by your teachers.'}
          </p>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '999px',
            background: isTeacher ? '#f0fdf4' : '#eff6ff',
            color: isTeacher ? '#166534' : '#1e40af',
            border: `1px solid ${isTeacher ? '#bbf7d0' : '#bfdbfe'}`,
            fontSize: '0.85rem',
            fontWeight: '600',
          }}
        >
          {isTeacher ? '👨‍🏫 Teacher Interface' : '🎓 Student Interface'}
        </div>
      </div>

      {/* Info Cards */}
      <div className="panel-grid">
        <div className="stat-card" style={{ borderTopColor: '#06b6d4' }}>
          <span className="stat-label">My Enrolled Classes</span>
          <strong>{joinedClasses.length}</strong>
        </div>
        {isTeacher && (
          <div className="stat-card" style={{ borderTopColor: '#f59e0b' }}>
            <span className="stat-label">My Created Classes</span>
            <strong>{createdClasses.length}</strong>
          </div>
        )}
      </div>

      {/* Classroom Action Forms */}
      <div className="entity-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {isTeacher && (
          <form onSubmit={createClassroom} style={{ display: 'grid', gap: '12px' }}>
            <h3>Create a New Classroom</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>
              Create a classroom to generate a unique 6-character join code for your students.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Classroom Name (e.g. AP Computer Science)"
                style={{ flex: 1, minWidth: '220px' }}
                required
              />
              <button
                className="primary-button"
                type="submit"
                style={{ width: 'auto', padding: '12px 24px' }}
              >
                + Create Classroom
              </button>
            </div>
          </form>
        )}

        <form onSubmit={joinClassroom} style={{ display: 'grid', gap: '12px', paddingTop: isTeacher ? '16px' : '0', borderTop: isTeacher ? '1px border var(--border)' : 'none' }}>
          <h3>Join a Classroom</h3>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>
            Enter the 6-character classroom join code provided by your teacher.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter 6-character code (e.g. S84AZ3)"
              style={{ flex: 1, minWidth: '220px' }}
              required
            />
            <button
              className="primary-button"
              type="submit"
              style={{ width: 'auto', padding: '12px 24px' }}
            >
              🔗 Join Classroom
            </button>
          </div>
        </form>

        {status && (
          <p
            style={{
              margin: '8px 0 0 0',
              padding: '10px 14px',
              borderRadius: '10px',
              background: '#f8fafc',
              border: '1px solid var(--border)',
              fontSize: '0.9rem',
              fontWeight: '600',
              color: 'var(--text)',
            }}
          >
            {status}
          </p>
        )}
      </div>

      {/* Classrooms List */}
      <div className="panel-grid" style={{ gridTemplateColumns: isTeacher ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Managed Classrooms for Teacher View */}
        {isTeacher && (
          <div className="panel-card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Managed Classrooms</h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {createdClasses.length} Classroom(s)
              </span>
            </div>

            {createdClasses.length > 0 ? (
              <div className="entity-list">
                {createdClasses.map((cls) => (
                  <div
                    key={cls.id}
                    className="entity-card"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '16px',
                      borderLeft: '5px solid #06b6d4',
                    }}
                  >
                    <div>
                      <h3 style={{ margin: '0 0 4px 0' }}>{cls.name}</h3>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            background: '#e0f2fe',
                            color: '#0369a1',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontWeight: '700',
                            fontSize: '0.82rem',
                          }}
                        >
                          Code: {cls.code}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                          👤 Creator: {cls.creatorName}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                          👥 {cls.member_count || cls.members.length || 1} Member(s)
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => handleCopyCode(cls.code, cls.id)}
                        style={{ width: 'auto', padding: '8px 14px', fontSize: '0.82rem' }}
                      >
                        {copiedCodeId === cls.id ? '✅ Copied!' : '📋 Copy Code'}
                      </button>

                      {/* Delete Classroom Button for Teacher Interface */}
                      <button
                        type="button"
                        onClick={() => handleDeleteClassroom(cls.id, cls.name)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          borderRadius: '12px',
                          border: '1px solid #fecdd3',
                          background: '#fff1f2',
                          color: '#dc2626',
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#ffe4e6';
                          e.currentTarget.style.borderColor = '#fda4af';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#fff1f2';
                          e.currentTarget.style.borderColor = '#fecdd3';
                        }}
                      >
                        🗑️ Delete Classroom
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', margin: 0 }}>You have not created any classrooms yet.</p>
            )}
          </div>
        )}

        {/* Student View Joined Classrooms */}
        {!isTeacher && (
          <div className="panel-card" style={{ gridColumn: '1 / -1' }}>
            <h3>Enrolled Classrooms</h3>
            {joinedClasses.length > 0 ? (
              <div className="entity-list" style={{ marginTop: '14px' }}>
                {joinedClasses.map((cls) => (
                  <div
                    key={cls.id}
                    className="entity-card"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderLeft: '5px solid #10b981',
                    }}
                  >
                    <div>
                      <h3 style={{ margin: '0 0 4px 0' }}>{cls.name}</h3>
                      <p style={{ margin: '0 0 6px 0', fontSize: '0.88rem', color: 'var(--muted)' }}>
                        Instructor: {cls.creatorName}
                      </p>
                      <span
                        style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontWeight: '700',
                          fontSize: '0.78rem',
                        }}
                      >
                        Class Code: {cls.code}
                      </span>
                    </div>

                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => handleCopyCode(cls.code, cls.id)}
                      style={{ width: 'auto', padding: '8px 14px', fontSize: '0.82rem' }}
                    >
                      {copiedCodeId === cls.id ? '✅ Copied!' : '📋 Copy Code'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', margin: '10px 0 0 0' }}>
                You have not joined any classrooms yet. Enter a join code above to enroll.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
