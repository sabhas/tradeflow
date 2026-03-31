import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ProtectedLayout } from './layouts/ProtectedLayout';
import { DashboardPage } from './pages/DashboardPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { useAppSelector } from './hooks/useAppSelector';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuth = useAppSelector((s) => s.auth.token);
  if (!isAuth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const isAuth = useAppSelector((s) => s.auth.token);
  if (isAuth) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ProtectedLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
