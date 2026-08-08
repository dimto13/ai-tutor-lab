import assert from "node:assert/strict";
import { test } from "node:test";
import type { RuntimeAdapter } from "../../src/runtime/runtimeAdapter.ts";
import type { UiTargetRef, WorkspaceEvent, WorkspaceEventName } from "../../src/types/training.ts";

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

interface SnapshotFixture {
  selector: string;
  expectedRestoredValue: unknown;
  prepare(): void;
  mutate(): void;
}

export interface RuntimeAdapterContractFixture {
  adapter: RuntimeAdapter;
  reset(): void;
  target: TargetFixture;
  event: EventFixture;
  query: QueryFixture;
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

  test(`${name}: exposes events through subscribe and supports unsubscribe`, () => {
    const fixture = createFixture();
    fixture.reset();
    const received: WorkspaceEvent[] = [];
    const unsubscribe = fixture.adapter.subscribe((event) => received.push(event));

    fixture.event.emit();
    assert.equal(received.length, 1);
    assert.equal(received[0]?.name, fixture.event.name);

    unsubscribe();
    fixture.event.emit();
    assert.equal(received.length, 1);
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

  test(`${name}: restores a previously captured snapshot`, async () => {
    const fixture = createFixture();
    fixture.reset();
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
  });
}
