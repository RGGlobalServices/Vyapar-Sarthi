'use client';
import { Canvas } from '@react-three/fiber';
import ShopScene from './ShopScene';

export default function Scene() {
  return (
    <Canvas camera={{ position: [0, 1.2, 5], fov: 55 }} shadows>
      <ShopScene />
    </Canvas>
  );
}
