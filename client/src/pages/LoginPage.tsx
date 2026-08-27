import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { GoogleSignIn } from '../auth/GoogleSignIn';

export function LoginPage() {
  const { user, error, loading, loginPreview } = useAuth();
  const navigate = useNavigate();
  const [devLoading, setDevLoading] = useState(false);
  const [role, setRole] = useState<'student' | 'teacher'>('student');

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const handlePreviewLogin = async () => {
    setDevLoading(true);
    try {
      await loginPreview(role);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('Preview login failed', err);
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <main className="page-container">
      <div className="auth-card">
        <h1>Welcome to Edugen</h1>
        <p>Sign in to continue to your learning workspace.</p>
        <div className="role-row">
          <button
            className={role === 'student' ? 'role-button active' : 'role-button'}
            type="button"
            onClick={() => setRole('student')}
          >
            Student
          </button>
          <button
            className={role === 'teacher' ? 'role-button active' : 'role-button'}
            type="button"
            onClick={() => setRole('teacher')}
          >
            Teacher
          </button>
        </div>
        <GoogleSignIn role={role} />
        <div className="login-footer">
          <p className="footer-text">If Google sign-in is unavailable, use the quick preview access below.</p>
          <button className="secondary-button" onClick={handlePreviewLogin} disabled={devLoading}>
            {devLoading ? 'Opening preview…' : `Open preview as ${role}`}
          </button>
        </div>
        {loading && <p className="status-text">Loading…</p>}
        {error && <p className="error-text">{error}</p>}
      </div>
    </main>
  );
}
