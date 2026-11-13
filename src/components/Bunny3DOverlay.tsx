import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Check, Mic, Send, Snowflake, Sparkles, Volume2, X } from 'lucide-react';
import {
  BunnyBehaviorStatus,
  BunnyCharacterConfig,
  BunnyChatMessage,
  BunnyFlashcard,
  BunnyId,
  BunnyIndividualState,
  PhotoItem,
  WeatherEffectMode,
} from '../types';

interface Bunny3DOverlayProps {
  characters: BunnyCharacterConfig[];
  bunnies: Record<BunnyId, BunnyIndividualState>;
  bunnyHistories: Record<BunnyId, BunnyChatMessage[]>;
  activeChatBunny: BunnyId | null;
  chatWaitSeconds: number;
  isVoiceListening: boolean;
  isPaused?: boolean;
  photos: PhotoItem[];
  weatherEffectMode: WeatherEffectMode;
  liveWeatherIconKey?: string;
  leftInsetPx: number;
  rightInsetPx: number;
  onSummonBunny: (bunnyId: BunnyId) => void;
  onSendBunnyMessage: (bunnyId: BunnyId, text: string) => void;
  onFinishBunnyChat: (bunnyId: BunnyId) => void;
  onReplayBunnyVoice: (bunnyId: BunnyId) => void;
  onSpeakEnglish: (bunnyId: BunnyId, englishText: string) => void;
  onAnswerFlashcard: (bunnyId: BunnyId, choice: string) => void;
  onDismissFlashcard: (bunnyId: BunnyId) => void;
  onSelectPhotoFromBunny: (photo: PhotoItem) => void;
  onToggleVoiceMic: () => void;
  onBunnyArrivedHome: (bunnyId: BunnyId) => void;
  onSnowballCompleted?: () => void;
}

interface BubbleParticle {
  mesh: THREE.Mesh;
  phase: number;
  speed: number;
  driftX: number;
}

interface SnowballProjectile {
  mesh: THREE.Group;
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
}

interface SnowBurstPuff {
  mesh: THREE.Mesh;
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
}

interface BunnyRig {
  id: BunnyId;
  signature: string;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  squashGroup: THREE.Group;
  headGroup: THREE.Group;
  leftEarPivot: THREE.Group;
  rightEarPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftFootPivot: THREE.Group;
  rightFootPivot: THREE.Group;
  mouthMesh: THREE.Mesh;
  shadowDisc: THREE.Mesh;
  // Outdoor Toys + Weather-Reactive Props + Snow Play Props
  ballProp: THREE.Group;
  ballMesh: THREE.Group;
  pinwheelProp: THREE.Group;
  pinwheelBlades: THREE.Group;
  blocksProp: THREE.Group;
  topBlockMesh: THREE.Mesh;
  carProp: THREE.Group;
  carWheels: THREE.Mesh[];
  bubblesProp: THREE.Group;
  soapBubbles: BubbleParticle[];
  photoProp: THREE.Group;
  umbrellaProp: THREE.Group;
  grassRestProp: THREE.Group;
  heldSnowballMesh: THREE.Mesh;
  rollingSnowballProp: THREE.Group;
  rollingSnowballBall: THREE.Group;
  rollingSnowScale: number;
  snowThrowTimer: number;
  // Natural spring/velocity & posture kinematics
  posX: number;
  posY: number;
  velX: number;
  velY: number;
  targetX: number;
  targetY: number;
  hopPhase: number;
  prevHopY: number;
  facingYaw: number;
  bankRoll: number;
  earLagPitch: number;
  scaleFactor: number;
  squashY: number;
  sitAmount: number;
  nextWaypointTimer: number;
  arrivedNotified: boolean;
}

type ResolvedWeatherKind = 'sun' | 'breeze' | 'rain' | 'snow' | 'off';

interface WeatherParticleItem {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  speedY: number;
  speedX: number;
  phase: number;
  spinSpeed: number;
  baseScale: number;
}

export function resolveWeatherKind(mode: WeatherEffectMode, iconKey?: string): ResolvedWeatherKind {
  if (mode !== 'auto') return mode;
  switch (iconKey) {
    case 'rain':
    case 'storm':
      return 'rain';
    case 'snow':
      return 'snow';
    case 'sun':
      return 'sun';
    case 'partly-cloudy':
    case 'cloudy':
    case 'fog':
    default:
      return 'breeze';
  }
}

function createRadialTexture(innerRgba: string, midRgba: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, innerRgba);
    grad.addColorStop(0.5, midRgba);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

/**
 * 30% Smaller (0.70x scale) & Fairytale Storybook 3D Bunny Cottage!
 */
function build3DCottage(shadowTex: THREE.Texture): {
  houseGroup: THREE.Group;
  doorPivot: THREE.Group;
  windowMat: THREE.MeshStandardMaterial;
  smokePuffs: THREE.Mesh[];
} {
  const houseGroup = new THREE.Group();

  const groundShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 1.48),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  groundShadow.position.set(0, -0.58, -0.08);
  houseGroup.add(groundShadow);

  const lowerMeadow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.16, 1.24, 0.12, 32),
    new THREE.MeshStandardMaterial({ color: 0x34d399, roughness: 0.86, metalness: 0.02 })
  );
  lowerMeadow.scale.set(1.12, 1, 0.76);
  lowerMeadow.position.set(0, -0.52, 0.02);
  houseGroup.add(lowerMeadow);

  const upperMoss = new THREE.Mesh(
    new THREE.CylinderGeometry(1.02, 1.08, 0.08, 30),
    new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.82, metalness: 0.01 })
  );
  upperMoss.scale.set(1.08, 1, 0.72);
  upperMoss.position.set(0, -0.45, 0.02);
  houseGroup.add(upperMoss);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.75 });
  [
    [-0.3, -0.405, 0.56, 0.13],
    [-0.42, -0.415, 0.7, 0.105],
    [-0.26, -0.42, 0.8, 0.09],
  ].forEach(([sx, sy, sz, sr]) => {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(sr, sr * 1.08, 0.035, 14), stoneMat);
    stone.scale.set(1.25, 1, 0.88);
    stone.position.set(sx, sy, sz);
    houseGroup.add(stone);
  });

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xfffaf2,
    roughness: 0.78,
    metalness: 0.01,
  });
  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x92400e,
    roughness: 0.68,
    metalness: 0.04,
  });
  const creamTrimMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.52,
    metalness: 0.02,
  });

  const walls = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.94, 0.94), wallMat);
  walls.position.set(0, 0.02, 0);
  houseGroup.add(walls);

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(1.43, 0.14, 0.99),
    new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.82 })
  );
  plinth.position.set(0, -0.39, 0);
  houseGroup.add(plinth);

  [
    [-0.69, -0.47],
    [0.69, -0.47],
    [-0.69, 0.47],
    [0.69, 0.47],
  ].forEach(([tx, tz]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.96, 0.065), timberMat);
    post.position.set(tx, 0.03, tz);
    houseGroup.add(post);
  });

  const headerBeam = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.06, 1.0), timberMat);
  headerBeam.position.set(0, 0.48, 0);
  houseGroup.add(headerBeam);

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xfb7185,
    roughness: 0.48,
    metalness: 0.05,
  });
  const roofUpperMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    roughness: 0.44,
    metalness: 0.06,
  });

  const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(1.26, 0.78, 4), roofMat);
  mainRoof.rotation.y = Math.PI / 4;
  mainRoof.scale.set(1.1, 1, 0.84);
  mainRoof.position.set(0, 0.86, 0);
  houseGroup.add(mainRoof);

  const eaveRim = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.055, 1.3), creamTrimMat);
  eaveRim.position.set(0, 0.5, 0);
  houseGroup.add(eaveRim);

  for (let i = -5; i <= 5; i++) {
    const scallop = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), creamTrimMat);
    scallop.position.set(i * 0.145, 0.47, 0.64);
    houseGroup.add(scallop);
  }

  const dormerBody = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.34), wallMat);
  dormerBody.position.set(0, 0.78, 0.34);
  houseGroup.add(dormerBody);

  const dormerRoof = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.22, 4), roofUpperMat);
  dormerRoof.rotation.y = Math.PI / 4;
  dormerRoof.position.set(0, 0.99, 0.35);
  houseGroup.add(dormerRoof);

  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfacc15,
    emissiveIntensity: 0.62,
    roughness: 0.22,
  });

  const atticGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 18), windowMat);
  atticGlass.rotation.x = Math.PI / 2;
  atticGlass.position.set(0, 0.78, 0.505);
  houseGroup.add(atticGlass);

  const carrotBody = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42 })
  );
  carrotBody.rotation.z = Math.PI * 0.75;
  carrotBody.position.set(-0.28, 0.36, 0.5);
  houseGroup.add(carrotBody);

  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.21, 0.44, 0.21),
    new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.72 })
  );
  chimney.position.set(0.45, 0.98, -0.1);
  houseGroup.add(chimney);

  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.26), creamTrimMat);
  chimneyCap.position.set(0.45, 1.21, -0.1);
  houseGroup.add(chimneyCap);

  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    transparent: true,
    opacity: 0.78,
  });
  const smokePuffs: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.085 - i * 0.015, 12, 12), smokeMat);
    puff.position.set(0.46 + i * 0.06, 1.34 + i * 0.18, -0.1);
    smokePuffs.push(puff);
    houseGroup.add(puff);
  }

  const interiorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.62, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x27201c, roughness: 0.92 })
  );
  interiorMesh.position.set(-0.28, -0.13, 0.45);
  houseGroup.add(interiorMesh);

  const doorFrameArch = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.68, 0.06), creamTrimMat);
  doorFrameArch.position.set(-0.28, -0.11, 0.465);
  houseGroup.add(doorFrameArch);

  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.48, -0.13, 0.495);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.58 });
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.05), doorMat);
  doorMesh.position.set(0.2, 0, 0);
  doorPivot.add(doorMesh);

  const knobMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.2, metalness: 0.68 })
  );
  knobMesh.position.set(0.33, -0.03, 0.038);
  doorPivot.add(knobMesh);

  const wreathRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.085, 0.024, 10, 20),
    new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.65 })
  );
  wreathRing.position.set(0.2, 0.11, 0.035);
  doorPivot.add(wreathRing);

  const wreathBow = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.42 })
  );
  wreathBow.scale.set(1.4, 0.85, 0.6);
  wreathBow.position.set(0.2, 0.19, 0.048);
  doorPivot.add(wreathBow);

  houseGroup.add(doorPivot);

  const lanternGlobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.058, 14, 14),
    new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    })
  );
  lanternGlobe.position.set(-0.58, 0.12, 0.53);
  houseGroup.add(lanternGlobe);

  const windowGlass = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.33, 0.055), windowMat);
  windowGlass.position.set(0.31, 0.08, 0.48);
  houseGroup.add(windowGlass);

  const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.35, 0.072), creamTrimMat);
  vBar.position.set(0.31, 0.08, 0.49);
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.032, 0.072), creamTrimMat);
  hBar.position.set(0.31, 0.08, 0.49);
  houseGroup.add(vBar, hBar);

  const shutterMat = new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.56 });
  [-0.24, 0.24].forEach((offsetX) => {
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.35, 0.04), shutterMat);
    shutter.position.set(0.31 + offsetX, 0.08, 0.485);
    houseGroup.add(shutter);
  });

  const flowerBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.095, 0.12), timberMat);
  flowerBox.position.set(0.31, -0.14, 0.53);
  houseGroup.add(flowerBox);

  [0xfb7185, 0xfacc15, 0x38bdf8, 0xc084fc].forEach((hex, idx) => {
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 12, 12),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45 })
    );
    bloom.position.set(0.14 + idx * 0.112, -0.07, 0.54);
    houseGroup.add(bloom);
  });

  for (let p = 0; p < 4; p++) {
    const picketL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.03), creamTrimMat);
    picketL.position.set(-1.02 + p * 0.12, -0.32, 0.36);
    const picketR = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.03), creamTrimMat);
    picketR.position.set(0.72 + p * 0.11, -0.32, 0.36);
    houseGroup.add(picketL, picketR);
  }
  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.025), creamTrimMat);
  railL.position.set(-0.84, -0.3, 0.36);
  const railR = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.035, 0.025), creamTrimMat);
  railR.position.set(0.88, -0.3, 0.36);
  houseGroup.add(railL, railR);

  const buildMiniMushroom = (mx: number, mz: number, s: number) => {
    const mGroup = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032 * s, 0.042 * s, 0.09 * s, 10),
      creamTrimMat
    );
    stem.position.y = 0.045 * s;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.082 * s, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.42 })
    );
    cap.position.y = 0.075 * s;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 8, 8), creamTrimMat);
    dot.position.set(0.025 * s, 0.135 * s, 0.04 * s);
    mGroup.add(stem, cap, dot);
    mGroup.position.set(mx, -0.42, mz);
    houseGroup.add(mGroup);
  };
  buildMiniMushroom(0.82, 0.48, 1.05);
  buildMiniMushroom(-0.88, 0.48, 0.85);

  houseGroup.traverse((obj) => {
    obj.userData.hitType = 'house';
  });
  houseGroup.rotation.y = -0.22;
  houseGroup.scale.setScalar(0.7);

  return { houseGroup, doorPivot, windowMat, smokePuffs };
}

/**
 * Lush Composite 3D Leafy Shelter Tree (for bunnies to shelter beneath when it rains!)
 */
