import { useState } from 'react';
import { useLocalStorageState } from '../utils/useLocalStorageState';

interface DiscussionThread {
  title: string;
  description: string;
  createdAt: string;
}

export function DiscussionsPage() {
  const [threads, setThreads] = useLocalStorageState<DiscussionThread[]>('edugen_discussions', []);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const createThread = () => {
    if (!title.trim()) return;
    setThreads((prev) => [
      { title: title.trim(), description: description.trim(), createdAt: new Date().toLocaleString() },
      ...prev,
    ]);
    setTitle('');
    setDescription('');
    setFormOpen(false);
  };

  return (
    <section className="page-section discussions-page">
      <div className="page-header">
        <div>
          <h2>Discussions</h2>
          <p>Share ideas, ask questions, and collaborate with your class.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ New Discussion'}
        </button>
      </div>

      {formOpen && (
        <div className="entity-form">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Discussion title" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What do you want to discuss?" />
          <button className="primary-button" type="button" onClick={createThread}>
            Create discussion
          </button>
        </div>
      )}

      <div className="panel-grid">
        <div className="panel-card">
          <h3>Conversation Board</h3>
          <p>Students and teachers can post notes, links, and study tips.</p>
        </div>
        <div className="panel-card">
          <h3>Study Groups</h3>
          <p>Create quick threads for group work and exam preparation.</p>
        </div>
      </div>

      {threads.length > 0 ? (
        <div className="entity-list">
          {threads.map((thread, idx) => (
            <div className="entity-card" key={idx}>
              <h3>{thread.title}</h3>
              <p>{thread.description}</p>
              <span>{thread.createdAt}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="placeholder-card">
          <p>This page is ready for discussion threads and classroom chat.</p>
        </div>
      )}
    </section>
  );
}
