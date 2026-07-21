/**
 * Cut a release: let changelogen determine the next version from Conventional
 * Commits and update CHANGELOG.md, sync that version into the Tauri config and
 * Cargo manifest, then commit, tag, and push. Pushing the tag triggers the
 * Release workflow, which builds, signs, and publishes the GitHub release.
 *
 *   bun run release            # auto-detect the bump from commits
 *   bun run release -- --patch # force a patch/minor/major bump
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const forward = process.argv.slice(2).join(" ");

// 1. Bump package.json + refresh CHANGELOG.md from Conventional Commits.
run(`bun x changelogen --bump ${forward}`.trim());

// 2. Read the new version and mirror it into the Rust/Tauri side.
const version = JSON.parse(readFileSync("package.json", "utf8")).version;

const conf = "src-tauri/tauri.conf.json";
writeFileSync(conf, readFileSync(conf, "utf8").replace(/("version":\s*)"[^"]+"/, `$1"${version}"`));

const cargo = "src-tauri/Cargo.toml";
writeFileSync(cargo, readFileSync(cargo, "utf8").replace(/^version = "[^"]+"$/m, `version = "${version}"`));

// Keep Cargo.lock's own package entry in step so the tree stays clean.
const lock = "src-tauri/Cargo.lock";
writeFileSync(
  lock,
  readFileSync(lock, "utf8").replace(
    /(name = "luna-ultra-desktop"\nversion = )"[^"]+"/,
    `$1"${version}"`,
  ),
);

// 3. Commit, tag, and push. The tag push kicks off the Release workflow.
run(`git add package.json CHANGELOG.md ${conf} ${cargo} ${lock}`);
run(`git commit -m "chore(release): v${version}"`);
run(`git tag v${version}`);
run("git push --follow-tags");

console.log(`\nReleased v${version}. GitHub Actions is now building and publishing it.`);
