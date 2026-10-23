import {
  imageUploadGuidance,
  type ImageFormatPolicy,
  type ImageUploadProfile,
} from "@/lib/image-upload-guidance";
import { cn } from "@/lib/utils";

export function ImageUploadGuidance({
  profile,
  formatPolicy,
  id,
  className,
}: {
  profile: ImageUploadProfile;
  formatPolicy?: ImageFormatPolicy;
  id?: string;
  className?: string;
}) {
  const guidance = imageUploadGuidance(profile, formatPolicy);
  return (
    <p id={id} className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
      {guidance.recommendation} {guidance.formats} · até {guidance.maxBytes / (1024 * 1024)} MB por
      arquivo.
    </p>
  );
}
