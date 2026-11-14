#!/usr/bin/env node
/**
 * Puts the repository's two GitHub-side protections in place:
 *
 *   1. visibility — make the repository public (only with `--public`);
 *   2. a branch ruleset on the default branch, so code cannot be changed
 *      without a pull request and the owner's approval.
 *
 * Both are admin API calls, which is why they live here rather than in the app:
 * nothing in the repository can enforce them, only GitHub can.
 *
 *   GH_TOKEN=… node scripts/protect-repo.mjs            # print the plan only
 *   GH_TOKEN=… node scripts/protect-repo.mjs --apply     # create/update the ruleset
 *   GH_TOKEN=… node scripts/protect-repo.mjs --apply --public
 *
 * The token needs admin rights on the repository (`repo` scope for a classic
 * token; "Administration: write" for a fine-grained one). Nothing is changed
 * without `--apply` on purpose: making a repository public is effectively
 * irreversible — clones, forks and crawls keep copies — so it must be a
 * deliberate second step, never a side effect of "set up the protections".
 */

import { execFileSync } from "node:child_process";

const RULESET_NAME = "Protect SAVO code";
const API = "https://api.github.com";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const makePublic = args.includes("--public");
const strict = args.includes("--strict");
const bypassApp = (() => {
  const i = args.indexOf("--bypass-app");
  return i >= 0 ? args[i + 1] : null;
})();

const token = process.env["GH_TOKEN"] ?? process.env["GITHUB_TOKEN"];
if (!token) {
  console.error(
    "No token. Set GH_TOKEN (or GITHUB_TOKEN) to a token with admin rights on this\n" +
      "repository. Generate one at https://github.com/settings/tokens — do not paste it\n" +
      "into a file in this repository.",
  );
  process.exit(2);
}

/** owner/name from the origin remote, so the script needs no configuration. */
function parseRemote() {
  const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
  if (!match) throw new Error(`cannot read owner/name from origin: ${url}`);
  return { owner: match[1], repo: match[2] };
}

async function gh(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.message ?? response.statusText;
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${message}`);
  }
  return body;
}

/**
 * The rules. Each one closes a specific way code could change without review:
 *
 *   pull_request        every change lands as a pull request
 *   deletion            `main` cannot be deleted
 *   non_fast_forward    no force-push over history
 *   required_linear_history  no merge commits, so each change is one commit
 *
 * Required approvals are 1 with code-owner review, which is what stops a
 * collaborator merging their own change. A solo maintainer cannot approve their
 * own pull request, so the repository admin role is allowed to bypass —
 * otherwise the owner would lock themselves out. `--strict` removes that bypass.
 */
function rulesetBody(defaultBranch) {
  const rules = [
    { type: "deletion" },
    { type: "non_fast_forward" },
    { type: "required_linear_history" },
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: 1,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: true,
        require_last_push_approval: false,
        required_review_thread_resolution: true,
        allowed_merge_methods: ["squash"],
      },
    },
  ];

  const bypass_actors = [];
  if (!strict) {
    // RepositoryRole 5 is "admin": the owner can still land their own changes.
    bypass_actors.push({ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" });
  }
  if (bypassApp) {
    // Keep an integration that pushes to the branch (e.g. the Lovable app)
    // working. Without this, its commits are rejected by the pull_request rule.
    bypass_actors.push({ actor_id: Number(bypassApp), actor_type: "Integration", bypass_mode: "always" });
  }

  return {
    name: RULESET_NAME,
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules,
    bypass_actors,
  };
}

async function main() {
  const { owner, repo } = parseRemote();
  console.log(`Repository: ${owner}/${repo}`);

  const info = await gh(`/repos/${owner}/${repo}`);
  console.log(`Visibility: ${info.visibility ?? (info.private ? "private" : "public")}`);
  console.log(`Default branch: ${info.default_branch}`);

  const existing = await gh(`/repos/${owner}/${repo}/rulesets`);
  const current = existing.find((r) => r.name === RULESET_NAME);
  console.log(`Ruleset "${RULESET_NAME}": ${current ? `exists (id ${current.id})` : "not present"}`);

  const body = rulesetBody(info.default_branch);
  if (makePublic) {
    console.log(
      info.visibility === "public"
        ? "Visibility: already public, nothing to change."
        : "Visibility: will be changed to public — this cannot be undone; copies already made elsewhere stay public.",
    );
  }
  console.log(
    `Ruleset rules: ${body.rules.map((r) => r.type).join(", ")}; ` +
      `bypass: ${body.bypass_actors.length ? JSON.stringify(body.bypass_actors) : "none (strict)"}`,
  );

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write these changes.");
    return;
  }

  if (makePublic && info.visibility !== "public") {
    await gh(`/repos/${owner}/${repo}`, {
      method: "PATCH",
      body: JSON.stringify({ visibility: "public" }),
    });
    console.log("Visibility: now public.");
  }

  if (current) {
    await gh(`/repos/${owner}/${repo}/rulesets/${current.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    console.log(`Ruleset "${RULESET_NAME}": updated.`);
  } else {
    const created = await gh(`/repos/${owner}/${repo}/rulesets`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log(`Ruleset "${RULESET_NAME}": created (id ${created.id}).`);
  }

  console.log(
    "\nVerify at Settings → Rules → Rulesets. A direct push to the branch should now\n" +
      "be rejected; a pull request by anyone but the owner should need approval.",
  );
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
