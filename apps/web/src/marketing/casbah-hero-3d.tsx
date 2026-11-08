"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  CatmullRomCurve3,
  Color,
  Object3D,
  TubeGeometry,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
} from "three";
import { buildCasbahScene, sceneTime, type CasbahScene } from "./casbah-scene";
import { heroPalette } from "./hero-palette";

// DESIGN §8.1 live hero. Loaded only after LCP and only on capable devices (see casbah-hero.tsx).

type HeroPalette = typeof heroPalette;

export type CasbahHero3dProps = {
  seed: number;
  scroll: number;
  pointer: { x: number; y: number };
  dpr: number;
  hasShadows: boolean;
  isRunning: boolean;
  onHomeSelect: () => void;
};

const parallaxRadians = (3 * Math.PI) / 180;
const trailSeconds = 4;

function Houses({
  scene,
  palette,
  litShare,
}: {
  scene: CasbahScene;
  palette: HeroPalette;
  litShare: number;
}) {
  const walls = useRef<InstancedMesh>(null);
  const windows = useRef<InstancedMesh>(null);
  const count = scene.houses.length;

  useLayoutEffect(() => {
    const mesh = walls.current;
    if (mesh === null) return;
    const dummy = new Object3D();
    const base = new Color(palette.wall);
    const shade = new Color(palette.shade);
    scene.houses.forEach((house, index) => {
      dummy.position.set(house.x, house.y + house.height / 2, house.z);
      dummy.rotation.set(0, house.rotation, 0);
      dummy.scale.set(house.width, house.height, house.depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      // Fake ambient occlusion: lower tones read as shaded bases.
      mesh.setColorAt(index, shade.clone().lerp(base, house.tone));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  }, [scene, palette]);

  useLayoutEffect(() => {
    const mesh = windows.current;
    if (mesh === null) return;
    const dummy = new Object3D();
    scene.houses.forEach((house, index) => {
      const isLit = house.lightAt < litShare;
      dummy.position.set(house.x, house.y + house.height * 0.55, house.z - house.depth / 2 - 0.01);
      dummy.rotation.set(0, house.rotation, 0);
      dummy.scale.setScalar(isLit ? 0.22 : 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [scene, litShare]);

  return (
    <>
      <instancedMesh ref={walls} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={windows} args={[undefined, undefined, count]}>
        <planeGeometry />
        <meshBasicMaterial color={palette.saffron} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

function Trail({ scene, palette }: { scene: CasbahScene; palette: HeroPalette }) {
  const tube = useRef<Mesh>(null);
  const geometry = useMemo(() => {
    const curve = new CatmullRomCurve3(
      scene.trail.map((point) => new Vector3(point.x, point.y + 0.6, point.z)),
    );
    return new TubeGeometry(curve, 120, 0.12, 8, false);
  }, [scene]);
  const indexCount = geometry.index?.count ?? 0;

  useFrame(({ clock }) => {
    // The saffron light travels kitchen → home, then rests a beat before the next delivery.
    const progress = Math.min(1, (clock.elapsedTime % (trailSeconds + 1)) / trailSeconds);
    tube.current?.geometry.setDrawRange(0, Math.floor((indexCount * progress) / 6) * 6);
  });

  return (
    <mesh ref={tube} geometry={geometry}>
      <meshBasicMaterial color={palette.saffron} toneMapped={false} />
    </mesh>
  );
}

function Landmarks({
  scene,
  palette,
  onHomeSelect,
}: {
  scene: CasbahScene;
  palette: HeroPalette;
  onHomeSelect: () => void;
}) {
  const { tower, home } = scene;
  return (
    <>
      {scene.domes.map((dome, index) => (
        <mesh key={index} position={[dome.x, dome.y, dome.z]} castShadow>
          <sphereGeometry args={[dome.radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={palette.wall} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[tower.x, tower.y + tower.height / 2, tower.z]} castShadow>
        <cylinderGeometry args={[tower.radius * 0.8, tower.radius, tower.height, 12]} />
        <meshStandardMaterial color={palette.roof} roughness={0.85} />
      </mesh>
      <mesh position={[home.x, home.y + 1.4, home.z]} onClick={onHomeSelect}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshBasicMaterial color={palette.saffron} toneMapped={false} />
      </mesh>
    </>
  );
}

function World(input: Omit<CasbahHero3dProps, "dpr" | "isRunning">) {
  const props = { ...input, palette: heroPalette };
  const scene = useMemo(() => buildCasbahScene(props.seed), [props.seed]);
  const rig = useRef<Group>(null);
  const { dusk, litShare } = sceneTime(props.scroll);
  const sky = useMemo(
    () => new Color(props.palette.goldenSky).lerp(new Color(props.palette.nightSky), dusk),
    [props.palette, dusk],
  );

  useFrame(({ clock }) => {
    const group = rig.current;
    if (group === null) return;
    // Pointer parallax (±3°) plus a slow idle drift.
    const drift = Math.sin(clock.elapsedTime * 0.1) * parallaxRadians * 0.3;
    group.rotation.y += (props.pointer.x * parallaxRadians + drift - group.rotation.y) * 0.05;
    group.rotation.x += (props.pointer.y * parallaxRadians * 0.5 - group.rotation.x) * 0.05;
  });

  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 55, 140]} />
      <hemisphereLight args={[props.palette.goldenSky, props.palette.sea, 1.1 - dusk * 0.6]} />
      <directionalLight
        position={[-40, 22 - dusk * 16, -30]}
        color={props.palette.saffron}
        intensity={2.6 - dusk * 1.9}
        castShadow={props.hasShadows}
        shadow-mapSize={[1024, 1024]}
      />
      <group ref={rig}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -20]} receiveShadow>
          <planeGeometry args={[400, 60]} />
          <meshStandardMaterial
            color={props.palette.sea}
            emissive={props.palette.sea}
            emissiveIntensity={0.45}
            roughness={0.35}
            metalness={0.15}
          />
        </mesh>
        <Houses scene={scene} palette={props.palette} litShare={litShare} />
        <Landmarks scene={scene} palette={props.palette} onHomeSelect={props.onHomeSelect} />
        <Trail scene={scene} palette={props.palette} />
      </group>
    </>
  );
}

export default function CasbahHero3d(props: CasbahHero3dProps) {
  const { dpr, isRunning, ...world } = props;
  return (
    <div className="casbah-canvas" aria-hidden="true">
      <Canvas
        dpr={dpr}
        shadows={props.hasShadows}
        frameloop={isRunning ? "always" : "never"}
        camera={{ position: [0, 16, -26], fov: 40, near: 0.5, far: 200 }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 6, 14);
        }}
      >
        <World {...world} />
      </Canvas>
    </div>
  );
}
