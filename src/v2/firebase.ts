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

// Firestore.settings() can only be called ONCE per instance. Memoize per database id
// so we don't double-apply settings (which would throw) and so every caller shares
// the same configured client.
const firestoreCache = new Map<string, FirebaseFirestore.Firestore>();

/**
 * Returns the Firestore instance for the configured database.
 * Set FIRESTORE_DATABASE_ID=dev-db in your environment to use the dev database.
 * Defaults to the project's default database when the variable is unset.
 *
 * `ignoreUndefinedProperties` is enabled so parser/serializer code paths that emit
 * `undefined` (e.g. optional review feedback fields like `submissionStructure`)
 * don't blow up the write — Firestore drops those keys instead of rejecting.
 */
export function getFirestore() {
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  const key = databaseId && databaseId !== "(default)" ? databaseId : "__default__";
  const cached = firestoreCache.get(key);
  if (cached) return cached;

  const instance =
    databaseId && databaseId !== "(default)"
      ? getFirestoreModular(getFirebaseApp(), databaseId)
      : getFirebaseApp().firestore();
  instance.settings({ ignoreUndefinedProperties: true });
  firestoreCache.set(key, instance);
  return instance;
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
  emailJobs: "email_jobs",
  quizzes: "quizzes",
  quizAttempts: "quiz_attempts",
} as const;
