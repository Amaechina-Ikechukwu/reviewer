import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AuditLogsPage from "./pages/AuditLogsPage";
import ClassNotesPage from "./pages/ClassNotesPage";
import CustomFormsPage from "./pages/CustomFormsPage";
import CustomFormBuilder from "./pages/CustomFormBuilder";
import CustomFormResponses from "./pages/CustomFormResponses";
import CustomFormResponseDetail from "./pages/CustomFormResponseDetail";
import StudentFormsPage from "./pages/StudentFormsPage";
import FillCustomForm from "./pages/FillCustomForm";
import QuizzesPage from "./pages/QuizzesPage";
import QuizBuilder from "./pages/QuizBuilder";
import QuizResults from "./pages/QuizResults";
import StudentQuizzesPage from "./pages/StudentQuizzesPage";
import TakeQuiz from "./pages/TakeQuiz";
import StudentNotesPage from "./pages/StudentNotesPage";
import GradebookPage from "./pages/GradebookPage";
import CreateAssignment from "./pages/CreateAssignment";
import EditAssignment from "./pages/EditAssignment";
import ManageGroups from "./pages/ManageGroups";
import GroupProjectsPage from "./pages/GroupProjectsPage";
import CreateGroupProject from "./pages/CreateGroupProject";
import ImportSubmissions from "./pages/ImportSubmissions";
import JoinClass from "./pages/JoinClass";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import SetupAccount from "./pages/SetupAccount";
import ReviewSubmission from "./pages/ReviewSubmission";
import StudentDashboard from "./pages/StudentDashboard";
import StudentResults from "./pages/StudentResults";
import StudentResultDetail from "./pages/StudentResultDetail";
import StaffPage from "./pages/StaffPage";
import ChangelogPage from "./pages/ChangelogPage";
import NotificationsPage from "./pages/NotificationsPage";
import SettingsPage from "./pages/SettingsPage";
import StudentsPage from "./pages/StudentsPage";
import StudentProfilePage from "./pages/StudentProfilePage";
import SubmitAssignment from "./pages/SubmitAssignment";
import SubmissionsList from "./pages/SubmissionsList";
import TeacherDashboard from "./pages/TeacherDashboard";
import type { Role } from "./types";
import { isStaffRole } from "./types";
import CohortsPage from "./pages/CohortsPage";
import CohortDetailPage from "./pages/CohortDetailPage";
import V2Wrapper from "./v2/V2Wrapper";
import V2AuditLogsPage from "./v2/pages/AuditLogsPage";
import V2ClassNotesPage from "./v2/pages/ClassNotesPage";
import V2StudentNotesPage from "./v2/pages/StudentNotesPage";
import V2GradebookPage from "./v2/pages/GradebookPage";
import V2CreateAssignment from "./v2/pages/CreateAssignment";
import V2EditAssignment from "./v2/pages/EditAssignment";
import V2ManageGroups from "./v2/pages/ManageGroups";
import V2ImportSubmissions from "./v2/pages/ImportSubmissions";
import V2JoinClass from "./v2/pages/JoinClass";
import V2Login from "./v2/pages/Login";
import V2ResetPassword from "./v2/pages/ResetPassword";
import V2SetupAccount from "./v2/pages/SetupAccount";
import V2ReviewSubmission from "./v2/pages/ReviewSubmission";
import V2StudentDashboard from "./v2/pages/StudentDashboard";
import V2StudentResults from "./v2/pages/StudentResults";
import V2StudentResultDetail from "./v2/pages/StudentResultDetail";
import V2StudentsPage from "./v2/pages/StudentsPage";
import V2SubmitAssignment from "./v2/pages/SubmitAssignment";
import V2SubmissionsList from "./v2/pages/SubmissionsList";
import V2TeacherDashboard from "./v2/pages/TeacherDashboard";

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

  if (role === "teacher" && !isStaffRole(user.role)) {
    return <Navigate to="/student" replace />;
  }

  if (role === "student" && user.role !== "student") {
    return <Navigate to="/teacher" replace />;
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

  return <Navigate to={isStaffRole(user.role) ? "/teacher" : "/student"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/join/:code" element={<JoinClass />} />
      <Route path="/setup/:token" element={<SetupAccount />} />
      <Route path="/reset/:token" element={<ResetPassword />} />
      <Route path="/changelog" element={<ChangelogPage />} />
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
        path="/teacher/assignments/:id/edit"
        element={(
          <ProtectedRoute role="teacher">
            <EditAssignment />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/assignments/:id/groups"
        element={(
          <ProtectedRoute role="teacher">
            <ManageGroups />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/group-projects"
        element={(
          <ProtectedRoute role="teacher">
            <GroupProjectsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/group-projects/new"
        element={(
          <ProtectedRoute role="teacher">
            <CreateGroupProject />
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
        path="/teacher/cohorts"
        element={(
          <ProtectedRoute role="teacher">
            <CohortsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/cohorts/:id"
        element={(
          <ProtectedRoute role="teacher">
            <CohortDetailPage />
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
        path="/teacher/students/:studentId"
        element={(
          <ProtectedRoute role="teacher">
            <StudentProfilePage />
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
        path="/teacher/staff"
        element={(
          <ProtectedRoute role="teacher">
            <StaffPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/changelog"
        element={(
          <ProtectedRoute role="teacher">
            <ChangelogPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/notifications"
        element={(
          <ProtectedRoute role="teacher">
            <NotificationsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/settings/:tab?"
        element={(
          <ProtectedRoute role="teacher">
            <SettingsPage />
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
        path="/teacher/notes"
        element={(
          <ProtectedRoute role="teacher">
            <ClassNotesPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/forms"
        element={(
          <ProtectedRoute role="teacher">
            <CustomFormsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/forms/new"
        element={(
          <ProtectedRoute role="teacher">
            <CustomFormBuilder />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/forms/:id/edit"
        element={(
          <ProtectedRoute role="teacher">
            <CustomFormBuilder />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/forms/:id/responses"
        element={(
          <ProtectedRoute role="teacher">
            <CustomFormResponses />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/forms/:id/responses/:responseId"
        element={(
          <ProtectedRoute role="teacher">
            <CustomFormResponseDetail />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/quizzes"
        element={(
          <ProtectedRoute role="teacher">
            <QuizzesPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/quizzes/new"
        element={(
          <ProtectedRoute role="teacher">
            <QuizBuilder />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/quizzes/:id/edit"
        element={(
          <ProtectedRoute role="teacher">
            <QuizBuilder />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/teacher/quizzes/:id/results"
        element={(
          <ProtectedRoute role="teacher">
            <QuizResults />
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
      <Route
        path="/student/results/:submissionId"
        element={(
          <ProtectedRoute role="student">
            <StudentResultDetail />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/notes"
        element={(
          <ProtectedRoute role="student">
            <StudentNotesPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/forms"
        element={(
          <ProtectedRoute role="student">
            <StudentFormsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/forms/:id"
        element={(
          <ProtectedRoute role="student">
            <FillCustomForm />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/quizzes"
        element={(
          <ProtectedRoute role="student">
            <StudentQuizzesPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/student/quizzes/:id"
        element={(
          <ProtectedRoute role="student">
            <TakeQuiz />
          </ProtectedRoute>
        )}
      />

      {/* /v2 — Firestore-backed mirror of every route */}
      <Route path="/v2" element={<V2Wrapper><HomeRedirect /></V2Wrapper>} />
      <Route path="/v2/login" element={<V2Wrapper><V2Login /></V2Wrapper>} />
      <Route path="/v2/join/:code" element={<V2Wrapper><V2JoinClass /></V2Wrapper>} />
      <Route path="/v2/setup/:token" element={<V2Wrapper><V2SetupAccount /></V2Wrapper>} />
      <Route path="/v2/reset/:token" element={<V2Wrapper><V2ResetPassword /></V2Wrapper>} />

      <Route path="/v2/teacher" element={<V2Wrapper><ProtectedRoute role="teacher"><V2TeacherDashboard /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/assignments/new" element={<V2Wrapper><ProtectedRoute role="teacher"><V2CreateAssignment /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/assignments/:id/edit" element={<V2Wrapper><ProtectedRoute role="teacher"><V2EditAssignment /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/assignments/:id/groups" element={<V2Wrapper><ProtectedRoute role="teacher"><V2ManageGroups /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/submissions" element={<V2Wrapper><ProtectedRoute role="teacher"><V2SubmissionsList /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/review/:submissionId" element={<V2Wrapper><ProtectedRoute role="teacher"><V2ReviewSubmission /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/cohorts" element={<V2Wrapper><ProtectedRoute role="teacher"><CohortsPage /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/cohorts/:id" element={<V2Wrapper><ProtectedRoute role="teacher"><CohortDetailPage /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/students" element={<V2Wrapper><ProtectedRoute role="teacher"><V2StudentsPage /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/import" element={<V2Wrapper><ProtectedRoute role="teacher"><V2ImportSubmissions /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/logs" element={<V2Wrapper><ProtectedRoute role="teacher"><V2AuditLogsPage /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/gradebook" element={<V2Wrapper><ProtectedRoute role="teacher"><V2GradebookPage /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/teacher/notes" element={<V2Wrapper><ProtectedRoute role="teacher"><V2ClassNotesPage /></ProtectedRoute></V2Wrapper>} />

      <Route path="/v2/student" element={<V2Wrapper><ProtectedRoute role="student"><V2StudentDashboard /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/student/submit/:assignmentId" element={<V2Wrapper><ProtectedRoute role="student"><V2SubmitAssignment /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/student/results" element={<V2Wrapper><ProtectedRoute role="student"><V2StudentResults /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/student/results/:submissionId" element={<V2Wrapper><ProtectedRoute role="student"><V2StudentResultDetail /></ProtectedRoute></V2Wrapper>} />
      <Route path="/v2/student/notes" element={<V2Wrapper><ProtectedRoute role="student"><V2StudentNotesPage /></ProtectedRoute></V2Wrapper>} />
    </Routes>
  );
}
