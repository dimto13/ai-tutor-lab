import type { FeedbackScreenshotAttachment } from "@/lib/feedbackStore";

const MAX_CAPTURE_WIDTH = 1280;
const MAX_CAPTURE_HEIGHT = 900;

function collectDocumentStyles(): string {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function sanitizeCaptureClone(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-feedback-capture-ui="true"]').forEach((element) => {
    element.remove();
  });

  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((field) => {
    field.value = "";
    field.setAttribute("value", "");
    field.setAttribute("placeholder", "Eingabe ausgeblendet");
  });

  root.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach((element) => {
    element.textContent = "Eingabe ausgeblendet";
  });
}

function captureTarget(): HTMLElement {
  const guide = document.querySelector<HTMLElement>('[data-platform-ui="guide"]');
  if (guide?.parentElement) return guide.parentElement;

  const completion = document.querySelector<HTMLElement>('[data-platform-ui="completion"]');
  if (completion) return completion;

  return document.body;
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Screenshot preview could not be rendered"));
    image.src = url;
  });
}

export async function captureTrainingSurfaceScreenshot(): Promise<FeedbackScreenshotAttachment> {
  const target = captureTarget();
  const bounds = target.getBoundingClientRect();
  const sourceWidth = Math.max(1, Math.round(bounds.width));
  const sourceHeight = Math.max(1, Math.round(bounds.height));
  const scale = Math.min(1, MAX_CAPTURE_WIDTH / sourceWidth, MAX_CAPTURE_HEIGHT / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const clone = target.cloneNode(true) as HTMLElement;
  sanitizeCaptureClone(clone);

  const serialized = new XMLSerializer().serializeToString(clone);
  const styles = collectDocumentStyles().replaceAll("</style>", "<\\/style>");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${sourceWidth}" height="${sourceHeight}" viewBox="0 0 ${sourceWidth} ${sourceHeight}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          <style>${styles}</style>
          ${serialized}
        </div>
      </foreignObject>
    </svg>
  `;

  const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await imageFromUrl(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Screenshot canvas is not available");
    context.drawImage(image, 0, 0, width, height);

    return {
      kind: "screenshot",
      mediaType: "image/png",
      dataUrl: canvas.toDataURL("image/png"),
      width,
      height,
      capturedArea: "training-surface",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
