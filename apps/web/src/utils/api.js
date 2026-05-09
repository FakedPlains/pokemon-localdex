/**
 * 统一 API 层 —— 通过 Hono API 中间层请求数据。
 */

/**
 * 通过 Hono API 请求数据
 */
export async function api(path, options) {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * 统一入口
 */
export async function unifiedApi(path, options) {
  return api(path, options);
}
