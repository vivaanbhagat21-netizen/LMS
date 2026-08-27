import { useMemo, useState } from 'react';
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

interface AttendanceRecord {
  id: string;
  classroomId: string;
  date: string; // YYYY-MM-DD
  records: StudentAttendance[];
  takenBy: string;
}

interface StudentAttendance {
  studentId: string;
  studentName: string;
  status: 'present' | 'absent' | 'late' | 'excused';
}

const STATUS_CONFIG: Record<StudentAttendance['status'], { label: string; icon: string; color: string; bg: string; border: string }> = {
  present: { label: 'Present', icon: '✅', color: '#166534', bg: '#dcfce7', border: '#86efac' },
  absent:  { label: 'Absent',  icon: '❌', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
  late:    { label: 'Late',    icon: '⏰', color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  excused: { label: 'Excused', icon: '📝', color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' },
};

const todayStr = () => new Date().toISOString().split('T')[0];

export function AttendancePage() {
  const { user } = useAuth();
  const userId = String(user?.id ?? 'preview-teacher');

  const [classrooms] = useLocalStorageState<Classroom[]>('edugen_classrooms', []);
  const [attendanceRecords, setAttendanceRecords] = useLocalStorageState<AttendanceRecord[]>('edugen_attendance', []);

  // UI state
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [activeTab, setActiveTab] = useState<'take' | 'history'>('take');
  const [searchQuery, setSearchQuery] = useState('');

  // Classrooms this user manages or is enrolled in
  const myClassrooms = useMemo(
    () => classrooms.filter((cls) => String(cls.createdBy) === userId || cls.members.map(String).includes(userId)),
    [classrooms, userId]
  );

  const selectedClassroom = myClassrooms.find((c) => c.id === selectedClassroomId) ?? myClassrooms[0] ?? null;

  // Build the draft attendance list for the selected classroom + date
  const [draftAttendance, setDraftAttendance] = useState<Record<string, StudentAttendance['status']>>({});

  // Check if attendance already taken for this date + classroom
  const existingRecord = useMemo(() => {
    if (!selectedClassroom) return null;
    return attendanceRecords.find(
      (r) => r.classroomId === selectedClassroom.id && r.date === selectedDate
    ) ?? null;
  }, [attendanceRecords, selectedClassroom, selectedDate]);

  // Members to show (excluding teacher/creator)
  const classroomStudents = useMemo(() => {
    if (!selectedClassroom) return [];
    return selectedClassroom.members
      .map(String)
      .filter((m) => m !== String(selectedClassroom.createdBy))
      .map((memberId) => ({
        id: memberId,
        name: memberId.startsWith('preview-') ? 'Preview Student' : `Student (${memberId.slice(0, 8)})`,
      }));
  }, [selectedClassroom]);

  const getStudentStatus = (studentId: string): StudentAttendance['status'] => {
    if (existingRecord) {
      return existingRecord.records.find((r) => r.studentId === studentId)?.status ?? 'absent';
    }
    return draftAttendance[studentId] ?? 'present';
  };

  const setStudentStatus = (studentId: string, status: StudentAttendance['status']) => {
    setDraftAttendance((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status: StudentAttendance['status']) => {
    const updated: Record<string, StudentAttendance['status']> = {};
    classroomStudents.forEach((s) => { updated[s.id] = status; });
    setDraftAttendance(updated);
  };

  const handleSaveAttendance = () => {
    if (!selectedClassroom || classroomStudents.length === 0) return;

    const records: StudentAttendance[] = classroomStudents.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      status: draftAttendance[s.id] ?? 'present',
    }));

    const newRecord: AttendanceRecord = {
      id: `att-${selectedClassroom.id}-${selectedDate}`,
      classroomId: selectedClassroom.id,
      date: selectedDate,
      records,
      takenBy: userId,
    };

    setAttendanceRecords((prev) => {
      const filtered = prev.filter(
        (r) => !(r.classroomId === selectedClassroom.id && r.date === selectedDate)
      );
      return [newRecord, ...filtered];
    });

    setDraftAttendance({});
  };

  // Stats for history tab
  const historyForClassroom = useMemo(() => {
    if (!selectedClassroom) return [];
    return attendanceRecords
      .filter((r) => r.classroomId === selectedClassroom.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, selectedClassroom]);

  const overallStats = useMemo(() => {
    if (historyForClassroom.length === 0) return null;
    let total = 0, present = 0, absent = 0, late = 0, excused = 0;
    historyForClassroom.forEach((rec) => {
      rec.records.forEach((r) => {
        total++;
        if (r.status === 'present') present++;
        else if (r.status === 'absent') absent++;
        else if (r.status === 'late') late++;
        else if (r.status === 'excused') excused++;
      });
    });
    return {
      sessions: historyForClassroom.length,
      rate: total > 0 ? ((present / total) * 100).toFixed(1) : '0',
      present, absent, late, excused, total,
    };
  }, [historyForClassroom]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return historyForClassroom;
    const q = searchQuery.toLowerCase();
    return historyForClassroom.filter(
      (r) =>
        r.date.includes(q) ||
        r.records.some((rec) => rec.studentName.toLowerCase().includes(q))
    );
  }, [historyForClassroom, searchQuery]);

  return (
    <section className="page-section attendance-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>🗓️ Attendance Tracker</h2>
          <p>Mark daily attendance for your classrooms, track patterns, and view session history.</p>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '999px',
            background: '#f0fdf4',
            color: '#166534',
            border: '1px solid #bbf7d0',
            fontSize: '0.85rem',
            fontWeight: '600',
          }}
        >
          👨‍🏫 Teacher Interface
        </div>
      </div>

      {/* Classroom + Date Selectors */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '24px',
        }}
      >
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
            📚 SELECT CLASSROOM
          </label>
          <select
            value={selectedClassroomId || selectedClassroom?.id || ''}
            onChange={(e) => {
              setSelectedClassroomId(e.target.value);
              setDraftAttendance({});
            }}
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: '0.92rem',
              fontWeight: '600',
            }}
          >
            {myClassrooms.length === 0 && (
              <option value="">No classrooms found</option>
            )}
            {myClassrooms.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
            📅 SELECT DATE
          </label>
          <input
            type="date"
            value={selectedDate}
            max={todayStr()}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setDraftAttendance({});
            }}
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: '0.92rem',
              fontWeight: '600',
            }}
          />
        </div>
      </div>

      {/* Tab Switcher */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          background: 'var(--surface)',
          padding: '6px',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          width: 'fit-content',
        }}
      >
        {(['take', 'history'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '0.88rem',
              transition: 'all 0.2s ease',
              background: activeTab === tab
                ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                : 'transparent',
              color: activeTab === tab ? 'white' : 'var(--muted)',
              boxShadow: activeTab === tab ? '0 4px 12px rgba(79,70,229,0.3)' : 'none',
            }}
          >
            {tab === 'take' ? '✏️ Take Attendance' : '📊 History & Analytics'}
          </button>
        ))}
      </div>

      {/* TAKE ATTENDANCE TAB */}
      {activeTab === 'take' && (
        <>
          {!selectedClassroom ? (
            <div className="placeholder-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🏫</div>
              <h3>No Classrooms Found</h3>
              <p style={{ color: 'var(--muted)' }}>Create a classroom first to start tracking attendance.</p>
            </div>
          ) : (
            <>
              {/* Status Banner */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '20px',
                  padding: '14px 18px',
                  borderRadius: '16px',
                  background: existingRecord ? '#dcfce7' : '#eff6ff',
                  border: `1px solid ${existingRecord ? '#86efac' : '#bfdbfe'}`,
                }}
              >
                <div>
                  <span style={{ fontWeight: '800', fontSize: '0.95rem', color: existingRecord ? '#166534' : '#1e40af' }}>
                    {existingRecord ? '✅ Attendance already recorded' : '📝 New attendance session'}
                  </span>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                    {selectedClassroom.name} · {selectedDate}
                    {existingRecord && ' · Saving will overwrite existing record'}
                  </p>
                </div>

                {/* Mark All Quick Buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--muted)', alignSelf: 'center' }}>MARK ALL:</span>
                  {(Object.keys(STATUS_CONFIG) as StudentAttendance['status'][]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => markAll(s)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '999px',
                        border: `1px solid ${STATUS_CONFIG[s].border}`,
                        background: STATUS_CONFIG[s].bg,
                        color: STATUS_CONFIG[s].color,
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      {STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Student Attendance Table */}
              {classroomStudents.length === 0 ? (
                <div className="placeholder-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '8px' }}>👥</div>
                  <h3>No Students Yet</h3>
                  <p style={{ color: 'var(--muted)' }}>
                    Students will appear here once they join using the classroom code.
                  </p>
                </div>
              ) : (
                <div style={{ marginBottom: '20px', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)' }}>
                    <thead>
                      <tr style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: 'white', fontWeight: '700', fontSize: '0.82rem', letterSpacing: '0.05em', width: '48px' }}>#</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: 'white', fontWeight: '700', fontSize: '0.82rem', letterSpacing: '0.05em' }}>STUDENT</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: 'white', fontWeight: '700', fontSize: '0.82rem', letterSpacing: '0.05em', width: '200px' }}>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classroomStudents.map((student, idx) => {
                        const status = getStudentStatus(student.id);
                        const cfg = STATUS_CONFIG[status];
                        const isEven = idx % 2 === 0;
                        return (
                          <tr
                            key={student.id}
                            style={{
                              background: isEven ? 'var(--surface)' : 'var(--surface-2, rgba(0,0,0,0.02))',
                              borderLeft: `4px solid ${cfg.border}`,
                              transition: 'background 0.15s ease',
                            }}
                          >
                            {/* Row number */}
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                              }}>
                                {idx + 1}
                              </span>
                            </td>

                            {/* Student name + ID */}
                            <td style={{ padding: '12px 16px' }}>
                              <p style={{ margin: 0, fontWeight: '700', fontSize: '0.93rem' }}>{student.name}</p>
                              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>{student.id}</p>
                            </td>

                            {/* Status Dropdown */}
                            <td style={{ padding: '10px 16px' }}>
                              <select
                                value={status}
                                onChange={(e) => setStudentStatus(student.id, e.target.value as StudentAttendance['status'])}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  borderRadius: '10px',
                                  border: `2px solid ${cfg.border}`,
                                  background: cfg.bg,
                                  color: cfg.color,
                                  fontWeight: '700',
                                  fontSize: '0.85rem',
                                  cursor: 'pointer',
                                  outline: 'none',
                                  appearance: 'none',
                                  WebkitAppearance: 'none',
                                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                                  backgroundRepeat: 'no-repeat',
                                  backgroundPosition: 'right 10px center',
                                  paddingRight: '30px',
                                }}
                              >
                                {(Object.keys(STATUS_CONFIG) as StudentAttendance['status'][]).map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Live Summary + Save */}
              {classroomStudents.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    padding: '16px 20px',
                    borderRadius: '16px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    {(Object.keys(STATUS_CONFIG) as StudentAttendance['status'][]).map((s) => {
                      const count = classroomStudents.filter(
                        (st) => getStudentStatus(st.id) === s
                      ).length;
                      return (
                        <div key={s} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.2rem', fontWeight: '800', color: STATUS_CONFIG[s].color }}>
                            {count}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: '600' }}>
                            {STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveAttendance}
                    className="primary-button"
                    style={{ width: 'auto', padding: '12px 28px' }}
                  >
                    💾 Save Attendance
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* HISTORY & ANALYTICS TAB */}
      {activeTab === 'history' && (
        <>
          {/* Overall Stats */}
          {overallStats && (
            <div className="panel-grid" style={{ marginBottom: '24px' }}>
              <div className="stat-card" style={{ borderTopColor: '#4f46e5' }}>
                <span className="stat-label">📅 Sessions Recorded</span>
                <strong>{overallStats.sessions}</strong>
              </div>
              <div className="stat-card" style={{ borderTopColor: '#10b981' }}>
                <span className="stat-label">📈 Attendance Rate</span>
                <strong style={{ color: parseFloat(overallStats.rate) >= 80 ? '#16a34a' : '#dc2626' }}>
                  {overallStats.rate}%
                </strong>
              </div>
              <div className="stat-card" style={{ borderTopColor: '#86efac' }}>
                <span className="stat-label">✅ Total Present</span>
                <strong>{overallStats.present}</strong>
              </div>
              <div className="stat-card" style={{ borderTopColor: '#fca5a5' }}>
                <span className="stat-label">❌ Total Absent</span>
                <strong>{overallStats.absent}</strong>
              </div>
              <div className="stat-card" style={{ borderTopColor: '#fde68a' }}>
                <span className="stat-label">⏰ Total Late</span>
                <strong>{overallStats.late}</strong>
              </div>
              <div className="stat-card" style={{ borderTopColor: '#93c5fd' }}>
                <span className="stat-label">📝 Excused</span>
                <strong>{overallStats.excused}</strong>
              </div>
            </div>
          )}

          {/* Search */}
          <div style={{ marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="🔍 Filter by student name or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '14px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontSize: '0.92rem',
              }}
            />
          </div>

          {/* Register Table: students = rows, dates = columns */}
          {historyForClassroom.length === 0 ? (
            <div className="placeholder-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📊</div>
              <h3>No Attendance Records Yet</h3>
              <p style={{ color: 'var(--muted)' }}>
                Use the "Take Attendance" tab to record your first session.
              </p>
            </div>
          ) : (() => {
            // Build sorted unique date columns (chronological)
            const allDates = [...new Set(historyForClassroom.map((r) => r.date))].sort();

            // Build unique student list across all records
            const studentMap = new Map<string, string>(); // id -> name
            historyForClassroom.forEach((rec) => {
              rec.records.forEach((r) => {
                if (!studentMap.has(r.studentId)) studentMap.set(r.studentId, r.studentName);
              });
            });

            // Filter dates/students by search query
            const q = searchQuery.trim().toLowerCase();
            const visibleDates = q
              ? allDates.filter((d) => d.includes(q) || historyForClassroom
                  .find((r) => r.date === d)
                  ?.records.some((rec) => rec.studentName.toLowerCase().includes(q)))
              : allDates;

            const visibleStudents = [...studentMap.entries()].filter(
              ([, name]) => !q || name.toLowerCase().includes(q) || visibleDates.length > 0
            );

            // Fast lookup: date -> studentId -> status
            const lookup = new Map<string, Map<string, StudentAttendance['status']>>();
            historyForClassroom.forEach((rec) => {
              const byStudent = new Map<string, StudentAttendance['status']>();
              rec.records.forEach((r) => byStudent.set(r.studentId, r.status));
              lookup.set(rec.date, byStudent);
            });

            return (
              <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)', minWidth: `${300 + visibleDates.length * 110}px` }}>
                  <thead>
                    {/* Header row: Student col + one col per date + Rate col */}
                    <tr style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', color: 'white', fontWeight: '700', fontSize: '0.8rem', letterSpacing: '0.05em', minWidth: '160px', position: 'sticky', left: 0, background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', zIndex: 2 }}>
                        👤 STUDENT
                      </th>
                      {visibleDates.map((date) => (
                        <th key={date} style={{ padding: '12px 10px', textAlign: 'center', color: 'white', fontWeight: '700', fontSize: '0.75rem', minWidth: '100px', whiteSpace: 'nowrap' }}>
                          📅 {date}
                        </th>
                      ))}
                      <th style={{ padding: '12px 14px', textAlign: 'center', color: 'white', fontWeight: '700', fontSize: '0.8rem', minWidth: '80px', background: 'rgba(0,0,0,0.15)' }}>
                        RATE
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleStudents.map(([studentId, studentName], rowIdx) => {
                      // Compute per-student attendance rate
                      let presentCount = 0;
                      let totalSessions = 0;
                      visibleDates.forEach((date) => {
                        const byStudent = lookup.get(date);
                        if (byStudent?.has(studentId)) {
                          totalSessions++;
                          if (byStudent.get(studentId) === 'present') presentCount++;
                        }
                      });
                      const rate = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : null;
                      const isEven = rowIdx % 2 === 0;

                      return (
                        <tr
                          key={studentId}
                          style={{ background: isEven ? 'var(--surface)' : 'rgba(79,70,229,0.03)' }}
                        >
                          {/* Student name — sticky left column */}
                          <td style={{ padding: '11px 16px', fontWeight: '700', fontSize: '0.88rem', position: 'sticky', left: 0, background: isEven ? 'var(--surface)' : 'rgba(79,70,229,0.03)', zIndex: 1, borderRight: '1px solid var(--border)' }}>
                            {studentName}
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--muted)', fontWeight: '400' }}>{studentId}</p>
                          </td>

                          {/* Status cell per date */}
                          {visibleDates.map((date) => {
                            const byStudent = lookup.get(date);
                            const status = byStudent?.get(studentId);
                            if (!status) {
                              return (
                                <td key={date} style={{ padding: '10px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>—</span>
                                </td>
                              );
                            }
                            const cfg = STATUS_CONFIG[status];
                            return (
                              <td key={date} style={{ padding: '8px 10px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 10px',
                                  borderRadius: '999px',
                                  background: cfg.bg,
                                  color: cfg.color,
                                  border: `1px solid ${cfg.border}`,
                                  fontSize: '0.75rem',
                                  fontWeight: '700',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {cfg.icon} {cfg.label}
                                </span>
                              </td>
                            );
                          })}

                          {/* Per-student rate */}
                          <td style={{ padding: '10px 14px', textAlign: 'center', background: 'rgba(0,0,0,0.03)' }}>
                            {rate !== null ? (
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: '999px',
                                fontWeight: '800',
                                fontSize: '0.8rem',
                                background: rate >= 80 ? '#dcfce7' : rate >= 60 ? '#fef3c7' : '#fee2e2',
                                color: rate >= 80 ? '#166534' : rate >= 60 ? '#92400e' : '#991b1b',
                                border: `1px solid ${rate >= 80 ? '#86efac' : rate >= 60 ? '#fde68a' : '#fca5a5'}`,
                              }}>
                                {rate}%
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Footer row: per-date present % */}
                  <tfoot>
                    <tr style={{ background: 'rgba(79,70,229,0.08)', borderTop: '2px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: '800', fontSize: '0.8rem', color: 'var(--muted)', position: 'sticky', left: 0, background: 'rgba(79,70,229,0.08)', borderRight: '1px solid var(--border)' }}>
                        📈 DAY RATE
                      </td>
                      {visibleDates.map((date) => {
                        const rec = historyForClassroom.find((r) => r.date === date);
                        if (!rec) return <td key={date} />;
                        const total = rec.records.length;
                        const present = rec.records.filter((r) => r.status === 'present').length;
                        const pct = total > 0 ? Math.round((present / total) * 100) : 0;
                        return (
                          <td key={date} style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: '999px',
                              fontWeight: '800',
                              fontSize: '0.78rem',
                              background: pct >= 80 ? '#dcfce7' : pct >= 60 ? '#fef3c7' : '#fee2e2',
                              color: pct >= 80 ? '#166534' : pct >= 60 ? '#92400e' : '#991b1b',
                              border: `1px solid ${pct >= 80 ? '#86efac' : pct >= 60 ? '#fde68a' : '#fca5a5'}`,
                            }}>
                              {pct}%
                            </span>
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </>
      )}
    </section>
  );
}

