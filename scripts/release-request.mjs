import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const got = createRequire(import.meta.url)('got');

// 复用桌面构建依赖的网络库，流式传输文件并保留调用方的请求取消能力。
export const releaseRequest = (url, options = {}) => new Promise((resolve, reject) => {
    const request = got.stream(url, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        signal: options.signal,
        retry: { limit: 0 },
        throwHttpErrors: false,
        timeout: { connect: 60_000, secureConnect: 60_000 }
    });
    request.once('error', reject);
    request.once('response', (response) => {
        const headers = Object.fromEntries(Object.entries(response.headers)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]));
        const body = [204, 205, 304].includes(response.statusCode) ? null : Readable.toWeb(request);
        resolve(new Response(body, { status: response.statusCode, headers }));
    });
});
