import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLocalStorageState } from '../utils/useLocalStorageState';

export interface Classroom {
  id: string | number;
  name: string;
  code: string;
  createdBy: string;
  creatorName: string;
  members: string[];
  createdAt: string;
}

export interface MaterialItem {
  id: string | number;
  title: string;
  link?: string;
  fileUrl?: string;
  fileName?: string;
  notes: string;
  classroomId?: string | number;
  classroomName?: string;
  createdAt?: string;
}

const INITIAL_MATERIALS: MaterialItem[] = [
  {
    id: 'mat-101',
    title: 'React Hooks Architecture Cheat Sheet',
    link: 'https://react.dev/reference/react',
    notes: 'Comprehensive guide covering useState, useEffect, useMemo, useCallback, and custom hook design patterns.',
    classroomId: 'class-1',
    classroomName: 'AP Computer Science',
    createdAt: '2026-08-01',
  },
  {
    id: 'mat-102',
    title: 'SQL Database Indexing & Join Performance Guide',
    link: 'https://www.w3schools.com/sql/sql_join.asp',
    notes: 'Visual breakdown of INNER JOIN, LEFT JOIN, RIGHT JOIN, and database indexing strategies.',
    classroomId: 'class-1',
    classroomName: 'AP Computer Science',
    createdAt: '2026-08-02',
  },
  {
    id: 'mat-103',
    title: 'CSS Grid & Flexbox Layout Handbook',
    link: 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/',
    notes: 'Interactive reference for responsive UI design, flex properties, CSS grid templates, and fluid typography.',
    classroomId: 'class-2',
    classroomName: 'Web Development Bootcamp',
    createdAt: '2026-08-03',
  },
];

type MaterialTab = 'all' | 'documents' | 'links';