function build3DShelterTree(shadowTex: THREE.Texture): {
  treeGroup: THREE.Group;
  canopyGroup: THREE.Group;
} {
  const treeGroup = new THREE.Group();

  const groundShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.45),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  groundShadow.position.set(0, -0.82, -0.05);
  treeGroup.add(groundShadow);

  const dryPatch = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.12, 0.08, 28),
    new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.86, metalness: 0.01 })
  );
  dryPatch.scale.set(1.15, 1, 0.68);
  dryPatch.position.set(0, -0.78, 0.04);
  treeGroup.add(dryPatch);

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x854d0e,
    roughness: 0.84,
    metalness: 0.02,
  });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 1.25, 16), barkMat);
  trunk.position.set(0, -0.16, -0.06);
  treeGroup.add(trunk);

  const leftBranch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.56, 10), barkMat);
  leftBranch.position.set(-0.24, 0.24, -0.04);
  leftBranch.rotation.z = 0.62;
  const rightBranch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.52, 10), barkMat);
  rightBranch.position.set(0.24, 0.28, -0.04);
  rightBranch.rotation.z = -0.58;
  treeGroup.add(leftBranch, rightBranch);

  const canopyGroup = new THREE.Group();
  canopyGroup.position.set(0, 0.58, 0.02);

  const leaves: Array<{ x: number; y: number; z: number; r: number; hex: number }> = [
    { x: 0, y: 0.22, z: 0.04, r: 0.66, hex: 0x22c55e },
    { x: -0.5, y: 0.02, z: 0.1, r: 0.5, hex: 0x4ade80 },
    { x: 0.5, y: 0.04, z: 0.1, r: 0.5, hex: 0x34d399 },
    { x: -0.24, y: 0.38, z: -0.06, r: 0.46, hex: 0x16a34a },
    { x: 0.26, y: 0.36, z: -0.05, r: 0.45, hex: 0x86efac },
  ];

  leaves.forEach((lf) => {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(lf.r, 20, 18),
      new THREE.MeshStandardMaterial({
        color: lf.hex,
        roughness: 0.72,
        metalness: 0.02,
      })
    );
    puff.scale.set(1.12, 0.9, 0.92);
    puff.position.set(lf.x, lf.y, lf.z);
    canopyGroup.add(puff);
  });

  const berryMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.35 });
  [
    [-0.36, 0.06, 0.46],
    [0.32, 0.14, 0.44],
    [-0.06, 0.36, 0.52],
    [0.54, -0.04, 0.36],
  ].forEach(([bx, by, bz]) => {
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 12), berryMat);
    berry.position.set(bx, by, bz);
    canopyGroup.add(berry);
  });

  treeGroup.add(canopyGroup);
  treeGroup.scale.setScalar(0.001);
  treeGroup.visible = false;

  return { treeGroup, canopyGroup };
}

/**
 * Composite 10-Part 3D Snowman that Bunnies Build Together When It Snows!
 */
function build3DSnowman(shadowTex: THREE.Texture): {
  snowmanGroup: THREE.Group;
  middleTierGroup: THREE.Group;
  headTierGroup: THREE.Group;
} {
  const snowmanGroup = new THREE.Group();

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.9),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadowPlane.position.set(0, -0.49, -0.04);
  snowmanGroup.add(shadowPlane);

  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.86,
    metalness: 0.02,
  });
  const coalMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.08,
  });
  const scarfMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    roughness: 0.72,
    metalness: 0.02,
  });
  const twigMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.85,
  });

  // Ground snow drift base
  const snowDrift = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.08, 24), snowMat);
  snowDrift.scale.set(1.15, 1, 0.8);
  snowDrift.position.set(0, -0.45, 0.02);
  snowmanGroup.add(snowDrift);

  // Tier 1: Bottom snow sphere
  const baseBall = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 20), snowMat);
  baseBall.scale.set(1.08, 0.92, 1.04);
  baseBall.position.set(0, -0.2, 0.04);
  snowmanGroup.add(baseBall);

  // Tier 2: Middle torso + coal buttons + twig arms + cozy scarf
  const middleTierGroup = new THREE.Group();
  middleTierGroup.position.set(0, 0.16, 0.04);

  const midBall = new THREE.Mesh(new THREE.SphereGeometry(0.24, 22, 18), snowMat);
  midBall.scale.set(1.04, 0.95, 1.02);
  middleTierGroup.add(midBall);

  [-0.07, 0.02, 0.11].forEach((by) => {
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), coalMat);
    btn.position.set(0, by, 0.23);
    middleTierGroup.add(btn);
  });

  const leftTwig = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.36, 8), twigMat);
  leftTwig.position.set(-0.32, 0.06, 0);
  leftTwig.rotation.z = 0.95;
  const rightTwig = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.36, 8), twigMat);
  rightTwig.position.set(0.32, 0.08, 0);
  rightTwig.rotation.z = -0.88;
  middleTierGroup.add(leftTwig, rightTwig);

  const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.042, 12, 24), scarfMat);
  scarfRing.rotation.x = Math.PI / 2;
  scarfRing.position.set(0, 0.19, 0.01);
  const scarfTail = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.14, 8, 12), scarfMat);
  scarfTail.position.set(0.11, 0.08, 0.19);
  scarfTail.rotation.z = -0.22;
  middleTierGroup.add(scarfRing, scarfTail);

  snowmanGroup.add(middleTierGroup);

  // Tier 3: Head + carrot nose + eyes + rosy cheeks + bucket top hat
  const headTierGroup = new THREE.Group();
  headTierGroup.position.set(0, 0.5, 0.05);

  const headBall = new THREE.Mesh(new THREE.SphereGeometry(0.18, 22, 18), snowMat);
  headTierGroup.add(headBall);

  const carrotNose = new THREE.Mesh(
    new THREE.ConeGeometry(0.032, 0.15, 12),
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42 })
  );
  carrotNose.rotation.x = Math.PI / 2;
  carrotNose.position.set(0, -0.01, 0.22);
  headTierGroup.add(carrotNose);

  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 12), coalMat);
    eye.position.set(side * 0.068, 0.04, 0.162);
    headTierGroup.add(eye);

    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xfda4af, roughness: 0.7 })
    );
    cheek.scale.set(1.2, 0.65, 0.4);
    cheek.position.set(side * 0.105, -0.015, 0.155);
    headTierGroup.add(cheek);
  });

  // Jaunty top hat with golden ribbon band
  const hatGroup = new THREE.Group();
  hatGroup.position.set(0.02, 0.16, 0);
  hatGroup.rotation.z = -0.14;
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 20), coalMat);
  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.135, 0.18, 20), coalMat);
  hatCrown.position.y = 0.095;
  const hatBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.138, 0.138, 0.036, 20),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.35, metalness: 0.25 })
  );
  hatBand.position.y = 0.035;
  hatGroup.add(hatBrim, hatCrown, hatBand);
  headTierGroup.add(hatGroup);

  snowmanGroup.add(headTierGroup);
  snowmanGroup.visible = false;
  snowmanGroup.scale.setScalar(0.001);

  return { snowmanGroup, middleTierGroup, headTierGroup };
}

/**
 * User-Interactive 3D Rollable Snowball (Drag or Tap to Roll & Grow Bigger!)
 */
function buildInteractiveSnowball(shadowTex: THREE.Texture): {
  snowballRoot: THREE.Group;
  snowballBall: THREE.Group;
  snowballShadow: THREE.Mesh;
} {
  const snowballRoot = new THREE.Group();

  const snowballShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.34),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  snowballShadow.position.set(0, -0.19, -0.04);
  snowballRoot.add(snowballShadow);

  const snowballBall = new THREE.Group();
  const mainSnowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.03,
  });
  const lumpMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    roughness: 0.72,
    metalness: 0.05,
  });
  const starDotMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.4,
    metalness: 0.12,
  });

  const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 20), mainSnowMat);
  snowballBall.add(coreSphere);

  // Tactile snow lumps + ice-blue crystal markers so 3D rotation is unmistakably visible as you roll it!
  [
    [0.14, 0.09, 0.08],
    [-0.13, -0.08, 0.1],
    [0.05, -0.15, -0.09],
    [-0.08, 0.14, -0.1],
    [0.09, 0.04, -0.16],
    [-0.15, 0.05, 0.06],
  ].forEach(([lx, ly, lz], i) => {
    const lump = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 12, 10),
      i % 2 === 0 ? lumpMat : mainSnowMat
    );
    lump.position.set(lx, ly, lz);
    snowballBall.add(lump);
  });

  [
    [0, 0, 0.195],
    [0, 0.195, 0],
    [0.195, 0, 0],
    [0, 0, -0.195],
  ].forEach(([sx, sy, sz]) => {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), starDotMat);
    crystal.position.set(sx, sy, sz);
    snowballBall.add(crystal);
  });

  snowballRoot.add(snowballBall);
  snowballRoot.traverse((obj) => {
    obj.userData.hitType = 'snowball';
  });
  snowballRoot.visible = false;

  return { snowballRoot, snowballBall, snowballShadow };
}

/**
 * Petite, slender, ultra-cute 3D baby bunny model + Outdoor Toys + Sunny Grass + Snowball Fight/Roll Props!
 */
