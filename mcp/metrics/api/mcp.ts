import * as fs from "node:fs";
import * as path from "node:path";
import { createMcpHandler } from "mcp-handler";
import { registerTools } from "../src/tools.js";

// Deployed function: point the manifest/SQL readers at the self-contained
// bundle/ copy (created by `npm run prepare-deploy`) when it exists.
// Explicit DBT_MANIFEST_PATH / REPO_ROOT env vars still win if set.
const bundleDir = path.join(process.cwd(), "bundle");
if (fs.existsSync(path.join(bundleDir, "target", "manifest.json"))) {
  process.env.DBT_MANIFEST_PATH ??= path.join(bundleDir, "target", "manifest.json");
  process.env.REPO_ROOT ??= bundleDir;
}

const handler = createMcpHandler(
  (server) => registerTools(server),
  { serverInfo: { name: "method-metrics", version: "0.1.0" } },
  {
    basePath: "/api", // function lives at /api/mcp
    disableSse: true, // streamable HTTP only — no Redis
    maxDuration: 60,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
