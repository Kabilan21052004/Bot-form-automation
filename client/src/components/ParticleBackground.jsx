import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const Particles = ({ count = 4000 }) => {
    const mesh = useRef();
    const mouse = useRef({ x: 0, y: 0 });

    // Store original positions for reference
    const { positions, colors, initialPositions } = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const cols = new Float32Array(count * 3);
        const initPos = new Float32Array(count * 3);
        const color1 = new THREE.Color('#00f2ff'); // Neon Cyan
        const color2 = new THREE.Color('#7000ff'); // Deep Purple

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 12;
            const y = (Math.random() - 0.5) * 12;
            const z = (Math.random() - 0.5) * 8;

            pos[i * 3] = initPos[i * 3] = x;
            pos[i * 3 + 1] = initPos[i * 3 + 1] = y;
            pos[i * 3 + 2] = initPos[i * 3 + 2] = z;

            const mixedColor = color1.clone().lerp(color2, Math.random());
            cols[i * 3] = mixedColor.r;
            cols[i * 3 + 1] = mixedColor.g;
            cols[i * 3 + 2] = mixedColor.b;
        }
        return { positions: pos, colors: cols, initialPositions: initPos };
    }, [count]);

    useEffect(() => {
        const handleMouseMove = (event) => {
            // Normalize mouse to -1 to 1
            mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useFrame((state) => {
        const { clock, viewport } = state;
        const time = clock.getElapsedTime();

        // Project mouse to 3D space
        const mx = (mouse.current.x * viewport.width) / 2;
        const my = (mouse.current.y * viewport.height) / 2;

        const posAttr = mesh.current.geometry.attributes.position;

        for (let i = 0; i < count; i++) {
            const ix = initialPositions[i * 3];
            const iy = initialPositions[i * 3 + 1];
            const iz = initialPositions[i * 3 + 2];

            // Current position
            let cx = posAttr.array[i * 3];
            let cy = posAttr.array[i * 3 + 1];

            // Distance from mouse
            const dx = mx - cx;
            const dy = my - cy;
            const distSq = dx * dx + dy * dy;
            const radius = 2.5;
            const radiusSq = radius * radius;

            if (distSq < radiusSq) {
                const dist = Math.sqrt(distSq);
                const force = (radius - dist) / radius;
                // Push particles AWAY from mouse
                cx -= dx * force * 0.4;
                cy -= dy * force * 0.4;
            }

            // Return to home position with simple lerp
            posAttr.array[i * 3] += (ix - cx) * 0.08;
            posAttr.array[i * 3 + 1] += (iy - cy) * 0.08;

            // Constant drift
            posAttr.array[i * 3 + 2] = iz + Math.sin(time * 0.5 + ix) * 0.3;
        }

        posAttr.needsUpdate = true;
        // Rotate the whole mesh subtly based on mouse
        mesh.current.rotation.y = THREE.MathUtils.lerp(mesh.current.rotation.y, mouse.current.x * 0.2, 0.05);
        mesh.current.rotation.x = THREE.MathUtils.lerp(mesh.current.rotation.x, -mouse.current.y * 0.2, 0.05);
    });

    return (
        <points ref={mesh}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={positions}
                    itemSize={3}
                />
                <bufferAttribute
                    attach="attributes-color"
                    count={count}
                    array={colors}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.035}
                vertexColors
                transparent
                opacity={0.7}
                sizeAttenuation
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
};

const ParticleBackground = () => {
    return (
        <div className="fixed inset-0 z-0 pointer-events-none">
            <Canvas
                camera={{ position: [0, 0, 6], fov: 60 }}
                gl={{ antialias: false, powerPreference: "high-performance" }}
            >
                <color attach="background" args={['#030712']} />
                <Particles />
            </Canvas>
        </div>
    );
};

export default ParticleBackground;
