import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { usePlanetStore, type EntryIntent } from '../../store/planetStore';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface OrbitalSite {
  id: string;
  label: string;
  coordLabel: string;
  lat: number;
  lon: number;
  zoom: number;
}

const ORBITAL_SITES: OrbitalSite[] = [
  {
    id: 'gale-crater',
    label: 'Gale Crater',
    coordLabel: '4.775°S · 137.389°E',
    lat: -4.775,
    lon: 137.3889,
    zoom: 12.2,
  },
  {
    id: 'boxwork',
    label: 'Mt. Sharp Boxwork',
    coordLabel: '4.826°S · 137.389°E',
    lat: -4.826,
    lon: 137.3889,
    zoom: 13.8,
  },
  {
    id: 'glen-torridon',
    label: 'Glen Torridon',
    coordLabel: '4.750°S · 137.372°E',
    lat: -4.7495,
    lon: 137.372,
    zoom: 14.0,
  },
];

// Cache Mars Viking texture canvas across Orbit <-> Atlas switches for instant re-mount
let cachedVikingCanvas: HTMLCanvasElement | null = null;
let vikingMosaicLoaded = false;

const _scratchCamPos = new THREE.Vector3();
const _scratchLookAt = new THREE.Vector3();
const _scratchTargetWorld = new THREE.Vector3();
const _scratchFocusGoal = new THREE.Vector3();
const _scratchUpAxis = new THREE.Vector3(0, 1, 0);

function latLonToSphereVec(
  latDeg: number,
  lonDeg: number,
  radius: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
  return out;
}

