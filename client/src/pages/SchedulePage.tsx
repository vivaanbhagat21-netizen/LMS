import { useState } from 'react';
import { useLocalStorageState } from '../utils/useLocalStorageState';

interface EventItem {
  title: string;
  date: string;
  note: string;
}

export function SchedulePage() {
  const [events, setEvents] = useLocalStorageState<EventItem[]>('edugen_events', []);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  const createEvent = () => {
    if (!title.trim()) return;
    setEvents((prev) => [
      { title: title.trim(), date, note: note.trim() },
      ...prev,
    ]);
    setTitle('');
    setDate('');
    setNote('');
    setFormOpen(false);
  };

  return (
    <section className="page-section schedule-page">
      <div className="page-header">
        <div>
          <h2>Schedule</h2>
          <p>Track upcoming lessons, deadlines, and classroom events.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ Add Event'}
        </button>
      </div>

      {formOpen && (
        <div className="entity-form">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Event notes" />
          <button className="primary-button" type="button" onClick={createEvent}>
            Add event
          </button>
        </div>
      )}

      <div className="panel-grid">
        <div className="panel-card">
          <h3>Upcoming Events</h3>
          <p>Stay on track with due dates, meetings, and study sessions.</p>
        </div>
        <div className="panel-card">
          <h3>Weekly Planner</h3>
          <p>Keep all classroom deadlines visible in one schedule view.</p>
        </div>
      </div>

      {events.length > 0 ? (
        <div className="entity-list">
          {events.map((event, idx) => (
            <div className="entity-card" key={idx}>
              <h3>{event.title}</h3>
              <p>{event.note}</p>
              <span>{event.date || 'No date set'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="placeholder-card">
          <p>The schedule page is ready for event management and classroom planning.</p>
        </div>
      )}
    </section>
  );
}
