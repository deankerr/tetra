import { Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { AdditiveBlending, BackSide, DoubleSide, TetrahedronGeometry, Vector3 } from 'three'

import { LogoExplorationNav } from '@/components/logo-exploration-nav'

export const Route = createFileRoute('/tetra-3d')({
  component: Tetra3DRoute,
  head: () => ({
    meta: [
      {
        title: 'Tetra 3D Forms',
      },
    ],
  }),
})

const forms = [
  {
    description:
      'The second-page hero translated into 3D: one simple glass body with visible internal cuts.',
    key: 'glass',
    label: 'Glass',
  },
  {
    description:
      'A logo-ready wire construction with enough glass fill to keep it from feeling skeletal.',
    key: 'wire',
    label: 'Wire',
  },
  {
    description:
      'A fixed split-facet version for loading states and assembly animations without random drift.',
    key: 'split',
    label: 'Split',
  },
  {
    description:
      'A prism-instrument reading: contained light planes inside the tetrahedron, not beams everywhere.',
    key: 'prism',
    label: 'Prism',
  },
] as const

const palettes = [
  {
    accent: '#bef264',
    background: '#060807',
    base: '#d9f99d',
    glow: '#84cc16',
    key: 'terminal',
    label: 'Terminal',
    secondary: '#22d3ee',
  },
  {
    accent: '#f0abfc',
    background: '#090607',
    base: '#fb7185',
    glow: '#e879f9',
    key: 'editorial',
    label: 'Editorial',
    secondary: '#fde68a',
  },
  {
    accent: '#67e8f9',
    background: '#05070a',
    base: '#7dd3fc',
    glow: '#06b6d4',
    key: 'cyan',
    label: 'Cyan Glass',
    secondary: '#a78bfa',
  },
  {
    accent: '#f8fafc',
    background: '#050505',
    base: '#e5e7eb',
    glow: '#94a3b8',
    key: 'mono',
    label: 'Mono',
    secondary: '#64748b',
  },
  {
    accent: '#facc15',
    background: '#080704',
    base: '#fde68a',
    glow: '#f59e0b',
    key: 'amber',
    label: 'Amber',
    secondary: '#fb7185',
  },
] as const

const materials = [
  { key: 'clear', label: 'Clear' },
  { key: 'frost', label: 'Frost' },
  { key: 'solid', label: 'Solid' },
] as const

const motions = [
  { key: 'fixed', label: 'Fixed' },
  { key: 'gentle', label: 'Gentle' },
] as const

type FormKey = (typeof forms)[number]['key']
type MaterialKey = (typeof materials)[number]['key']
type MotionKey = (typeof motions)[number]['key']
type Palette = (typeof palettes)[number]
type PaletteKey = Palette['key']

function Tetra3DRoute() {
  const [formKey, setFormKey] = useState<FormKey>('glass')
  const [paletteKey, setPaletteKey] = useState<PaletteKey>('terminal')
  const [materialKey, setMaterialKey] = useState<MaterialKey>('clear')
  const [motionKey, setMotionKey] = useState<MotionKey>('gentle')

  const form = forms.find((candidate) => candidate.key === formKey) ?? forms[0]
  const palette = palettes.find((candidate) => candidate.key === paletteKey) ?? palettes[0]

  return (
    <main className="tetra3d min-h-svh overflow-hidden text-white">
      <Tetra3DStyles />

      {/* The canvas is fixed-camera and logo-first; interaction is optional, not orbital. */}
      <section className="tetra3d__stage" style={{ background: palette.background }}>
        <Canvas
          camera={{ fov: 34, position: [4.8, 3.2, 7.4] }}
          className="tetra3d__canvas"
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        >
          <color args={[palette.background]} attach="background" />
          <fog args={[palette.background, 8, 16]} attach="fog" />
          <SceneLights palette={palette} />
          <TetraLogo form={formKey} material={materialKey} motion={motionKey} palette={palette} />
          <OrbitControls
            enableDamping
            enablePan={false}
            enableZoom={false}
            maxPolarAngle={Math.PI * 0.72}
            minPolarAngle={Math.PI * 0.28}
          />
        </Canvas>

        <div className="tetra3d__grain" />
        <div className="tetra3d__hud">
          <div className="tetra3d__nav">
            <LogoExplorationNav active="three" />
          </div>

          <div className="tetra3d__hero-copy">
            <span>3D tetrahedron logo studio</span>
            <h1>TETRA</h1>
            <p>{form.description}</p>
          </div>

          <div className="tetra3d__panel">
            <ControlGroup
              active={formKey}
              label="Form"
              options={forms}
              onSelect={(key) => {
                setFormKey(key)
              }}
            />
            <ControlGroup
              active={paletteKey}
              label="Palette"
              options={palettes}
              onSelect={(key) => {
                setPaletteKey(key)
              }}
            />
            <ControlGroup
              active={materialKey}
              label="Material"
              options={materials}
              onSelect={(key) => {
                setMaterialKey(key)
              }}
            />
            <ControlGroup
              active={motionKey}
              label="Motion"
              options={motions}
              onSelect={(key) => {
                setMotionKey(key)
              }}
            />
          </div>
        </div>
      </section>

      {/* Permutation cards show how the same form language survives as flat logo silhouettes. */}
      <section className="tetra3d__specimens">
        {palettes.map((specimenPalette) => (
          <article className="tetra3d-card" key={specimenPalette.key}>
            <MiniTetra form={formKey} palette={specimenPalette} />
            <div>
              <span>{specimenPalette.key}</span>
              <h2>{specimenPalette.label}</h2>
              <p>
                {form.label} form with {specimenPalette.label.toLowerCase()} color.
              </p>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

function ControlGroup<T extends string>({
  active,
  label,
  onSelect,
  options,
}: {
  active: T
  label: string
  onSelect: (key: T) => void
  options: readonly { key: T; label: string }[]
}) {
  return (
    <div className="tetra3d-control-group">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            className={option.key === active ? 'is-active' : undefined}
            key={option.key}
            onClick={() => {
              onSelect(option.key)
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SceneLights({ palette }: { palette: Palette }) {
  return (
    <>
      <ambientLight intensity={0.48} />
      <directionalLight color="#ffffff" intensity={2.6} position={[4, 6, 4]} />
      <pointLight color={palette.glow} intensity={13} position={[-3.2, 1.4, 2.8]} />
      <pointLight color={palette.secondary} intensity={8} position={[3.2, -1, 2.2]} />
      <spotLight
        angle={0.42}
        color={palette.accent}
        intensity={24}
        penumbra={0.72}
        position={[0, 5.8, 2.4]}
      />
    </>
  )
}

function TetraLogo({
  form,
  material,
  motion,
  palette,
}: {
  form: FormKey
  material: MaterialKey
  motion: MotionKey
  palette: Palette
}) {
  const groupRef = useRef<Group>(null)
  const { size } = useThree()
  const isNarrow = size.width < 700
  const logoPosition: [number, number, number] = isNarrow ? [0.56, -0.82, 0] : [1.85, 0.02, 0]
  const logoScale = isNarrow ? 0.52 : 1

  useFrame(({ clock }) => {
    if (groupRef.current === null) {
      return
    }

    // Keep motion gentle: the object breathes in place instead of orbiting the camera.
    const drift = motion === 'gentle' ? Math.sin(clock.elapsedTime * 0.36) : 0
    groupRef.current.rotation.x = -0.24 + drift * 0.055
    groupRef.current.rotation.y = 0.38 + drift * 0.11
  })

  return (
    <group position={logoPosition} ref={groupRef} scale={logoScale}>
      <AxisLines palette={palette} />
      <GlassBody material={material} palette={palette} />
      <InternalCuts form={form} palette={palette} />
      {form === 'wire' ? <WireOverlay palette={palette} /> : null}
      {form === 'split' ? <SplitFacetSet palette={palette} /> : null}
      {form === 'prism' ? <PrismPlanes palette={palette} /> : null}
    </group>
  )
}

function GlassBody({ material, palette }: { material: MaterialKey; palette: Palette }) {
  const materialSettings = {
    clear: { opacity: 0.62, roughness: 0.05, wireOpacity: 0.16 },
    frost: { opacity: 0.76, roughness: 0.42, wireOpacity: 0.12 },
    solid: { opacity: 0.94, roughness: 0.18, wireOpacity: 0.08 },
  }[material]

  return (
    <>
      <mesh geometry={useTetraGeometry(1.68)}>
        <meshPhysicalMaterial
          clearcoat={1}
          color={palette.base}
          emissive={palette.glow}
          emissiveIntensity={0.08}
          metalness={0.02}
          opacity={materialSettings.opacity}
          reflectivity={0.86}
          roughness={materialSettings.roughness}
          transparent={material !== 'solid'}
        />
      </mesh>
      <mesh geometry={useTetraGeometry(1.72)}>
        <meshBasicMaterial
          color={palette.accent}
          opacity={materialSettings.wireOpacity}
          side={BackSide}
          transparent
          wireframe
        />
      </mesh>
    </>
  )
}

function InternalCuts({ form, palette }: { form: FormKey; palette: Palette }) {
  if (form === 'wire') {
    return null
  }

  return (
    <group>
      <mesh position={[0.08, 0.02, 0.04]} rotation={[0.68, 0.14, -0.1]}>
        <circleGeometry args={[1.05, 3]} />
        <meshBasicMaterial color="#ffffff" opacity={0.18} side={DoubleSide} transparent />
      </mesh>
      <mesh position={[-0.08, -0.16, 0.1]} rotation={[-0.55, 0.86, 0.2]}>
        <circleGeometry args={[0.86, 3]} />
        <meshBasicMaterial color={palette.secondary} opacity={0.16} side={DoubleSide} transparent />
      </mesh>
    </group>
  )
}

function WireOverlay({ palette }: { palette: Palette }) {
  const vertices = useTetraVertices(1.54)
  const edges = tetraEdges

  return (
    <group>
      {edges.map(([start, end]) => (
        <Line
          color={palette.accent}
          key={`${start}-${end}`}
          lineWidth={2.2}
          opacity={0.92}
          points={[vertices[start], vertices[end]]}
          transparent
        />
      ))}
      {vertices.map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[0.04, 20, 20]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  )
}

function SplitFacetSet({ palette }: { palette: Palette }) {
  const facets = [
    { color: palette.accent, position: [0, 0.28, 0.18], rotation: [0.74, 0, 0] },
    { color: palette.base, position: [-0.26, -0.2, 0.1], rotation: [-0.38, 0.92, -0.34] },
    { color: palette.secondary, position: [0.26, -0.2, 0.1], rotation: [-0.38, -0.92, 0.34] },
  ] as const

  return (
    <group>
      {facets.map((facet) => (
        <mesh key={facet.color} position={facet.position} rotation={facet.rotation}>
          <circleGeometry args={[0.78, 3]} />
          <meshPhysicalMaterial
            clearcoat={1}
            color={facet.color}
            opacity={0.52}
            roughness={0.18}
            side={DoubleSide}
            transparent
          />
        </mesh>
      ))}
    </group>
  )
}

function PrismPlanes({ palette }: { palette: Palette }) {
  return (
    <group>
      <mesh position={[0.06, 0.08, 0.1]} rotation={[0.2, -0.64, 0.16]}>
        <boxGeometry args={[1.6, 0.035, 0.34]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={palette.accent}
          opacity={0.5}
          transparent
        />
      </mesh>
      <mesh position={[0.12, -0.08, 0.08]} rotation={[-0.28, 0.7, -0.28]}>
        <boxGeometry args={[1.45, 0.03, 0.32]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={palette.secondary}
          opacity={0.36}
          transparent
        />
      </mesh>
    </group>
  )
}

const tetraEdges = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
] as const

function AxisLines({ palette }: { palette: Palette }) {
  const lines = useMemo(
    () => [
      [new Vector3(-2.5, 0, 0), new Vector3(2.5, 0, 0)],
      [new Vector3(0, -2.1, 0), new Vector3(0, 2.1, 0)],
      [new Vector3(0, 0, -2.4), new Vector3(0, 0, 2.4)],
    ],
    [],
  )

  return (
    <group rotation={[0.24, -0.48, 0.18]}>
      {lines.map((points, index) => (
        <Line
          color={index === 2 ? palette.accent : '#ffffff'}
          key={index}
          lineWidth={1}
          opacity={0.12}
          points={points}
          transparent
        />
      ))}
    </group>
  )
}

function useTetraGeometry(radius: number) {
  return useMemo(() => new TetrahedronGeometry(radius, 0), [radius])
}

function useTetraVertices(radius: number): [Vector3, Vector3, Vector3, Vector3] {
  return useMemo(
    () => [
      new Vector3(1, 1, 1).multiplyScalar(radius),
      new Vector3(-1, -1, 1).multiplyScalar(radius),
      new Vector3(-1, 1, -1).multiplyScalar(radius),
      new Vector3(1, -1, -1).multiplyScalar(radius),
    ],
    [radius],
  )
}

function MiniTetra({ form, palette }: { form: FormKey; palette: Palette }) {
  return (
    <svg
      className={`mini-tetra mini-tetra--${form}`}
      viewBox="0 0 180 150"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Flat echoes help compare the current 3D form as a logo silhouette. */}
      <path className="mini-tetra__ray" d="M4 82 L176 54" style={{ stroke: palette.accent }} />
      <polygon
        className="mini-tetra__left"
        points="90,10 26,132 90,92"
        style={{ fill: palette.base }}
      />
      <polygon
        className="mini-tetra__right"
        points="90,10 90,92 154,132"
        style={{ fill: palette.secondary }}
      />
      <polygon
        className="mini-tetra__base"
        points="26,132 154,132 90,92"
        style={{ fill: '#f8fafc' }}
      />
      <path className="mini-tetra__line" d="M90 10 L90 92 L58 116" />
      <path className="mini-tetra__line" d="M90 92 L124 116" />
    </svg>
  )
}

function Tetra3DStyles() {
  return (
    <style>{`
      .tetra3d {
        background: #050607;
        font-family: 'Orbitron Variable', ui-sans-serif, system-ui, sans-serif;
      }

      .tetra3d__stage {
        min-height: 100svh;
        overflow: hidden;
        position: relative;
      }

      .tetra3d__canvas {
        inset: 0;
        position: absolute !important;
      }

      .tetra3d__grain {
        background:
          linear-gradient(rgba(255, 255, 255, 0.034) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.034) 1px, transparent 1px),
          radial-gradient(circle at 64% 30%, rgba(103, 232, 249, 0.22), transparent 34%),
          radial-gradient(circle at 20% 74%, rgba(167, 139, 250, 0.16), transparent 30%);
        background-size: 54px 54px, 54px 54px, auto, auto;
        inset: 0;
        mask-image: radial-gradient(circle at 50% 45%, black, transparent 86%);
        pointer-events: none;
        position: absolute;
      }

      .tetra3d__hud {
        display: grid;
        grid-template-rows: auto 1fr auto;
        inset: 0;
        padding: 28px;
        pointer-events: none;
        position: absolute;
      }

      .tetra3d__nav {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        pointer-events: auto;
      }

      .tetra3d-control-group button {
        backdrop-filter: blur(16px);
        background: rgba(255, 255, 255, 0.055);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        color: rgba(255, 255, 255, 0.76);
      }

      .tetra3d__hero-copy {
        align-self: center;
        max-width: min(52vw, 720px);
        pointer-events: none;
      }

      .tetra3d__hero-copy > span,
      .tetra3d-control-group > span,
      .tetra3d-card span {
        color: #67e8f9;
        display: block;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .tetra3d__hero-copy h1 {
        background: linear-gradient(95deg, #ffffff, #67e8f9 42%, #f8fafc 43%, #a78bfa);
        background-clip: text;
        color: transparent;
        font-size: clamp(74px, 9.2vw, 132px);
        font-weight: 840;
        letter-spacing: 0;
        line-height: 0.86;
        margin-top: 14px;
        max-width: 100%;
        overflow: visible;
        text-transform: uppercase;
      }

      .tetra3d__hero-copy p {
        color: rgba(255, 255, 255, 0.66);
        font-family: 'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif;
        font-size: 21px;
        line-height: 1.42;
        margin-top: 22px;
        max-width: 500px;
      }

      .tetra3d__panel {
        align-self: end;
        background: rgba(5, 6, 7, 0.62);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        display: grid;
        gap: 14px;
        justify-self: center;
        max-width: 1180px;
        padding: 14px;
        pointer-events: auto;
        width: min(100%, 1180px);
      }

      .tetra3d-control-group {
        align-items: center;
        display: grid;
        gap: 12px;
        grid-template-columns: 88px 1fr;
      }

      .tetra3d-control-group div {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tetra3d-control-group button {
        cursor: pointer;
        font-size: 12px;
        min-height: 34px;
        padding: 8px 12px;
      }

      .tetra3d-control-group button.is-active {
        background: rgba(103, 232, 249, 0.14);
        border-color: rgba(103, 232, 249, 0.9);
        color: #ffffff;
        box-shadow: 0 0 28px rgba(103, 232, 249, 0.18);
      }

      .tetra3d__specimens {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        margin-inline: auto;
        max-width: 1240px;
        padding: 18px 24px 38px;
      }

      .tetra3d-card {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        min-height: 330px;
        overflow: hidden;
        padding: 18px;
      }

      .tetra3d-card h2 {
        color: #ffffff;
        font-size: 23px;
        font-weight: 820;
        line-height: 1;
        margin-top: 8px;
      }

      .tetra3d-card p {
        color: rgba(255, 255, 255, 0.58);
        font-family: 'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif;
        font-size: 14px;
        line-height: 1.38;
        margin-top: 10px;
      }

      .mini-tetra {
        display: block;
        margin: 10px auto 18px;
        overflow: visible;
        width: min(100%, 190px);
      }

      .mini-tetra__left,
      .mini-tetra__right,
      .mini-tetra__base {
        opacity: 0.82;
      }

      .mini-tetra__line {
        fill: none;
        stroke: rgba(255, 255, 255, 0.58);
        stroke-width: 2.5;
      }

      .mini-tetra__ray {
        fill: none;
        opacity: 0;
        stroke-linecap: round;
        stroke-width: 7;
      }

      .mini-tetra--wire polygon {
        fill: transparent !important;
        stroke: rgba(255, 255, 255, 0.72);
        stroke-width: 2;
      }

      .mini-tetra--split .mini-tetra__left {
        transform: translate(-8px, -5px);
      }

      .mini-tetra--split .mini-tetra__right {
        transform: translate(9px, -6px);
      }

      .mini-tetra--split .mini-tetra__base {
        transform: translateY(8px);
      }

      .mini-tetra--prism .mini-tetra__ray {
        opacity: 0.68;
      }

      @media (max-width: 1040px) {
        .tetra3d__specimens {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 700px) {
        .tetra3d__hud {
          padding: 16px;
        }

        .tetra3d__nav {
          display: grid;
          justify-content: stretch;
        }

        .tetra3d__hero-copy {
          align-self: start;
          max-width: 100%;
          padding-top: 112px;
        }

        .tetra3d__hero-copy h1 {
          font-size: 56px;
        }

        .tetra3d__hero-copy p {
          font-size: 17px;
          max-width: 320px;
        }

        .tetra3d__panel {
          max-height: 42svh;
          overflow: auto;
        }

        .tetra3d-control-group {
          align-items: start;
          grid-template-columns: 1fr;
        }

        .tetra3d__specimens {
          grid-template-columns: 1fr;
          padding-inline: 14px;
        }
      }
    `}</style>
  )
}
