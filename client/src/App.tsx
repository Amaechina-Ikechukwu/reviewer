import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AuditLogsPage from "./pages/AuditLogsPage";
import GradebookPage from "./pages/GradebookPage";
import CreateAssignment from "./pages/CreateAssignment";
import ImportSubmissions from "./pages/ImportSubmissions";
import JoinClass from "./pages/JoinClass";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import SetupAccount from "./pages/SetupAccount";
import ReviewSubmission from "./pages/ReviewSubmission";
import StudentDashboard from "./pages/StudentDashboard";
import StudentResults from "./pages/StudentResults";
import StudentsPage from "./pages/StudentsPage";
import SubmitAssignment from "./pages/SubmitAssignment";
import SubmissionsList from "./pages/SubmissionsList";
import TeacherDashboard from "./pages/TeacherDashboard";
import type { Role } from "./types";

function ProtectedRoute({ role, children }: { role?: Role; children: ReactNode }) {
  const { ready, user } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm text-[var(--fg-muted)]">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;
  }

  return <>{children}</>;
}

function HomeRedirect() {
  const { ready, user } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm text-[var(--fg-muted)]">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/join/:code" element={<JoinClass />} />
      <Route path="/setup/:token" element={<SetupAccount />} />
      <Route path="/reset/:token" element={<ResetPassword />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/teacher"
        element={(
          <ProtectedRoute role="teacher">
            <TeacherDashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/assignments/new"
        element={(
          <ProtectedRoute role="teacher">
            <CreateAssignment />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/submissions"
        element={(
          <ProtectedRoute role="teacher">
            <SubmissionsList />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/review/:submissionId"
        element={(
          <ProtectedRoute role="teacher">
            <ReviewSubmission />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/students"
        element={(
          <ProtectedRoute role="teacher">
            <StudentsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/import"
        element={(
          <ProtectedRoute role="teacher">
            <ImportSubmissions />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/logs"
        element={(
          <ProtectedRoute role="teacher">
            <AuditLogsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/gradebook"
        element={(
          <ProtectedRoute role="teacher">
            <GradebookPage />
          </ProtectedRoute>
        )}
      />

      <Route
        path="/student"
        element={(
          <ProtectedRoute role="student">
            <StudentDashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/submit/:assignmentId"
        element={(
          <ProtectedRoute role="student">
            <SubmitAssignment />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/results"
        element={(
          <ProtectedRoute role="student">
            <StudentResults />
          </ProtectedRoute>
        )}
      />
    </Routes>
  );
}
