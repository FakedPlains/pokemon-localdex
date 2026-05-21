/**
 * 统一 API 层 —— 通过 Hono API 中间层请求数据。
 *
 * api<T>() 直接返回后端响应的完整 JSON，T 就是响应体类型。
 * 各接口的响应类型定义在 apiTypes.ts 中。
 */

/**
 * 通过 Hono API 请求数据。
 *
 * @typeParam T - 完整响应体的类型（后端返回什么就是什么）
 */
export async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response: Response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}
