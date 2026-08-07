import { mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scopeDir = path.join(root, "node_modules", "@adminops");
const linkPath = path.join(scopeDir, "workforce-core");
const targetPath = path.join(root, "modules", "workforce-core");

await mkdir(scopeDir, { recursive: true });
await rm(linkPath, { recursive: true, force: true });
await symlink(targetPath, linkPath, process.platform === "win32" ? "junction" : "dir");
