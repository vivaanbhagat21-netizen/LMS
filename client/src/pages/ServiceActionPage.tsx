import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLocalStorageState } from '../utils/useLocalStorageState';
import './ServiceActionPage.css';

export interface Classroom {
  id: string;
  name: string;
  code: string;
  createdBy: string;
  creatorName: string;
  members: string[];
  createdAt: string;
}

export interface SAItem {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  details: string;
  classroomId?: string;
  classroomName?: string;
  createdAt: string;
  createdBy: string; // ID of the user who created this
}

export interface SASubmission {
  id: string;
  saId: string;
  studentId: string;
  studentName: string;
  reflectionText: string;
  hoursSpent: number;
  fileUrl?: string;
  submittedAt: string;
  status: 'completed' | 'verified';
  feedback?: string;
}

const INITIAL_SA_ITEMS: SAItem[] = [
  {
    id: 'sa-101',
    title: 'Community Garden Volunteering',
    dueDate: '2026-08-15',
    details: 'Help maintain the local community garden. Activities include planting, weeding, and composting.',
    classroomId: 'class-1',
    classroomName: 'AP Computer Science',
    createdAt: '2026-08-01',
    createdBy: 'teacher-1',
  },
  {
    id: 'sa-102',
    title: 'Code for Good: Local NGO Website',
    dueDate: '2026-08-20',
    details: 'Assist a local non-profit in updating their website content and improving accessibility.',
    classroomId: 'class-2',
    classroomName: 'Web Development Bootcamp',
    createdAt: '2026-08-02',
    createdBy: 'teacher-1',
  },
];

const INITIAL_SA_SUBMISSIONS: SASubmission[] = [
  {
    id: 'sasub-201',
    saId: 'sa-101',
    studentId: 'preview-student',
    studentName: 'Student Preview',
    reflectionText: 'Spent 4 hours at the garden. Learned about sustainable irrigation systems.',
    hoursSpent: 4,
    submittedAt: '2026-08-03 16:00',
    status: 'verified',
    feedback: 'Great work! Your reflection shows deep engagement with sustainability.',
  },
];

type SATab = 'sa' | 'completed';