export function TutorialsPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const userId = String(user?.id ?? 'preview-student');

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClassroomId = searchParams.get('classroom') ?? '';

  const [localMaterials, setLocalMaterials] = useLocalStorageState<MaterialItem[]>(
    'edugen_materials',
    INITIAL_MATERIALS
  );
  const [apiMaterials, setApiMaterials] = useState<MaterialItem[]>([]);
  const [classrooms] = useLocalStorageState<Classroom[]>('edugen_classrooms', []);

  // UI state
  const [activeTab, setActiveTab] = useState<MaterialTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form input state (Teacher creation only)
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [targetClassroomId, setTargetClassroomId] = useState('');

  // Fetch materials from API if target classroom selected
  const fetchClassroomMaterials = async () => {
    if (!selectedClassroomId) return;
    try {
      const res = await fetch(`/api/classrooms/${selectedClassroomId}/materials`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const formatted: MaterialItem[] = data.map((m: any) => ({
            id: m.id,
            title: m.title,
            link: m.youtube_url || m.link || '',
            fileUrl: m.file_url || undefined,
            fileName: m.file_url ? m.file_url.split('/').pop() : undefined,
            notes: m.description || m.notes || '',
            classroomId: m.classroom_id,
            createdAt: m.created_at ? new Date(m.created_at).toLocaleDateString() : '',
          }));
          setApiMaterials(formatted);
        }
      }
    } catch (e) {
      console.warn('Could not fetch API materials');
    }
  };

  useEffect(() => {
    fetchClassroomMaterials();
  }, [selectedClassroomId]);

  const materials = useMemo(() => {
    if (apiMaterials.length > 0) {
      return [...apiMaterials, ...localMaterials];
    }
    return localMaterials;
  }, [apiMaterials, localMaterials]);

  // Classrooms current user is enrolled in or created
  const userClassrooms = useMemo(
    () => classrooms.filter((cls) => String(cls.createdBy) === userId || cls.members.map(String).includes(userId)),
    [classrooms, userId]
  );

  const userClassroomIds = useMemo(
    () => new Set(userClassrooms.map((cls) => String(cls.id))),
    [userClassrooms]
  );

  const activeClassroom = useMemo(
    () => userClassrooms.find((cls) => String(cls.id) === selectedClassroomId) ?? null,
    [userClassrooms, selectedClassroomId]
  );

  // Filter materials based on classroom membership, selection, tab, and search query
  const filteredMaterials = useMemo(() => {
    return materials.filter((item) => {
      if (item.classroomId && userClassroomIds.size > 0 && !userClassroomIds.has(String(item.classroomId))) {
        // Only filter out if user has specific classrooms
      }
      if (selectedClassroomId && String(item.classroomId) !== selectedClassroomId) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesNotes = item.notes.toLowerCase().includes(q);
        const matchesClassroom = item.classroomName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesNotes && !matchesClassroom) return false;
      }

      if (activeTab === 'links' && !item.link) return false;
      if (activeTab === 'documents' && !item.fileUrl && item.link) return false;

      return true;
    });
  }, [materials, selectedClassroomId, searchQuery, activeTab, userClassroomIds]);

  // Handle Handout Creation with File Upload Support
  const createMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacher || !title.trim()) return;

    setUploading(true);

    let localFileUrl: string | undefined = undefined;
    let localFileName: string | undefined = undefined;

    if (file) {
      localFileName = file.name;
      localFileUrl = URL.createObjectURL(file);
    }

    const clsId = targetClassroomId || selectedClassroomId;

    // Attempt API upload if classroom selected
    if (clsId && /^\d+$/.test(clsId)) {
      try {
        const formData = new FormData();
        formData.append('title', title.trim());
        formData.append('description', notes.trim());
        if (link.trim()) formData.append('youtube_url', link.trim());
        if (file) formData.append('file', file);

        const res = await fetch(`/api/classrooms/${clsId}/materials`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (res.ok) {
          fetchClassroomMaterials();
          setTitle('');
          setLink('');
          setFile(null);
          setNotes('');
          setFormOpen(false);
          setUploading(false);
          return;
        }
      } catch (err) {
        console.warn('API handout upload failed, using local storage fallback');
      }
    }

    // Local storage fallback
    const targetCls = classrooms.find((cls) => String(cls.id) === targetClassroomId) || activeClassroom;

    const newMaterial: MaterialItem = {
      id: `mat-${Date.now()}`,
      title: title.trim(),
      link: link.trim() || undefined,
      fileUrl: localFileUrl,
      fileName: localFileName,
      notes: notes.trim(),
      classroomId: targetCls?.id || selectedClassroomId || undefined,
      classroomName: targetCls?.name || activeClassroom?.name || undefined,
      createdAt: new Date().toISOString().substring(0, 10),
    };

    setLocalMaterials((prev) => [newMaterial, ...prev]);
    setTitle('');
    setLink('');
    setFile(null);
    setNotes('');
    setFormOpen(false);
    setUploading(false);
  };

  // Delete Material (Teacher Only)
  const handleDeleteMaterial = async (materialId: string | number) => {
    if (!isTeacher) return;
    if (typeof materialId === 'number' || /^\d+$/.test(String(materialId))) {
      try {
        await fetch(`/api/materials/${materialId}`, { method: 'DELETE', credentials: 'include' });
        fetchClassroomMaterials();
      } catch (e) {
        console.warn('Failed to delete material via API');
      }
    }
    setLocalMaterials((prev) => prev.filter((m) => m.id !== materialId));
  };

  return (
    <section className="page-section tutorials-page">
      {/* Header Bar */}
      <div className="page-header">
        <div>
          <h2>📚 Handouts & Resources</h2>
          <p>
            {isTeacher
              ? 'Publish reading materials, attach downloadable files, and share guide links for your classrooms.'
              : activeClassroom
              ? `Review study guides, documents, and reading materials for ${activeClassroom.name}.`
              : 'Browse handouts, attached documents, and learning resources across your classrooms.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Role badge indicator */}
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
            {isTeacher ? '👨‍🏫 Teacher Mode' : '🎓 Student Mode (View Only)'}
          </div>

          {/* Creation Button ONLY rendered for Teachers */}
          {isTeacher && (
            <button
              className="primary-button"
              type="button"
              onClick={() => setFormOpen((v) => !v)}
              style={{ width: 'auto' }}
            >
              {formOpen ? 'Cancel' : '+ Add Handout'}
            </button>
          )}
        </div>
      </div>

      {/* Teacher Form to Create New Handout */}
      {isTeacher && formOpen && (
        <form className="entity-form" onSubmit={createMaterial} style={{ display: 'grid', gap: '14px' }}>
          <h3>Post New Handout / Study Resource</h3>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Handout Title (e.g. React Hooks Cheat Sheet)"
            required
          />
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="External Resource Link / URL (Optional)"
              style={{ flex: 1, minWidth: '220px' }}
            />
            <select
              value={targetClassroomId}
              onChange={(e) => setTargetClassroomId(e.target.value)}
              style={{
                flex: 1,
                minWidth: '220px',
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

          {/* Attach File Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--muted)' }}>
              📎 Attach File (PDF, Document, Image, Slides, etc.):
            </label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px dashed var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
              }}
            />
            {file && (
              <span style={{ fontSize: '0.84rem', color: '#059669', fontWeight: '600' }}>
                📄 Selected Attachment: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Provide a detailed description, study notes, or reading instructions..."
          />
          <button className="primary-button" type="submit" disabled={uploading}>
            {uploading ? 'Publishing Handout…' : 'Publish Handout'}
          </button>
        </form>
      )}

      {/* Student View Summary Cards */}
      {!isTeacher && (
        <div className="panel-grid">
          <div className="stat-card" style={{ borderTopColor: '#0d9488' }}>
            <span className="stat-label">Available Handouts</span>
            <strong>{materials.length}</strong>
          </div>
          <div className="stat-card" style={{ borderTopColor: '#3b82f6' }}>
            <span className="stat-label">Classrooms</span>
            <strong>{classrooms.length || 1}</strong>
          </div>
          <div className="stat-card" style={{ borderTopColor: '#8b5cf6' }}>
            <span className="stat-label">File Attachments</span>
            <strong>{materials.filter((m) => Boolean(m.fileUrl)).length}</strong>
          </div>
        </div>
      )}

      {/* Tabs & Controls Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
        <div className="student-tabs-nav" style={{ marginTop: 0 }}>
          <button
            className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveTab('all')}
          >
            📚 All Handouts ({materials.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'links' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveTab('links')}
          >
            🔗 External Links ({materials.filter((m) => Boolean(m.link)).length})
          </button>
          <button
            className={`tab-button ${activeTab === 'documents' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveTab('documents')}
          >
            📄 Files & Text Guides ({materials.filter((m) => Boolean(m.fileUrl) || !m.link).length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Search handouts by title or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: '220px',
              padding: '12px 16px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: '0.92rem',
            }}
          />

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
            style={{
              minWidth: '200px',
              padding: '12px 14px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: '0.92rem',
            }}
          >
            <option value="">All Classrooms</option>
            {classrooms.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Materials / Handouts Grid */}
      {filteredMaterials.length > 0 ? (
        <div className="entity-list">
          {filteredMaterials.map((item) => (
            <div
              key={item.id}
              className="entity-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                borderLeft: '5px solid #0d9488',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      background: '#ccfbf1',
                      color: '#0f766e',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      marginBottom: '6px',
                    }}
                  >
                    🏫 {item.classroomName || 'General Handout'}
                  </span>
                  <h3 style={{ margin: '2px 0 6px 0' }}>{item.title}</h3>
                </div>

                {isTeacher && (
                  <button
                    type="button"
                    onClick={() => handleDeleteMaterial(item.id)}
                    style={{
                      background: '#fff1f2',
                      color: '#e11d48',
                      border: '1px solid #fecdd3',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Delete
                  </button>
                )}
              </div>

              <p style={{ margin: 0, color: 'var(--muted)', lineHeight: '1.6' }}>{item.notes}</p>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px dashed var(--border)' }}>
                {item.fileUrl && (
                  <a
                    href={item.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    download={item.fileName || true}
                    className="secondary-button"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      width: 'auto',
                      padding: '8px 16px',
                      fontSize: '0.88rem',
                      textDecoration: 'none',
                      gap: '6px',
                      background: '#ecfdf5',
                      color: '#047857',
                      borderColor: '#a7f3d0',
                    }}
                  >
                    📥 Download Attachment {item.fileName ? `(${item.fileName})` : ''} ↗
                  </a>
                )}

                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      width: 'auto',
                      padding: '8px 16px',
                      fontSize: '0.88rem',
                      textDecoration: 'none',
                      gap: '6px',
                    }}
                  >
                    📖 Open Resource Link ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="placeholder-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📚</div>
          <h3 style={{ margin: '0 0 6px 0' }}>No Handouts Found</h3>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            {isTeacher
              ? 'Click "+ Add Handout" above to publish reference material or attach files for your students.'
              : 'No reading materials match your search or selected classroom yet.'}
          </p>
        </div>
      )}
    </section>
  );
}
