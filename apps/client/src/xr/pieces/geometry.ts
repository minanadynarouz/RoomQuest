import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function paint(geo: BufferGeometry, color: Color): BufferGeometry {
  const dest = geo.index ? geo.toNonIndexed() : geo;
  if (dest !== geo) {
    geo.dispose();
  }
  dest.deleteAttribute('uv');
  dest.deleteAttribute('uv1');
  dest.deleteAttribute('uv2');
  dest.deleteAttribute('uv3');
  const position = dest.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  dest.setAttribute('color', new BufferAttribute(colors, 3));
  dest.computeVertexNormals();
  return dest;
}

export function sitOnGround(geo: BufferGeometry): BufferGeometry {
  geo.computeBoundingBox();
  const box = geo.boundingBox ?? new Box3();
  geo.translate(0, -box.min.y, 0);
  geo.computeBoundingBox();
  return geo;
}

/**
 * Merge painted parts into one BufferGeometry and free the inputs.
 * The result sits with its base at y = 0.
 */
export function mergePainted(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  merged.computeVertexNormals();
  return sitOnGround(merged);
}

export function box(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  color: Color
): BufferGeometry {
  const geo = new BoxGeometry(width, height, depth);
  geo.translate(x, y, z);
  return paint(geo, color);
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  x: number,
  y: number,
  z: number,
  color: Color,
  segments = 8
): BufferGeometry {
  const geo = new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  geo.translate(x, y, z);
  return paint(geo, color);
}

export function cone(
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
  color: Color,
  segments = 4
): BufferGeometry {
  const geo = new ConeGeometry(radius, height, segments);
  geo.translate(x, y, z);
  return paint(geo, color);
}

export function sphere(
  radius: number,
  x: number,
  y: number,
  z: number,
  color: Color,
  widthSegments = 8,
  heightSegments = 6
): BufferGeometry {
  const geo = new SphereGeometry(radius, widthSegments, heightSegments);
  geo.translate(x, y, z);
  return paint(geo, color);
}

export function octahedron(
  radius: number,
  x: number,
  y: number,
  z: number,
  color: Color
): BufferGeometry {
  const geo = new OctahedronGeometry(radius, 0);
  geo.translate(x, y, z);
  return paint(geo, color);
}

export function torus(
  radius: number,
  tube: number,
  x: number,
  y: number,
  z: number,
  color: Color,
  radial = 12,
  tubular = 8
): BufferGeometry {
  const geo = new TorusGeometry(radius, tube, tubular, radial);
  geo.translate(x, y, z);
  return paint(geo, color);
}

/** Documented axis-aligned footprint of a piece sitting at the origin. */
export interface PieceFootprint {
  width: number;
  depth: number;
  height: number;
}
