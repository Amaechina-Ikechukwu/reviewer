export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function parseJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  return JSON.parse(text) as T;
}
