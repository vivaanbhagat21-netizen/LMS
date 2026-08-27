import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClassroomsPage } from './pages/ClassroomsPage';
import { TutorialsPage } from './pages/TutorialsPage';
import { TasksPage } from './pages/TasksPage';
import { ServiceActionPage } from './pages/ServiceActionPage';
import { GradesPage } from './pages/GradesPage';
import { SchedulePage } from './pages/SchedulePage';
import { DiscussionsPage } from './pages/DiscussionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AttendancePage } from './pages/AttendancePage';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/classrooms" element={<ClassroomsPage />} />
            <Route path="/tutorials" element={<TutorialsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/service-action" element={<ServiceActionPage />} />
            <Route path="/grades" element={<GradesPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/discussions" element={<DiscussionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ThemeProvider>
    </AuthProvider>
  );
}
