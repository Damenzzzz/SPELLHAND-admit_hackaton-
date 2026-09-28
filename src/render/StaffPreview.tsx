import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { ASSETS } from '../game/data/assets';

function Spinning({ id }: { id: string }) {
  const { scene } = useGLTF(ASSETS.staffModel(id), false, true);
  const object = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.9;
  });
  return (
    <group ref={ref} position={[0, -0.12, 0]}>
      <primitive object={object} />
    </group>
  );
}

/** Вращающаяся 3D-модель посоха (магазин). */
export default function StaffPreview({ id }: { id: string }) {
  return (
    <Canvas camera={{ position: [0, 0.1, 1.6], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
      <ambientLight intensity={1} />
      <directionalLight position={[2, 3, 4]} intensity={2.4} />
      <directionalLight position={[-3, -1, 2]} intensity={0.6} color="#8fb8ff" />
      <Suspense fallback={null}>
        <Spinning key={id} id={id} />
      </Suspense>
    </Canvas>
  );
}
