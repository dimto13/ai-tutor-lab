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
  /**
   * Surfaces the step asks the learner to look at besides the action target,
   * e.g. a status indicator. Floating platform chrome must keep them clear.
   */
  informationSurfaces?: readonly GuidedActionTarget[];
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

/** Platform chrome that floats above runtime and platform UI. */
export function floatingPlatformOverlayChrome(page: Page): readonly PlatformOverlayChrome[] {
  return [
    {
      name: "Guided Spotlight-Tooltip",
      locator: page.getByTestId("highlight-tooltip"),
    },
    {
      name: "Guided-Hinweis (Fallback)",
      locator: page.getByTestId("highlight-hint"),
    },
    {
      name: "Tutor-Attention-Tooltip",
      locator: page.getByTestId("tutor-attention-tooltip"),
    },
  ];
}

export function guidedInstructionSurface(page: Page): GuidedActionTarget {
  return {
    name: "Guided-Instruktionsfläche",
    locator: page.getByTestId("guided-orientation"),
  };
}

export function platformOverlayChrome(page: Page): readonly PlatformOverlayChrome[] {
  const instruction = guidedInstructionSurface(page);
  return [
    ...floatingPlatformOverlayChrome(page),
    { name: instruction.name, locator: instruction.locator },
  ];
}

async function describeHitTestAtCenter(target: Locator): Promise<string> {
  return target.evaluate((targetElement) => {
    const targetRect = targetElement.getBoundingClientRect();
    const element = document.elementFromPoint(
      targetRect.left + targetRect.width / 2,
      targetRect.top + targetRect.height / 2,
    );
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

  const hitTest = await describeHitTestAtCenter(target.locator);
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

/**
 * #312/#454 guard: the action target has 0 px² overlap with platform chrome, and
 * floating platform chrome also keeps the Guided instruction surface (when it is
 * on screen) and every information surface the step needs clear.
 */
export async function expectGuidedActionTargetUnobstructed(
  page: Page,
  target: GuidedActionTarget,
  options: GuardOptions = {},
): Promise<void> {
  await expect(target.locator, `Guided-Ziel "${target.name}" muss sichtbar sein.`).toBeVisible();
  const informationSurfaces = options.informationSurfaces ?? [];
  for (const surface of informationSurfaces) {
    await expect(
      surface.locator,
      `Informationsfläche "${surface.name}" muss sichtbar sein.`,
    ).toBeVisible();
  }

  const overlays = options.overlays ?? platformOverlayChrome(page);
  const floatingOverlays = floatingPlatformOverlayChrome(page);
  const instruction = guidedInstructionSurface(page);
  await expect
    .poll(
      async () => {
        const surfaces = [...informationSurfaces];
        if ((await instruction.locator.count()) === 1 && (await instruction.locator.isVisible())) {
          surfaces.push(instruction);
        }
        const measurements = [
          ...(await measureObstructions(page, target, overlays)),
          ...(
            await Promise.all(
              surfaces.map((surface) => measureObstructions(page, surface, floatingOverlays)),
            )
          ).flat(),
        ];
        return formatObstructions(measurements);
      },
      {
        message: `Guided-Ziel "${target.name}" und die Informationsflächen des Schritts müssen gegenüber sichtbarer Plattform-Overlay-Chrome 0 px² Überschneidung haben.`,
        timeout: options.timeoutMs ?? 2_000,
        intervals: [0, 50, 100, 250],
      },
    )
    .toBe("");
}
