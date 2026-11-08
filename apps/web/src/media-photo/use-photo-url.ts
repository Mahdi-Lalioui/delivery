import { useEffect, useState } from "react";

export function usePhotoUrl(blob: Blob | undefined) {
  const [resource, setResource] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setResource({ blob, url });
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return resource?.blob === blob ? resource?.url : undefined;
}
