import { notFound } from "next/navigation";
import { isPreviewDemo } from "../../../preview-settings";
import { PreviewHub, previewMetadata } from "../../../preview/preview-hub";

export const metadata = previewMetadata;

export default function ArabicPreview() {
  if (!isPreviewDemo(process.env)) notFound();
  return <PreviewHub locale="ar" />;
}
