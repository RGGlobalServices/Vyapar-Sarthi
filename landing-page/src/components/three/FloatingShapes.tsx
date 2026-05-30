'use client';
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

type ShapeType = 'icosahedron' | 'torusKnot' | 'octahedron' | 'dodecahedron';

interface FloatingShapesProps {
  position: [number, number, number];
  shape: ShapeType;
  color: string;
  size: number;
  speed: number;
}

export default function FloatingShapes({ position, shape, color, size, speed }: FloatingShapesProps) {
  const meshRef = useRef<Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime * speed;
    meshRef.current.rotation.x += 0.008 * speed;
    meshRef.current.rotation.y += 0.012 * speed;
    meshRef.current.position.y = position[1] + Math.sin(t) * 0.3;

    const target = hovered ? size * 1.2 : size;
    meshRef.current.scale.x += (target - meshRef.current.scale.x) * 0.06;
    meshRef.current.scale.y = meshRef.current.scale.x;
    meshRef.current.scale.z = meshRef.current.scale.x;
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {shape === 'icosahedron' && <icosahedronGeometry args={[1, 0]} />}
      {shape === 'torusKnot' && <torusKnotGeometry args={[0.8, 0.3, 64, 8]} />}
      {shape === 'octahedron' && <octahedronGeometry args={[1, 0]} />}
      {shape === 'dodecahedron' && <dodecahedronGeometry args={[1, 0]} />}
      <meshStandardMaterial
        wireframe
        color={color}
        emissive={color}
        emissiveIntensity={hovered ? 1.0 : 0.5}
      />
    </mesh>
  );
}
