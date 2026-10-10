import {
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Object3D,
} from '@iwsdk/core';
import type { SurfaceGraph, SurfaceNode } from '@roomquest/schema';

export const ROOM_READING_HIGHLIGHT_NAME = 'room-reading-highlight';

/** Cream rim from the art direction — small highlight only. */
export const ROOM_READING_HIGHLIGHT_COLOR = 0xfff1d6;

const LIFT_M = 0.008;
const BASE_OPACITY = 0.42;

/**
 * One plane overlay + one shared material. Repositioned onto the active
 * surface so the sweep is a single draw call while visible, zero when hidden.
 */
export interface RoomReadingHighlight {
  object: Object3D;
  mesh: Mesh;
  material: MeshBasicMaterial;
  apply: (graph: SurfaceGraph, node: SurfaceNode, intensity: number) => void;
  hide: () => void;
  dispose: () => void;
}

export function createRoomReadingHighlight(): RoomReadingHighlight {
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    color: ROOM_READING_HIGHLIGHT_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  material.name = 'rq-room-reading-highlight';
  const mesh = new Mesh(geometry, material);
  mesh.name = ROOM_READING_HIGHLIGHT_NAME;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return {
    object: mesh,
    mesh,
    material,
    apply(graph, node, intensity) {
      if (intensity <= 0) {
        mesh.visible = false;
        material.opacity = 0;
        return;
      }
      mesh.visible = true;
      mesh.position.set(
        node.centroid[0],
        graph.floorY + node.topHeight + LIFT_M,
        node.centroid[2]
      );
      mesh.rotation.set(0, node.yaw, 0);
      mesh.scale.set(node.size[0], 1, node.size[1]);
      material.opacity = BASE_OPACITY * intensity;
    },
    hide() {
      mesh.visible = false;
      material.opacity = 0;
    },
    dispose() {
      mesh.visible = false;
      geometry.dispose();
      material.dispose();
    },
  };
}
