import { type Photograph } from "@/lib/photography";
import { cn } from "@/lib/utils";

/**
 * A narrow photographic band above a data screen.
 *
 * It exists to give a long list a place to start, not to decorate the list: one
 * image, one line of text, fixed height, and `loading="lazy"` so it never delays
 * the rows behind it. The photograph is decorative; the caption carries the
 * meaning, which is why the image is hidden from assistive technology.
 */
export function PhotoBanner({
  photo,
  caption,
  className,
}: {
  photo: Photograph;
  caption: string;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border border-[var(--border)]", className)}
    >
      <img
        src={photo.src}
        alt=""
        aria-hidden
        width={photo.width}
        height={photo.height}
        loading="lazy"
        decoding="async"
        className="h-28 w-full object-cover sm:h-32"
        style={{ objectPosition: photo.focal }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,17,16,0.15),rgba(11,17,16,0.86))]" />
      <p className="absolute inset-x-4 bottom-3 text-sm font-medium text-[var(--foreground)]">
        {caption}
      </p>
    </div>
  );
}