function createProceduralMarsCanvas(width = 1024, height = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#c8beb2');
  grad.addColorStop(0.12, '#9e472a');
  grad.addColorStop(0.5, '#b65432');
  grad.addColorStop(0.88, '#8a3a21');
  grad.addColorStop(1, '#cfc5b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 64; i++) {
    const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * width;
    const y = (Math.cos(i * 78.233) * 0.5 + 0.5) * height;
    const r = 18 + (i % 5) * 14;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(65, 26, 15, 0.14)' : 'rgba(218, 152, 108, 0.1)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

export const MarsOrbitScene: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const descendingRef = useRef(false);
  const focusSiteAnimRef = useRef(false);
  const pendingIntentRef = useRef<EntryIntent>('EXPLORE');
  const activeSiteRef = useRef<OrbitalSite>(ORBITAL_SITES[0]);
  const beaconGroupRef = useRef<THREE.Group | null>(null);

  const completeIntro = usePlanetStore((s) => s.completeIntro);
  const setCamera = usePlanetStore((s) => s.setCamera);
  const introComplete = usePlanetStore((s) => s.introComplete);

  const [revealed, setRevealed] = useState(false);
  const [descending, setDescending] = useState(false);
  const [descentCrossfade, setDescentCrossfade] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(ORBITAL_SITES[0].id);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [textureStatus, setTextureStatus] = useState(
    vikingMosaicLoaded
      ? 'NASA Viking MDIM 2.1 Global Mosaic (Mars Trek WMTS)'
      : 'NASA Viking MDIM 2.1 Global Mosaic'
  );

  const activeSite = ORBITAL_SITES.find((s) => s.id === selectedSiteId) ?? ORBITAL_SITES[0];
  activeSiteRef.current = activeSite;

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 80);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const bg = beaconGroupRef.current;
    if (!bg) return;
    const pos = latLonToSphereVec(activeSite.lat, activeSite.lon, 1.006, new THREE.Vector3());
    bg.position.copy(pos);
    bg.lookAt(pos.clone().multiplyScalar(2));
  }, [activeSite.lat, activeSite.lon]);

  const triggerDescent = (intent: EntryIntent) => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setCamera({
      lat: activeSiteRef.current.lat,
      lon: activeSiteRef.current.lon,
      zoom: activeSiteRef.current.zoom,
      bearing: 0,
      pitch: 0,
    });
    if (reducedMotion || webglError) {
      completeIntro(intent, 'FIELD');
      return;
    }
    pendingIntentRef.current = intent;
    descendingRef.current = true;
    setDescending(true);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL unavailable — opening 2D geospatial Mars map directly.');
      return;
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost — opening 2D geospatial Mars map.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07080A');
    scene.fog = new THREE.FogExp2('#07080A', 0.032);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      40,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      100
    );

    const galeLocalDir = latLonToSphereVec(
      activeSiteRef.current.lat,
      activeSiteRef.current.lon,
      1,
      new THREE.Vector3()
    ).normalize();
    const initialCamDir = galeLocalDir.clone().applyAxisAngle(_scratchUpAxis, -0.58);
    camera.position.copy(initialCamDir.multiplyScalar(3.25));
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.45;
    controls.maxDistance = 6.2;
    controls.rotateSpeed = 0.6;

    const sunKey = new THREE.DirectionalLight('#FFF3E0', 2.45);
    sunKey.position.set(5.2, 2.0, 4.0);
    scene.add(sunKey);

    const hemiFill = new THREE.HemisphereLight('#7A8BA8', '#26140E', 0.42);
    scene.add(hemiFill);

    const rimLight = new THREE.DirectionalLight('#C46D48', 0.62);
    rimLight.position.set(-5, -1, -3);
    scene.add(rimLight);

    const marsGroup = new THREE.Group();
    scene.add(marsGroup);

    const albedoCanvas = cachedVikingCanvas ?? createProceduralMarsCanvas(1024, 512);
    cachedVikingCanvas = albedoCanvas;
    const marsTexture = new THREE.CanvasTexture(albedoCanvas);
    marsTexture.colorSpace = THREE.SRGBColorSpace;
    marsTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const planetGeo = new THREE.SphereGeometry(1, 72, 48);
    const planetMat = new THREE.MeshStandardMaterial({
      map: marsTexture,
      roughness: 0.88,
      metalness: 0.04,
    });
    const planetMesh = new THREE.Mesh(planetGeo, planetMat);
    marsGroup.add(planetMesh);

    if (!vikingMosaicLoaded) {
      (async () => {
        try {
          const tilePromises: Array<
            Promise<{ r: number; c: number; img: HTMLImageElement } | null>
          > = [];
          for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 4; c++) {
              const url = `/api/tiles/Mars_Viking_MDIM21_ClrMosaic_global_232m/1/${r}/${c}.jpg`;
              tilePromises.push(
                new Promise((resolve) => {
                  const img = new Image();
                  img.crossOrigin = 'anonymous';
                  img.onload = () => resolve({ r, c, img });
                  img.onerror = () => resolve(null);
                  img.src = url;
                })
              );
            }
          }
          const loaded = await Promise.all(tilePromises);
          const ctx = albedoCanvas.getContext('2d');
          if (ctx && loaded.some(Boolean)) {
            loaded.forEach((item) => {
              if (item) ctx.drawImage(item.img, item.c * 256, item.r * 256, 256, 256);
            });
            vikingMosaicLoaded = true;
            marsTexture.needsUpdate = true;
            setTextureStatus('NASA Viking MDIM 2.1 Global Mosaic (Mars Trek WMTS)');
          }
        } catch {
          // Keep baseline gracefully
        }
      })();
    }

    const atmoGeo = new THREE.SphereGeometry(1.022, 64, 40);
    const atmoMat = new THREE.MeshPhysicalMaterial({
      color: '#D98A4E',
      transparent: true,
      opacity: 0.075,
      roughness: 0.45,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    marsGroup.add(atmoMesh);

    const orbitRingGeo = new THREE.TorusGeometry(1.26, 0.002, 8, 128);
    const orbitRingMat = new THREE.MeshStandardMaterial({
      color: '#D4B483',
      roughness: 0.35,
      metalness: 0.72,
      transparent: true,
      opacity: 0.38,
    });
    const orbitRing = new THREE.Mesh(orbitRingGeo, orbitRingMat);
    orbitRing.rotation.x = Math.PI * 0.44;
    orbitRing.rotation.y = 0.25;
    marsGroup.add(orbitRing);

    const beaconGroup = new THREE.Group();
    beaconGroupRef.current = beaconGroup;
    const galeSurfacePos = latLonToSphereVec(
      activeSiteRef.current.lat,
      activeSiteRef.current.lon,
      1.006,
      new THREE.Vector3()
    );
    beaconGroup.position.copy(galeSurfacePos);
    beaconGroup.lookAt(galeSurfacePos.clone().multiplyScalar(2));

    const beaconHitMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.065, 24),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    const beaconRing = new THREE.Mesh(
      new THREE.RingGeometry(0.022, 0.03, 32),
      new THREE.MeshBasicMaterial({ color: '#F7F3EB', side: THREE.DoubleSide })
    );
    const beaconInner = new THREE.Mesh(
      new THREE.RingGeometry(0.007, 0.012, 24),
      new THREE.MeshBasicMaterial({ color: '#C44D2B', side: THREE.DoubleSide })
    );
    beaconGroup.add(beaconHitMesh, beaconRing, beaconInner);
    marsGroup.add(beaconGroup);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos: { x: number; y: number } | null = null;

    const onCanvasPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const onCanvasPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(beaconHitMesh, false);
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    };
    const onCanvasPointerUp = (e: PointerEvent) => {
      if (!pointerDownPos) return;
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      pointerDownPos = null;
      if (moved > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(beaconHitMesh, false);
      if (hits.length > 0) {
        triggerDescent('EXPLORE');
      }
    };

    renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
    renderer.domElement.addEventListener('pointermove', onCanvasPointerMove);
    renderer.domElement.addEventListener('pointerup', onCanvasPointerUp);

    const starCount = 650;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 18 + (i % 7) * 4;
      const th = (i * 2.39996) % (Math.PI * 2);
      const ph = Math.acos(1 - 2 * ((i + 0.5) / starCount));
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.cos(ph);
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: '#C7C1B5', size: 0.04, sizeAttenuation: true });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let descentTime = 0;
    let crossfadeTriggered = false;
    let userInteracting = false;

    controls.addEventListener('start', () => {
      userInteracting = true;
      focusSiteAnimRef.current = false;
    });

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = (now = performance.now()) => {
      if (disposed) return;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (descendingRef.current) {
        descentTime += dt;
        controls.enabled = false;

        beaconGroup.getWorldPosition(_scratchTargetWorld).normalize();
        const dist = descentTime < 0.45 ? 2.4 : 1.18;
        const targetPosX = _scratchTargetWorld.x * dist;
        const targetPosY = _scratchTargetWorld.y * dist;
        const targetPosZ = _scratchTargetWorld.z * dist;

        _scratchCamPos.copy(camera.position);
        _scratchCamPos.x = THREE.MathUtils.damp(_scratchCamPos.x, targetPosX, 4.4, dt);
        _scratchCamPos.y = THREE.MathUtils.damp(_scratchCamPos.y, targetPosY, 4.4, dt);
        _scratchCamPos.z = THREE.MathUtils.damp(_scratchCamPos.z, targetPosZ, 4.4, dt);
        camera.position.copy(_scratchCamPos);

        camera.fov = THREE.MathUtils.damp(camera.fov, 26, 3.6, dt);
        camera.updateProjectionMatrix();

        _scratchLookAt.set(0, 0, 0);
        camera.lookAt(_scratchLookAt);

        if (descentTime > 0.72 && !crossfadeTriggered) {
          crossfadeTriggered = true;
          setDescentCrossfade(true);
        }

        if (descentTime >= 1.1) {
          descendingRef.current = false;
          completeIntro(pendingIntentRef.current, 'FIELD');
          return;
        }
      } else {
        if (focusSiteAnimRef.current) {
          beaconGroup.getWorldPosition(_scratchTargetWorld).normalize();
          _scratchFocusGoal
            .copy(_scratchTargetWorld)
            .applyAxisAngle(_scratchUpAxis, -0.25)
            .multiplyScalar(2.68);
          camera.position.x = THREE.MathUtils.damp(camera.position.x, _scratchFocusGoal.x, 4.8, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, _scratchFocusGoal.y, 4.8, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, _scratchFocusGoal.z, 4.8, dt);
          if (camera.position.distanceTo(_scratchFocusGoal) < 0.035) {
            focusSiteAnimRef.current = false;
          }
        } else if (!userInteracting) {
          marsGroup.rotation.y += dt * 0.028;
        }
        controls.update();
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(() => tick(performance.now()));
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
      renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove);
      renderer.domElement.removeEventListener('pointerup', onCanvasPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      controls.dispose();
      planetGeo.dispose();
      planetMat.dispose();
      marsTexture.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      orbitRingGeo.dispose();
      orbitRingMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [completeIntro]);

  return (
    <div
      className={`relative w-full h-full bg-[#07080A] overflow-hidden select-none transition-opacity duration-500 ${
        descentCrossfade ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Dedicated WebGL Mount */}
      <div
        ref={mountRef}
        className={`absolute inset-0 w-full h-full transition-opacity duration-700 ${
          revealed ? 'opacity-100' : 'opacity-0'
        }`}
        aria-label="Interactive 3D Mars globe"
      />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#07080A] px-6 text-center z-20">
          <div className="max-w-md mp-instrument-panel mp-reticle-frame p-6 space-y-3">
            <p className="font-telemetry text-[11px] text-[#D98A4E]">2D Geospatial Fallback</p>
            <p className="text-sm text-[#EAE4D9]">{webglError}</p>
            <button
              type="button"
              onClick={() => completeIntro('EXPLORE', 'FIELD')}
              className="mp-btn-primary px-4 py-2.5 text-xs font-medium cursor-pointer"
            >
              Open Mars Atlas
            </button>
          </div>
        </div>
      )}

      {/* Minimal Top Telemetry & Skip */}
      <div
        className={`pointer-events-none absolute top-4 inset-x-4 md:inset-x-6 z-10 flex items-start justify-between gap-4 transition-opacity duration-500 ${
          descending ? 'opacity-0' : revealed ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="pointer-events-auto mp-instrument-panel px-3.5 py-2">
          <div className="text-[11px] font-telemetry tracking-[0.12em] text-[#D4B483]">
            {activeSite.coordLabel} · {activeSite.label}
          </div>
          <div className="text-[10px] font-telemetry text-[#736D63] mt-0.5">{textureStatus}</div>
        </div>

        <button
          type="button"
          onClick={() => {
            setCamera({
              lat: activeSite.lat,
              lon: activeSite.lon,
              zoom: activeSite.zoom,
              bearing: 0,
              pitch: 0,
            });
            completeIntro('EXPLORE', 'FIELD');
          }}
          className="pointer-events-auto mp-btn-secondary min-h-[36px] px-4 py-1.5 text-xs cursor-pointer"
        >
          {introComplete ? 'Return to Atlas' : 'Skip to Atlas'}
        </button>
      </div>

      {/* Collapsible Unified Bottom Orbital Dock (Zero Viewport Center Occlusion) */}
      <div
        className={`pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 w-[94vw] max-w-[920px] z-10 transition-all duration-300 ${
          descending ? 'opacity-0 translate-y-4' : revealed ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex justify-center mb-1.5">
          <button
            type="button"
            onClick={() => setDockCollapsed(!dockCollapsed)}
            className="pointer-events-auto mp-instrument-panel px-3 py-1 text-[10px] font-telemetry text-[#D4B483] hover:text-[#F7F3EB] inline-flex items-center gap-1.5 cursor-pointer"
          >
            {dockCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>{dockCollapsed ? 'Show Controls (H)' : 'Hide Controls (H)'}</span>
          </button>
        </div>

        {!dockCollapsed && (
          <div className="pointer-events-auto mp-instrument-panel mp-reticle-frame p-4 md:p-5 space-y-4 mp-settle-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h1 className="font-editorial text-xl md:text-2xl font-medium tracking-tight text-[#F7F3EB]">
                  Orbital Approach · {activeSite.label}
                </h1>
                <p className="text-xs text-[#9D968A] mt-0.5">
                  Drag globe to inspect Mars, click the surface reticle, or descend into real NASA &amp; USGS datasets.
                </p>
              </div>

              {/* Beacon Site Switcher (also smoothly slews orbital camera!) */}
              <div className="mp-segmented shrink-0 self-start">
                {ORBITAL_SITES.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => {
                      setSelectedSiteId(site.id);
                      focusSiteAnimRef.current = true;
                    }}
                    className={`mp-segmented-btn min-h-[28px] px-2.5 text-[11px] font-telemetry cursor-pointer ${
                      selectedSiteId === site.id
                        ? 'bg-[#171A20] text-[#D4B483]'
                        : 'text-[#9D968A] hover:text-[#EAE4D9]'
                    }`}
                  >
                    {site.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mp-hairline" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => triggerDescent('EXPLORE')}
                className="mp-btn-primary min-h-[48px] px-3.5 py-2 text-left flex items-center justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="text-xs font-telemetry font-medium">EXPLORE SURFACE</div>
                  <div className="text-[11px] text-[#F7F3EB]/85">Browse mosaics &amp; geology</div>
                </div>
                <span className="text-xs font-telemetry">→</span>
              </button>

              <button
                type="button"
                onClick={() => triggerDescent('EVIDENCE')}
                className="mp-btn-secondary min-h-[48px] px-3.5 py-2 text-left flex items-center justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="text-xs font-telemetry font-medium">FOLLOW EVIDENCE</div>
                  <div className="text-[11px] text-[#9D968A]">5-stage dataset convergence</div>
                </div>
                <span className="text-xs font-telemetry text-[#D4B483]">→</span>
              </button>

              <button
                type="button"
                onClick={() => triggerDescent('PLAN')}
                className="mp-btn-secondary min-h-[48px] px-3.5 py-2 text-left flex items-center justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="text-xs font-telemetry font-medium">PLAN MARSWALK</div>
                  <div className="text-[11px] text-[#9D968A]">Evaluate DEM slope &amp; routes</div>
                </div>
                <span className="text-xs font-telemetry text-[#D4B483]">→</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
