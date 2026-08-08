import assert from "node:assert/strict";
import { test } from "node:test";
import type { RuntimeAdapter, RuntimeSeed } from "../../src/runtime/runtimeAdapter.ts";
import type { TrainingEvent, UiTargetRef, WorkspaceEventName } from "../../src/types/training.ts";

interface TargetFixture {
  ref: UiTargetRef;
  container: HTMLElement;
  expectedRect: Pick<DOMRect, "top" | "left" | "width" | "height">;
}

interface EventFixture {
  name: WorkspaceEventName;
  emit(): void;
}

interface QueryFixture {
  selector: string;
  expected: unknown;
}

interface SeedFixture {
  seed: RuntimeSeed;
  selector: string;
  expected: unknown;
  assertMountedPresentation?(): void | Promise<void>;
}

interface SnapshotFixture {
  selector: string;
  expectedRestoredValue: unknown;
  prepare(): void;
  mutate(): void;
  assertRestoredPresentation?(): void | Promise<void>;
}

export interface RuntimeAdapterContractFixture {
  adapter: RuntimeAdapter;
  reset(): void;
  target: TargetFixture;
  event: EventFixture;
  query: QueryFixture;
  seed: SeedFixture;
  snapshot: SnapshotFixture;
}

export function defineRuntimeAdapterContractTests(
  name: string,
  createFixture: () => RuntimeAdapterContractFixture,
): void {
  test(`${name}: exposes stable identity and capabilities`, () => {
    const { adapter } = createFixture();
    assert.ok(adapter.id.length > 0);
    assert.ok(adapter.productId.length > 0);
    assert.ok(Array.isArray(adapter.capabilities));
  });

  test(`${name}: mounts, resolves semantic targets and unmounts`, async () => {
    const fixture = createFixture();
    fixture.reset();

    await fixture.adapter.mount(fixture.target.container);
    const resolved = fixture.adapter.resolveTarget(fixture.target.ref);
    assert.ok(resolved);
    assert.equal(resolved.top, fixture.target.expectedRect.top);
    assert.equal(resolved.left, fixture.target.expectedRect.left);
    assert.equal(resolved.width, fixture.target.expectedRect.width);
    assert.equal(resolved.height, fixture.target.expectedRect.height);

    await fixture.adapter.unmount();
    assert.equal(fixture.adapter.resolveTarget(fixture.target.ref), null);
  });

  test(`${name}: applies a supplied seed to the mounted runtime`, async () => {
    const fixture = createFixture();
    fixture.reset();
    await fixture.adapter.mount(fixture.target.container, fixture.seed.seed);

    try {
      assert.deepEqual(await fixture.adapter.query(fixture.seed.selector), fixture.seed.expected);
      await fixture.seed.assertMountedPresentation?.();
    } finally {
      await fixture.adapter.unmount();
    }
  });

  test(`${name}: exposes canonical training events and supports unsubscribe`, async () => {
    const fixture = createFixture();
    fixture.reset();
    await fixture.adapter.mount(fixture.target.container);
    const received: TrainingEvent[] = [];
    const unsubscribe = fixture.adapter.subscribe((event) => received.push(event));

    try {
      fixture.event.emit();
      fixture.event.emit();
      assert.equal(received.length, 2);
      assert.equal(received[0]?.type, fixture.event.name);
      assert.equal(received[0]?.source, fixture.adapter.id);
      assert.ok(received[0]?.id);
      assert.ok(received[0]?.sessionId);
      assert.equal(received[0]?.sessionId, received[1]?.sessionId);
      assert.notEqual(received[0]?.id, received[1]?.id);
      assert.ok(Number.isFinite(Date.parse(received[0]?.timestamp ?? "")));

      unsubscribe();
      fixture.event.emit();
      assert.equal(received.length, 2);
    } finally {
      unsubscribe();
      await fixture.adapter.unmount();
    }
  });

  test(`${name}: answers state queries asynchronously`, async () => {
    const fixture = createFixture();
    fixture.reset();
    const pending = fixture.adapter.query(fixture.query.selector);
    assert.equal(typeof pending.then, "function");
    assert.deepEqual(await pending, fixture.query.expected);
  });

  test(`${name}: describes a unique semantic surface`, () => {
    const { adapter } = createFixture();
    const surface = adapter.describeSurface();
    const refs = surface.map((entry) => entry.ref);

    assert.ok(surface.length > 0);
    assert.equal(new Set(refs).size, refs.length);
    for (const entry of surface) {
      assert.ok(entry.ref.length > 0);
      assert.ok(entry.label.length > 0);
    }
  });

  test(`${name}: restores a previously captured snapshot into the mounted runtime`, async () => {
    const fixture = createFixture();
    fixture.reset();
    await fixture.adapter.mount(fixture.target.container);

    try {
      fixture.snapshot.prepare();
      const snapshot = await fixture.adapter.snapshot();

      fixture.snapshot.mutate();
      assert.notDeepEqual(
        await fixture.adapter.query(fixture.snapshot.selector),
        fixture.snapshot.expectedRestoredValue,
      );

      await fixture.adapter.restore(snapshot);
      assert.deepEqual(
        await fixture.adapter.query(fixture.snapshot.selector),
        fixture.snapshot.expectedRestoredValue,
      );
      await fixture.snapshot.assertRestoredPresentation?.();
    } finally {
      await fixture.adapter.unmount();
    }
  });
}
