# Reporting a security issue

Please do not open a public issue for a security problem.

Email **security@savo.co.ke** with:

- what the issue is and where it is (URL, screen or file),
- the steps to reproduce it,
- what an attacker could do with it,
- whether any real shop's data was involved.

You will get an acknowledgement, and an honest answer about whether the report
is in scope. This is a small project maintained by one person: expect a reply
rather than a bug bounty.

## What is worth reporting

- A way to read or change another shop's records, or another account's data.
- A way to reach an authenticated screen or database function without a session.
- A secret in the repository, the client bundle or the page source.
- A way to make the assistant reveal data from a shop the signed-in user is not
  a member of.

## What is not a vulnerability

- The Supabase anon/publishable key in the client bundle. It is designed to be
  public; row-level security is what protects the data.
- The prices or the fact that the product is free.
- Missing headers that have no effect on this static, cookie-less front end.

## If you are the maintainer

Rotate first, explain second. Supabase keys rotate in the dashboard, and the
service role key must never reach the repository or the browser bundle. If a
secret is committed, rotate it even if the commit is removed — this repository
is public, so assume it was read.
