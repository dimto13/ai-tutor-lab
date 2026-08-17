import { expect, type Locator, type Page } from "../fixtures/browser-error-guard";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GuidedActionTarget {
  name: string;
  locator: Locator;
}

export interface PlatformOverlayChrome {
  name: string;
  locator: Locator;
}

interface ObstructionMeasurement {
  target: string;
  overlay: string;
  intersectionArea: number;
  hitTest: string;
}

interface GuardOptions {
  overlays?: readonly PlatformOverlayChrome[];
  timeoutMs?: number;
}

export function intersectionArea(left: Box, right: Box): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return width * height;
}

export function platformOverlayChrome(page: Page): readonly PlatformOverlayChrome[] {
  return [
    {
      name: "Guided Spotlight-Tooltip",
      locator: page.getByTestId("highlight-tooltip"),
    },
    {
      name: "Tutor-Attention-Tooltip",
      locator: page.getByTestId("tutor-attention-tooltip"),
    },
  ];
}

async function describeHitTestAtCenter(page: Page, box: Box): Promise<string> {
  return page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    if (!element) return "none";

    const role = element.getAttribute("role");
    const ariaLabel = element.getAttribute("aria-label");
    const testId = element.getAttribute("data-testid");
    return [
      element.tagName.toLowerCase(),
      role ? `role=${role}` : null,
      ariaLabel ? `aria-label=${ariaLabel}` : null,
      testId ? `data-testid=${testId}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
}

async function measureObstructions(
  page: Page,
  target: GuidedActionTarget,
  overlays: readonly PlatformOverlayChrome[],
): Promise<readonly ObstructionMeasurement[]> {
  const targetCount = await target.locator.count();
  if (targetCount !== 1) {
    throw new Error(
      `Guided-Ziel "${target.name}" muss genau ein Element auflösen, gefunden: ${targetCount}.`,
    );
  }

  const targetBox = await target.locator.boundingBox();
  if (!targetBox || targetBox.width <= 0 || targetBox.height <= 0) {
    throw new Error(`Guided-Ziel "${target.name}" besitzt keine sichtbare Boundingbox.`);
  }

  const hitTest = await describeHitTestAtCenter(page, targetBox);
  const measurements: ObstructionMeasurement[] = [];

  for (const overlay of overlays) {
    const overlayCount = await overlay.locator.count();
    for (let index = 0; index < overlayCount; index += 1) {
      const overlayLocator = overlay.locator.nth(index);
      if (!(await overlayLocator.isVisible())) continue;

      const overlayBox = await overlayLocator.boundingBox();
      if (!overlayBox || overlayBox.width <= 0 || overlayBox.height <= 0) continue;

      const area = intersectionArea(targetBox, overlayBox);
      if (area <= 0) continue;

      measurements.push({
        target: target.name,
        overlay: overlayCount > 1 ? `${overlay.name} #${index + 1}` : overlay.name,
        intersectionArea: area,
        hitTest,
      });
    }
  }

  return measurements;
}

function formatObstructions(measurements: readonly ObstructionMeasurement[]): string {
  return measurements
    .map(
      ({ target, overlay, intersectionArea: area, hitTest }) =>
        `Ziel "${target}" wird durch Overlay "${overlay}" visuell verdeckt: ${area.toFixed(2)} px² Schnittfläche (elementFromPoint in Zielmitte: ${hitTest}).`,
    )
    .join("\n");
}

export async function expectGuidedActionTargetUnobstructed(
  page: Page,
  target: GuidedActionTarget,
  options: GuardOptions = {},
): Promise<void> {
  await expect(target.locator, `Guided-Ziel "${target.name}" muss sichtbar sein.`).toBeVisible();

  const overlays = options.overlays ?? platformOverlayChrome(page);
  await expect
    .poll(
      async () => formatObstructions(await measureObstructions(page, target, overlays)),
      {
        message: `Guided-Ziel "${target.name}" muss gegenüber sichtbarer Plattform-Overlay-Chrome 0 px² Überschneidung haben.`,
        timeout: options.timeoutMs ?? 2_000,
        intervals: [0, 50, 100, 250],
      },
    )
    .toBe("");
}
