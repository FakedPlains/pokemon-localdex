/**
 * 统一 API 层 —— 通过 Hono API 中间层请求数据。
 */

/**
 * 通过 Hono API 请求数据
 */
export async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{ data: T; total?: number; hasMore?: boolean }> {
  const response: Response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<{ data: T; total?: number; hasMore?: boolean }>;
}

/**
 * 统一入口
 */
export async function unifiedApi<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{ data: T; total?: number; hasMore?: boolean }> {
  return api<T>(path, options);
}
