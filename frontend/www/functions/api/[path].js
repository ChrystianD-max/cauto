export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = env.API_ORIGIN || "https://cauto.onrender.com";
  const target = origin + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.set("x-internal-proxy", "pages");

  const method = request.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);

  const init = {
    method,
    headers,
    redirect: "follow",
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? "half" : undefined,
  };

  return fetch(target, init);
}
