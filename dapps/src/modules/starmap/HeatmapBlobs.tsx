/**
 * GPU-rendered heatmap blobs using InstancedMesh.
 * Camera-facing billboards with soft gaussian texture + additive blending.
 * Overlapping blobs merge naturally into nebulae.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HeatmapBlobData } from "./helpers/violence-score";

const MAX_INSTANCES = 500;

// Reusable temporaries (avoid GC pressure in render loop)
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

/** Create a soft gaussian blob texture. */
function createBlobTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255,255,255,0.6)");
  gradient.addColorStop(0.15, "rgba(255,255,255,0.4)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.15)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.04)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

interface Props {
  blobs: HeatmapBlobData[];
}

export function HeatmapBlobs({ blobs }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const blobTexture = useMemo(() => createBlobTexture(), []);

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: blobTexture,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    [blobTexture],
  );

  // Billboard all instances to face camera each frame
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const count = Math.min(blobs.length, MAX_INSTANCES);
    mesh.count = count;

    if (count === 0) return;

    camera.getWorldQuaternion(_quat);

    for (let i = 0; i < count; i++) {
      const blob = blobs[i];

      // Scale by radius
      _scale.set(blob.radius, blob.radius, blob.radius);

      // Compose transform: position + camera rotation + scale
      _matrix.compose(blob.position, _quat, _scale);
      mesh.setMatrixAt(i, _matrix);

      // Bake opacity into color intensity (instanceColor is RGB only)
      _color.copy(blob.color).multiplyScalar(blob.opacity);
      mesh.setColorAt(i, _color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      frustumCulled={false}
    />
  );
}
