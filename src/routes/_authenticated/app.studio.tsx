import { createFileRoute } from "@tanstack/react-router";

import { PageContainer, PageHeader } from "@/components/app/AppChrome";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { PhotoStudio } from "@/components/studio/PhotoStudio";
import { useActiveShop } from "@/hooks/useActiveShop";

export const Route = createFileRoute("/_authenticated/app/studio")({
  head: () => ({ meta: [{ title: "SAVO — Photo studio" }] }),
  component: () => (
    <OwnerOnly title="Photo studio">
      <StudioPage />
    </OwnerOnly>
  ),
});

function StudioPage() {
  const { activeShop } = useActiveShop();
  if (!activeShop) return null;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="SAVO Studio"
        title="Photo studio"
        subtitle="Cut out a plain background, place the product on a studio backdrop, and save a new photo to its listing."
      />
      <PhotoStudio shopId={activeShop.id} />
    </PageContainer>
  );
}
