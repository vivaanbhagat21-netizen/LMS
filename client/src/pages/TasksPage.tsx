import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLocalStorageState } from '../utils/useLocalStorageState';
import './TasksPage.css';

export interface Classroom {
  id: string;
  name: string;
  code: string;
  createdBy: string;
  creatorName: string;
  members: string[];
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  details: string;
  classroomId?: string;
  classroomName?: string;
  fileUrl?: string;
  fileName?: string;
  createdAt: string;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  studentId: string;
  studentName: string;
  submissionText: string;
  fileUrl?: string;
  fileName?: string;
  submittedAt: string;
  status: 'submitted' | 'graded';
  grade?: string;
  critA?: number; // 0-8 Knowing & Understanding
  critB?: number; // 0-8 Investigating / Planning
  critC?: number; // 0-8 Communicating / Creating
  critD?: number; // 0-8 Thinking Critically
  feedback?: string;
}

export function calculateIBScore(a: number, b: number, c: number, d: number) {
  const validA = Math.min(8, Math.max(0, a || 0));
  const validB = Math.min(8, Math.max(0, b || 0));
  const validC = Math.min(8, Math.max(0, c || 0));
  const validD = Math.min(8, Math.max(0, d || 0));
  const total = validA + validB + validC + validD;

  let ibGrade = 1;
  if (total >= 28) ibGrade = 7;
  else if (total >= 24) ibGrade = 6;
  else if (total >= 19) ibGrade = 5;
  else if (total >= 15) ibGrade = 4;
  else if (total >= 10) ibGrade = 3;
  else if (total >= 5) ibGrade = 2;

  return {
    validA,
    validB,
    validC,
    validD,
    total,
    ibGrade,
    summary: `A: ${validA}/8 | B: ${validB}/8 | C: ${validC}/8 | D: ${validD}/8 → ${total}/32 (IB Grade ${ibGrade})`,
  };
}

const INITIAL_TASKS: TaskItem[] = [
  {
    id: 'task-101',
    title: 'React Component Architecture & Hooks',
    dueDate: '2026-08-08',
    details: 'Design and build a multi-tab student workspace component utilizing custom React hooks and state management.',
    classroomId: 'class-1',
    classroomName: 'AP Computer Science',
    createdAt: '2026-08-01',
  },
  {
    id: 'task-102',
    title: 'Database Normalization & SQL Queries',
    dueDate: '2026-08-05',
    details: 'Complete problems 1 through 10 on database schema design, 3NF normalization, and complex JOIN queries.',
    classroomId: 'class-1',
    classroomName: 'AP Computer Science',
    createdAt: '2026-08-02',
  },
  {
    id: 'task-103',
    title: 'Mobile UX Design & Wireframing Feedback',
    dueDate: '2026-08-04',
    details: 'Submit wireframe mockups for the student dashboard mobile experience and collect peer feedback.',
    classroomId: 'class-2',
    classroomName: 'Web Development Bootcamp',
    createdAt: '2026-08-02',
  },
  {
    id: 'task-104',
    title: 'Data Structures Problem Set 3',
    dueDate: '2026-07-30',
    details: 'Implement Binary Search Tree traversals and Min-Heap priority queues in TypeScript with unit tests.',
    classroomId: 'class-1',
    classroomName: 'AP Computer Science',
    createdAt: '2026-07-20',
  },
  {
    id: 'task-105',
    title: 'Python Web Frameworks Lab',
    dueDate: '2026-08-01',
    details: 'Build a lightweight REST endpoint in FastAPI with authentication middleware and CORS support.',
    classroomId: 'class-2',
    classroomName: 'Web Development Bootcamp',
    createdAt: '2026-07-25',
  },
  {
    id: 'task-106',
    title: 'HTML5 & CSS Grid Layout Project',
    dueDate: '2026-08-02',
    details: 'Create a responsive web app layout matching the high-fidelity mockups provided in class.',
    classroomId: 'class-2',
    classroomName: 'Web Development Bootcamp',
    createdAt: '2026-07-28',
  },
  {
    id: 'task-107',
    title: 'TypeScript Interfaces & Generics Review',
    dueDate: '2026-08-06',
    details: 'Refactor existing JavaScript utilities into strictly typed TypeScript generic helper functions.',
    classroomId: 'class-1',
    classroomName: 'AP Computer Science',
    createdAt: '2026-08-01',
  },
];

