import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLocalStorageState } from '../utils/useLocalStorageState';
import { calculateIBScore } from './TasksPage';

interface TaskItem {
  id: string;
  title: string;
  dueDate: string;
  details: string;
  classroomId?: string;
  classroomName?: string;
}

interface TaskSubmission {
  id: string;
  taskId: string;
  studentId: string;
  studentName: string;
  submissionText: string;
  submittedAt: string;
  status: 'submitted' | 'graded';
  grade?: string;
  critA?: number;
  critB?: number;
  critC?: number;
  critD?: number;
  feedback?: string;
}

interface ManualGradeEntry {
  student: string;
  subject: string;
  score: string;
  critA?: number;
  critB?: number;
  critC?: number;
  critD?: number;
}

interface Classroom {
  id: string;
  name: string;
  code: string;
  createdBy: string;
  creatorName: string;
  members: string[];
  createdAt: string;
}

interface MergedGradeRecord {
  id: string;
  studentName: string;
  studentId?: string;
  assignmentTitle: string;
  classroomId?: string;
  classroomName: string;
  score: string;
  critA: number;
  critB: number;
  critC: number;
  critD: number;
  totalPoints: number; // out of 32
  ibGrade: number; // 1-7
  feedback?: string;
  date: string;
  isFromAssignment: boolean;
}