export function ServiceActionPage() {
  const { user } = useAuth();
  const userId = String(user?.id ?? 'preview-student');
  const studentName = user?.name ?? 'Student Preview';

  const isTeacher = user?.role === 'teacher';

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClassroomId = searchParams.get('classroom') ?? '';
  const initialTabParam = (searchParams.get('tab') as SATab) || 'sa';

  const [saItems, setSAItems] = useLocalStorageState<SAItem[]>('edugen_sa_items', INITIAL_SA_ITEMS);
  const [submissions, setSubmissions] = useLocalStorageState<SASubmission[]>(
    'edugen_sa_submissions',
    INITIAL_SA_SUBMISSIONS
  );
  const [classrooms] = useLocalStorageState<Classroom[]>('edugen_classrooms', []);

  // UI state
  const [activeTab, setActiveTab] = useState<SATab>(initialTabParam);
  const [searchQuery, setSearchQuery] = useState('');

  // Submit Modal state
  const [selectedSAToSubmit, setSelectedSAToSubmit] = useState<SAItem | null>(null);
  const [reflectionText, setReflectionText] = useState('');
  const [hoursSpent, setHoursSpent] = useState<number>(0);
  const [submissionFileUrl, setSubmissionFileUrl] = useState('');
  const [submitFeedbackMsg, setSubmitFeedbackMsg] = useState('');

  // Teacher Create SA state
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newClassroomId, setNewClassroomId] = useState('');

  // Teacher Verification state
  const [verifyingSubmissionId, setVerifyingSubmissionId] = useState<string | null>(null);
  const [feedbackInput, setFeedbackInput] = useState('');

  // Sync tab with URL
  const handleTabChange = (tab: SATab) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams);
  };

  const getSACategoryAndSubmission = (item: SAItem) => {
    const studentSub = submissions.find(
      (sub) => sub.saId === item.id && sub.studentId === userId
    );

    if (studentSub) {
      return { category: 'completed' as const, submission: studentSub };
    }

    return { category: 'sa' as const, submission: undefined };
  };

  const activeClassroom = useMemo(
    () => classrooms.find((cls) => cls.id === selectedClassroomId) ?? null,
    [classrooms, selectedClassroomId]
  );

  const filteredItems = useMemo(() => {
    return saItems.filter((item) => {
      if (selectedClassroomId && item.classroomId !== selectedClassroomId) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDetails = item.details.toLowerCase().includes(q);
        const matchesClassroom = item.classroomName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDetails && !matchesClassroom) return false;
      }
      return true;
    });
  }, [saItems, selectedClassroomId, searchQuery]);

  const categorizedItems = useMemo(() => {
    const saList: { item: SAItem; submission?: SASubmission }[] = [];
    const completedList: { item: SAItem; submission?: SASubmission }[] = [];

    filteredItems.forEach((item) => {
      const { category, submission } = getSACategoryAndSubmission(item);
      if (category === 'completed') {
        completedList.push({ item, submission });
      } else {
        saList.push({ item, submission });
      }
    });

    return {
      sa: saList,
      completed: completedList,
    };
  }, [filteredItems, submissions, userId]);

  const displayedItems = useMemo(() => {
    if (activeTab === 'sa') return categorizedItems.sa;
    return categorizedItems.completed;
  }, [categorizedItems, activeTab]);

  const openSubmitModal = (item: SAItem) => {
    const existingSub = submissions.find(
      (sub) => sub.saId === item.id && sub.studentId === userId
    );
    setSelectedSAToSubmit(item);
    setReflectionText(existingSub?.reflectionText || '');
    setHoursSpent(existingSub?.hoursSpent || 0);
    setSubmissionFileUrl(existingSub?.fileUrl || '');
    setSubmitFeedbackMsg('');
  };

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSAToSubmit || !reflectionText.trim()) return;

    const existingIndex = submissions.findIndex(
      (sub) => sub.saId === selectedSAToSubmit.id && sub.studentId === userId
    );

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

    let updatedList: SASubmission[];
    if (existingIndex >= 0) {
      updatedList = [...submissions];
      updatedList[existingIndex] = {
        ...updatedList[existingIndex],
        reflectionText: reflectionText.trim(),
        hoursSpent,
        fileUrl: submissionFileUrl.trim() || undefined,
        submittedAt: nowStr,
      };
    } else {
      const newSub: SASubmission = {
        id: `sasub-${Date.now()}`,
        saId: selectedSAToSubmit.id,
        studentId: userId,
        studentName,
        reflectionText: reflectionText.trim(),
        hoursSpent,
        fileUrl: submissionFileUrl.trim() || undefined,
        submittedAt: nowStr,
        status: 'completed',
      };
      updatedList = [newSub, ...submissions];
    }

    setSubmissions(updatedList);
    setSubmitFeedbackMsg('Service reflection submitted successfully!');
    setTimeout(() => {
      setSelectedSAToSubmit(null);
      handleTabChange('completed');
    }, 1200);
  };

  const handleCreateSA = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const cls = classrooms.find((c) => c.id === newClassroomId) || activeClassroom;

    const newItem: SAItem = {
      id: `sa-${Date.now()}`,
      title: newTitle.trim(),
      dueDate: newDueDate,
      details: newDetails.trim(),
      classroomId: cls?.id || selectedClassroomId || undefined,
      classroomName: cls?.name || activeClassroom?.name || undefined,
      createdAt: new Date().toISOString().substring(0, 10),
      createdBy: userId,
    };

    setSAItems((prev) => [newItem, ...prev]);
    setNewTitle('');
    setNewDueDate('');
    setNewDetails('');
    setCreateFormOpen(false);
  };

  const handleVerifySA = (submissionId: string) => {
    setSubmissions((prev) =>
      prev.map((sub) => {
        if (sub.id === submissionId) {
          return {
            ...sub,
            status: 'verified',
            feedback: feedbackInput.trim(),
          };
        }
        return sub;
      })
    );
    setVerifyingSubmissionId(null);
  };

  return (
    <section className="page-section sa-page">
      <div className="sa-container">
        <div className="sa-header-bar">
          <div className="sa-title-group">
            <h2>{isTeacher ? 'Service as Action Management' : 'Service as Action (SA)'}</h2>
            <p>
              {isTeacher
                ? 'Manage service activities and verify student reflections.'
                : 'Track your service activities and submit reflections.'}
            </p>
          </div>

          <div className="sa-header-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => setCreateFormOpen((v) => !v)}
            >
              {createFormOpen ? 'Cancel' : isTeacher ? '+ Create Service Activity' : '+ Propose Own Activity'}
            </button>
          </div>
        </div>

        {createFormOpen && (
          <form className="entity-form" onSubmit={handleCreateSA}>
            <h3>{isTeacher ? 'Create New Service Activity' : 'Propose Self-Initiated SA'}</h3>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Activity title (e.g. Beach Cleanup)"
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
                {classrooms.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={newDetails}
              onChange={(e) => setNewDetails(e.target.value)}
              placeholder={isTeacher 
                ? "Describe the service activity and expected learning outcomes..." 
                : "Describe your proposed activity, who it helps, and how it aligns with IB SA goals..."}
            />
            <button className="primary-button" type="submit">
              {isTeacher ? 'Post Service Activity' : 'Create & Log Activity'}
            </button>
          </form>
        )}

        {!isTeacher && (
          <div className="sa-tabs-nav">
            <button
              className={`tab-button sa ${activeTab === 'sa' ? 'active' : ''}`}
              type="button"
              onClick={() => handleTabChange('sa')}
            >
              <span>🌱 SA (Service as Action)</span>
              <span className="tab-badge">{categorizedItems.sa.length}</span>
            </button>

            <button
              className={`tab-button completed ${activeTab === 'completed' ? 'active' : ''}`}
              type="button"
              onClick={() => handleTabChange('completed')}
            >
              <span>✅ Completed</span>
              <span className="tab-badge">{categorizedItems.completed.length}</span>
            </button>
          </div>
        )}

        <div className="sa-controls-bar">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="🔍 Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {!isTeacher && (
          <div className="sa-cards-grid">
            {displayedItems.length > 0 ? (
              displayedItems.map(({ item, submission }) => (
                <div key={item.id} className={`sa-card status-${activeTab}`}>
                  <div className="sa-card-top">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="classroom-tag">🏫 {item.classroomName || 'General'}</span>
                      {item.createdBy === userId && !isTeacher && (
                        <span className="classroom-tag" style={{ background: '#fef3c7', color: '#92400e' }}>
                          Self-Initiated
                        </span>
                      )}
                    </div>
                    <h3 className="sa-card-title">{item.title}</h3>
                    <p className="sa-card-details">{item.details}</p>
                    
                    {submission && (
                      <div className="sa-submission-preview">
                        <div className="submission-meta">
                          <span>Hours: {submission.hoursSpent}</span>
                          <span className={`status-badge ${submission.status}`}>
                            {submission.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="reflection-text">"{submission.reflectionText}"</p>
                        {submission.feedback && (
                          <div className="teacher-feedback">
                            <strong>Feedback:</strong> {submission.feedback}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="sa-card-actions">
                    {activeTab === 'sa' ? (
                      <button className="primary-button" onClick={() => openSubmitModal(item)}>
                        Log Service Reflection
                      </button>
                    ) : (
                      <button className="secondary-button" onClick={() => openSubmitModal(item)}>
                        Edit Reflection
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No activities found in this category.</p>
              </div>
            )}
          </div>
        )}

        {isTeacher && (
          <div className="sa-teacher-list">
            {filteredItems.map((item) => {
              const itemSubmissions = submissions.filter((s) => s.saId === item.id);
              return (
                <div key={item.id} className="sa-teacher-card">
                  <div className="sa-teacher-card-header">
                    <h3>{item.title}</h3>
                    <span className="submission-count">{itemSubmissions.length} Submissions</span>
                  </div>
                  
                  <div className="sa-teacher-submissions">
                    {itemSubmissions.map((sub) => (
                      <div key={sub.id} className="submission-row">
                        <div className="sub-header">
                          <strong>{sub.studentName}</strong>
                          <span>{sub.hoursSpent} hours</span>
                        </div>
                        <p>{sub.reflectionText}</p>
                        
                        {verifyingSubmissionId === sub.id ? (
                          <div className="verification-form">
                            <input
                              value={feedbackInput}
                              onChange={(e) => setFeedbackInput(e.target.value)}
                              placeholder="Add feedback..."
                            />
                            <div className="actions">
                              <button onClick={() => setVerifyingSubmissionId(null)}>Cancel</button>
                              <button className="verify-btn" onClick={() => handleVerifySA(sub.id)}>
                                Verify Service
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="sub-footer">
                            {sub.status === 'verified' ? (
                              <span className="verified-tag">✅ Verified</span>
                            ) : (
                              <button onClick={() => {
                                setVerifyingSubmissionId(sub.id);
                                setFeedbackInput(sub.feedback || '');
                              }}>
                                Verify Reflection
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedSAToSubmit && (
          <div className="modal-overlay" onClick={() => setSelectedSAToSubmit(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3>Service Reflection: {selectedSAToSubmit.title}</h3>
              <form onSubmit={handleStudentSubmit}>
                <div className="form-group">
                  <label>Hours Spent</label>
                  <input
                    type="number"
                    value={hoursSpent}
                    onChange={(e) => setHoursSpent(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Your Reflection</label>
                  <textarea
                    value={reflectionText}
                    onChange={(e) => setReflectionText(e.target.value)}
                    placeholder="What did you learn? How did you help?"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Link (optional)</label>
                  <input
                    type="url"
                    value={submissionFileUrl}
                    onChange={(e) => setSubmissionFileUrl(e.target.value)}
                    placeholder="Link to photos or documents"
                  />
                </div>
                {submitFeedbackMsg && <p className="success-msg">{submitFeedbackMsg}</p>}
                <div className="modal-actions">
                  <button type="button" onClick={() => setSelectedSAToSubmit(null)}>Cancel</button>
                  <button type="submit" className="primary-button">Submit Reflection</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
