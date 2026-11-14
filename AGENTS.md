<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## SAVO architecture rules

- Layering is `routes/components → hooks → services → Supabase client`. UI never calls Supabase directly — why: keeps the backend swappable for the future Freebuff move.
- All Supabase queries live in `src/services/*.service.ts`; generated Supabase code stays in `src/integrations/supabase/` and is aliased through `src/types/savo.ts`. Why: app code must not depend on generated files.
- Schema changes are always new SQL migrations in `supabase/migrations/`, never manual table edits. Why: the database must be reproducible on any Postgres instance.
- Every shop-owned table carries `shop_id`, has RLS enabled, and is gated by `is_shop_member` / `has_shop_role` / `is_shop_owner`. Why: multi-tenant isolation at the database level.
- Colours, fonts, radii and shadows are tokens in `src/styles.css`; components use semantic classes only. Why: single source of truth for the brand.
- Storage objects are keyed `<shop_id>/<filename>` in private buckets. Why: storage policies derive tenancy from the first path segment.