export function GradesPage() {
  const { user } = useAuth();
  const userId = String(user?.id ?? 'preview-student');
  const isTeacher = user?.role === 'teacher';

  const [classrooms] = useLocalStorageState<Classroom[]>('edugen_classrooms', []);
  const [tasks] = useLocalStorageState<TaskItem[]>('edugen_tasks', []);
  const [submissions] = useLocalStorageState<TaskSubmission[]>('edugen_task_submissions', []);
  const [manualGrades, setManualGrades] = useLocalStorageState<ManualGradeEntry[]>('edugen_grades', []);

  // Classrooms current user is enrolled in or created
  const userClassrooms = useMemo(
    () => classrooms.filter((cls) => String(cls.createdBy) === userId || cls.members.map(String).includes(userId)),
    [classrooms, userId]
  );

  const userClassroomIds = useMemo(
    () => new Set(userClassrooms.map((cls) => cls.id)),
    [userClassrooms]
  );

  // Filter & Form State
  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [studentInput, setStudentInput] = useState('');
  const [subjectInput, setSubjectInput] = useState('');
  const [critA, setCritA] = useState<number>(7);
  const [critB, setCritB] = useState<number>(7);
  const [critC, setCritC] = useState<number>(7);
  const [critD, setCritD] = useState<number>(7);

  // Combine graded assignment submissions + manual grade entries into IB Records
  const allGradeRecords = useMemo(() => {
    const records: MergedGradeRecord[] = [];

    // 1. Convert graded submissions into records
    submissions.forEach((sub) => {
      if (sub.status === 'graded' || sub.grade) {
        const task = tasks.find((t) => t.id === sub.taskId);
        const a = sub.critA ?? 7;
        const b = sub.critB ?? 7;
        const c = sub.critC ?? 7;
        const d = sub.critD ?? 7;
        const scoreCalc = calculateIBScore(a, b, c, d);

        records.push({
          id: `sub-grade-${sub.id}`,
          studentName: sub.studentName || 'Student',
          studentId: sub.studentId,
          assignmentTitle: task?.title || 'IB Classroom Assignment',
          classroomId: task?.classroomId,
          classroomName: task?.classroomName || 'General',
          score: sub.grade || scoreCalc.summary,
          critA: a,
          critB: b,
          critC: c,
          critD: d,
          totalPoints: scoreCalc.total,
          ibGrade: scoreCalc.ibGrade,
          feedback: sub.feedback,
          date: sub.submittedAt || 'Recently',
          isFromAssignment: true,
        });
      }
    });

    // 2. Add manual grades
    manualGrades.forEach((entry, idx) => {
      const a = entry.critA ?? 7;
      const b = entry.critB ?? 7;
      const c = entry.critC ?? 7;
      const d = entry.critD ?? 7;
      const scoreCalc = calculateIBScore(a, b, c, d);

      records.push({
        id: `manual-grade-${idx}`,
        studentName: entry.student || 'Student',
        assignmentTitle: entry.subject || 'IB Direct Assessment',
        classroomName: 'Gradebook Entry',
        score: entry.score || scoreCalc.summary,
        critA: a,
        critB: b,
        critC: c,
        critD: d,
        totalPoints: scoreCalc.total,
        ibGrade: scoreCalc.ibGrade,
        date: 'Recorded',
        isFromAssignment: false,
      });
    });

    return records;
  }, [submissions, tasks, manualGrades]);

  // Filter records based on classroom membership, student identity, and search query
  const visibleGrades = useMemo(() => {
    return allGradeRecords.filter((record) => {
      // Must belong to a classroom the user is enrolled in/added to (if classroomId is set)
      if (record.classroomId && !userClassroomIds.has(record.classroomId)) {
        return false;
      }

      // If student: strictly match studentId (or name if preview)
      if (!isTeacher) {
        if (record.studentId) {
          if (String(record.studentId) !== userId) {
            return false;
          }
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesStudent = record.studentName.toLowerCase().includes(q);
        const matchesTitle = record.assignmentTitle.toLowerCase().includes(q);
        const matchesClassroom = record.classroomName.toLowerCase().includes(q);
        if (!matchesStudent && !matchesTitle && !matchesClassroom) return false;
      }

      return true;
    });
  }, [allGradeRecords, isTeacher, userId, userClassroomIds, searchQuery]);

  // Calculate IB Criteria Averages (Out of 8)
  const ibStats = useMemo(() => {
    if (visibleGrades.length === 0) {
      return { avgA: '—', avgB: '—', avgC: '—', avgD: '—', avgTotal: '—', avgIBGrade: '—' };
    }

    const sumA = visibleGrades.reduce((acc, curr) => acc + curr.critA, 0);
    const sumB = visibleGrades.reduce((acc, curr) => acc + curr.critB, 0);
    const sumC = visibleGrades.reduce((acc, curr) => acc + curr.critC, 0);
    const sumD = visibleGrades.reduce((acc, curr) => acc + curr.critD, 0);
    const sumTotal = visibleGrades.reduce((acc, curr) => acc + curr.totalPoints, 0);
    const sumIBGrade = visibleGrades.reduce((acc, curr) => acc + curr.ibGrade, 0);

    const len = visibleGrades.length;

    return {
      avgA: `${(sumA / len).toFixed(1)} / 8`,
      avgB: `${(sumB / len).toFixed(1)} / 8`,
      avgC: `${(sumC / len).toFixed(1)} / 8`,
      avgD: `${(sumD / len).toFixed(1)} / 8`,
      avgTotal: `${(sumTotal / len).toFixed(1)} / 32`,
      avgIBGrade: `Grade ${(sumIBGrade / len).toFixed(1)}`,
    };
  }, [visibleGrades]);

  const handleCreateManualGrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentInput.trim()) return;

    const calculated = calculateIBScore(critA, critB, critC, critD);

    setManualGrades((prev) => [
      {
        student: studentInput.trim(),
        subject: subjectInput.trim() || 'IB MYP Assessment',
        score: calculated.summary,
        critA,
        critB,
        critC,
        critD,
      },
      ...prev,
    ]);

    setStudentInput('');
    setSubjectInput('');
    setFormOpen(false);
  };

  return (
    <section className="page-section grades-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>🎓 IB MYP Gradebook (Out of 8 Criteria)</h2>
          <p>
            {isTeacher
              ? 'Assess students across IB Criteria A, B, C, and D (scored 0 to 8 per criterion).'
              : 'Review your IB criteria breakdown (A, B, C, D out of 8) and teacher feedback.'}
          </p>
        </div>

        {isTeacher && (
          <button
            className="primary-button"
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            style={{ width: 'auto' }}
          >
            {formOpen ? 'Cancel' : '+ Add IB Grade Entry'}
          </button>
        )}
      </div>

      {/* Manual Grade Form for Teachers */}
      {isTeacher && formOpen && (
        <form className="entity-form" onSubmit={handleCreateManualGrade}>
          <h3>Record Direct IB Assessment (0-8 per Criterion)</h3>
          <input
            value={studentInput}
            onChange={(e) => setStudentInput(e.target.value)}
            placeholder="Student Name (e.g. Alex Johnson)"
            required
          />
          <input
            value={subjectInput}
            onChange={(e) => setSubjectInput(e.target.value)}
            placeholder="Assessment Title (e.g. MYP Science Criterion A & D)"
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Crit A /8</label>
              <input
                type="number"
                min={0}
                max={8}
                value={critA}
                onChange={(e) => setCritA(Math.min(8, Math.max(0, parseInt(e.target.value) || 0)))}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Crit B /8</label>
              <input
                type="number"
                min={0}
                max={8}
                value={critB}
                onChange={(e) => setCritB(Math.min(8, Math.max(0, parseInt(e.target.value) || 0)))}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Crit C /8</label>
              <input
                type="number"
                min={0}
                max={8}
                value={critC}
                onChange={(e) => setCritC(Math.min(8, Math.max(0, parseInt(e.target.value) || 0)))}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Crit D /8</label>
              <input
                type="number"
                min={0}
                max={8}
                value={critD}
                onChange={(e) => setCritD(Math.min(8, Math.max(0, parseInt(e.target.value) || 0)))}
              />
            </div>
          </div>

          <button className="primary-button" type="submit">
            Save IB Criteria Grade
          </button>
        </form>
      )}

      {/* IB Criteria 0-8 Stat Metric Grid */}
      <div className="panel-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card" style={{ borderTopColor: '#3b82f6' }}>
          <span className="stat-label">📘 Crit A (Knowing)</span>
          <strong>{ibStats.avgA}</strong>
        </div>
        <div className="stat-card" style={{ borderTopColor: '#f59e0b' }}>
          <span className="stat-label">📙 Crit B (Planning)</span>
          <strong>{ibStats.avgB}</strong>
        </div>
        <div className="stat-card" style={{ borderTopColor: '#10b981' }}>
          <span className="stat-label">📗 Crit C (Creating)</span>
          <strong>{ibStats.avgC}</strong>
        </div>
        <div className="stat-card" style={{ borderTopColor: '#8b5cf6' }}>
          <span className="stat-label">📕 Crit D (Thinking)</span>
          <strong>{ibStats.avgD}</strong>
        </div>
        <div className="stat-card" style={{ borderTopColor: '#ec4899' }}>
          <span className="stat-label">🏆 IB Overall Grade</span>
          <strong style={{ fontSize: '1.4rem' }}>{ibStats.avgIBGrade}</strong>
        </div>
      </div>

      {/* Search Filter Control */}
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="🔍 Search IB grades by student, assignment title, or classroom..."
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

      {/* IB Grade Cards List */}
      {visibleGrades.length > 0 ? (
        <div className="entity-list">
          {visibleGrades.map((record) => (
            <div
              key={record.id}
              className="entity-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                borderLeft: '5px solid #8b5cf6',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '999px',
                        background: '#f3e8ff',
                        color: '#7e22ce',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                      }}
                    >
                      🏫 {record.classroomName}
                    </span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                      📅 {record.date}
                    </span>
                  </div>
                  <h3 style={{ margin: '4px 0 2px 0' }}>{record.assignmentTitle}</h3>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>
                    Student: <strong>{record.studentName}</strong>
                  </p>
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                    color: 'white',
                    fontWeight: '800',
                    fontSize: '1rem',
                    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
                  }}
                >
                  🏆 IB Grade {record.ibGrade} ({record.totalPoints}/32)
                </div>
              </div>

              {/* IB Criteria 0-8 Grid Chips */}
              <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: '14px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '8px', color: 'var(--muted)' }}>
                  IB CRITERIA BREAKDOWN (OUT OF 8):
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', textAlign: 'center' }}>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 'bold', color: '#1e40af' }}>
                    📘 Crit A<br />{record.critA} / 8
                  </div>
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '6px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 'bold', color: '#92400e' }}>
                    📙 Crit B<br />{record.critB} / 8
                  </div>
                  <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '6px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 'bold', color: '#166534' }}>
                    📗 Crit C<br />{record.critC} / 8
                  </div>
                  <div style={{ background: '#f3e8ff', border: '1px solid #e9d5ff', padding: '6px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 'bold', color: '#6b21a8' }}>
                    📕 Crit D<br />{record.critD} / 8
                  </div>
                </div>
              </div>

              {record.feedback && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '12px',
                    padding: '12px 14px',
                  }}
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#166534', display: 'block', marginBottom: '2px' }}>
                    💬 Teacher Feedback:
                  </span>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#14532d', fontStyle: 'italic' }}>
                    "{record.feedback}"
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="placeholder-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🎓</div>
          <h3 style={{ margin: '0 0 6px 0' }}>No IB Graded Assignments Yet</h3>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            {isTeacher
              ? 'When you grade student assignment submissions against IB Criteria A, B, C, D in the Task Center, they will automatically appear here!'
              : 'As soon as your teacher evaluates your submitted assignments against IB Criteria (Out of 8), your grades and breakdown will appear here.'}
          </p>
        </div>
      )}
    </section>
  );
}