function buildCuteSlender3DBunny(
  cfg: BunnyCharacterConfig,
  shadowTex: THREE.Texture
): BunnyRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const squashGroup = new THREE.Group();
  root.add(bodyGroup);
  bodyGroup.add(squashGroup);

  const shadowDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.48),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadowDisc.position.set(0, -0.48, -0.04);
  root.add(shadowDisc);

  const furMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cfg.furHex || '#FFFCFA'),
    roughness: 0.85,
    metalness: 0.01,
  });
  const outfitMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cfg.outfitHex || '#FFE4E8'),
    roughness: 0.68,
    metalness: 0.02,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cfg.accentHex || '#FB7185'),
    roughness: 0.42,
    metalness: 0.05,
  });
  const innerEarMat = new THREE.MeshStandardMaterial({
    color: 0xfecdd3,
    roughness: 0.76,
    metalness: 0.01,
  });
  const blushMat = new THREE.MeshStandardMaterial({
    color: 0xff9ebb,
    roughness: 0.72,
    transparent: true,
    opacity: 0.72,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x16161a,
    roughness: 0.08,
    metalness: 0.1,
  });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // 1. Petite Slender Torso + Cute Pastel A-Line Tunic Dress
  const upperTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.142, 0.13, 12, 20), furMat);
  upperTorso.scale.set(0.95, 1.0, 0.88);
  upperTorso.position.set(0, -0.13, 0);
  squashGroup.add(upperTorso);

  const tunic = new THREE.Mesh(new THREE.ConeGeometry(0.215, 0.25, 24), outfitMat);
  tunic.scale.set(1.0, 1.0, 0.88);
  tunic.position.set(0, -0.22, 0.01);
  squashGroup.add(tunic);

  const collarRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.138, 0.024, 10, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
  );
  collarRing.rotation.x = Math.PI / 2;
  collarRing.position.set(0, -0.07, 0.01);
  squashGroup.add(collarRing);

  [-0.15, -0.22].forEach((by) => {
    const btn = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    btn.position.set(0, by, 0.165);
    squashGroup.add(btn);
  });

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 14), furMat);
  tail.position.set(0, -0.28, -0.2);
  squashGroup.add(tail);

  const buildFootPivot = (side: -1 | 1) => {
    const fPivot = new THREE.Group();
    fPivot.position.set(side * 0.105, -0.39, 0.04);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.078, 16, 14), furMat);
    foot.scale.set(0.88, 0.58, 1.32);
    foot.position.set(0, -0.02, 0.025);
    const pawPad = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 10), innerEarMat);
    pawPad.scale.set(1.0, 0.35, 1.1);
    pawPad.position.set(0, -0.055, 0.045);
    fPivot.add(foot, pawPad);
    squashGroup.add(fPivot);
    return fPivot;
  };
  const leftFootPivot = buildFootPivot(-1);
  const rightFootPivot = buildFootPivot(1);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.165, -0.09, 0.03);
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.125, 8, 14), furMat);
  leftArm.position.set(-0.045, -0.065, 0.03);
  leftArm.rotation.z = 0.38;
  leftArmPivot.add(leftArm);
  squashGroup.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.165, -0.09, 0.03);
  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.125, 8, 14), furMat);
  rightArm.position.set(0.045, -0.065, 0.03);
  rightArm.rotation.z = -0.38;
  rightArmPivot.add(rightArm);

  // Mini snowball held in right paw for SNOWBALL_FIGHT wind-up!
  const heldSnowballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.072, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })
  );
  heldSnowballMesh.position.set(0.09, -0.14, 0.08);
  heldSnowballMesh.visible = false;
  rightArmPivot.add(heldSnowballMesh);

  squashGroup.add(rightArmPivot);

  // 2. Soft Baby Bunny Head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.18, 0.02);
  squashGroup.add(headGroup);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.272, 28, 24), furMat);
  headMesh.scale.set(1.05, 0.96, 0.96);
  headGroup.add(headMesh);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 14), furMat);
  muzzle.scale.set(1.18, 0.82, 0.65);
  muzzle.position.set(0, -0.055, 0.235);
  headGroup.add(muzzle);

  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.38 })
  );
  nose.scale.set(1.18, 0.82, 0.72);
  nose.position.set(0, -0.032, 0.282);
  headGroup.add(nose);

  const mouthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.034, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.48 })
  );
  mouthMesh.scale.set(0.95, 0.25, 0.45);
  mouthMesh.position.set(0, -0.088, 0.268);
  headGroup.add(mouthMesh);

  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.046, 18, 16), eyeMat);
    eye.scale.set(0.9, 1.16, 0.72);
    eye.position.set(side * 0.112, -0.008, 0.246);
    headGroup.add(eye);

    const mainGlint = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 10), glintMat);
    mainGlint.position.set(side * 0.112 + 0.014, 0.014, 0.278);
    headGroup.add(mainGlint);

    const subGlint = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 8), glintMat);
    subGlint.position.set(side * 0.112 - 0.012, -0.022, 0.276);
    headGroup.add(subGlint);

    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 12), blushMat);
    blush.scale.set(1.28, 0.65, 0.3);
    blush.position.set(side * 0.178, -0.052, 0.222);
    headGroup.add(blush);
  });

  const buildSlenderEar = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.108, 0.22, -0.01);
    pivot.rotation.z = side * -0.11;

    const outerEar = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.29, 10, 18), furMat);
    outerEar.scale.set(0.95, 1.0, 0.52);
    outerEar.position.set(0, 0.19, 0);
    pivot.add(outerEar);

    const innerEar = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.21, 8, 14), innerEarMat);
    innerEar.scale.set(0.95, 1.0, 0.3);
    innerEar.position.set(0, 0.18, 0.032);
    pivot.add(innerEar);

    headGroup.add(pivot);
    return pivot;
  };

  const leftEarPivot = buildSlenderEar(-1);
  const rightEarPivot = buildSlenderEar(1);

  if (cfg.accessory === 'ribbon') {
    const bowGroup = new THREE.Group();
    const lLoop = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 14), accentMat);
    lLoop.scale.set(1.22, 0.82, 0.5);
    lLoop.position.set(-0.062, 0, 0);
    const rLoop = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 14), accentMat);
    rLoop.scale.set(1.22, 0.82, 0.5);
    rLoop.position.set(0.062, 0, 0);
    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(0.038, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff1f2, roughness: 0.4 })
    );
    bowGroup.add(lLoop, rLoop, knot);
    bowGroup.position.set(-0.155, 0.23, 0.11);
    bowGroup.rotation.z = 0.24;
    headGroup.add(bowGroup);
  } else if (cfg.accessory === 'clover') {
    const cloverGroup = new THREE.Group();
    [
      [-0.038, 0.038],
      [0.038, 0.038],
      [-0.038, -0.038],
      [0.038, -0.038],
    ].forEach(([lx, ly]) => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), accentMat);
      leaf.scale.set(1, 1, 0.42);
      leaf.position.set(lx, ly, 0);
      cloverGroup.add(leaf);
    });
    cloverGroup.position.set(0.16, 0.24, 0.11);
    cloverGroup.rotation.z = -0.22;
    headGroup.add(cloverGroup);
  } else if (cfg.accessory === 'backpack') {
    const miniBag = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.13), accentMat);
    miniBag.position.set(0, -0.18, -0.15);
    squashGroup.add(miniBag);

    const miniCarrot = new THREE.Mesh(
      new THREE.ConeGeometry(0.036, 0.11, 12),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45 })
    );
    miniCarrot.rotation.z = Math.PI * 0.85;
    miniCarrot.position.set(0.06, -0.15, 0.17);
    squashGroup.add(miniCarrot);
  } else if (cfg.accessory === 'star') {
    const starGroup = new THREE.Group();
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.3,
      metalness: 0.25,
    });
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 + Math.PI / 2;
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.075, 8), starMat);
      point.position.set(Math.cos(a) * 0.036, Math.sin(a) * 0.036, 0);
      point.rotation.z = a - Math.PI / 2;
      starGroup.add(point);
    }
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 12), starMat);
    starGroup.add(center);
    starGroup.position.set(-0.16, 0.22, 0.12);
    headGroup.add(starGroup);
  } else if (cfg.accessory === 'scarf') {
    const muffler = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.038, 12, 24), accentMat);
    muffler.rotation.x = Math.PI / 2;
    muffler.position.set(0, -0.055, 0.015);
    squashGroup.add(muffler);

    const scarfTail = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.11, 8, 12), accentMat);
    scarfTail.position.set(0.09, -0.14, 0.155);
    scarfTail.rotation.z = -0.2;
    squashGroup.add(scarfTail);
  }

  // Toy 1: Play Ball
  const ballProp = new THREE.Group();
  const ballMesh = new THREE.Group();
  const ballSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 22, 20),
    new THREE.MeshStandardMaterial({ color: 0xfff1f2, roughness: 0.28, metalness: 0.04 })
  );
  const band1 = new THREE.Mesh(
    new THREE.TorusGeometry(0.132, 0.022, 10, 24),
    new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.32 })
  );
  const band2 = new THREE.Mesh(
    new THREE.TorusGeometry(0.132, 0.02, 10, 24),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.32 })
  );
  band2.rotation.x = Math.PI / 2;
  ballMesh.add(ballSphere, band1, band2);
  ballProp.add(ballMesh);

  const ballShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.22),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  ballShadow.position.set(0.38, -0.46, 0.18);
  ballProp.add(ballShadow);
  ballMesh.position.set(0.38, -0.34, 0.18);
  ballProp.visible = false;
  root.add(ballProp);

  // Toy 2: Pinwheel
  const pinwheelProp = new THREE.Group();
  const pwStick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.013, 0.42, 8),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5 })
  );
  pwStick.position.set(0, 0.14, 0);
  pinwheelProp.add(pwStick);

  const pinwheelBlades = new THREE.Group();
  pinwheelBlades.position.set(0, 0.33, 0.025);
  [0x60a5fa, 0xfbbf24, 0xf472b6, 0x34d399].forEach((c, idx) => {
    const vane = new THREE.Mesh(
      new THREE.ConeGeometry(0.068, 0.165, 12),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 })
    );
    const angle = (idx * Math.PI) / 2;
    vane.position.set(Math.cos(angle) * 0.072, Math.sin(angle) * 0.072, 0);
    vane.rotation.z = angle - Math.PI / 2;
    vane.rotation.y = 0.22;
    pinwheelBlades.add(vane);
  });
  const pwHub = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })
  );
  pinwheelBlades.add(pwHub);
  pinwheelProp.add(pinwheelBlades);
  pinwheelProp.position.set(-0.32, -0.12, 0.18);
  pinwheelProp.rotation.z = 0.14;
  pinwheelProp.visible = false;
  squashGroup.add(pinwheelProp);

  // Toy 3: Building Blocks
  const blocksProp = new THREE.Group();
  const blockColors = [0xfda4af, 0x93c5fd, 0xfde047];
  const block1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.14),
    new THREE.MeshStandardMaterial({ color: blockColors[0], roughness: 0.52 })
  );
  block1.position.set(0.34, -0.39, 0.16);
  block1.rotation.y = 0.2;

  const block2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.14),
    new THREE.MeshStandardMaterial({ color: blockColors[1], roughness: 0.52 })
  );
  block2.position.set(0.49, -0.39, 0.12);
  block2.rotation.y = -0.18;

  const topBlockMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.13, 0.13),
    new THREE.MeshStandardMaterial({ color: blockColors[2], roughness: 0.48 })
  );
  topBlockMesh.position.set(0.41, -0.25, 0.14);
  blocksProp.add(block1, block2, topBlockMesh);
  blocksProp.visible = false;
  root.add(blocksProp);

  // Toy 4: Toy Car
  const carProp = new THREE.Group();
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.09, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.44 })
  );
  chassis.position.set(0, 0.06, 0);
  const cabin = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 14),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.4 })
  );
  cabin.scale.set(1.2, 0.85, 0.85);
  cabin.position.set(-0.02, 0.12, 0);
  carProp.add(chassis, cabin);

  const carWheels: THREE.Mesh[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.032, 14);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.6 });
  [
    [-0.1, 0.035, 0.1],
    [0.1, 0.035, 0.1],
    [-0.1, 0.035, -0.1],
    [0.1, 0.035, -0.1],
  ].forEach(([wx, wy, wz]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, wy, wz);
    carWheels.push(w);
    carProp.add(w);
  });
  carProp.position.set(-0.46, -0.45, 0.1);
  carProp.visible = false;
  root.add(carProp);

  // Toy 5: Soap Bubbles
  const bubblesProp = new THREE.Group();
  const wandStick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8),
    new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.4 })
  );
  wandStick.position.set(0.28, -0.1, 0.18);
  wandStick.rotation.z = -0.35;
  const wandRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.048, 0.01, 10, 20),
    new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.35 })
  );
  wandRing.position.set(0.32, -0.01, 0.19);
  bubblesProp.add(wandStick, wandRing);

  const soapBubbles: BubbleParticle[] = [];
  const bubbleColors = [0xe0f2fe, 0xfce7f3, 0xfef9c3, 0xede9fe, 0xd1fae5];
  for (let i = 0; i < 5; i++) {
    const bMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 16, 16),
      new THREE.MeshStandardMaterial({
        color: bubbleColors[i % bubbleColors.length],
        roughness: 0.06,
        metalness: 0.18,
        transparent: true,
        opacity: 0.58,
      })
    );
    bubblesProp.add(bMesh);
    soapBubbles.push({
      mesh: bMesh,
      phase: (i / 5) * Math.PI * 2,
      speed: 0.55 + (i % 3) * 0.18,
      driftX: (i % 2 === 0 ? 1 : -1) * (0.08 + i * 0.03),
    });
  }
  bubblesProp.visible = false;
  root.add(bubblesProp);

  // Miniature Photo Frame Prop
  const photoProp = new THREE.Group();
  const frameBorder = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.26, 0.035),
    new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.48 })
  );
  const pictureInner = new THREE.Mesh(
    new THREE.BoxGeometry(0.27, 0.18, 0.042),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.35 })
  );
  photoProp.add(frameBorder, pictureInner);
  photoProp.position.set(0.34, -0.12, 0.22);
  photoProp.rotation.y = -0.25;
  photoProp.visible = false;
  squashGroup.add(photoProp);

  // Rain Umbrella Prop
  const umbrellaProp = new THREE.Group();
  const umbStick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.011, 0.62, 8),
    new THREE.MeshStandardMaterial({ color: 0xe4e4e7, roughness: 0.4, metalness: 0.3 })
  );
  umbStick.position.set(0, 0.24, 0);
  const umbCanopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 0.18, 18),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.accentHex || '#FB7185'),
      roughness: 0.35,
      transparent: true,
      opacity: 0.9,
    })
  );
  umbCanopy.position.set(0, 0.54, 0);
  umbrellaProp.add(umbStick, umbCanopy);
  umbrellaProp.position.set(0.18, -0.04, 0.06);
  umbrellaProp.rotation.z = -0.08;
  umbrellaProp.visible = false;
  squashGroup.add(umbrellaProp);

  // Sunny Grass Patch Prop
  const grassRestProp = new THREE.Group();
  const turfPad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.54, 0.58, 0.065, 24),
    new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.85, metalness: 0.01 })
  );
  turfPad.scale.set(1.15, 1, 0.78);
  turfPad.position.set(0, -0.45, 0.03);
  grassRestProp.add(turfPad);

  const daisyPetalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const daisyCoreMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
  [
    [-0.38, 0.22],
    [0.42, 0.18],
    [-0.28, -0.18],
    [0.34, -0.2],
  ].forEach(([dx, dz], dIdx) => {
    const dGroup = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), daisyCoreMat);
    core.position.y = 0.02;
    dGroup.add(core);
    for (let p = 0; p < 5; p++) {
      const pa = (p * Math.PI * 2) / 5;
      const pet = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), daisyPetalMat);
      pet.scale.set(1.2, 0.45, 0.9);
      pet.position.set(Math.cos(pa) * 0.035, 0.012, Math.sin(pa) * 0.035);
      dGroup.add(pet);
    }
    dGroup.position.set(dx, -0.41, dz);
    dGroup.rotation.y = dIdx * 0.6;
    grassRestProp.add(dGroup);
  });
  grassRestProp.visible = false;
  root.add(grassRestProp);

  // Bunny Autonomous Rolling Snowball Prop ('ROLLING_SNOWBALL')
  const rollingSnowballProp = new THREE.Group();
  const rollingSnowballBall = new THREE.Group();
  const rBallMain = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 18),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })
  );
  const rBallLump1 = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.72 })
  );
  rBallLump1.position.set(0.11, 0.08, 0.06);
  const rBallLump2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.046, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.72 })
  );
  rBallLump2.position.set(-0.1, -0.09, -0.05);
  rollingSnowballBall.add(rBallMain, rBallLump1, rBallLump2);
  rollingSnowballBall.position.set(0, -0.31, 0.22);
  rollingSnowballProp.add(rollingSnowballBall);
  rollingSnowballProp.visible = false;
  root.add(rollingSnowballProp);

  root.traverse((obj) => {
    obj.userData.hitType = 'bunny';
    obj.userData.bunnyId = cfg.id;
  });

  const signature = `${cfg.furHex}|${cfg.outfitHex}|${cfg.accentHex}|${cfg.accessory}`;

  return {
    id: cfg.id,
    signature,
    root,
    bodyGroup,
    squashGroup,
    headGroup,
    leftEarPivot,
    rightEarPivot,
    leftArmPivot,
    rightArmPivot,
    leftFootPivot,
    rightFootPivot,
    mouthMesh,
    shadowDisc,
    ballProp,
    ballMesh,
    pinwheelProp,
    pinwheelBlades,
    blocksProp,
    topBlockMesh,
    carProp,
    carWheels,
    bubblesProp,
    soapBubbles,
    photoProp,
    umbrellaProp,
    grassRestProp,
    heldSnowballMesh,
    rollingSnowballProp,
    rollingSnowballBall,
    rollingSnowScale: 0.85,
    snowThrowTimer: 1.4 + Math.random() * 1.4,
    posX: 0,
    posY: 0,
    velX: 0,
    velY: 0,
    targetX: 0,
    targetY: 0,
    hopPhase: Math.random() * Math.PI * 2,
    prevHopY: 0,
    facingYaw: 0,
    bankRoll: 0,
    earLagPitch: 0,
    scaleFactor: 0.01,
    squashY: 1,
    sitAmount: 0,
    nextWaypointTimer: 2.5 + Math.random() * 3,
    arrivedNotified: false,
  };
}

// Reusable module-level math helpers for zero per-frame allocations
const _snowPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.34);
const _dragWorldPt = new THREE.Vector3();
const _rollAxis = new THREE.Vector3();
const _rollQuat = new THREE.Quaternion();

