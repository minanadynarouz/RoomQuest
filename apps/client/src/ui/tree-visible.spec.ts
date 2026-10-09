import { describe, expect, it } from 'vitest';
import { setObjectTreeVisible, type VisibleNode } from './tree-visible.js';

function node(visible: boolean, children: VisibleNode[] = []): VisibleNode {
  const self: VisibleNode = {
    visible,
    traverse(cb) {
      cb(self);
      for (const child of children) child.traverse(cb);
    },
  };
  return self;
}

describe('setObjectTreeVisible', () => {
  it('hides the root and every descendant', () => {
    const leaf = node(true);
    const child = node(true, [leaf]);
    const root = node(true, [child]);
    setObjectTreeVisible(root, false);
    expect(root.visible).toBe(false);
    expect(child.visible).toBe(false);
    expect(leaf.visible).toBe(false);
  });

  it('shows the whole tree again without allocating nodes', () => {
    const leaf = node(false);
    const root = node(false, [leaf]);
    setObjectTreeVisible(root, true);
    expect(root.visible).toBe(true);
    expect(leaf.visible).toBe(true);
  });
});
