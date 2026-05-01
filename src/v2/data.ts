import { getFirestore } from "./firebase";

export type Where = [field: string, op: FirebaseFirestore.WhereFilterOp, value: unknown];

function applyTimestamps<T = any>(doc: FirebaseFirestore.DocumentSnapshot): T | null {
  if (!doc.exists) return null;
  const raw = doc.data() as Record<string, unknown>;
  const out: Record<string, unknown> = { id: doc.id };
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof (v as any).toDate === "function") {
      out[k] = (v as FirebaseFirestore.Timestamp).toDate();
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

function clean(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export const data = {
  col(name: string) {
    return getFirestore().collection(name);
  },

  async getById<T = any>(name: string, id: string): Promise<T | null> {
    const snap = await getFirestore().collection(name).doc(id).get();
    return applyTimestamps<T>(snap);
  },

  async findOne<T = any>(name: string, wheres: Where[]): Promise<T | null> {
    let q: FirebaseFirestore.Query = getFirestore().collection(name);
    for (const [f, op, v] of wheres) q = q.where(f, op, v);
    const snap = await q.limit(1).get();
    if (snap.empty) return null;
    return applyTimestamps<T>(snap.docs[0]);
  },

  async findMany<T = any>(
    name: string,
    opts: {
      where?: Where[];
      orderBy?: [string, "asc" | "desc"];
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<T[]> {
    let q: FirebaseFirestore.Query = getFirestore().collection(name);
    if (opts.where) for (const [f, op, v] of opts.where) q = q.where(f, op, v);
    if (opts.orderBy) q = q.orderBy(opts.orderBy[0], opts.orderBy[1]);
    if (opts.offset) q = q.offset(opts.offset);
    if (opts.limit) q = q.limit(opts.limit);
    const snap = await q.get();
    return snap.docs.map((d) => applyTimestamps<T>(d) as T);
  },

  async insert<T = any>(name: string, id: string, values: Record<string, unknown>): Promise<T> {
    const fs = getFirestore();
    const now = new Date();
    const payload = clean({ createdAt: now, ...values });
    await fs.collection(name).doc(id).set(payload);
    return { id, ...payload } as T;
  },

  async update<T = any>(name: string, id: string, values: Record<string, unknown>): Promise<T | null> {
    const fs = getFirestore();
    await fs.collection(name).doc(id).set(clean(values), { merge: true });
    return await data.getById<T>(name, id);
  },

  async del(name: string, id: string): Promise<void> {
    await getFirestore().collection(name).doc(id).delete();
  },

  async delMany(name: string, wheres: Where[]): Promise<number> {
    let q: FirebaseFirestore.Query = getFirestore().collection(name);
    for (const [f, op, v] of wheres) q = q.where(f, op, v);
    const snap = await q.get();
    if (snap.empty) return 0;
    const fs = getFirestore();
    const batch = fs.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  },
};
