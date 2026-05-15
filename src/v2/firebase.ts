import admin from "firebase-admin";
import { getFirestore as getFirestoreModular } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

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

/**
 * Returns the Firestore instance for the configured database.
 * Set FIRESTORE_DATABASE_ID=dev-db in your environment to use the dev database.
 * Defaults to the project's default database when the variable is unset.
 */
export function getFirestore() {
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  if (databaseId && databaseId !== "(default)") {
    return getFirestoreModular(getFirebaseApp(), databaseId);
  }
  return getFirebaseApp().firestore();
}

function getStorageBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  return getStorage(getFirebaseApp()).bucket(bucketName || undefined);
}

export async function storageUpload(remotePath: string, buffer: Buffer, contentType: string): Promise<void> {
  await getStorageBucket().file(remotePath).save(buffer, { contentType });
}

export async function storageDownload(remotePath: string): Promise<Buffer> {
  const [buffer] = await getStorageBucket().file(remotePath).download();
  return buffer as Buffer;
}

export async function storageDelete(remotePath: string): Promise<void> {
  await getStorageBucket().file(remotePath).delete().catch(() => {});
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
  assignmentGroups: "assignment_groups",
  customForms: "custom_forms",
  customFormResponses: "custom_form_responses",
  cohorts: "cohorts",
  changelogs: "changelogs",
} as const;
