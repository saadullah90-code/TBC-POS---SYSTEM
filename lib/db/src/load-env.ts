import dotenv from "dotenv";
import path from "path";
import fs from "fs";

let dir = process.cwd();
const visited = new Set<string>();
while (dir && !visited.has(dir)) {
  visited.add(dir);
  const envPath = path.join(dir, ".env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
