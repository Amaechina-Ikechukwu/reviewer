import admin from "firebase-admin";

let app: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App {
  if (app) return app;

  if (admin.apps.length > 0) {
    app = admin.app();
    return app;
  }

  const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (serviceAccountStr) {
    // Support both an inline JSON string and a file path to the JSON key
    const json = serviceAccountStr.trimStart().startsWith("{")
      ? JSON.parse(serviceAccountStr)
      : JSON.parse(require("fs").readFileSync(serviceAccountStr, "utf8"));
    app = admin.initializeApp({
      credential: admin.credential.cert(json),
      projectId: projectId || json.project_id,
    });
  } else {
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  return app;
}

export function getFirestore() {
  return getFirebaseApp().firestore();
}

export const COLLECTIONS = {
  users: "users",
  assignments: "assignments",
  submissions: "submissions",
  reviews: "reviews",
  authTokens: "auth_tokens",
  submissionOverrides: "submission_overrides",
  auditLogs: "audit_logs",
  classNoteFiles: "class_note_files",
} as const;