export const Bunny3DOverlay: React.FC<Bunny3DOverlayProps> = ({
  characters,
  bunnies,
  bunnyHistories,
  activeChatBunny,
  chatWaitSeconds,
  isVoiceListening,
  isPaused = false,
  photos,
  weatherEffectMode,
  liveWeatherIconKey,
  leftInsetPx,
  rightInsetPx,
  onSummonBunny,
  onSendBunnyMessage,
  onFinishBunnyChat,
  onReplayBunnyVoice,
  onSpeakEnglish,
  onAnswerFlashcard,
  onDismissFlashcard,
  onSelectPhotoFromBunny,
  onToggleVoiceMic,
  onBunnyArrivedHome,
  onSnowballCompleted,
}) => {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const bubbleDomRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chatScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const houseTagDomRef = useRef<HTMLDivElement | null>(null);
  const snowballTagDomRef = useRef<HTMLDivElement | null>(null);
  const snowballPctSpanRef = useRef<HTMLSpanElement | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showFallbackChoices, setShowFallbackChoices] = useState(false);

  const enabledCharacters = useMemo(
    () => characters.filter((c) => c.enabled),
    [characters]
  );

  const resolvedWeather = useMemo(
    () => resolveWeatherKind(weatherEffectMode, liveWeatherIconKey),
    [weatherEffectMode, liveWeatherIconKey]
  );

  // Active Giant Flashcard: ONLY shown when a child is actively chatting with a bunny!
  const activeGiantCardInfo = useMemo(() => {
    if (!activeChatBunny) return null;
    const b = bunnies[activeChatBunny];
    const cfg = characters.find((c) => c.id === activeChatBunny);
    if (!b || b.status !== 'CHATTING' || !b.activeFlashcard || !cfg) return null;
    return { cfg, state: b, card: b.activeFlashcard };
  }, [activeChatBunny, bunnies, characters]);

  // Reset fallback choices toggle whenever a new flashcard appears
  useEffect(() => {
    setShowFallbackChoices(false);
  }, [activeGiantCardInfo?.card.id]);

  // Auto-scroll active bunny's multi-turn chat thread to bottom
  useEffect(() => {
    if (!activeChatBunny) return;
    const scroller = chatScrollRefs.current[activeChatBunny];
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [activeChatBunny, bunnyHistories, bunnies]);

  const latestPropsRef = useRef({
    characters,
    enabledCharacters,
    bunnies,
    activeChatBunny,
    resolvedWeather,
    isPaused,
    leftInsetPx,
    rightInsetPx,
    onSummonBunny,
    onBunnyArrivedHome,
    onSnowballCompleted,
  });

  useEffect(() => {
    latestPropsRef.current = {
      characters,
      enabledCharacters,
      bunnies,
      activeChatBunny,
      resolvedWeather,
      isPaused,
      leftInsetPx,
      rightInsetPx,
      onSummonBunny,
      onBunnyArrivedHome,
      onSnowballCompleted,
    };
  }, [
    characters,
    enabledCharacters,
    bunnies,
    activeChatBunny,
    resolvedWeather,
    isPaused,
    leftInsetPx,
    rightInsetPx,
    onSummonBunny,
    onBunnyArrivedHome,
    onSnowballCompleted,
  ]);

  const sceneSyncRef = useRef<{
    syncCharacters?: (list: BunnyCharacterConfig[]) => void;
    syncLayout?: () => void;
    resumeIfActive?: () => void;
  }>({});

  useEffect(() => {
    sceneSyncRef.current.syncCharacters?.(characters);
  }, [characters]);

  useEffect(() => {
    sceneSyncRef.current.syncLayout?.();
  }, [leftInsetPx, rightInsetPx]);

  useEffect(() => {
    if (!isPaused) {
      sceneSyncRef.current.resumeIfActive?.();
    }
  }, [isPaused]);

  useEffect(() => {
    const container = canvasHostRef.current;
    if (!container) return;

    const probeCanvas = document.createElement('canvas');
    const probeGl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    const dbg = probeGl?.getExtension('WEBGL_debug_renderer_info');
    const rendererInfo = dbg ? String(probeGl?.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    probeGl?.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererInfo);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.pointerEvents = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const envGen = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(envGen, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.62;
    envGen.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    camera.position.set(0, 0, 16);

    const hemiLight = new THREE.HemisphereLight(0xfefefe, 0xd6d3d1, 0.82);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff6eb, 1.48);
    keyLight.position.set(5.5, 8.5, 10);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xe0f2fe, 0.6);
    rimLight.position.set(-6.5, 4, -5);
    scene.add(rimLight);

    const shadowTex = createRadialTexture('rgba(20, 21, 25, 0.32)', 'rgba(20, 21, 25, 0.12)');
    const sunBokehTex = createRadialTexture('rgba(255, 244, 196, 0.72)', 'rgba(253, 224, 71, 0.22)');

    // 1. Fairytale Cottage + Rain-Shelter Tree + Snowy Snowman + Interactive Rollable Snowball
    const { houseGroup, doorPivot, windowMat, smokePuffs } = build3DCottage(shadowTex);
    scene.add(houseGroup);

    const { treeGroup, canopyGroup } = build3DShelterTree(shadowTex);
    scene.add(treeGroup);
    let treeScale = 0.001;

    const { snowmanGroup, middleTierGroup, headTierGroup } = build3DSnowman(shadowTex);
    scene.add(snowmanGroup);
    let snowmanScale = 0.001;
    let snowmanBuildProgress = 0.45;

    const { snowballRoot, snowballBall, snowballShadow } = buildInteractiveSnowball(shadowTex);
    scene.add(snowballRoot);
    let sbPosX = 0;
    let sbPosY = -2.2;
    let sbVelX = 0;
    let sbVelY = 0;
    let sbScale = 1.0;
    let sbVisibilityScale = 0.001;
    let isDraggingSnowball = false;

    // Pre-allocated Snowball Fight Projectiles & Snow Impact Burst Puffs (Zero GC!)
    const projectileGroup = new THREE.Group();
    scene.add(projectileGroup);
    const projSnowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
    const projPuffMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      roughness: 0.78,
      transparent: true,
      opacity: 0.85,
    });

    const snowballProjectiles: SnowballProjectile[] = [];
    for (let i = 0; i < 6; i++) {
      const pGroup = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), projSnowMat);
      const trail = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 10), projPuffMat);
      trail.position.set(-0.08, -0.02, 0);
      pGroup.add(core, trail);
      pGroup.visible = false;
      projectileGroup.add(pGroup);
      snowballProjectiles.push({
        mesh: pGroup,
        active: false,
        x: 0,
        y: 0,
        z: 0.35,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 1.2,
      });
    }

    const snowBurstPuffs: SnowBurstPuff[] = [];
    for (let i = 0; i < 16; i++) {
      const puffMesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), projPuffMat);
      puffMesh.visible = false;
      projectileGroup.add(puffMesh);
      snowBurstPuffs.push({
        mesh: puffMesh,
        active: false,
        x: 0,
        y: 0,
        z: 0.36,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
      });
    }

    const spawnSnowBurst = (bx: number, by: number, count = 5) => {
      let spawned = 0;
      for (let i = 0; i < snowBurstPuffs.length && spawned < count; i++) {
        const sp = snowBurstPuffs[i];
        if (!sp.active) {
          sp.active = true;
          sp.age = 0;
          sp.x = bx;
          sp.y = by;
          sp.z = 0.38;
          const ang = (spawned / count) * Math.PI * 2 + Math.random() * 0.5;
          const spd = 0.8 + Math.random() * 1.3;
          sp.vx = Math.cos(ang) * spd;
          sp.vy = Math.sin(ang) * spd + 0.6;
          sp.vz = (Math.random() - 0.5) * 0.4;
          sp.mesh.visible = true;
          spawned += 1;
        }
      }
    };

    const launchSnowballProjectile = (fromX: number, fromY: number, toX: number, toY: number) => {
      const slot = snowballProjectiles.find((p) => !p.active);
      if (!slot) return;
      const flightTime = 0.68 + Math.random() * 0.22;
      const gravity = -9.4;
      slot.active = true;
      slot.age = 0;
      slot.maxAge = flightTime;
      slot.x = fromX;
      slot.y = fromY + 0.14;
      slot.z = 0.38;
      slot.vx = (toX - fromX) / flightTime;
      slot.vy = (toY - (fromY + 0.14) - 0.5 * gravity * flightTime * flightTime) / flightTime;
      slot.vz = 0;
      slot.mesh.visible = true;
    };

    // Ambient Weather Particles
    const weatherGroup = new THREE.Group();
    scene.add(weatherGroup);

    const particleCount = isSoftwareGl ? 28 : 54;
    const sunPool: WeatherParticleItem[] = [];
    const breezePool: WeatherParticleItem[] = [];
    const rainPool: WeatherParticleItem[] = [];
    const snowPool: WeatherParticleItem[] = [];

    const sunMat = new THREE.MeshBasicMaterial({
      map: sunBokehTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const petalColors = [0xfecdd3, 0xfbcfe8, 0xfef3c7, 0xd1fae5];
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const snowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });

    const sunGeo = new THREE.PlaneGeometry(0.45, 0.45);
    const petalGeo = new THREE.SphereGeometry(0.055, 8, 8);
    petalGeo.scale(1.3, 0.35, 0.85);
    const rainGeo = new THREE.PlaneGeometry(0.018, 0.42);
    const snowGeo = new THREE.SphereGeometry(0.048, 8, 8);

    for (let i = 0; i < particleCount; i++) {
      const rx = (Math.random() - 0.5) * 16;
      const ry = (Math.random() - 0.5) * 10;
      const rz = -1.2 + Math.random() * 2.2;

      const sm = new THREE.Mesh(sunGeo, sunMat);
      sm.visible = false;
      weatherGroup.add(sm);
      sunPool.push({
        mesh: sm,
        x: rx,
        y: ry,
        z: rz,
        speedY: 0.16 + Math.random() * 0.22,
        speedX: (Math.random() - 0.5) * 0.2,
        phase: Math.random() * Math.PI * 2,
        spinSpeed: 0,
        baseScale: 0.6 + Math.random() * 1.1,
      });

      const pm = new THREE.Mesh(
        petalGeo,
        new THREE.MeshStandardMaterial({
          color: petalColors[i % petalColors.length],
          roughness: 0.6,
          transparent: true,
          opacity: 0.85,
        })
      );
      pm.visible = false;
      weatherGroup.add(pm);
      breezePool.push({
        mesh: pm,
        x: rx,
        y: ry,
        z: rz,
        speedY: -0.55 - Math.random() * 0.45,
        speedX: 0.65 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
        spinSpeed: 1.4 + Math.random() * 2.0,
        baseScale: 0.75 + Math.random() * 0.6,
      });

      const rm = new THREE.Mesh(rainGeo, rainMat);
      rm.rotation.z = 0.14;
      rm.visible = false;
      weatherGroup.add(rm);
      rainPool.push({
        mesh: rm,
        x: rx,
        y: ry,
        z: rz,
        speedY: -7.5 - Math.random() * 3.5,
        speedX: -1.1 - Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        spinSpeed: 0,
        baseScale: 0.8 + Math.random() * 0.6,
      });

      const snm = new THREE.Mesh(snowGeo, snowMat);
      snm.visible = false;
      weatherGroup.add(snm);
      snowPool.push({
        mesh: snm,
        x: rx,
        y: ry,
        z: rz,
        speedY: -0.78 - Math.random() * 0.55,
        speedX: (Math.random() - 0.5) * 0.25,
        phase: Math.random() * Math.PI * 2,
        spinSpeed: 0.5,
        baseScale: 0.68 + Math.random() * 0.82,
      });
    }

    const rigsMap = new Map<BunnyId, BunnyRig>();
    const prevStatusesMap = new Map<BunnyId, BunnyBehaviorStatus>();

    let halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    let halfW = halfH * camera.aspect;
    let houseX = halfW - 1.06;
    let houseY = -halfH + 0.72;
    let treeX = -halfW + 1.5;
    let treeY = -halfH + 1.18;
    let snowmanX = 0;
    let snowmanY = -halfH + 0.92;
    let snowBoundsMinX = -3.0;
    let snowBoundsMaxX = 2.0;

    const updateStageLayout = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      halfW = halfH * camera.aspect;

      const worldPerPx = (halfW * 2) / w;
      const rightWorldInset = latestPropsRef.current.rightInsetPx * worldPerPx;
      const leftWorldInset = latestPropsRef.current.leftInsetPx * worldPerPx;

      houseX = halfW - rightWorldInset - 1.02;
      houseY = -halfH + 0.68;
      houseGroup.position.set(houseX, houseY, 0);

      treeX = Math.min(houseX - 2.6, -halfW + leftWorldInset + 1.32);
      treeY = -halfH + 1.18;
      treeGroup.position.set(treeX, treeY, -0.05);

      snowBoundsMinX = -halfW + leftWorldInset + 0.95;
      snowBoundsMaxX = Math.max(snowBoundsMinX + 1.2, houseX - 1.35);

      snowmanX = THREE.MathUtils.lerp(treeX, houseX, 0.54);
      snowmanY = -halfH + 0.88;
      snowmanGroup.position.set(snowmanX, snowmanY, 0.08);

      if (!isDraggingSnowball) {
        sbPosX = THREE.MathUtils.clamp(
          sbPosX === 0 ? snowmanX - 1.15 : sbPosX,
          snowBoundsMinX,
          snowBoundsMaxX
        );
        sbPosY = THREE.MathUtils.clamp(sbPosY, -halfH + 0.58, halfH - 1.6);
      }
    };

    const syncCharactersToScene = (charList: BunnyCharacterConfig[]) => {
      const nextIds = new Set(charList.map((c) => c.id));

      for (const [id, rig] of rigsMap.entries()) {
        if (!nextIds.has(id)) {
          scene.remove(rig.root);
          disposeObjectTree(rig.root);
          rigsMap.delete(id);
          prevStatusesMap.delete(id);
        }
      }

      charList.forEach((cfg) => {
        const sig = `${cfg.furHex}|${cfg.outfitHex}|${cfg.accentHex}|${cfg.accessory}`;
        const existing = rigsMap.get(cfg.id);

        if (existing && existing.signature !== sig) {
          const oldX = existing.posX;
          const oldY = existing.posY;
          const oldTargetX = existing.targetX;
          const oldTargetY = existing.targetY;
          const oldVis = existing.root.visible;
          const oldScale = existing.scaleFactor;

          scene.remove(existing.root);
          disposeObjectTree(existing.root);

          const rebuilt = buildCuteSlender3DBunny(cfg, shadowTex);
          rebuilt.posX = oldX;
          rebuilt.posY = oldY;
          rebuilt.targetX = oldTargetX;
          rebuilt.targetY = oldTargetY;
          rebuilt.scaleFactor = oldScale;
          rebuilt.root.visible = oldVis && cfg.enabled;
          scene.add(rebuilt.root);
          rigsMap.set(cfg.id, rebuilt);
        } else if (!existing) {
          const created = buildCuteSlender3DBunny(cfg, shadowTex);
          created.posX = houseX - 0.24;
          created.posY = houseY - 0.14;
          created.targetX = houseX - 0.24;
          created.targetY = houseY - 0.14;
          created.root.position.set(created.posX, created.posY, 0.25);
          created.root.visible = false;
          scene.add(created.root);
          rigsMap.set(cfg.id, created);
          prevStatusesMap.set(cfg.id, 'IN_HOUSE');
        }
      });
    };

    updateStageLayout();
    sbPosX = snowmanX - 1.15;
    sbPosY = -halfH + 0.72;
    syncCharactersToScene(latestPropsRef.current.characters);

    const resizeObserver = new ResizeObserver(updateStageLayout);
    resizeObserver.observe(container);

    // Raycasting for clicking 3D bunnies, cottage, AND rolling the 3D snowball!
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const updateNdcFromClient = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      return true;
    };

    const getHitInfo = (clientX: number, clientY: number) => {
      if (!updateNdcFromClient(clientX, clientY)) return null;

      const pickList: THREE.Object3D[] = [houseGroup];
      if (snowballRoot.visible) {
        pickList.unshift(snowballRoot);
      }
      rigsMap.forEach((r) => {
        if (r.root.visible) pickList.push(r.root);
      });

      const hits = raycaster.intersectObjects(pickList, true);
      for (const hit of hits) {
        let p: THREE.Object3D | null = hit.object;
        let visible = true;
        while (p) {
          if (!p.visible) {
            visible = false;
            break;
          }
          p = p.parent;
        }
        if (!visible) continue;
        if (hit.object.userData.hitType === 'snowball') {
          return { type: 'snowball' as const };
        }
        if (hit.object.userData.hitType === 'bunny' && hit.object.userData.bunnyId) {
          return { type: 'bunny' as const, bunnyId: String(hit.object.userData.bunnyId) };
        }
        if (hit.object.userData.hitType === 'house') {
          return { type: 'house' as const };
        }
      }
      return null;
    };

    const applySnowballRollDelta = (dx: number, dy: number) => {
      const dist = Math.hypot(dx, dy);
      if (dist < 0.0005) return;
      const radius = 0.2 * sbScale;
      _rollAxis.set(-dy, dx, 0).normalize();
      _rollQuat.setFromAxisAngle(_rollAxis, dist / Math.max(0.08, radius));
      snowballBall.quaternion.premultiply(_rollQuat);

      sbScale = Math.min(2.6, sbScale + dist * 0.14);
      if (Math.random() < 0.35) {
        spawnSnowBurst(sbPosX, sbPosY - 0.12, 1);
      }
      if (sbScale >= 2.55) {
        // Giant snowball completed! Celebrate & boost snowman!
        spawnSnowBurst(sbPosX, sbPosY, 8);
        snowmanBuildProgress = 1.0;
        sbScale = 1.0;
        sbVelX = 0;
        sbVelY = 0;
        isDraggingSnowball = false;
        latestPropsRef.current.onSnowballCompleted?.();
      }
    };

    let lastPointerTime = 0;
    const handleWindowPointerMove = (e: PointerEvent) => {
      if (latestPropsRef.current.isPaused) return;

      if (isDraggingSnowball) {
        if (updateNdcFromClient(e.clientX, e.clientY)) {
          if (raycaster.ray.intersectPlane(_snowPlane, _dragWorldPt)) {
            const clampedX = THREE.MathUtils.clamp(_dragWorldPt.x, snowBoundsMinX, snowBoundsMaxX);
            const clampedY = THREE.MathUtils.clamp(_dragWorldPt.y, -halfH + 0.56, halfH - 1.5);
            const dx = clampedX - sbPosX;
            const dy = clampedY - sbPosY;
            sbPosX = clampedX;
            sbPosY = clampedY;
            sbVelX = dx * 14;
            sbVelY = dy * 14;
            applySnowballRollDelta(dx, dy);
          }
        }
        document.body.style.cursor = 'grabbing';
        return;
      }

      // Throttle hover raycasts to ~20fps for crisp performance
      const nowMs = performance.now();
      if (nowMs - lastPointerTime < 45) return;
      lastPointerTime = nowMs;

      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('[data-bunny-ui="true"]')) return;
      const hit = getHitInfo(e.clientX, e.clientY);
      document.body.style.cursor = hit
        ? hit.type === 'snowball'
          ? 'grab'
          : 'pointer'
        : '';
    };

    const handleWindowPointerDown = (e: PointerEvent) => {
      if (latestPropsRef.current.isPaused) return;
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('button, input, select, textarea, a, form, [data-bunny-ui="true"]')) {
        return;
      }
      const hit = getHitInfo(e.clientX, e.clientY);
      if (!hit) return;

      if (hit.type === 'snowball') {
        isDraggingSnowball = true;
        // Give a gentle initial roll impulse even on a quick tap!
        const pushDir = sbPosX > (snowBoundsMinX + snowBoundsMaxX) * 0.5 ? -1 : 1;
        sbVelX = pushDir * 1.9;
        sbVelY = 0.45;
        spawnSnowBurst(sbPosX, sbPosY, 3);
        document.body.style.cursor = 'grabbing';
      } else if (hit.type === 'bunny') {
        latestPropsRef.current.onSummonBunny(hit.bunnyId);
      } else if (hit.type === 'house') {
        const enabled = latestPropsRef.current.enabledCharacters;
        const states = latestPropsRef.current.bunnies;
        const insideChar =
          enabled.find((c) => (states[c.id]?.status ?? 'IN_HOUSE') === 'IN_HOUSE') || enabled[0];
        if (insideChar) {
          latestPropsRef.current.onSummonBunny(insideChar.id);
        }
      }
    };

    const handleWindowPointerUp = () => {
      if (isDraggingSnowball) {
        isDraggingSnowball = false;
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true });
    window.addEventListener('pointerdown', handleWindowPointerDown);
    window.addEventListener('pointerup', handleWindowPointerUp);

    const projVec = new THREE.Vector3();
    const houseProjVec = new THREE.Vector3();
    const snowballProjVec = new THREE.Vector3();

    const pickRandomScreenPoint = (bunnyIdx: number, preferLowerLawn = false) => {
      const cw = container.clientWidth || window.innerWidth;
      const worldPerPx = cw > 0 ? (halfW * 2) / cw : 0.01;
      const leftPad = Math.max(1.15, latestPropsRef.current.leftInsetPx * worldPerPx + 0.9);
      const rightPad = Math.max(1.15, latestPropsRef.current.rightInsetPx * worldPerPx + 0.9);

      const minX = -halfW + leftPad;
      const maxX = Math.max(minX + 0.8, halfW - rightPad);
      const minY = -halfH + 0.82;
      const maxY = preferLowerLawn ? -halfH + 2.35 : halfH - 1.95;

      let rx = minX + Math.random() * Math.max(0.5, maxX - minX);
      const ry = minY + Math.random() * Math.max(0.4, maxY - minY);

      if (Math.abs(rx - houseX) < 1.25 && ry < houseY + 0.95) {
        rx -= 1.8 + (bunnyIdx % 3) * 0.35;
      }
      return { x: THREE.MathUtils.clamp(rx, minX, maxX), y: ry };
    };

    const pickTreeShelterSpot = (bunnyIdx: number) => {
      const offsets = [-0.46, 0.38, -0.05, -0.72, 0.68];
      const ox = offsets[bunnyIdx % offsets.length];
      const oy = -0.46 - (bunnyIdx % 2) * 0.14;
      return { x: treeX + ox, y: treeY + oy };
    };

    const pickSnowmanBuildSpot = (bunnyIdx: number) => {
      const side = bunnyIdx % 2 === 0 ? -1 : 1;
      const extra = Math.floor(bunnyIdx / 2) * 0.32;
      return {
        x: snowmanX + side * (0.68 + extra),
        y: snowmanY - 0.06 + (bunnyIdx % 2) * 0.08,
      };
    };

    let disposed = false;
    let loopRunning = false;
    let rafId = 0;
    let fenceTimerId = 0;
    let lastTime = performance.now();

    const gl = renderer.getContext() as WebGL2RenderingContext;
    const scheduleNextFrame = (fn: () => void) => {
      if (disposed || latestPropsRef.current.isPaused) {
        loopRunning = false;
        return;
      }
      if (!isSoftwareGl || typeof gl.fenceSync !== 'function') {
        rafId = requestAnimationFrame(fn);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed || latestPropsRef.current.isPaused) {
          if (sync) gl.deleteSync(sync);
          loopRunning = false;
          return;
        }
        if (!sync) {
          rafId = requestAnimationFrame(fn);
          return;
        }
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) {
          fenceTimerId = window.setTimeout(poll, 16);
        } else {
          gl.deleteSync(sync);
          fenceTimerId = window.setTimeout(() => {
            if (!disposed && !latestPropsRef.current.isPaused) {
              rafId = requestAnimationFrame(fn);
            } else {
              loopRunning = false;
            }
          }, 80);
        }
      };
      fenceTimerId = window.setTimeout(poll, 16);
    };

    const updateWeatherPool = (
      pool: WeatherParticleItem[],
      active: boolean,
      kind: ResolvedWeatherKind,
      dt: number,
      elapsed: number
    ) => {
      const boundW = halfW + 1.5;
      const boundH = halfH + 1.4;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        p.mesh.visible = active;
        if (!active) continue;

        if (kind === 'sun') {
          p.y += p.speedY * dt;
          p.x += Math.sin(elapsed * 0.6 + p.phase) * 0.18 * dt;
          const pulse = 0.72 + Math.sin(elapsed * 1.4 + p.phase) * 0.28;
          p.mesh.scale.setScalar(p.baseScale * pulse);
          if (p.y > boundH) p.y = -boundH;
        } else if (kind === 'breeze') {
          const gust = 1.0 + Math.sin(elapsed * 0.85) * 0.35;
          p.x += p.speedX * gust * dt;
          p.y += (p.speedY + Math.sin(elapsed * 1.8 + p.phase) * 0.22) * dt;
          p.mesh.rotation.x += p.spinSpeed * dt;
          p.mesh.rotation.y += p.spinSpeed * 0.8 * dt;
          p.mesh.rotation.z += p.spinSpeed * 0.5 * dt;
          p.mesh.scale.setScalar(p.baseScale);
          if (p.x > boundW) p.x = -boundW;
          if (p.y < -boundH) p.y = boundH;
        } else if (kind === 'rain') {
          p.x += p.speedX * dt;
          p.y += p.speedY * dt;
          p.mesh.scale.setScalar(p.baseScale);
          if (p.y < -boundH) {
            p.y = boundH;
            p.x = (Math.random() - 0.5) * boundW * 2;
          }
          if (p.x < -boundW) p.x = boundW;
        } else if (kind === 'snow') {
          p.y += p.speedY * dt;
          p.x += (p.speedX + Math.sin(elapsed * 1.2 + p.phase) * 0.32) * dt;
          p.mesh.scale.setScalar(p.baseScale);
          if (p.y < -boundH) {
            p.y = boundH;
            p.x = (Math.random() - 0.5) * boundW * 2;
          }
        }

        p.mesh.position.set(p.x, p.y, p.z);
      }
    };

    const tick = () => {
      if (disposed || latestPropsRef.current.isPaused) {
        loopRunning = false;
        return;
      }
      loopRunning = true;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const elapsed = now * 0.001;

      const {
        characters: allChars,
        bunnies: currentBunnies,
        resolvedWeather: wKind,
      } = latestPropsRef.current;

      updateWeatherPool(sunPool, wKind === 'sun', 'sun', dt, elapsed);
      updateWeatherPool(breezePool, wKind === 'breeze', 'breeze', dt, elapsed);
      updateWeatherPool(rainPool, wKind === 'rain', 'rain', dt, elapsed);
      updateWeatherPool(snowPool, wKind === 'snow', 'snow', dt, elapsed);

      keyLight.intensity = wKind === 'rain' ? 1.15 : wKind === 'sun' ? 1.65 : 1.48;

      // Chimney smoke puffs
      for (let si = 0; si < smokePuffs.length; si++) {
        const sp = smokePuffs[si];
        const sProg = (elapsed * 0.45 + si * 0.5) % 1.0;
        sp.position.y = 1.28 + sProg * 0.42;
        sp.position.x = 0.45 + Math.sin(elapsed * 1.5 + si) * 0.04 + sProg * 0.08;
        sp.scale.setScalar(0.65 + Math.sin(sProg * Math.PI) * 0.55);
      }

      // Rain/Snow Shelter Tree
      const anySheltering = allChars.some(
        (c) => c.enabled && currentBunnies[c.id]?.status === 'SHELTERING_UNDER_TREE'
      );
      const showShelterTree = wKind === 'rain' || wKind === 'snow' || anySheltering;
      treeScale = THREE.MathUtils.damp(treeScale, showShelterTree ? 0.92 : 0.001, 5.5, dt);
      treeGroup.visible = treeScale > 0.03;
      if (treeGroup.visible) {
        treeGroup.scale.setScalar(treeScale);
        canopyGroup.rotation.z = Math.sin(elapsed * 2.1) * (wKind === 'rain' ? 0.045 : 0.022);
      }

      // 3D Snowman Visibility & Progressive Building Animation ('BUILDING_SNOWMAN')
      const anyBuildingSnowman = allChars.some(
        (c) => c.enabled && currentBunnies[c.id]?.status === 'BUILDING_SNOWMAN'
      );
      const showSnowman = wKind === 'snow' || anyBuildingSnowman;
      snowmanScale = THREE.MathUtils.damp(snowmanScale, showSnowman ? 0.96 : 0.001, 5.2, dt);
      snowmanGroup.visible = snowmanScale > 0.03;
      if (snowmanGroup.visible) {
        if (anyBuildingSnowman) {
          snowmanBuildProgress += dt * 0.16;
          if (snowmanBuildProgress > 1.15) snowmanBuildProgress = 0.42;
        } else {
          snowmanBuildProgress = THREE.MathUtils.damp(snowmanBuildProgress, 1.0, 2.5, dt);
        }
        const midProg = THREE.MathUtils.clamp((snowmanBuildProgress - 0.15) / 0.45, 0.25, 1.0);
        const headProg = THREE.MathUtils.clamp((snowmanBuildProgress - 0.45) / 0.45, 0.01, 1.0);
        snowmanGroup.scale.setScalar(snowmanScale);
        middleTierGroup.scale.setScalar(midProg);
        headTierGroup.scale.setScalar(headProg);
        headTierGroup.visible = headProg > 0.08;
        snowmanGroup.rotation.z = Math.sin(elapsed * 1.8) * 0.025;
      }

      // Interactive User-Rollable 3D Snowball Physics (Drag + Momentum + Growth!)
      const showInteractiveSnowball = wKind === 'snow';
      sbVisibilityScale = THREE.MathUtils.damp(
        sbVisibilityScale,
        showInteractiveSnowball ? 1.0 : 0.001,
        6,
        dt
      );
      snowballRoot.visible = sbVisibilityScale > 0.04;
      if (snowballRoot.visible) {
        if (!isDraggingSnowball && (Math.abs(sbVelX) > 0.02 || Math.abs(sbVelY) > 0.02)) {
          const stepX = sbVelX * dt;
          const stepY = sbVelY * dt;
          sbPosX += stepX;
          sbPosY += stepY;

          if (sbPosX < snowBoundsMinX) {
            sbPosX = snowBoundsMinX;
            sbVelX = Math.abs(sbVelX) * 0.65;
          } else if (sbPosX > snowBoundsMaxX) {
            sbPosX = snowBoundsMaxX;
            sbVelX = -Math.abs(sbVelX) * 0.65;
          }
          if (sbPosY < -halfH + 0.56) {
            sbPosY = -halfH + 0.56;
            sbVelY = Math.abs(sbVelY) * 0.65;
          } else if (sbPosY > halfH - 1.5) {
            sbPosY = halfH - 1.5;
            sbVelY = -Math.abs(sbVelY) * 0.65;
          }

          applySnowballRollDelta(stepX, stepY);
          sbVelX = THREE.MathUtils.damp(sbVelX, 0, 3.2, dt);
          sbVelY = THREE.MathUtils.damp(sbVelY, 0, 3.2, dt);
        }

        const effScale = sbScale * sbVisibilityScale;
        const radiusOffset = (sbScale - 1.0) * 0.16;
        snowballRoot.position.set(sbPosX, sbPosY + radiusOffset, 0.34);
        snowballBall.scale.setScalar(effScale);
        snowballShadow.scale.set(effScale, effScale, 1);
        snowballShadow.position.y = -0.19 * effScale;

        if (snowballTagDomRef.current) {
          snowballProjVec.set(sbPosX, sbPosY + 0.28 * effScale + 0.16, 0.34);
          snowballProjVec.project(camera);
          const cw = container.clientWidth || window.innerWidth;
          const ch = container.clientHeight || window.innerHeight;
          const sx = THREE.MathUtils.clamp((snowballProjVec.x * 0.5 + 0.5) * cw, 110, cw - 110);
          const sy = THREE.MathUtils.clamp((-snowballProjVec.y * 0.5 + 0.5) * ch, 60, ch - 48);
          snowballTagDomRef.current.style.opacity = '1';
          snowballTagDomRef.current.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -100%)`;
          if (snowballPctSpanRef.current) {
            snowballPctSpanRef.current.textContent = `${Math.round(sbScale * 100)}%`;
          }
        }
      } else if (snowballTagDomRef.current) {
        snowballTagDomRef.current.style.opacity = '0';
      }

      // Update Flying Snowball Projectiles ('SNOWBALL_FIGHT')
      for (let pi = 0; pi < snowballProjectiles.length; pi++) {
        const pr = snowballProjectiles[pi];
        if (!pr.active) continue;
        pr.age += dt;
        pr.vy += -9.4 * dt;
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.z += pr.vz * dt;
        pr.mesh.position.set(pr.x, pr.y, pr.z);
        pr.mesh.rotation.z -= dt * 9;

        if (pr.age >= pr.maxAge) {
          pr.active = false;
          pr.mesh.visible = false;
          spawnSnowBurst(pr.x, pr.y, 5);
        }
      }

      // Update Snow Impact Burst Puffs
      for (let bi = 0; bi < snowBurstPuffs.length; bi++) {
        const bp = snowBurstPuffs[bi];
        if (!bp.active) continue;
        bp.age += dt;
        bp.vy += -4.5 * dt;
        bp.x += bp.vx * dt;
        bp.y += bp.vy * dt;
        bp.z += bp.vz * dt;
        bp.mesh.position.set(bp.x, bp.y, bp.z);
        const fade = Math.max(0.01, 1 - bp.age / 0.55);
        bp.mesh.scale.setScalar(fade * 1.15);
        if (bp.age >= 0.55) {
          bp.active = false;
          bp.mesh.visible = false;
        }
      }

      let anyDoorActivity = false;
      let insideCount = 0;
      let enabledTotal = 0;

      // Collect outdoor bunny positions for snowball fight targeting
      const outdoorRigs: BunnyRig[] = [];
      allChars.forEach((c) => {
        const r = rigsMap.get(c.id);
        const st = currentBunnies[c.id]?.status;
        if (c.enabled && r && st && st !== 'IN_HOUSE') {
          outdoorRigs.push(r);
        }
      });

      allChars.forEach((cfg, idx) => {
        const rig = rigsMap.get(cfg.id);
        if (!rig) return;

        const bubbleEl = bubbleDomRefs.current[cfg.id];

        if (!cfg.enabled) {
          rig.root.visible = false;
          if (bubbleEl) bubbleEl.style.opacity = '0';
          return;
        }

        enabledTotal += 1;
        const bState: BunnyIndividualState = currentBunnies[cfg.id] ?? {
          status: 'IN_HOUSE',
          bubbleText: cfg.greeting,
          isSpeaking: false,
          isThinking: false,
          photoIndex: 0,
        };
        const prevStatus = prevStatusesMap.get(cfg.id) ?? 'IN_HOUSE';

        if (bState.status !== prevStatus) {
          if (prevStatus === 'IN_HOUSE' && bState.status !== 'IN_HOUSE') {
            rig.posX = houseX - 0.24;
            rig.posY = houseY - 0.14;
            rig.velX = -0.8;
            rig.velY = 0.35;
            rig.scaleFactor = 0.25;
          }

          if (bState.status === 'CHATTING') {
            if (prevStatus !== 'IN_HOUSE') {
              rig.targetX = THREE.MathUtils.clamp(rig.posX, -halfW + 1.85, halfW - 2.05);
              rig.targetY = THREE.MathUtils.clamp(rig.posY, -halfH + 0.95, halfH - 2.85);
            } else {
              const spotOffset = ((idx % 3) - 1) * 1.75;
              rig.targetX = THREE.MathUtils.clamp(spotOffset, -halfW + 1.85, houseX - 2.0);
              rig.targetY = -halfH + 1.18;
            }
          } else if (bState.status === 'GOING_HOME') {
            rig.targetX = houseX - 0.24;
            rig.targetY = houseY - 0.14;
            rig.arrivedNotified = false;
          } else if (bState.status === 'SHELTERING_UNDER_TREE') {
            const spot = pickTreeShelterSpot(idx);
            rig.targetX = spot.x;
            rig.targetY = spot.y;
            rig.nextWaypointTimer = 9.0 + Math.random() * 4.0;
          } else if (bState.status === 'BUILDING_SNOWMAN') {
            const spot = pickSnowmanBuildSpot(idx);
            rig.targetX = spot.x;
            rig.targetY = spot.y;
            rig.nextWaypointTimer = 9.0 + Math.random() * 4.0;
          } else if (bState.status === 'RESTING_ON_GRASS') {
            const pt = pickRandomScreenPoint(idx, true);
            rig.targetX = pt.x;
            rig.targetY = pt.y;
            rig.nextWaypointTimer = 9.0 + Math.random() * 4.0;
          } else if (bState.status !== 'IN_HOUSE') {
            const pt = pickRandomScreenPoint(idx, bState.status === 'SNOWBALL_FIGHT');
            rig.targetX = pt.x;
            rig.targetY = pt.y;
            rig.nextWaypointTimer = 5.0 + Math.random() * 4.5;
          }

          prevStatusesMap.set(cfg.id, bState.status);
        }

        if (bState.status === 'IN_HOUSE') {
          insideCount += 1;
          rig.scaleFactor = THREE.MathUtils.damp(rig.scaleFactor, 0.01, 8, dt);
          if (rig.scaleFactor < 0.05) rig.root.visible = false;
          if (bubbleEl) bubbleEl.style.opacity = '0';
          return;
        }

        rig.root.visible = true;
        rig.scaleFactor = THREE.MathUtils.damp(rig.scaleFactor, 1.0, 6.5, dt);

        const isRoaming =
          bState.status !== 'CHATTING' &&
          bState.status !== 'GOING_HOME' &&
          bState.status !== 'SHELTERING_UNDER_TREE' &&
          bState.status !== 'BUILDING_SNOWMAN' &&
          bState.status !== 'RESTING_ON_GRASS';

        if (isRoaming) {
          rig.nextWaypointTimer -= dt;
          if (rig.nextWaypointTimer <= 0) {
            const pt = pickRandomScreenPoint(idx, bState.status === 'SNOWBALL_FIGHT');
            rig.targetX = pt.x;
            rig.targetY = pt.y;
            rig.nextWaypointTimer =
              bState.status === 'SNOWBALL_FIGHT'
                ? 3.2 + Math.random() * 2.5
                : 5.5 + Math.random() * 5.0;
          }
        } else if (bState.status === 'SHELTERING_UNDER_TREE') {
          const spot = pickTreeShelterSpot(idx);
          rig.targetX = spot.x;
          rig.targetY = spot.y;
        } else if (bState.status === 'BUILDING_SNOWMAN') {
          const spot = pickSnowmanBuildSpot(idx);
          rig.targetX = spot.x;
          rig.targetY = spot.y;
        }

        const dx = rig.targetX - rig.posX;
        const dy = rig.targetY - rig.posY;
        const dist = Math.hypot(dx, dy);

        const topSpeed =
          bState.status === 'CHATTING'
            ? 3.0
            : bState.status === 'SHELTERING_UNDER_TREE'
            ? 2.6
            : bState.status === 'SNOWBALL_FIGHT'
            ? 2.25
            : bState.status === 'GOING_HOME'
            ? 2.35
            : 1.5;
        const desiredSpeed = dist > 0.05 ? Math.min(topSpeed, dist * 2.1) : 0;
        const desiredVx = dist > 0.05 ? (dx / dist) * desiredSpeed : 0;
        const desiredVy = dist > 0.05 ? (dy / dist) * desiredSpeed : 0;

        const prevPosX = rig.posX;
        const prevPosY = rig.posY;
        rig.velX = THREE.MathUtils.damp(rig.velX, desiredVx, 5.2, dt);
        rig.velY = THREE.MathUtils.damp(rig.velY, desiredVy, 5.2, dt);
        rig.posX += rig.velX * dt;
        rig.posY += rig.velY * dt;

        const frameDistMoved = Math.hypot(rig.posX - prevPosX, rig.posY - prevPosY);
        const actualSpeed = Math.hypot(rig.velX, rig.velY);
        const settled = dist < 0.45;

        if (dist <= 0.1 && bState.status === 'GOING_HOME' && !rig.arrivedNotified) {
          rig.arrivedNotified = true;
          latestPropsRef.current.onBunnyArrivedHome(cfg.id);
        }

        if (Math.hypot(rig.posX - (houseX - 0.24), rig.posY - (houseY - 0.14)) < 1.0) {
          anyDoorActivity = true;
        }

        const wantsSit = bState.status === 'RESTING_ON_GRASS' && settled;
        rig.sitAmount = THREE.MathUtils.damp(rig.sitAmount, wantsSit ? 1.0 : 0.0, 6.0, dt);

        // Snowball Fight Throw Logic
        let isWindingUpThrow = false;
        if (bState.status === 'SNOWBALL_FIGHT') {
          rig.snowThrowTimer -= dt;
          if (rig.snowThrowTimer < 0.45) {
            isWindingUpThrow = true;
          }
          if (rig.snowThrowTimer <= 0) {
            const peers = outdoorRigs.filter((o) => o.id !== rig.id);
            const targetRig = peers.length > 0 ? peers[Math.floor(Math.random() * peers.length)] : null;
            const aimX = targetRig
              ? targetRig.posX + (Math.random() - 0.5) * 0.4
              : snowmanX + (Math.random() - 0.5) * 2.2;
            const aimY = targetRig
              ? targetRig.posY + 0.1
              : -halfH + 0.9 + Math.random() * 0.8;
            launchSnowballProjectile(rig.posX, rig.posY, aimX, aimY);
            rig.snowThrowTimer = 1.9 + Math.random() * 1.4;
          }
        }
        rig.heldSnowballMesh.visible = bState.status === 'SNOWBALL_FIGHT' && isWindingUpThrow;

        let hopY = 0;
        if (actualSpeed > 0.14) {
          rig.hopPhase += dt * (6.2 + actualSpeed * 2.2);
          const s = Math.abs(Math.sin(rig.hopPhase));
          hopY = s * (0.14 + Math.min(0.12, actualSpeed * 0.05));
          const targetSquash = 0.94 + s * 0.11;
          rig.squashY = THREE.MathUtils.damp(rig.squashY, targetSquash, 12, dt);

          const desiredYaw = Math.atan2(rig.velX, 1.15) * 0.62;
          rig.facingYaw = THREE.MathUtils.damp(rig.facingYaw, desiredYaw, 6.5, dt);
          rig.bankRoll = THREE.MathUtils.damp(rig.bankRoll, -rig.velX * 0.045, 6, dt);
        } else if (bState.status === 'BUILDING_SNOWMAN' && settled) {
          // Face toward the 3D snowman and hop cheerfully while patting snow!
          const dirToSnowman = snowmanX - rig.posX >= 0 ? 0.36 : -0.36;
          hopY = Math.abs(Math.sin(elapsed * 5.2 + idx)) * 0.055;
          rig.squashY = THREE.MathUtils.damp(rig.squashY, 0.96 + hopY * 0.6, 10, dt);
          rig.facingYaw = THREE.MathUtils.damp(rig.facingYaw, dirToSnowman, 7, dt);
          rig.bankRoll = THREE.MathUtils.damp(rig.bankRoll, Math.sin(elapsed * 5.2) * 0.04, 8, dt);
        } else if (bState.status === 'SHELTERING_UNDER_TREE' && settled) {
          const shakeCycle = (elapsed + idx * 1.7) % 4.8;
          const isShaking = shakeCycle > 4.25;
          hopY = Math.sin(elapsed * 2.4 + idx) * 0.012;
          rig.squashY = THREE.MathUtils.damp(rig.squashY, 0.93, 8, dt);
          rig.facingYaw = THREE.MathUtils.damp(
            rig.facingYaw,
            isShaking ? Math.sin(elapsed * 38) * 0.24 : Math.sin(elapsed * 0.9 + idx) * 0.16,
            10,
            dt
          );
          rig.bankRoll = THREE.MathUtils.damp(
            rig.bankRoll,
            isShaking ? Math.cos(elapsed * 36) * 0.08 : 0,
            10,
            dt
          );
        } else {
          hopY = Math.sin(elapsed * 2.0 + idx * 1.3) * 0.016 * (1 - rig.sitAmount * 0.5);
          rig.squashY = THREE.MathUtils.damp(
            rig.squashY,
            1.0 + Math.sin(elapsed * 2.1 + idx) * 0.015,
            8,
            dt
          );
          rig.facingYaw = THREE.MathUtils.damp(
            rig.facingYaw,
            Math.sin(elapsed * 0.7 + idx * 2.1) * 0.12,
            4.5,
            dt
          );
          rig.bankRoll = THREE.MathUtils.damp(rig.bankRoll, 0, 6, dt);
        }

        const hopVelY = (hopY - rig.prevHopY) / Math.max(dt, 0.001);
        rig.prevHopY = hopY;
        rig.earLagPitch = THREE.MathUtils.damp(rig.earLagPitch, -hopVelY * 0.12, 10, dt);

        rig.root.position.set(rig.posX, rig.posY, 0.3 + idx * 0.06);
        rig.root.scale.setScalar(rig.scaleFactor * 0.96);
        rig.bodyGroup.position.y = hopY - rig.sitAmount * 0.125;
        rig.bodyGroup.rotation.y = rig.facingYaw;
        rig.bodyGroup.rotation.z = rig.bankRoll;

        rig.squashGroup.rotation.x = -0.14 * rig.sitAmount;

        rig.leftFootPivot.rotation.x = -0.96 * rig.sitAmount;
        rig.rightFootPivot.rotation.x = -0.96 * rig.sitAmount;
        rig.leftFootPivot.position.z = 0.04 + rig.sitAmount * 0.11;
        rig.rightFootPivot.position.z = 0.04 + rig.sitAmount * 0.11;
        rig.leftFootPivot.rotation.y = 0.18 * rig.sitAmount;
        rig.rightFootPivot.rotation.y = -0.18 * rig.sitAmount;

        const invSquashXZ = 1 / Math.sqrt(Math.max(0.8, rig.squashY));
        rig.squashGroup.scale.set(invSquashXZ, rig.squashY, invSquashXZ);

        const shadowScale = Math.max(0.66, 1.0 - hopY * 1.1 + rig.sitAmount * 0.12);
        rig.shadowDisc.scale.set(shadowScale, shadowScale, 1);

        const isUnderTreeNow = bState.status === 'SHELTERING_UNDER_TREE' && settled;
        const rainEarDroop = isUnderTreeNow ? 0.14 : 0;
        const earSway = Math.sin(elapsed * 2.4 + idx * 1.9) * 0.055;
        const singleTwitch = Math.pow(Math.max(0, Math.sin(elapsed * 0.9 + idx * 2.7)), 14) * 0.18;
        rig.leftEarPivot.rotation.z =
          0.11 +
          rainEarDroop +
          earSway +
          singleTwitch +
          (bState.isSpeaking ? Math.sin(elapsed * 11) * 0.07 : 0);
        rig.rightEarPivot.rotation.z =
          -0.11 -
          rainEarDroop -
          earSway -
          (bState.isSpeaking ? Math.cos(elapsed * 11) * 0.07 : 0);
        rig.leftEarPivot.rotation.x = rig.earLagPitch;
        rig.rightEarPivot.rotation.x = rig.earLagPitch;

        // Expressive Arm Postures (Chatting, Snowman Patting, Snowball Fight, Rolling Snowball, Grass Rest, Tree Shelter)
        if (bState.status === 'CHATTING' || bState.isSpeaking) {
          rig.rightArmPivot.rotation.z = -1.75 + Math.sin(elapsed * 8.5) * 0.32;
          rig.leftArmPivot.rotation.z = 0.3 + Math.cos(elapsed * 5.5) * 0.1;
          rig.headGroup.rotation.z = Math.sin(elapsed * 3.0) * 0.065;
          rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, 0, 6, dt);
        } else if (bState.status === 'BUILDING_SNOWMAN' && settled) {
          // Rapidly patting & sculpting the 3D snowman with both paws!
          rig.leftArmPivot.rotation.z = 0.95 + Math.sin(elapsed * 12 + idx) * 0.35;
          rig.rightArmPivot.rotation.z = -0.95 + Math.cos(elapsed * 12 + idx) * 0.35;
          rig.headGroup.rotation.z = Math.sin(elapsed * 3.2 + idx) * 0.08;
          rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, -0.06, 6, dt);
        } else if (bState.status === 'SNOWBALL_FIGHT') {
          if (isWindingUpThrow) {
            rig.rightArmPivot.rotation.z = -2.25;
            rig.leftArmPivot.rotation.z = 0.55;
          } else {
            rig.rightArmPivot.rotation.z = -0.55 + Math.sin(elapsed * 7 + idx) * 0.3;
            rig.leftArmPivot.rotation.z = 0.4 + Math.cos(elapsed * 7 + idx) * 0.25;
          }
          rig.headGroup.rotation.z = Math.sin(elapsed * 3.5 + idx) * 0.07;
          rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, 0, 6, dt);
        } else if (bState.status === 'ROLLING_SNOWBALL') {
          // Both paws extended forward pushing the rolling snowball!
          rig.leftArmPivot.rotation.z = 0.78 + Math.sin(elapsed * 8) * 0.14;
          rig.rightArmPivot.rotation.z = -0.78 - Math.sin(elapsed * 8) * 0.14;
          rig.headGroup.rotation.z = Math.sin(elapsed * 2.2) * 0.05;
          rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, 0.08, 6, dt);
        } else if (wantsSit) {
          rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, -0.25, 6, dt);
          rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, 0.25, 6, dt);
          rig.headGroup.rotation.z = Math.sin(elapsed * 1.35 + idx) * 0.11;
          rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, -0.08, 5, dt);
        } else if (isUnderTreeNow) {
          rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, 0.18, 6, dt);
          rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, -0.18, 6, dt);
          rig.headGroup.rotation.z = Math.sin(elapsed * 1.8 + idx) * 0.06;
          const lookUp = -0.16 + Math.sin(elapsed * 1.1 + idx) * 0.08;
          rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, lookUp, 5, dt);
        } else if (bState.status === 'PLAYING_BALL' && settled) {
          rig.rightArmPivot.rotation.z = -0.85 + Math.sin(elapsed * 6.2 + idx) * 0.35;
          rig.leftArmPivot.rotation.z = 0.25;
          rig.headGroup.rotation.z = Math.sin(elapsed * 2.5 + idx) * 0.05;
          rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, 0, 6, dt);
        } else {
          rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, 0, 6, dt);
          rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, 0, 6, dt);
          rig.headGroup.rotation.z = Math.sin(elapsed * 1.4 + idx * 1.5) * 0.045;
          rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, 0, 6, dt);
        }

        const mouthOpen = bState.isSpeaking ? 0.3 + Math.abs(Math.sin(elapsed * 15)) * 0.72 : 0.22;
        rig.mouthMesh.scale.set(0.95, mouthOpen, 0.45);

        // Outdoor Props Visibility & Kinematics
        rig.ballProp.visible = bState.status === 'PLAYING_BALL' && settled;
        if (rig.ballProp.visible) {
          const bBounce = Math.abs(Math.sin(elapsed * 4.8 + idx));
          const rollX = 0.34 + Math.cos(elapsed * 2.4 + idx) * 0.08;
          rig.ballMesh.position.set(rollX, -0.35 + bBounce * 0.26, 0.18);
          rig.ballMesh.rotation.z -= dt * 3.8;
          rig.ballMesh.rotation.x += dt * 2.1;
        }

        rig.pinwheelProp.visible = bState.status === 'SPINNING_PINWHEEL';
        if (rig.pinwheelProp.visible) {
          const windBoost = wKind === 'breeze' ? 3.2 : 0;
          rig.pinwheelBlades.rotation.z -= dt * (4.2 + actualSpeed * 2.5 + windBoost);
        }

        rig.blocksProp.visible = bState.status === 'STACKING_BLOCKS' && settled;
        if (rig.blocksProp.visible) {
          rig.topBlockMesh.position.y = -0.24 + Math.abs(Math.sin(elapsed * 3.2 + idx)) * 0.09;
          rig.topBlockMesh.rotation.y = elapsed * 0.9;
        }

        rig.carProp.visible = bState.status === 'PULLING_CAR';
        if (rig.carProp.visible) {
          const sideSign = rig.velX >= 0 ? -1 : 1;
          rig.carProp.position.x = THREE.MathUtils.damp(
            rig.carProp.position.x,
            sideSign * 0.44,
            5,
            dt
          );
          rig.carProp.rotation.y = sideSign < 0 ? 0.1 : Math.PI - 0.1;
          const wheelSpin = (actualSpeed > 0.1 ? actualSpeed * 6 : 1.5) * dt;
          for (let wi = 0; wi < rig.carWheels.length; wi++) {
            rig.carWheels[wi].rotation.z -= wheelSpin;
          }
        }

        rig.bubblesProp.visible = bState.status === 'BLOWING_BUBBLES' && settled;
        if (rig.bubblesProp.visible) {
          for (let bi = 0; bi < rig.soapBubbles.length; bi++) {
            const sb = rig.soapBubbles[bi];
            const prog = ((elapsed * sb.speed + sb.phase) % 2.2) / 2.2;
            sb.mesh.position.set(
              0.32 + Math.sin(prog * Math.PI * 2 + sb.phase) * 0.14 + sb.driftX * prog,
              -0.02 + prog * 0.92,
              0.2 + Math.cos(prog * Math.PI) * 0.08
            );
            const bScale = prog < 0.85 ? 0.35 + prog * 0.85 : (1 - prog) * 6.5;
            sb.mesh.scale.setScalar(Math.max(0.01, bScale));
          }
        }

        rig.photoProp.visible = bState.status === 'ADMIRING_PHOTO' && settled;
        if (rig.photoProp.visible) {
          rig.photoProp.position.y = -0.11 + Math.sin(elapsed * 2.8 + idx) * 0.04;
        }

        rig.grassRestProp.visible = rig.sitAmount > 0.12;
        if (rig.grassRestProp.visible) {
          rig.grassRestProp.scale.setScalar(Math.min(1, rig.sitAmount * 1.1));
        }

        // Autonomous Bunny Rolling Snowball ('ROLLING_SNOWBALL')
        rig.rollingSnowballProp.visible = bState.status === 'ROLLING_SNOWBALL';
        if (rig.rollingSnowballProp.visible) {
          const pushDir = rig.velX >= 0 ? 1 : -1;
          rig.rollingSnowballProp.position.x = THREE.MathUtils.damp(
            rig.rollingSnowballProp.position.x,
            pushDir * 0.36,
            6,
            dt
          );
          rig.rollingSnowballBall.rotation.z -= pushDir * (frameDistMoved * 5.2 + dt * 1.2);
          rig.rollingSnowScale += frameDistMoved * 0.08;
          if (rig.rollingSnowScale > 1.55) rig.rollingSnowScale = 0.8;
          rig.rollingSnowballBall.scale.setScalar(rig.rollingSnowScale);
        }

        rig.umbrellaProp.visible =
          wKind === 'rain' &&
          !isUnderTreeNow &&
          bState.status !== 'CHATTING' &&
          bState.status !== 'SPINNING_PINWHEEL';

        if (bubbleEl) {
          projVec.set(rig.posX, rig.posY + hopY + 0.76 - rig.sitAmount * 0.1, rig.root.position.z);
          projVec.project(camera);
          const cw = container.clientWidth || window.innerWidth;
          const ch = container.clientHeight || window.innerHeight;
          const rawX = (projVec.x * 0.5 + 0.5) * cw;
          const rawY = (-projVec.y * 0.5 + 0.5) * ch;

          const isExpandedCard = bState.status === 'CHATTING';
          const padX = isExpandedCard ? 168 : 98;
          const minTop = isExpandedCard ? 265 : 56;
          const clampedX = Math.max(padX, Math.min(cw - padX, rawX));
          const clampedY = Math.max(minTop, Math.min(ch - 76, rawY));

          bubbleEl.style.opacity = '1';
          bubbleEl.style.transform = `translate3d(${Math.round(clampedX)}px, ${Math.round(clampedY)}px, 0) translate(-50%, -100%)`;
        }
      });

      const targetDoorAngle = anyDoorActivity || insideCount < enabledTotal ? -1.12 : 0;
      doorPivot.rotation.y = THREE.MathUtils.damp(doorPivot.rotation.y, targetDoorAngle, 6, dt);
      windowMat.emissiveIntensity = insideCount > 0 ? 0.72 : 0.24;

      if (houseTagDomRef.current) {
        houseProjVec.set(houseX, houseY + 0.96, 0);
        houseProjVec.project(camera);
        const cw = container.clientWidth || window.innerWidth;
        const ch = container.clientHeight || window.innerHeight;
        const maxRight = cw - latestPropsRef.current.rightInsetPx - 96;
        const hx = Math.max(100, Math.min(maxRight, (houseProjVec.x * 0.5 + 0.5) * cw));
        const hy = (-houseProjVec.y * 0.5 + 0.5) * ch;
        houseTagDomRef.current.style.transform = `translate3d(${Math.round(hx)}px, ${Math.round(hy)}px, 0) translate(-50%, -100%)`;
      }

      renderer.render(scene, camera);
      scheduleNextFrame(tick);
    };

    sceneSyncRef.current = {
      syncCharacters: syncCharactersToScene,
      syncLayout: updateStageLayout,
      resumeIfActive: () => {
        if (!disposed && !loopRunning && !latestPropsRef.current.isPaused) {
          lastTime = performance.now();
          loopRunning = true;
          rafId = requestAnimationFrame(tick);
        }
      },
    };

    if (!latestPropsRef.current.isPaused) {
      loopRunning = true;
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      loopRunning = false;
      sceneSyncRef.current = {};
      cancelAnimationFrame(rafId);
      window.clearTimeout(fenceTimerId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerdown', handleWindowPointerDown);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      document.body.style.cursor = '';

      disposeObjectTree(scene);
      shadowTex.dispose();
      sunBokehTex.dispose();
      envRT.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleChatSubmit = (e: React.FormEvent, id: BunnyId) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    onSendBunnyMessage(id, replyText.trim());
    setReplyText('');
  };

  return (
    <div
      ref={canvasHostRef}
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
      aria-label="3D 동물친구 및 날씨 효과 레이어"
    >
      {/* Interactive 3D Snowball Rolling Hint Label (Shown Only When Snowing) */}
      <div
        ref={snowballTagDomRef}
        style={{ left: 0, top: 0, opacity: 0 }}
        className="pointer-events-none absolute z-30 will-change-transform transition-opacity duration-150"
      >
        <div className="rounded-xl bg-[#141519] text-white px-2.5 py-1 text-[11px] font-semibold shadow-md flex items-center gap-1.5 whitespace-nowrap">
          <Snowflake className="w-3 h-3 text-sky-300 shrink-0" />
          <span>눈덩이를 드래그해 굴려보세요</span>
          <span aria-hidden="true">·</span>
          <span ref={snowballPctSpanRef} className="tabular-nums text-sky-300">
            100%
          </span>
        </div>
      </div>

      {/* 10x Larger Giant Storybook Picture Flashcard (ONLY During Active Child Conversation!) */}
      {activeGiantCardInfo && (
        <div
          data-bunny-ui="true"
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35"
        >
          <div className="w-[min(700px,92vw)] min-h-[430px] sm:min-h-[460px] rounded-[32px] bg-[#FFFCF7] border border-black/12 shadow-[0_32px_90px_rgba(20,21,25,0.32)] p-6 sm:p-8 flex flex-col justify-between text-[#141519]">
            {/* Top Bar: Bunny Teacher Header + 60s Voice Wait Timer + Close */}
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 pb-3.5">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#141519]">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: activeGiantCardInfo.cfg.accentHex }}
                />
                <span>{activeGiantCardInfo.cfg.name}의 큰 그림 영어카드</span>
                <span className="text-zinc-300" aria-hidden="true">
                  ·
                </span>
                <span className="font-medium text-zinc-500">큰 소리로 따라 말해봐요</span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-semibold text-zinc-500 tabular-nums">
                  대기 {chatWaitSeconds}초
                </span>
                <button
                  type="button"
                  onClick={() => onDismissFlashcard(activeGiantCardInfo.cfg.id)}
                  aria-label="단어카드 닫기"
                  className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Center 2-Column Giant Card Content (10x Scale!) */}
            <div className="my-4 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center flex-1">
              {/* Left: Huge Storybook Picture Frame */}
              <div className="h-full min-h-[240px] rounded-[26px] bg-white border border-zinc-200/90 p-6 flex flex-col items-center justify-center text-center shadow-[0_6px_24px_rgba(0,0,0,0.03)]">
                <div className="text-[96px] sm:text-[116px] leading-none select-none">
                  {activeGiantCardInfo.card.emoji}
                </div>
                <div className="mt-4 text-2xl sm:text-3xl font-extrabold text-[#141519]">
                  {activeGiantCardInfo.card.koreanWord}
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-zinc-500">
                  {activeGiantCardInfo.card.hintText}
                </p>
              </div>

              {/* Right: Giant English Word, Phonetic Pronunciation & Voice-First Repeat Prompt */}
              <div className="flex flex-col justify-center space-y-4 text-left">
                <div>
                  <div className="text-xs font-semibold text-zinc-500">영어로 이렇게 말해요</div>
                  <div className="mt-1 text-5xl sm:text-6xl font-black tracking-tight text-[#141519]">
                    {activeGiantCardInfo.card.englishWord}
                  </div>
                  <div className="mt-2 text-xl sm:text-2xl font-bold text-sky-700">
                    발음: {activeGiantCardInfo.card.phonetic}
                  </div>
                  <p className="mt-2 text-sm sm:text-base font-medium text-zinc-600">
                    "{activeGiantCardInfo.card.exampleEn}"
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      onSpeakEnglish(
                        activeGiantCardInfo.cfg.id,
                        `${activeGiantCardInfo.card.englishWord}! ${activeGiantCardInfo.card.exampleEn}`
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#141519] hover:bg-zinc-800 text-white px-5 py-3 text-sm font-bold transition-colors whitespace-nowrap"
                  >
                    <Volume2 className="w-4 h-4" />
                    원어민 발음 다시 듣기
                  </button>
                </div>

                {/* Voice-First Feedback Box */}
                {activeGiantCardInfo.card.revealed ? (
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                      <Check className="w-5 h-5 shrink-0" />
                      <span>참 잘했어요! 멋진 목소리로 성공했어요!</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-[#F4F5F7] border border-zinc-200 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Mic
                        className={`w-4 h-4 shrink-0 ${
                          isVoiceListening ? 'text-rose-600' : 'text-zinc-500'
                        }`}
                      />
                      <span className="text-xs sm:text-sm font-semibold text-[#141519]">
                        {isVoiceListening
                          ? `"${activeGiantCardInfo.card.phonetic}!" 하고 마이크에 말해봐요`
                          : '마이크를 켜고 큰 소리로 따라 말해봐요'}
                      </span>
                    </div>
                    {!isVoiceListening && (
                      <button
                        type="button"
                        onClick={onToggleVoiceMic}
                        className="rounded-xl bg-[#141519] text-white px-3 py-1.5 text-xs font-semibold shrink-0 whitespace-nowrap"
                      >
                        마이크 켜기
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Footer: Patient 1-Minute Auto-Advance Notice + Last-Resort Button Fallback */}
            <div className="pt-3 border-t border-zinc-200/80 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <span className="tabular-nums">
                아이가 말할 때까지 기다리며, {chatWaitSeconds}초 동안 대답이 없으면 자동으로 다음 대화를 이어갑니다.
              </span>

              {!activeGiantCardInfo.card.revealed && (
                <div className="flex items-center gap-2">
                  {!showFallbackChoices ? (
                    <button
                      type="button"
                      onClick={() => setShowFallbackChoices(true)}
                      className="text-xs text-zinc-400 hover:text-zinc-700 underline underline-offset-2 whitespace-nowrap"
                    >
                      마이크가 안 될 때 버튼 선택 (최후 수단)
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {activeGiantCardInfo.card.choices.map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => onAnswerFlashcard(activeGiantCardInfo.cfg.id, choice)}
                          className="rounded-lg bg-white hover:bg-zinc-100 border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-700 whitespace-nowrap"
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Direct Overhead Speech Bubbles Tracked Above Each Active 3D Bunny */}
      {enabledCharacters.map((cfg) => {
        const b = bunnies[cfg.id] ?? {
          status: 'IN_HOUSE',
          bubbleText: cfg.greeting,
          isSpeaking: false,
          isThinking: false,
          photoIndex: 0,
        };
        const isChatting = b.status === 'CHATTING' && activeChatBunny === cfg.id;
        const heldPhoto = photos[b.photoIndex] ?? null;
        const threadMessages = bunnyHistories[cfg.id] ?? [];

        return (
          <div
            key={cfg.id}
            ref={(el) => {
              bubbleDomRefs.current[cfg.id] = el;
            }}
            style={{ left: 0, top: 0, opacity: 0 }}
            className="pointer-events-none absolute z-40 will-change-transform transition-opacity duration-150"
          >
            {b.status !== 'IN_HOUSE' && (
              <div
                data-bunny-ui="true"
                className={`pointer-events-auto relative rounded-2xl bg-white text-[#141519] border border-black/10 shadow-[0_12px_30px_rgba(20,21,25,0.16)] ${
                  isChatting ? 'w-[298px] sm:w-[330px] p-3' : 'max-w-[238px] px-3 py-1.5'
                }`}
              >
                {isChatting ? (
                  <>
                    {/* Header: Bunny Name + Voice Replay + 60s Wait Counter + Finish */}
                    <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-zinc-100">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cfg.accentHex }}
                        />
                        <span className="text-xs font-bold text-[#141519] truncate">
                          {cfg.name} 음성대화
                        </span>
                        <button
                          type="button"
                          onClick={() => onReplayBunnyVoice(cfg.id)}
                          title={`${cfg.name} 목소리 다시 듣기`}
                          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                            b.isSpeaking
                              ? 'bg-emerald-500 text-white'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          <Volume2 className="w-3 h-3" />
                          {b.isSpeaking ? `${cfg.name} 말하는 중` : '다시 듣기'}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!b.isThinking && !b.isSpeaking && isVoiceListening && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 whitespace-nowrap">
                            <Mic className="w-2.5 h-2.5" />
                            듣는 중
                          </span>
                        )}
                        {!b.isThinking && !b.isSpeaking && !isVoiceListening && (
                          <span className="text-[10px] font-medium text-zinc-400 tabular-nums whitespace-nowrap">
                            대기 {chatWaitSeconds}초
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onFinishBunnyChat(cfg.id)}
                          className="rounded-full bg-zinc-100 hover:bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 whitespace-nowrap"
                          title="대화 마치고 화면에서 놀게 하기"
                        >
                          잘 놀아!
                        </button>
                      </div>
                    </div>

                    {/* Quick Bunny Switcher inside Chat Bubble so user can switch designated bunny anytime */}
                    {characters.length > 1 && (
                      <div className="mt-1.5 flex items-center gap-1 overflow-x-auto pb-1 border-b border-zinc-100">
                        <span className="text-[9px] font-semibold text-zinc-400 shrink-0 mr-0.5">
                          대화 상대:
                        </span>
                        {characters.map((otherCfg) => {
                          const selected = otherCfg.id === cfg.id;
                          return (
                            <button
                              key={otherCfg.id}
                              type="button"
                              onClick={() => {
                                if (!selected) onSummonBunny(otherCfg.id);
                              }}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                                selected
                                  ? 'bg-[#141519] text-white'
                                  : 'bg-[#F4F5F7] hover:bg-zinc-200 text-zinc-600'
                              }`}
                              title={`${otherCfg.name} 지명하여 ${otherCfg.name} 목소리로 대화하기`}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: otherCfg.accentHex }}
                              />
                              {otherCfg.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Multi-Turn Gemini Chat Scrollable Message Thread */}
                    <div
                      ref={(el) => {
                        chatScrollRefs.current[cfg.id] = el;
                      }}
                      className="mt-2 max-h-28 overflow-y-auto space-y-1.5 pr-1"
                    >
                      {threadMessages.length === 0 ? (
                        <p className="text-xs font-medium leading-relaxed text-[#141519]">
                          {b.bubbleText}
                        </p>
                      ) : (
                        threadMessages.slice(-8).map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${
                              msg.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <div
                              className={`max-w-[86%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed ${
                                msg.role === 'user'
                                  ? 'bg-[#141519] text-white font-medium'
                                  : 'bg-[#F4F5F7] text-[#141519] font-medium'
                              }`}
                            >
                              {msg.text}
                            </div>
                          </div>
                        ))
                      )}
                      {b.isThinking && (
                        <div className="flex justify-start">
                          <div className="rounded-xl bg-[#F4F5F7] px-2.5 py-1 text-[11px] text-zinc-500 font-medium">
                            귀를 쫑긋~ 제미나이가 대답 생각 중...
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Voice-First Kid English Re-Ask Coach (Buttons only as last resort!) */}
                    {b.englishCoach && !b.isThinking && (
                      <div className="mt-2 rounded-xl bg-amber-50/90 border border-amber-200 p-2.5 text-left">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            목소리로 영어로 다시 말해볼래?
                          </span>
                          <button
                            type="button"
                            onClick={() => onSpeakEnglish(cfg.id, b.englishCoach!.englishPhrase)}
                            className="inline-flex items-center gap-0.5 rounded-lg bg-white hover:bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900 whitespace-nowrap"
                          >
                            <Volume2 className="w-2.5 h-2.5" />
                            발음 듣기
                          </button>
                        </div>
                        <p className="mt-1 text-xs font-extrabold text-[#141519]">
                          "{b.englishCoach.englishPhrase}"
                        </p>
                        <div className="mt-0.5 text-[11px] font-semibold text-amber-900/85">
                          발음: {b.englishCoach.koreanPhonetic}
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-amber-200/60 flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-amber-900/75 font-medium tabular-nums">
                            {isVoiceListening
                              ? `마이크로 듣는 중 · ${chatWaitSeconds}초 후 다음 대화`
                              : `대답 대기 중 (${chatWaitSeconds}초)`}
                          </span>
                          <button
                            type="button"
                            onClick={() => onSendBunnyMessage(cfg.id, b.englishCoach!.englishPhrase)}
                            className="text-zinc-400 hover:text-zinc-700 underline underline-offset-2 whitespace-nowrap shrink-0"
                            title="음성 인식이 어려울 때만 사용하는 버튼"
                          >
                            버튼 전송(최후수단)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Chat Input Form */}
                    <form
                      onSubmit={(e) => handleChatSubmit(e, cfg.id)}
                      className="mt-2 flex items-center gap-1.5"
                    >
                      <button
                        type="button"
                        onClick={onToggleVoiceMic}
                        title="마이크로 말하기"
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          isVoiceListening
                            ? 'bg-rose-500 text-white'
                            : 'bg-[#141519] text-white hover:bg-zinc-800'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={
                          isVoiceListening
                            ? '마이크로 말하거나 입력하기...'
                            : `${cfg.name}에게 말 걸기...`
                        }
                        className="flex-1 min-w-0 rounded-full bg-[#F4F5F7] border border-zinc-200 px-2.5 py-1 text-[11px] text-[#141519] placeholder:text-zinc-400 focus:outline-none focus:border-[#141519]"
                      />
                      <button
                        type="submit"
                        disabled={b.isThinking}
                        aria-label="보내기"
                        className="w-7 h-7 rounded-full bg-[#141519] hover:bg-zinc-800 text-white flex items-center justify-center shrink-0"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="flex flex-col gap-1">
                    {b.status === 'ADMIRING_PHOTO' && heldPhoto && (
                      <button
                        type="button"
                        onClick={() => onSelectPhotoFromBunny(heldPhoto)}
                        className="w-36 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100 text-left"
                        title="클릭하면 액자에 크게 띄워요"
                      >
                        <img
                          src={heldPhoto.src}
                          alt={heldPhoto.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-16 object-cover"
                        />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSummonBunny(cfg.id)}
                      className="text-left text-[11px] font-medium leading-snug text-[#141519]"
                    >
                      <span className="font-bold mr-1">{cfg.name}</span>
                      <span>{b.bubbleText}</span>
                    </button>
                  </div>
                )}

                <div className="pointer-events-none absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 rotate-45 bg-white border-r border-b border-black/10" />
              </div>
            )}
          </div>
        );
      })}

      {/* Bunny Designation & Voice Conversation Bar Above the Fairytale 3D Cottage Roof */}
      {characters.length > 0 && (
        <div
          ref={houseTagDomRef}
          data-bunny-ui="true"
          style={{ left: 0, top: 0 }}
          className="pointer-events-auto absolute z-30 will-change-transform"
        >
          <div className="flex flex-col items-center gap-1">
            <div className="flex flex-wrap items-center justify-center gap-1 rounded-2xl bg-[#141519]/95 backdrop-blur-md text-white px-2.5 py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.32)] border border-white/15">
              <span className="text-[10px] font-bold text-amber-300 px-1 whitespace-nowrap">
                🐰 토끼 지명 대화
              </span>
              {(enabledCharacters.length > 0 ? enabledCharacters : characters.slice(0, 3)).map(
                (cfg) => {
                  const st = bunnies[cfg.id]?.status ?? 'IN_HOUSE';
                  const isInside = st === 'IN_HOUSE';
                  const isTalking = st === 'CHATTING' && activeChatBunny === cfg.id;
                  const isSpeakingNow = Boolean(bunnies[cfg.id]?.isSpeaking);
                  return (
                    <button
                      key={cfg.id}
                      type="button"
                      onClick={() => onSummonBunny(cfg.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all whitespace-nowrap ${
                        isTalking
                          ? 'bg-white text-[#141519] shadow-sm scale-105'
                          : isInside
                          ? 'bg-white/10 text-zinc-100 hover:bg-white/25'
                          : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/35'
                      }`}
                      title={`${cfg.name} 지명하고 ${cfg.name} 목소리로 대화하기`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: cfg.accentHex }}
                      />
                      <span>{cfg.name}</span>
                      {isTalking && (
                        <Volume2
                          className={`w-3 h-3 shrink-0 ${
                            isSpeakingNow ? 'text-emerald-600 animate-pulse' : 'text-rose-500'
                          }`}
                        />
                      )}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
