'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

function Customer({ delay, side }: { delay: number; side: 1 | -1 }) {
  const bodyRef = useRef<THREE.Group>(null);
  const startX = side * 5;
  const startZ = (Math.random() - 0.5) * 3;

  useFrame((state) => {
    if (!bodyRef.current) return;
    const t = ((state.clock.elapsedTime + delay) % 8) / 8;
    const phase = t < 0.5 ? t * 2 : (1 - t) * 2;
    const x = startX * (1 - phase);
    const z = startZ * (1 - phase * 0.3);
    bodyRef.current.position.set(x, 0.4, z);
    bodyRef.current.rotation.y = side > 0 ? -Math.PI / 4 + phase * Math.PI / 2 : Math.PI / 4 - phase * Math.PI / 2;
    bodyRef.current.position.y = 0.4 + Math.sin(state.clock.elapsedTime * 6 + delay * 2) * 0.03;
  });

  const colors = ['#f97316', '#22c55e', '#3b82f6', '#ec4899', '#a855f7'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  return (
    <group ref={bodyRef}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 0.5, 6]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function SignBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureRef = useRef<THREE.CanvasTexture>(null);

  useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 128);

    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(0, 0, 512, 128);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, 10, 472, 108);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 52px "Inter", "Poppins", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Vyapar Sarthi', 256, 60);

    ctx.font = '16px "Inter", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Apni Dukan Ko Smart Banao', 256, 100);

    const texture = new THREE.CanvasTexture(canvas);
    textureRef.current = texture;
  }, []);

  if (!textureRef.current) return null;

  return (
    <mesh position={[0, 2.2, -1.52]}>
      <planeGeometry args={[3, 0.75]} />
      <meshStandardMaterial map={textureRef.current} emissive="#22c55e" emissiveIntensity={0.15} />
    </mesh>
  );
}

function ShopBuilding() {
  return (
    <group position={[0, 0, -2]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[3, 1, 0.3]} />
        <meshStandardMaterial color="#334155" />
      </mesh>

      <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.5, 0.15]} />
        <meshStandardMaterial color="#475569" />
      </mesh>

      <mesh position={[0, 0.5, 0.16]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.9, 0.02]} />
        <meshStandardMaterial color="#0f172a" emissive="#22c55e" emissiveIntensity={0.3} />
      </mesh>

      <mesh position={[-0.9, 0.85, 0.16]} castShadow receiveShadow>
        <boxGeometry args={[0.35, 0.25, 0.02]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.5} />
      </mesh>

      <mesh position={[0.9, 0.85, 0.16]} castShadow receiveShadow>
        <boxGeometry args={[0.35, 0.25, 0.02]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.5} />
      </mesh>

      <group position={[0, 0.28, 0.17]}>
        {[-0.25, 0, 0.25].map((x, i) => (
          <mesh key={i} position={[x, 0, 0]}>
            <boxGeometry args={[0.04, 0.3, 0.02]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#0f172a" />
    </mesh>
  );
}

export default function ShopScene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
      <pointLight position={[0, 1, -1.5]} intensity={0.3} color="#22c55e" />

      <Ground />
      <ShopBuilding />
      <SignBoard />

      {Array.from({ length: 6 }, (_, i) => (
        <Customer key={i} delay={i * 1.2} side={i % 2 === 0 ? 1 : -1} />
      ))}
    </>
  );
}
