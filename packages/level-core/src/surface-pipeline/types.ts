/**
 * Pure types for the surface pipeline
 * No IWSDK or DOM dependencies
 */

export type Orientation = 'horizontal' | 'vertical';

export interface PlaneDescriptor {
  type: 'plane';
  label: string;
  orientation: Orientation;
  pose: {
    position: [number, number, number];
    orientation: [number, number, number, number]; // quaternion
  };
  extents?: {
    width: number;
    height: number;
  };
  polygon?: [number, number, number][];
}

export interface MeshDescriptor {
  type: 'mesh';
  label: string;
  isBounded: boolean;
  pose: {
    position: [number, number, number];
    orientation: [number, number, number, number];
  };
  bounds?: {
    min: [number, number, number];
    max: [number, number, number];
  };
  polygon?: [number, number, number][];
}

export type SurfaceDescriptor = PlaneDescriptor | MeshDescriptor;