const INITIAL_SUBMISSIONS: TaskSubmission[] = [
  {
    id: 'sub-201',
    taskId: 'task-106',
    studentId: 'preview-student',
    studentName: 'Student Preview',
    submissionText: 'Completed grid layout with CSS variables and responsive media queries. Tested across mobile and desktop breakpoints.',
    fileUrl: 'https://github.com/example/css-grid-project',
    submittedAt: '2026-08-01 14:30',
    status: 'graded',
    critA: 7,
    critB: 8,
    critC: 7,
    critD: 7,
    grade: 'A: 7/8 | B: 8/8 | C: 7/8 | D: 7/8 → 29/32 (IB Grade 7)',
    feedback: 'Outstanding technical understanding and clean execution! Demonstrated high critical thinking in layout responsiveness.',
  },
  {
    id: 'sub-202',
    taskId: 'task-107',
    studentId: 'preview-student',
    studentName: 'Student Preview',
    submissionText: 'Converted all utility functions to generic types with constraints. Added comprehensive JSDoc annotations.',
    submittedAt: '2026-08-03 10:15',
    status: 'submitted',
  },
];

type StudentTab = 'upcoming' | 'submitted' | 'overdue' | 'all';

export function TasksPage() {
  const { user } = useAuth();
  const userId = String(user?.id ?? 'preview-student');
  const studentName = user?.name ?? 'Student Preview';

  // Strict role determination from login state (cannot be toggled on the page)
  const isTeacher = user?.role === 'teacher';

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClassroomId = searchParams.get('classroom') ?? '';
  const initialTabParam = (searchParams.get('tab') as StudentTab) || 'upcoming';

  const [tasks, setTasks] = useLocalStorageState<TaskItem[]>('edugen_tasks', INITIAL_TASKS);
  const [submissions, setSubmissions] = useLocalStorageState<TaskSubmission[]>(
    'edugen_task_submissions',
    INITIAL_SUBMISSIONS
  );
  const [classrooms] = useLocalStorageState<Classroom[]>('edugen_classrooms', []);

  // UI state
  const [activeTab, setActiveTab] = useState<StudentTab>(initialTabParam);
  const [searchQuery, setSearchQuery] = useState('');

  // Submit Modal state
  const [selectedTaskToSubmit, setSelectedTaskToSubmit] = useState<TaskItem | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFileUrl, setSubmissionFileUrl] = useState('');
  const [submissionFileName, setSubmissionFileName] = useState('');
  const [submitFeedbackMsg, setSubmitFeedbackMsg] = useState('');

  // Teacher Create Task state
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newClassroomId, setNewClassroomId] = useState('');
  const [newFileUrl, setNewFileUrl] = useState('');
  const [newFileName, setNewFileName] = useState('');

  // Teacher IB Grade state (Criteria A, B, C, D out of 8)
  const [gradingSubmissionId, setGradingSubmissionId] = useState<string | null>(null);
  const [critAInput, setCritAInput] = useState<number>(7);
  const [critBInput, setCritBInput] = useState<number>(7);
  const [critCInput, setCritCInput] = useState<number>(7);
  const [critDInput, setCritDInput] = useState<number>(7);
  const [feedbackInput, setFeedbackInput] = useState('');

  // Helper for uploading teacher task attachment file
  const handleTeacherFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setNewFileUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Helper for uploading student submission file
  const handleStudentFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmissionFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSubmissionFileUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Delete task handler (Teacher only)
  const handleDeleteTask = (taskId: string, title: string) => {
    if (!isTeacher) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete assignment "${title}"?\n\nThis will permanently remove the assignment and all student submissions for it.`
    );
    if (confirmDelete) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSubmissions((prev) => prev.filter((s) => s.taskId !== taskId));
    }
  };

  // Sync tab with URL
  const handleTabChange = (tab: StudentTab) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams);
  };

  // Helper to determine category of a task for the current student
  const getTaskCategoryAndSubmission = (task: TaskItem) => {
    const studentSub = submissions.find(
      (sub) => sub.taskId === task.id && sub.studentId === userId
    );

    if (studentSub) {
      return { category: 'submitted' as const, submission: studentSub };
    }

    if (!task.dueDate) {
      return { category: 'upcoming' as const, submission: undefined };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = task.dueDate.split('-').map(Number);
    if (year && month && day) {
      const dueMidnight = new Date(year, month - 1, day);
      if (dueMidnight < today) {
        return { category: 'overdue' as const, submission: undefined };
      }
    }

    return { category: 'upcoming' as const, submission: undefined };
  };

  // Classrooms current user is enrolled in or created
  const userClassrooms = useMemo(
    () => classrooms.filter((cls) => String(cls.createdBy) === userId || cls.members.map(String).includes(userId)),
    [classrooms, userId]
  );

  const userClassroomIds = useMemo(
    () => new Set(userClassrooms.map((cls) => cls.id)),
    [userClassrooms]
  );

  // Active classroom info
  const activeClassroom = useMemo(
    () => userClassrooms.find((cls) => cls.id === selectedClassroomId) ?? null,
    [userClassrooms, selectedClassroomId]
  );

  // Filter tasks by classroom membership, active classroom selection, and search query
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Must belong to a classroom the user is added to / enrolled in
      if (task.classroomId && !userClassroomIds.has(task.classroomId)) {
        return false;
      }
      if (selectedClassroomId && task.classroomId !== selectedClassroomId) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(q);
        const matchesDetails = task.details.toLowerCase().includes(q);
        const matchesClassroom = task.classroomName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDetails && !matchesClassroom) return false;
      }
      return true;
    });
  }, [tasks, selectedClassroomId, searchQuery, userClassroomIds]);

  // Categorized tasks for student view
  const categorizedTasks = useMemo(() => {
    const upcomingList: { task: TaskItem; submission?: TaskSubmission }[] = [];
    const submittedList: { task: TaskItem; submission?: TaskSubmission }[] = [];
    const overdueList: { task: TaskItem; submission?: TaskSubmission }[] = [];

    filteredTasks.forEach((task) => {
      const { category, submission } = getTaskCategoryAndSubmission(task);
      if (category === 'submitted') {
        submittedList.push({ task, submission });
      } else if (category === 'overdue') {
        overdueList.push({ task, submission });
      } else {
        upcomingList.push({ task, submission });
      }
    });

    return {
      upcoming: upcomingList,
      submitted: submittedList,
      overdue: overdueList,
      all: [
        ...upcomingList.map((item) => ({ ...item, status: 'upcoming' as const })),
        ...submittedList.map((item) => ({ ...item, status: 'submitted' as const })),
        ...overdueList.map((item) => ({ ...item, status: 'overdue' as const })),
      ],
    };
  }, [filteredTasks, submissions, userId]);

  // Tasks to display based on active tab
  const displayedStudentTasks = useMemo(() => {
    if (activeTab === 'upcoming') return categorizedTasks.upcoming;
    if (activeTab === 'submitted') return categorizedTasks.submitted;
    if (activeTab === 'overdue') return categorizedTasks.overdue;
    return categorizedTasks.all;
  }, [categorizedTasks, activeTab]);

  // Calculate Due Date Badge Details
  const getDueDateBadge = (dueDateStr?: string, submission?: TaskSubmission) => {
    if (submission) {
      if (submission.status === 'graded') {
        return {
          text: `IB Graded: ${submission.grade || 'Completed'}`,
          className: 'due-badge graded',
          icon: '🏆',
        };
      }
      return {
        text: `Submitted on ${submission.submittedAt.split(' ')[0] || 'time'}`,
        className: 'due-badge submitted',
        icon: '✅',
      };
    }

    if (!dueDateStr) {
      return { text: 'No Due Date', className: 'due-badge upcoming', icon: '📅' };
    }

    const [y, m, d] = dueDateStr.split('-').map(Number);
    if (!y || !m || !d) {
      return { text: `Due ${dueDateStr}`, className: 'due-badge upcoming', icon: '📅' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(y, m - 1, d);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    if (diffDays < 0) {
      const pastDays = Math.abs(diffDays);
      return {
        text: `Overdue by ${pastDays} day${pastDays === 1 ? '' : 's'}`,
        className: 'due-badge overdue',
        icon: '⚠️',
      };
    } else if (diffDays === 0) {
      return {
        text: 'Due Today',
        className: 'due-badge today',
        icon: '🔥',
      };
    } else if (diffDays === 1) {
      return {
        text: 'Due Tomorrow',
        className: 'due-badge upcoming',
        icon: '⏳',
      };
    } else {
      return {
        text: `Due in ${diffDays} days (${dueDateStr})`,
        className: 'due-badge upcoming',
        icon: '📅',
      };
    }
  };

  // Submit Work Handler (Student)
  const openSubmitModal = (task: TaskItem) => {
    const existingSub = submissions.find(
      (sub) => sub.taskId === task.id && sub.studentId === userId
    );
    setSelectedTaskToSubmit(task);
    setSubmissionText(existingSub?.submissionText || '');
    setSubmissionFileUrl(existingSub?.fileUrl || '');
    setSubmissionFileName(existingSub?.fileName || '');
    setSubmitFeedbackMsg('');
  };

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskToSubmit || !submissionText.trim()) return;

    const existingIndex = submissions.findIndex(
      (sub) => sub.taskId === selectedTaskToSubmit.id && sub.studentId === userId
    );

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

    let updatedList: TaskSubmission[];
    if (existingIndex >= 0) {
      updatedList = [...submissions];
      updatedList[existingIndex] = {
        ...updatedList[existingIndex],
        submissionText: submissionText.trim(),
        fileUrl: submissionFileUrl.trim() || undefined,
        fileName: submissionFileName.trim() || undefined,
        submittedAt: nowStr,
      };
    } else {
      const newSub: TaskSubmission = {
        id: `sub-${Date.now()}`,
        taskId: selectedTaskToSubmit.id,
        studentId: userId,
        studentName,
        submissionText: submissionText.trim(),
        fileUrl: submissionFileUrl.trim() || undefined,
        fileName: submissionFileName.trim() || undefined,
        submittedAt: nowStr,
        status: 'submitted',
      };
      updatedList = [newSub, ...submissions];
    }

    setSubmissions(updatedList);
    setSubmitFeedbackMsg('Work submitted successfully! Task moved to Submitted tab.');
    setTimeout(() => {
      setSelectedTaskToSubmit(null);
      handleTabChange('submitted');
    }, 1200);
  };

  // Teacher Create Assignment Handler
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const cls = classrooms.find((c) => c.id === newClassroomId) || activeClassroom;

    const newTask: TaskItem = {
      id: `task-${Date.now()}`,
      title: newTitle.trim(),
      dueDate: newDueDate,
      details: newDetails.trim(),
      classroomId: cls?.id || selectedClassroomId || undefined,
      classroomName: cls?.name || activeClassroom?.name || undefined,
      fileUrl: newFileUrl.trim() || undefined,
      fileName: newFileName.trim() || undefined,
      createdAt: new Date().toISOString().substring(0, 10),
    };

    setTasks((prev) => [newTask, ...prev]);
    setNewTitle('');
    setNewDueDate('');
    setNewDetails('');
    setNewFileUrl('');
    setNewFileName('');
    setCreateFormOpen(false);
  };

  // Teacher IB Criteria Grade Handler (Criteria A, B, C, D out of 8)
  const handleSaveGrade = (submissionId: string) => {
    const scoreResult = calculateIBScore(critAInput, critBInput, critCInput, critDInput);

    setSubmissions((prev) =>
      prev.map((sub) => {
        if (sub.id === submissionId) {
          return {
            ...sub,
            status: 'graded',
            critA: scoreResult.validA,
            critB: scoreResult.validB,
            critC: scoreResult.validC,
            critD: scoreResult.validD,
            grade: scoreResult.summary,
            feedback: feedbackInput.trim(),
          };
        }
        return sub;
      })
    );
    setGradingSubmissionId(null);
  };

  return (
    <section className="page-section tasks-page">
      <div className="tasks-container">
        {/* Header Bar */}
        <div className="tasks-header-bar">
          <div className="tasks-title-group">
            <h2>{isTeacher ? 'Teacher Task Management' : 'IB MYP Assignments'}</h2>
            <p>
              {isTeacher
                ? 'Create assignments, track student submissions, and assess against IB Criteria (A, B, C, D out of 8).'
                : activeClassroom
                ? `Showing IB tasks and submissions for ${activeClassroom.name}.`
                : 'Track upcoming assignments, submit completed work, and review IB Criteria grades (Out of 8).'}
            </p>
          </div>

          <div className="tasks-header-actions">
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
              {isTeacher ? '👨‍🏫 Teacher Account (IB Grading)' : '🎓 Student Account (IB MYP)'}
            </div>

            {isTeacher && (
              <button
                className="primary-button"
                type="button"
                onClick={() => setCreateFormOpen((v) => !v)}
              >
                {createFormOpen ? 'Cancel' : '+ Create Assignment'}
              </button>
            )}
          </div>
        </div>

        {/* Teacher Task Creation Form */}
        {isTeacher && createFormOpen && (
          <form className="entity-form" onSubmit={handleCreateTask}>
            <h3>Create New IB Assignment</h3>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Assignment title (e.g. Criterion B & C Design Project)"
              required
            />
            <div className="form-row" style={{ display: 'flex', gap: '12px' }}>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                style={{ flex: 1 }}
              />
              <select
                value={newClassroomId}
                onChange={(e) => setNewClassroomId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '14px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}
              >
                <option value="">Select Classroom (Optional)</option>
                {userClassrooms.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={newDetails}
              onChange={(e) => setNewDetails(e.target.value)}
              placeholder="Describe requirements, instructions, and IB criteria rubrics (A, B, C, D)..."
            />

            {/* File Attachment Input for Teachers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--surface-2)', padding: '12px 14px', borderRadius: '14px', border: '1px solid var(--border)' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text)' }}>
                📎 Attach File / Resource to Assignment <span style={{ color: 'var(--muted)', fontWeight: 'normal' }}>(optional)</span>
              </label>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="file"
                  onChange={handleTeacherFileUpload}
                  style={{ fontSize: '0.85rem' }}
                />
                <input
                  type="url"
                  placeholder="Or paste external URL (e.g. Drive, GitHub, PDF link)..."
                  value={newFileUrl}
                  onChange={(e) => {
                    setNewFileUrl(e.target.value);
                    if (!newFileName) setNewFileName('External Resource Link');
                  }}
                  style={{ flex: 1, minWidth: '200px', fontSize: '0.85rem' }}
                />
              </div>
              {newFileName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#1d4ed8', background: '#eff6ff', padding: '6px 12px', borderRadius: '8px', width: 'fit-content' }}>
                  <span>📎 Attached: {newFileName}</span>
                  <button
                    type="button"
                    onClick={() => { setNewFileUrl(''); setNewFileName(''); }}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', padding: 0 }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <button className="primary-button" type="submit">
              Post Assignment
            </button>
          </form>
        )}

        {/* Summary Metric Cards for Student View */}
        {!isTeacher && (
          <div className="tasks-stats-grid">
            <div
              className={`stat-box ${activeTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => handleTabChange('upcoming')}
            >
              <div className="stat-icon-wrapper upcoming">🕒</div>
              <div className="stat-info">
                <span className="stat-value">{categorizedTasks.upcoming.length}</span>
                <span className="stat-label">Upcoming Tasks</span>
              </div>
            </div>

            <div
              className={`stat-box ${activeTab === 'submitted' ? 'active' : ''}`}
              onClick={() => handleTabChange('submitted')}
            >
              <div className="stat-icon-wrapper submitted">✅</div>
              <div className="stat-info">
                <span className="stat-value">{categorizedTasks.submitted.length}</span>
                <span className="stat-label">Submitted Tasks</span>
              </div>
            </div>

            <div
              className={`stat-box ${activeTab === 'overdue' ? 'active' : ''}`}
              onClick={() => handleTabChange('overdue')}
            >
              <div className="stat-icon-wrapper overdue">⚠️</div>
              <div className="stat-info">
                <span className="stat-value">{categorizedTasks.overdue.length}</span>
                <span className="stat-label">Overdue Tasks</span>
              </div>
            </div>

            <div
              className={`stat-box ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => handleTabChange('all')}
            >
              <div className="stat-icon-wrapper all">🏆</div>
              <div className="stat-info">
                <span className="stat-value">{categorizedTasks.all.length}</span>
                <span className="stat-label">Total IB Tasks</span>
              </div>
            </div>
          </div>
        )}

        {/* Student View Navigation Tabs */}
        {!isTeacher && (
          <div className="student-tabs-nav">
            <button
              className={`tab-button upcoming ${activeTab === 'upcoming' ? 'active' : ''}`}
              type="button"
              onClick={() => handleTabChange('upcoming')}
            >
              <span>🕒 Upcoming</span>
              <span className="tab-badge">{categorizedTasks.upcoming.length}</span>
            </button>

            <button
              className={`tab-button submitted ${activeTab === 'submitted' ? 'active' : ''}`}
              type="button"
              onClick={() => handleTabChange('submitted')}
            >
              <span>✅ Submitted</span>
              <span className="tab-badge">{categorizedTasks.submitted.length}</span>
            </button>

            <button
              className={`tab-button overdue ${activeTab === 'overdue' ? 'active' : ''}`}
              type="button"
              onClick={() => handleTabChange('overdue')}
            >
              <span>⚠️ Overdue</span>
              <span className="tab-badge">{categorizedTasks.overdue.length}</span>
            </button>

            <button
              className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
              type="button"
              onClick={() => handleTabChange('all')}
            >
              <span>📋 All Tasks</span>
              <span className="tab-badge">{categorizedTasks.all.length}</span>
            </button>
          </div>
        )}

        {/* Controls Bar: Search & Classroom Filter */}
        <div className="task-controls-bar">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="🔍 Search tasks by title, details, or classroom..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="classroom-select-wrapper">
            <select
              value={selectedClassroomId}
              onChange={(event) => {
                const nextClassroomId = event.target.value;
                const nextParams = new URLSearchParams(searchParams);
                if (nextClassroomId) {
                  nextParams.set('classroom', nextClassroomId);
                } else {
                  nextParams.delete('classroom');
                }
                setSearchParams(nextParams);
              }}
            >
              <option value="">All My Classrooms</option>
              {userClassrooms.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* STUDENT VIEW TASK LIST */}
        {!isTeacher && (
          <>
            {displayedStudentTasks.length > 0 ? (
              <div className="tasks-cards-grid">
                {displayedStudentTasks.map(({ task, submission }) => {
                  const categoryInfo = getTaskCategoryAndSubmission(task);
                  const badge = getDueDateBadge(task.dueDate, submission);
                  const isOverdue = categoryInfo.category === 'overdue';
                  const isSubmitted = categoryInfo.category === 'submitted';

                  return (
                    <div
                      key={task.id}
                      className={`student-task-card status-${categoryInfo.category}`}
                    >
                      <div className="task-card-top">
                        <div className="task-meta-row">
                          <span className="classroom-tag">
                            🏫 {task.classroomName || 'General Assignment'}
                          </span>
                          <span className={badge.className}>
                            {badge.icon} {badge.text}
                          </span>
                        </div>

                        <h3 className="task-card-title">{task.title}</h3>
                        <p className="task-card-details">{task.details}</p>

                        {/* Task Attachment Resource provided by Teacher */}
                        {task.fileUrl && (
                          <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                            <a
                              href={task.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={task.fileName || 'assignment-resource'}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '10px',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                fontSize: '0.84rem',
                                fontWeight: '600',
                                textDecoration: 'none',
                              }}
                            >
                              📎 Assignment File: {task.fileName || 'View Resource'}
                            </a>
                          </div>
                        )}

                        {/* If submitted, render submission details preview inside card */}
                        {isSubmitted && submission && (
                          <div className="card-submission-info">
                            <div className="submission-meta-line">
                              <span>Submitted {submission.submittedAt}</span>
                              {submission.status === 'graded' && (
                                <span className="grade-badge-chip">
                                  🏆 IB Grade
                                </span>
                              )}
                            </div>
                            <p className="submission-text-preview">"{submission.submissionText}"</p>
                            {submission.fileUrl && (
                              <div style={{ marginTop: '6px' }}>
                                <a
                                  href={submission.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={submission.fileName || 'my-submission'}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '3px 10px',
                                    borderRadius: '8px',
                                    background: '#dcfce7',
                                    color: '#166534',
                                    border: '1px solid #86efac',
                                    fontSize: '0.78rem',
                                    fontWeight: '600',
                                    textDecoration: 'none',
                                  }}
                                >
                                  📎 Attached Work: {submission.fileName || 'View Attachment'}
                                </a>
                              </div>
                            )}

                            {/* IB Criteria breakdown display */}
                            {submission.status === 'graded' && (
                              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center' }}>
                                  <div style={{ background: '#eff6ff', padding: '4px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', color: '#1e40af' }}>
                                    Crit A<br />{submission.critA ?? 7}/8
                                  </div>
                                  <div style={{ background: '#fef3c7', padding: '4px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', color: '#92400e' }}>
                                    Crit B<br />{submission.critB ?? 8}/8
                                  </div>
                                  <div style={{ background: '#dcfce7', padding: '4px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', color: '#166534' }}>
                                    Crit C<br />{submission.critC ?? 7}/8
                                  </div>
                                  <div style={{ background: '#f3e8ff', padding: '4px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', color: '#6b21a8' }}>
                                    Crit D<br />{submission.critD ?? 7}/8
                                  </div>
                                </div>
                              </div>
                            )}

                            {submission.feedback && (
                              <div className="teacher-feedback-note">
                                💬 <strong>Feedback:</strong> {submission.feedback}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="task-card-actions">
                        {!isSubmitted ? (
                          <button
                            className={`submit-btn-primary ${isOverdue ? 'late-submit' : ''}`}
                            type="button"
                            onClick={() => openSubmitModal(task)}
                          >
                            {isOverdue ? '⚠️ Submit Late Work' : '📤 Submit Work'}
                          </button>
                        ) : (
                          <button
                            className="view-sub-btn"
                            type="button"
                            onClick={() => openSubmitModal(task)}
                          >
                            ✏️ View or Edit Submission
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="tasks-empty-state">
                <div className="empty-icon">
                  {activeTab === 'upcoming'
                    ? '🎉'
                    : activeTab === 'submitted'
                    ? '📥'
                    : activeTab === 'overdue'
                    ? '✨'
                    : '📋'}
                </div>
                <h3>
                  {activeTab === 'upcoming'
                    ? 'No Upcoming Assignments!'
                    : activeTab === 'submitted'
                    ? 'No Submissions Yet'
                    : activeTab === 'overdue'
                    ? 'No Overdue Assignments!'
                    : 'No Assignments Found'}
                </h3>
                <p>
                  {activeTab === 'upcoming'
                    ? 'You are all caught up on your pending IB classroom tasks.'
                    : activeTab === 'submitted'
                    ? 'When you submit solutions for assignments, they will appear here.'
                    : activeTab === 'overdue'
                    ? 'Great job keeping up with all your IB deadlines!'
                    : 'Try adjusting your filters or classroom selection.'}
                </p>
              </div>
            )}
          </>
        )}

        {/* TEACHER VIEW ASSIGNMENT & SUBMISSIONS LIST WITH IB CRITERIA (0-8) */}
        {isTeacher && (
          <div className="entity-list">
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => {
                const taskSubmissions = submissions.filter((s) => s.taskId === task.id);
                return (
                  <div key={task.id} className="entity-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: '240px' }}>
                        <h3 style={{ margin: '0 0 6px 0' }}>{task.title}</h3>
                        <p style={{ margin: '0 0 8px 0', color: 'var(--text)' }}>{task.details}</p>

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                            📅 Due Date: {task.dueDate || 'None'} | 🏫 {task.classroomName || 'General'}
                          </span>

                          {task.fileUrl && (
                            <a
                              href={task.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={task.fileName || 'assignment-file'}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                textDecoration: 'none',
                              }}
                            >
                              📎 {task.fileName || 'Attached File'}
                            </a>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="tab-badge" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                          {taskSubmissions.length} Submission(s)
                        </span>

                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id, task.title)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '12px',
                            border: '1px solid #fecdd3',
                            background: '#fff1f2',
                            color: '#dc2626',
                            fontSize: '0.82rem',
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
                          🗑️ Delete Assignment
                        </button>
                      </div>
                    </div>

                    {/* Submissions list for teacher to grade */}
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                        Student Submissions:
                      </strong>
                      {taskSubmissions.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                          {taskSubmissions.map((sub) => (
                            <div
                              key={sub.id}
                              style={{
                                background: 'var(--surface)',
                                padding: '14px',
                                borderRadius: '14px',
                                border: '1px solid var(--border)',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <strong>{sub.studentName}</strong>
                                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                                  {sub.submittedAt}
                                </span>
                              </div>
                              <p style={{ margin: '6px 0', fontSize: '0.9rem' }}>"{sub.submissionText}"</p>
                              {sub.fileUrl && (
                                <div style={{ marginTop: '6px' }}>
                                  <a
                                    href={sub.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={sub.fileName || 'student-submission'}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: '4px 10px',
                                      borderRadius: '8px',
                                      background: '#f0fdf4',
                                      color: '#166534',
                                      border: '1px solid #bbf7d0',
                                      fontSize: '0.82rem',
                                      fontWeight: '600',
                                      textDecoration: 'none',
                                    }}
                                  >
                                    📎 {sub.fileName || 'Submission Attachment / Link'}
                                  </a>
                                </div>
                              )}

                              {/* IB 4-Criteria Grading Form (Out of 8 per Criterion) */}
                              {gradingSubmissionId === sub.id ? (
                                <div style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: '14px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text)' }}>
                                    🏆 Grade IB Criteria (0 to 8 Score Scale)
                                  </h4>

                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                                    <div>
                                      <label style={{ fontSize: '0.78rem', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                                        Crit A (Knowing) /8
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={8}
                                        value={critAInput}
                                        onChange={(e) => setCritAInput(Math.min(8, Math.max(0, parseInt(e.target.value) || 0)))}
                                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: '0.78rem', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                                        Crit B (Investigating) /8
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={8}
                                        value={critBInput}
                                        onChange={(e) => setCritBInput(Math.min(8, Math.max(0, parseInt(e.target.value) || 0)))}
                                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: '0.78rem', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                                        Crit C (Communicating) /8
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={8}
                                        value={critCInput}
                                        onChange={(e) => setCritCInput(Math.min(8, Math.max(0, parseInt(e.target.value) || 0)))}
                                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: '0.78rem', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                                        Crit D (Thinking) /8
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={8}
                                        value={critDInput}
                                        onChange={(e) => setCritDInput(Math.min(8, Math.max(0, parseInt(e.target.value) || 0)))}
                                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                      />
                                    </div>
                                  </div>

                                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                                    Total IB Points: {critAInput + critBInput + critCInput + critDInput} / 32
                                  </div>

                                  <input
                                    type="text"
                                    placeholder="Teacher IB Feedback..."
                                    value={feedbackInput}
                                    onChange={(e) => setFeedbackInput(e.target.value)}
                                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                  />

                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button
                                      className="secondary-button"
                                      type="button"
                                      onClick={() => setGradingSubmissionId(null)}
                                      style={{ width: 'auto', padding: '6px 14px' }}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      className="primary-button"
                                      type="button"
                                      onClick={() => handleSaveGrade(sub.id)}
                                      style={{ width: 'auto', padding: '6px 20px' }}
                                    >
                                      Save IB Grade
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                  {sub.status === 'graded' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <span style={{ color: '#16a34a', fontWeight: '700', fontSize: '0.88rem' }}>
                                        🏆 {sub.grade}
                                      </span>
                                      {sub.feedback && (
                                        <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                                          💬 "{sub.feedback}"
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span style={{ color: '#0284c7', fontSize: '0.85rem' }}>⏳ Needs IB Grading</span>
                                  )}
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    onClick={() => {
                                      setGradingSubmissionId(sub.id);
                                      setCritAInput(sub.critA ?? 7);
                                      setCritBInput(sub.critB ?? 7);
                                      setCritCInput(sub.critC ?? 7);
                                      setCritDInput(sub.critD ?? 7);
                                      setFeedbackInput(sub.feedback || '');
                                    }}
                                    style={{ padding: '6px 14px', fontSize: '0.82rem', width: 'auto' }}
                                  >
                                    {sub.status === 'graded' ? 'Edit IB Criteria Grade' : 'Grade IB Criteria (out of 8)'}
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '6px 0 0 0' }}>
                          No submissions received for this task yet.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="placeholder-card">
                <p>No tasks created yet. Click "+ Create Assignment" above to post work.</p>
              </div>
            )}
          </div>
        )}

        {/* STUDENT SUBMISSION MODAL */}
        {selectedTaskToSubmit && (
          <div className="task-modal-overlay" onClick={() => setSelectedTaskToSubmit(null)}>
            <div className="task-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-custom">
                <h3>Submit IB Assignment</h3>
                <button
                  className="modal-close-btn"
                  type="button"
                  onClick={() => setSelectedTaskToSubmit(null)}
                >
                  ✕
                </button>
              </div>

              <form className="modal-body-custom" onSubmit={handleStudentSubmit}>
                <div className="modal-task-summary">
                  <h4>{selectedTaskToSubmit.title}</h4>
                  <p>{selectedTaskToSubmit.details}</p>
                </div>

                <div className="modal-form-group">
                  <label htmlFor="student-submission-text">
                    Your Response / Solution <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <textarea
                    id="student-submission-text"
                    rows={5}
                    placeholder="Type or paste your completed assignment solution here..."
                    value={submissionText}
                    onChange={(e) => setSubmissionText(e.target.value)}
                    required
                  />
                </div>

                <div className="modal-form-group">
                  <label htmlFor="student-submission-file">
                    Attach Submission File or Link <span style={{ fontWeight: 'normal', color: 'var(--muted)' }}>(optional)</span>
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="file"
                        onChange={handleStudentFileUpload}
                        style={{ fontSize: '0.85rem' }}
                      />
                      <input
                        id="student-submission-file"
                        type="url"
                        placeholder="Or paste external URL (e.g. GitHub, Drive)..."
                        value={submissionFileUrl}
                        onChange={(e) => {
                          setSubmissionFileUrl(e.target.value);
                          if (!submissionFileName) setSubmissionFileName('Submission External Link');
                        }}
                        style={{ flex: 1, minWidth: '200px' }}
                      />
                    </div>
                    {submissionFileName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#15803d', background: '#dcfce7', padding: '6px 12px', borderRadius: '8px', width: 'fit-content' }}>
                        <span>📎 Attached: {submissionFileName}</span>
                        <button
                          type="button"
                          onClick={() => { setSubmissionFileUrl(''); setSubmissionFileName(''); }}
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', padding: 0 }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {submitFeedbackMsg && (
                  <div
                    style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                    }}
                  >
                    {submitFeedbackMsg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSelectedTaskToSubmit(null)}
                    style={{ width: 'auto', padding: '10px 20px' }}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    style={{ width: 'auto', padding: '10px 24px' }}
                  >
                    Submit Assignment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
