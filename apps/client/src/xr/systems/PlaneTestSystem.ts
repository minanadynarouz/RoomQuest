/**
 * Plane Test System for X-01 spike
 * Logs XRPlane and XRMesh entity counts and semantic labels
 * Places a test cube on the largest detected table
 */

import {
  createSystem,
  XRPlane,
  XRMesh,
  Transform,
  RayInteractable,
  PokeInteractable,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
} from '@iwsdk/core';

interface SurfaceInfo {
  entityId: number;
  label: string;
  area: number;
  topHeight: number;
  position: [number, number, number];
}

export class PlaneTestSystem extends createSystem(
  {
    planes: { required: [XRPlane, Transform] },
    meshes: { required: [XRMesh, Transform] },
  },
  {},
) {
  private hasLogged = false;
  private cubeSpawned = false;
  private framesSinceStart = 0;
  private readonly WAIT_FRAMES = 60; // ~1s at 60fps

  init() {
    console.log('[X-01 Spike] PlaneTestSystem initialized');
    console.log('[X-01 Spike] Waiting for planes and meshes to appear...');

    // Subscribe to new planes and meshes
    this.queries.planes.subscribe('qualify', (entity) => {
      const plane = entity.getValue(XRPlane, '_plane') as any;
      console.log('[X-01 Spike] New plane detected:', {
        orientation: plane?.orientation,
      });
    });

    this.queries.meshes.subscribe('qualify', (entity) => {
      const semanticLabel = entity.getValue(XRMesh, 'semanticLabel');
      const isBounded = entity.getValue(XRMesh, 'isBounded3D');
      console.log('[X-01 Spike] New mesh detected:', {
        semanticLabel,
        isBounded,
      });
    });
  }

  update(_delta: number, _time: number) {
    this.framesSinceStart++;

    // Debug log every 30 frames
    if (this.framesSinceStart % 30 === 0) {
      console.log(`[X-01 Spike] PlaneTestSystem update: frame ${this.framesSinceStart}, planes=${Array.from(this.queries.planes.entities).length}, meshes=${Array.from(this.queries.meshes.entities).length}`);
    }

    // Wait for surfaces to stabilize
    if (!this.hasLogged && this.framesSinceStart > this.WAIT_FRAMES) {
      this.logSurfaceCounts();
      this.hasLogged = true;
    }

    // Spawn cube after logging
    if (this.hasLogged && !this.cubeSpawned) {
      this.spawnTestCube();
      this.cubeSpawned = true;
    }
  }

  private logSurfaceCounts() {
    const planeEntities = Array.from(this.queries.planes.entities);
    const meshEntities = Array.from(this.queries.meshes.entities);
    const planeCount = planeEntities.length;
    const meshCount = meshEntities.length;

    console.log('='.repeat(60));
    console.log('[X-01 Spike] Surface Detection Results');
    console.log('='.repeat(60));
    console.log(`XRPlane entities: ${planeCount}`);
    console.log(`XRMesh entities: ${meshCount}`);
    console.log('');

    // Expose data to window for test script
    (window as any).__xr01PlaneCount = planeCount;
    (window as any).__xr01MeshCount = meshCount;
    (window as any).__xr01Planes = [];
    (window as any).__xr01Meshes = [];

    // Log all plane details
    if (planeCount > 0) {
      console.log('--- Planes ---');
      planeEntities.forEach((entity, idx) => {
        const plane = entity.getValue(XRPlane, '_plane') as any;
        const pos = entity.getVectorView(Transform, 'position');
        const orientation = plane?.orientation || 'unknown';
        const polygon = plane?.polygon;
        
        // Calculate approximate area from polygon
        let area = 0;
        if (polygon && polygon.length >= 3) {
          for (let i = 0; i < polygon.length; i++) {
            const p1 = polygon[i];
            const p2 = polygon[(i + 1) % polygon.length];
            area += (p1.x * p2.z - p2.x * p1.z) / 2;
          }
          area = Math.abs(area);
        }
        
        const planeInfo = {
          orientation,
          position: [
            pos?.[0]?.toFixed(2) || '0',
            pos?.[1]?.toFixed(2) || '0',
            pos?.[2]?.toFixed(2) || '0',
          ],
          area: area.toFixed(3),
        };
        
        console.log(`Plane ${idx + 1}:`, planeInfo);
        
        // Expose to window
        (window as any).__xr01Planes.push({
          label: 'PLANE',
          orientation: orientation.toUpperCase(),
          height: pos?.[1] ?? 0,
          area,
        });
      });
      console.log('');
    }

    // Log all mesh details with semantic labels
    if (meshCount > 0) {
      console.log('--- Meshes ---');
      const labelCounts: Record<string, number> = {};

      meshEntities.forEach((entity, idx) => {
        const label = entity.getValue(XRMesh, 'semanticLabel') || 'unknown';
        const isBounded = entity.getValue(XRMesh, 'isBounded3D');
        const dimensions = entity.getVectorView(XRMesh, 'dimensions');
        const pos = entity.getVectorView(Transform, 'position');

        labelCounts[label] = (labelCounts[label] || 0) + 1;

        const meshInfo = {
          label,
          isBounded,
          dimensions: dimensions
            ? [
                dimensions[0]?.toFixed(2) || '0',
                dimensions[1]?.toFixed(2) || '0',
                dimensions[2]?.toFixed(2) || '0',
              ]
            : ['0', '0', '0'],
          position: [
            pos?.[0]?.toFixed(2) || '0',
            pos?.[1]?.toFixed(2) || '0',
            pos?.[2]?.toFixed(2) || '0',
          ],
        };

        console.log(`Mesh ${idx + 1}:`, meshInfo);
        
        // Expose to window
        (window as any).__xr01Meshes.push({
          label: label.toUpperCase(),
          isBounded3D: isBounded,
          width: dimensions?.[0] ?? 0,
          height: dimensions?.[1] ?? 0,
          depth: dimensions?.[2] ?? 0,
        });
      });

      console.log('');
      console.log('--- Label Summary ---');
      Object.entries(labelCounts)
        .sort(([, a], [, b]) => b - a)
        .forEach(([label, count]) => {
          console.log(`${label}: ${count}`);
        });
    }

    console.log('='.repeat(60));
  }

  private spawnTestCube() {
    console.log('[X-01 Spike] Finding largest table...');

    // Find all table surfaces (both from planes and meshes)
    const tables: SurfaceInfo[] = [];
    const planeEntities = Array.from(this.queries.planes.entities);
    const meshEntities = Array.from(this.queries.meshes.entities);

    // Check horizontal planes (potential tables)
    planeEntities.forEach((entity) => {
      const plane = entity.getValue(XRPlane, '_plane') as any;
      if (plane?.orientation === 'horizontal') {
        const pos = entity.getVectorView(Transform, 'position');
        const y = pos?.[1] ?? 0;

        // Tables are typically 0.4-1.1m high (per design doc)
        if (y >= 0.4 && y <= 1.1) {
          // Estimate area from plane polygon if available
          // For now use a simple heuristic
          tables.push({
            entityId: 0,
            label: 'plane-horizontal',
            area: 1.0, // Placeholder
            topHeight: y,
            position: [pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0],
          });
        }
      }
    });

    // Check mesh entities labeled as 'table' or 'desk'
    meshEntities.forEach((entity) => {
      const label = entity.getValue(XRMesh, 'semanticLabel') || '';
      const isBounded = entity.getValue(XRMesh, 'isBounded3D');

      if (
        isBounded &&
        (label === 'table' || label === 'desk' || label === 'couch')
      ) {
        const dimensions = entity.getValue(XRMesh, 'dimensions');
        const pos = entity.getVectorView(Transform, 'position');

        if (dimensions && pos) {
          // Calculate approximate top surface area (width * depth)
          const area = (dimensions[0] ?? 0) * (dimensions[2] ?? 0);

          tables.push({
            entityId: 0,
            label,
            area,
            topHeight: (pos[1] ?? 0) + (dimensions[1] ?? 0) / 2, // Top of bounding box
            position: [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0],
          });
        }
      }
    });

    if (tables.length === 0) {
      console.warn('[X-01 Spike] No tables found! Placing cube at origin.');
      this.createCube([0, 1.0, 0]);
      return;
    }

    // Find the largest table
    tables.sort((a, b) => b.area - a.area);
    const largestTable = tables[0];

    if (!largestTable) {
      console.warn('[X-01 Spike] No valid table found! Placing cube at origin.');
      this.createCube([0, 1.0, 0]);
      return;
    }

    console.log('[X-01 Spike] Largest table found:', {
      label: largestTable.label,
      area: largestTable.area.toFixed(2),
      topHeight: largestTable.topHeight.toFixed(2),
    });

    // Place cube on top of the largest table (add 0.1m for the cube's half-height)
    const cubePosition: [number, number, number] = [
      largestTable.position[0],
      largestTable.topHeight + 0.1,
      largestTable.position[2],
    ];

    this.createCube(cubePosition);
  }

  private createCube(position: [number, number, number]) {
    console.log('[X-01 Spike] Creating test cube at:', position);

    // Create a bright cube that's easy to see
    const geometry = new BoxGeometry(0.2, 0.2, 0.2);
    const material = new MeshStandardMaterial({
      color: 0xff6b35, // Bright orange
      metalness: 0.2,
      roughness: 0.7,
    });

    const cubeMesh = new Mesh(geometry, material);
    const cubeEntity = this.world.createTransformEntity(cubeMesh);

    // Set position
    cubeEntity.setValue(Transform, 'position', position);

    // Make it interactive with both ray and poke
    cubeEntity.addComponent(RayInteractable);
    cubeEntity.addComponent(PokeInteractable);

    // Add pointer event handlers for testing
    (cubeMesh as any).onClick = () => {
      console.log('[X-01 Spike] Cube clicked (RAY+PINCH)!');
      (window as any).__xr01RayPinch = true;
      // Flash the cube color
      const mat = cubeMesh.material as MeshStandardMaterial;
      mat.color.setHex(0x00ff00);
      setTimeout(() => mat.color.setHex(0xff6b35), 200);
    };

    (cubeMesh as any).onPointerEnter = () => {
      console.log('[X-01 Spike] Cube pointer enter (POKE)');
      (window as any).__xr01Poke = true;
      const mat = cubeMesh.material as MeshStandardMaterial;
      mat.emissive.setHex(0x444444);
    };

    (cubeMesh as any).onPointerLeave = () => {
      console.log('[X-01 Spike] Cube pointer leave');
      const mat = cubeMesh.material as MeshStandardMaterial;
      mat.emissive.setHex(0x000000);
    };

    console.log('[X-01 Spike] Test cube spawned with ray and poke interaction');
    console.log(
      '[X-01 Spike] Try pointing at it (ray + pinch) or poking it with your finger!',
    );
  }
}
