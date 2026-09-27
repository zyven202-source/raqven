import { ModulePlaceholder, PageContainer, PageHeader } from "@/components/app/AppChrome";

/**
 * Standard module page for features that are planned but not implemented yet.
 * Renders the real navigation chrome with an explicit "not built yet" notice —
 * never fake data or dead controls. Ship real implementations by replacing
 * the ModulePlaceholder with live UI in the module route file.
 */
export function ModulePage({
  title,
  description,
  bulletPoints,
}: {
  title: string;
  description: string;
  bulletPoints?: string[];
}) {
  return (
    <PageContainer>
      <PageHeader title={title} subtitle={description} />
      <div className="mt-6">
        {bulletPoints ? (
          <ModulePlaceholder
            title={`${title} is not built yet`}
            description={description}
            bulletPoints={bulletPoints}
          />
        ) : (
          <ModulePlaceholder title={`${title} is not built yet`} description={description} />
        )}
      </div>
    </PageContainer>
  );
}
