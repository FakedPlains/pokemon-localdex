/**
 * Cloudflare Pages Function — 代理 /api/* 到 Worker Service Binding
 *
 * 在 Cloudflare Pages 设置中需要添加 Service Binding：
 *   变量名: API_WORKER
 *   服务:   pokemon-localdex-api
 *
 * 本地开发时，wrangler pages dev 会自动处理。
 */

interface Env {
  API_WORKER: { fetch: (req: Request) => Promise<Response> };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // 将请求转发给 Worker
  return env.API_WORKER.fetch(request);
};
