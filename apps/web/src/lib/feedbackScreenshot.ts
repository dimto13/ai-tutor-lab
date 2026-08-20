import type { FeedbackScreenshotAttachment } from "@/lib/feedbackStore";

const MAX_CAPTURE_WIDTH = 1280;
const MAX_CAPTURE_HEIGHT = 900;
const CAPTURE_STYLE_PROPERTIES = [
  "display",
  "position",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin",
  "padding",
  "gap",
  "flex",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "align-content",
  "justify-content",
  "grid-template-columns",
  "grid-template-rows",
  "grid-auto-flow",
  "overflow",
  "overflow-x",
  "overflow-y",
  "background",
  "background-color",
  "color",
  "border",
  "border-radius",
  "box-shadow",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-transform",
  "white-space",
  "word-break",
  "overflow-wrap",
] as const;

function inlineComputedStyles(source: Element, clone: Element): void {
  if (!(source instanceof HTMLElement || source instanceof SVGElement)) return;
  if (!(clone instanceof HTMLElement || clone instanceof SVGElement)) return;

  const computed = window.getComputedStyle(source);
  for (const property of CAPTURE_STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (value) clone.style.setProperty(property, value);
  }
}

function createStyledClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const sourceElements = [source, ...source.querySelectorAll("*")];
  const cloneElements = [clone, ...clone.querySelectorAll("*")];

  for (let index = 0; index < sourceElements.length; index += 1) {
    const sourceElement = sourceElements[index];
    const cloneElement = cloneElements[index];
    if (!sourceElement || !cloneElement) continue;
    inlineComputedStyles(sourceElement, cloneElement);
  }

  return clone;
}

function sanitizeCaptureClone(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-feedback-capture-ui="true"]').forEach((element) => {
    element.remove();
  });

  root.querySelectorAll<HTMLElement>('[data-feedback-redact="true"]').forEach((element) => {
    element.textContent = "Eingabe ausgeblendet";
  });

  root
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
    .forEach((field) => {
      field.value = "";
      field.textContent = "";
      field.removeAttribute("value");
      field.setAttribute("placeholder", "Eingabe ausgeblendet");
    });

  root.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach((element) => {
    element.textContent = "Eingabe ausgeblendet";
  });

  root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    image.removeAttribute("src");
    image.removeAttribute("srcset");
    image.setAttribute("alt", image.alt || "Bild ausgeblendet");
  });
}

function captureTarget(): HTMLElement {
  const guide = document.querySelector<HTMLElement>('[data-platform-ui="guide"]');
  if (guide?.parentElement) return guide.parentElement;

  const completion = document.querySelector<HTMLElement>('[data-platform-ui="completion"]');
  if (completion) return completion;

  return document.body;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Screenshot data could not be encoded"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Screenshot data could not be encoded"));
    reader.readAsDataURL(blob);
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

  const clone = createStyledClone(target);
  sanitizeCaptureClone(clone);
  clone.style.width = `${sourceWidth}px`;
  clone.style.height = `${sourceHeight}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.overflow = "hidden";

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${sourceWidth} ${sourceHeight}"><foreignObject x="0" y="0" width="${sourceWidth}" height="${sourceHeight}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${sourceWidth}px;height:${sourceHeight}px;overflow:hidden">${serialized}</div></foreignObject></svg>`;
  const dataUrl = await blobToDataUrl(new Blob([svg], { type: "image/svg+xml" }));

  return {
    kind: "screenshot",
    mediaType: "image/svg+xml",
    dataUrl,
    width,
    height,
    capturedArea: "training-surface",
  };
}
