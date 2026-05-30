'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Mesh } from 'three';

export default function GradientOrb() {
  const meshRef = useRef<Mesh>(null!);
  const outerRef = useRef<Mesh>(null!);
  const innerRef = useRef<Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 0.8) * 0.04;
    if (meshRef.current) {
      meshRef.current.scale.setScalar(pulse);
    }
    if (outerRef.current) {
      outerRef.current.rotation.x = Math.sin(t * 0.15) * 0.3;
      outerRef.current.rotation.y = t * 0.1;
    }
    if (innerRef.current) {
      innerRef.current.scale.setScalar(1 + Math.sin(t * 1.2 + 1) * 0.1);
    }
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.2, 64, 64]} />
        <shaderMaterial
          transparent
          uniforms={{
            uColor1: { value: new THREE.Color('#818cf8') },
            uColor2: { value: new THREE.Color('#1e1b4b') },
          }}
          vertexShader={`
            varying vec3 vPosition;
            void main() {
              vPosition = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            varying vec3 vPosition;
            void main() {
              float dist = length(vPosition) / 1.2;
              vec3 color = mix(uColor1, uColor2, dist);
              gl_FragColor = vec4(color, 1.0);
            }
          `}
        />
      </mesh>

      <mesh ref={innerRef}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshBasicMaterial color="#a5b4fc" transparent opacity={0.6} />
      </mesh>

      <mesh ref={outerRef}>
        <ringGeometry args={[1.6, 2.4, 64]} />
        <meshBasicMaterial
          color="#6366f1"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <mesh>
        <ringGeometry args={[1.8, 2.6, 64]} />
        <meshBasicMaterial
          color="#818cf8"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
