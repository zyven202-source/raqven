# Protecting this repository

The rule, in one sentence: **code changes reach `main` only through a pull
request that the owner has approved, and nobody — including a future
collaborator — can push over it, force-push it or delete it.**

Two halves make that true. Neither works alone.

| Half | Where it lives | What it does |
| --- | --- | --- |
| `.github/CODEOWNERS` | this repository | Names the owner as reviewer for every path, so a pull request cannot be merged without their review. |
| `Protect SAVO code` ruleset | GitHub (server-side) | Blocks direct pushes, force-pushes and deletion of the default branch, and requires a pull request with 1 approval plus code-owner review. |

A file in the repository cannot stop a `git push` — only GitHub can. That is why
the ruleset is applied through the API instead of by a config file that looks
authoritative but enforces nothing.

## Applying it

```bash
GH_TOKEN=… node scripts/protect-repo.mjs             # dry run: prints the plan
GH_TOKEN=… node scripts/protect-repo.mjs --apply     # creates/updates the ruleset
GH_TOKEN=… node scripts/protect-repo.mjs --apply --public   # also makes it public
```

The token needs admin rights on the repository. The script reads `owner/name`
from the `origin` remote, is safe to re-run, and never touches visibility unless
`--public` is passed — publishing source is effectively irreversible, so it is
never a side effect.

The same thing can be done by hand:

1. **Settings → Rules → Rulesets → New branch ruleset**, target the default
   branch, then add: *Restrict deletions*, *Block force pushes*, *Require linear
   history*, and *Require a pull request before merging* with 1 approval and
   *Require review from Code Owners*. Add the repository admin role to **Bypass
   list** if the owner needs to merge their own work.
2. **Settings → General → Danger Zone → Change visibility → Make public.**

## Why the owner can bypass

GitHub does not let anyone approve their own pull request. With required
approvals on and no bypass, a one-person repository could not merge anything at
all — the protection would become a lockout. So the admin role bypasses the
ruleset by default. That is the deliberate trade: the owner keeps working, and
anyone else still needs the owner's approval. Run with `--strict` to remove the
bypass once a second maintainer exists.

## Two things this will break if you use them

- **The Lovable integration** pushes commits straight to the connected branch.
  The pull-request rule rejects those pushes. Either add the integration to the
  ruleset's bypass list (`--bypass-app <integration_id>`) or accept that edits
  from Lovable must come through a pull request.
- **Any deploy or bot that pushes to `main`.** Same fix: bypass the actor, or
  give it its own branch.

## Publishing the source

The repository is public, so assume everything in it — and everything in its
history — is readable forever.

- `.env` is **not** tracked. `.env.example` holds the same keys with placeholder
  values. The Supabase anon/publishable key is safe to expose by design; the
  service-role key, database password and access tokens must never be committed.
- `.env.local` is ignored and holds local-only tokens.
- There is deliberately **no LICENSE file**. A public repository without a
  licence grants nobody the right to copy, modify or redistribute the code —
  they can read it, which is all "public" has to mean here. Adding MIT or Apache
  would hand out exactly the permissions this rule exists to withhold.
- If a secret is ever committed, rotate it before removing it: this repository
  is public, so a deleted commit has still been read.

## Reporting a problem

See [SECURITY.md](../SECURITY.md).
