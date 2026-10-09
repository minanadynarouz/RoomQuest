/**
 * Three.js `traverse` visits hidden parents' children, and X-10's
 * `countDrawCalls` only checks each mesh's own `.visible`. Toggling a HUD
 * panel root therefore leaves UIKit Text/Button/Divider meshes counted.
 * Flip the whole subtree so inactive panels drop out of the draw budget.
 *
 * Does not create materials or meshes.
 */
export interface VisibleNode {
  visible: boolean;
  traverse: (cb: (child: VisibleNode) => void) => void;
}

export function setObjectTreeVisible(
  object: VisibleNode,
  visible: boolean
): void {
  object.traverse((child) => {
    child.visible = visible;
  });
}
