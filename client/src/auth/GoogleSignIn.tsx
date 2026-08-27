import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { GoogleLogin } from '@react-oauth/google';

interface GoogleSignInProps {
  role?: 'student' | 'teacher';
}

export function GoogleSignIn({ role = 'student' }: GoogleSignInProps) {
  const { loginWithGoogle, setError } = useAuth();
  const navigate = useNavigate();

  return (
    <GoogleLogin
      onSuccess={async (credentialResponse) => {
        if (!credentialResponse.credential) {
          setError('Google sign-in did not return a valid ID token.');
          return;
        }
        try {
          await loginWithGoogle(credentialResponse.credential, role);
          navigate('/dashboard', { replace: true });
        } catch (error) {
          console.error('Google login error:', error);
          setError(error instanceof Error ? error.message : 'Google authentication failed.');
        }
      }}
      onError={() => {
        console.error('Google sign-in failed');
        setError('Google Sign-In failed or was cancelled. Use Quick Preview mode below to access the workspace.');
      }}
      useOneTap={false}
    />
  );
}
