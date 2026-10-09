import type { SurfaceGraph } from '@roomquest/schema';
import {
  BufferGeometry,
  CanvasTexture,
  Group,
  LineLoop,
  Sprite,
  SpriteMaterial,
  Vector3,
  type LineBasicMaterial,
} from '@iwsdk/core';

/**
 * One LineLoop per graph node (shared line material) plus a billboard label.
 * Debug-only (`?debug=1`); not used in the hot frame path after creation.
 */
export function createSurfaceDebugOverlay(
  graph: SurfaceGraph,
  lineMaterial: LineBasicMaterial
): Group {
  const root = new Group();
  root.name = 'surfaceDebug';

  for (const node of graph.nodes) {
    const y = graph.floorY + node.topHeight + 0.004;
    const hw = node.size[0] / 2;
    const hd = node.size[1] / 2;
    const cos = Math.cos(node.yaw);
    const sin = Math.sin(node.yaw);
    const cx = node.centroid[0];
    const cz = node.centroid[2];

    const corner = (lx: number, lz: number): Vector3 => {
      return new Vector3(cx + lx * cos - lz * sin, y, cz + lx * sin + lz * cos);
    };

    const points = [
      corner(-hw, -hd),
      corner(hw, -hd),
      corner(hw, hd),
      corner(-hw, hd),
    ];
    const loopGeo = new BufferGeometry().setFromPoints(points);
    const loop = new LineLoop(loopGeo, lineMaterial);
    loop.name = `outline-${node.id}`;
    loop.userData.surfaceId = node.id;
    root.add(loop);

    const label = makeLabelSprite(`${node.id} ${node.label}`);
    label.position.set(cx, y + 0.04, cz);
    label.name = `label-${node.id}`;
    root.add(label);
  }

  return root;
}

function makeLabelSprite(text: string): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(12, 20, 32, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#e8f4ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(0.22, 0.055, 1);
  sprite.userData.disposeLabel = () => {
    texture.dispose();
    material.dispose();
  };
  return sprite;
}

export function disposeSurfaceDebugOverlay(root: Group): void {
  root.traverse((obj) => {
    const disposeLabel = obj.userData.disposeLabel;
    if (typeof disposeLabel === 'function') {
      disposeLabel();
    }
    if (obj instanceof LineLoop) {
      obj.geometry.dispose();
    }
  });
  root.removeFromParent();
}
