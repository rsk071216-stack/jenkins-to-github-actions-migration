// Container HEALTHCHECK probe. Distroless images ship no curl/wget, so we use Node itself.
import { request } from "node:http";

const port = Number(process.env.PORT ?? 8080);
const req = request({ host: "127.0.0.1", port, path: "/healthz", timeout: 2000 }, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on("timeout", () => req.destroy(new Error("timeout")));
req.on("error", () => process.exit(1));
req.end();
