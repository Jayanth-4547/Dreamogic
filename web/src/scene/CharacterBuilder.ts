import * as THREE from 'three';
import { CHARACTER_PALETTES, CharacterProfile } from '../engine/model';

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  capePivot: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
  aura: THREE.Mesh;
  hitMesh: THREE.Mesh;
  pos: THREE.Vector3;
  facingYaw: number;
  blinkTimer: number;
  fallVelY: number;
  fallRotX: number;
  fallRotZ: number;
}

export function buildTravelerRig(
  pawnId: number,
  profile: CharacterProfile,
  isRivalParty = false,
): CharacterRig {
  const pal = CHARACTER_PALETTES[profile.paletteIndex % CHARACTER_PALETTES.length];
  const cloakColor = isRivalParty ? '#7B6D9E' : pal.cloak;
  const trimColor = isRivalParty ? '#C8BFE8' : pal.trim;
  const tunicColor = isRivalParty ? '#2D2740' : pal.tunic;
  const glowColor = isRivalParty ? '#B2A3E0' : pal.glow;

  const root = new THREE.Group();
  const body = new THREE.Group();

  const cloakMat = new THREE.MeshStandardMaterial({
    color: cloakColor,
    roughness: 0.62,
    metalness: 0.05,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    roughness: 0.48,
  });
  const tunicMat = new THREE.MeshStandardMaterial({
    color: tunicColor,
    roughness: 0.72,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: '#221C35',
    roughness: 0.4,
  });

  // Articulated legs + boots (NOT a bean!)
  const legGeo = new THREE.CylinderGeometry(0.052, 0.042, 0.34, 7);
  const bootGeo = new THREE.BoxGeometry(0.095, 0.075, 0.14);

  const hipL = new THREE.Group();
  hipL.position.set(-0.085, 0.34, 0);
  const legL = new THREE.Mesh(legGeo, tunicMat);
  legL.position.y = -0.15;
  const bootL = new THREE.Mesh(bootGeo, trimMat);
  bootL.position.set(0, -0.31, -0.02);
  hipL.add(legL, bootL);

  const hipR = new THREE.Group();
  hipR.position.set(0.085, 0.34, 0);
  const legR = new THREE.Mesh(legGeo, tunicMat);
  legR.position.y = -0.15;
  const bootR = new THREE.Mesh(bootGeo, trimMat);
  bootR.position.set(0, -0.31, -0.02);
  hipR.add(legR, bootR);

  body.add(hipL, hipR);

  // Slender tapered tunic torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.21, 0.44, 8), tunicMat);
  torso.position.y = 0.56;
  torso.userData = { pawnId };
  body.add(torso);

  // Belt sash
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.185, 0.07, 8), trimMat);
  sash.position.y = 0.42;
  body.add(sash);

  // Cloak / Mantle silhouette
  const capePivot = new THREE.Group();
  capePivot.position.set(0, 0.76, 0.06);

  if (profile.cloak === 'poncho') {
    const poncho = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.38, 8, 1, true), cloakMat);
    poncho.material.side = THREE.DoubleSide;
    poncho.position.set(0, -0.18, -0.05);
    capePivot.add(poncho);
  } else if (profile.cloak === 'shawl') {
    const shawl = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.065, 7, 14), cloakMat);
    shawl.rotation.x = Math.PI / 2;
    shawl.position.set(0, -0.02, -0.06);
    capePivot.add(shawl);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.05), cloakMat);
    tail.position.set(0, -0.24, 0.11);
    tail.rotation.x = 0.16;
    capePivot.add(tail);
  } else if (profile.cloak === 'split') {
    for (const sx of [-0.095, 0.095]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.54, 0.04), cloakMat);
      strip.position.set(sx, -0.27, 0.1);
      strip.rotation.x = 0.18;
      capePivot.add(strip);
    }
  } else {
    // 'long' cloak
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, 0.045), cloakMat);
    cape.position.set(0, -0.29, 0.1);
    cape.rotation.x = 0.17;
    const hem = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.06, 0.05), trimMat);
    hem.position.set(0, -0.56, 0.15);
    hem.rotation.x = 0.17;
    capePivot.add(cape, hem);
  }
  body.add(capePivot);

  // Shoulders / sleeves
  for (const sx of [-0.19, 0.19]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.3, 6), cloakMat);
    arm.position.set(sx, 0.58, 0);
    arm.rotation.z = sx < 0 ? 0.25 : -0.25;
    body.add(arm);
  }

  // Sculpted head (not oversized cartoon sphere)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.9, 0);
  const headMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.145, 1), skinMat);
  headMesh.scale.set(0.95, 1.05, 0.95);
  headGroup.add(headMesh);

  // Expressive glowing eyes facing -Z
  const eyeMat = new THREE.MeshBasicMaterial({ color: trimColor });
  const eyeGeo = new THREE.BoxGeometry(0.036, 0.024, 0.02);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.048, 0.01, -0.132);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.048, 0.01, -0.132);
  headGroup.add(eyeL, eyeR);

  // Headwear variations
  if (profile.head === 'hood') {
    const cowl = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 7), cloakMat);
    cowl.position.set(0, 0.09, 0.04);
    cowl.rotation.x = -0.32;
    headGroup.add(cowl);
  } else if (profile.head === 'crown') {
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.02, 6, 16), trimMat);
    crown.rotation.x = Math.PI / 2 - 0.18;
    crown.position.set(0, 0.12, 0);
    const spire = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), eyeMat);
    spire.position.set(0, 0.21, -0.06);
    headGroup.add(crown, spire);
  } else if (profile.head === 'turban') {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.055, 8, 14), trimMat);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.set(0, 0.08, 0);
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), cloakMat);
    crest.position.set(0, 0.13, -0.14);
    headGroup.add(wrap, crest);
  } else if (profile.head === 'hat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.29, 0.025, 12), cloakMat);
    brim.position.y = 0.11;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.32, 8), cloakMat);
    peak.position.y = 0.26;
    headGroup.add(brim, peak);
  } else {
    // 'hair' sculpted swept crest
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.22), trimMat);
    hair.position.set(0, 0.09, 0.03);
    hair.rotation.x = -0.25;
    headGroup.add(hair);
  }

  body.add(headGroup);

  // Carried Charm
  if (profile.charm === 'lantern') {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 5), trimMat);
    rod.position.set(0.25, 0.52, -0.1);
    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.065, 0),
      new THREE.MeshBasicMaterial({ color: glowColor }),
    );
    orb.position.set(0.25, 0.38, -0.14);
    body.add(rod, orb);
  } else if (profile.charm === 'staff') {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 1.08, 6), trimMat);
    staff.position.set(0.26, 0.56, -0.04);
    const tip = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.055, 0),
      new THREE.MeshBasicMaterial({ color: glowColor }),
    );
    tip.position.set(0.26, 1.13, -0.04);
    body.add(staff, tip);
  } else if (profile.charm === 'compass') {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.014, 6, 14),
      new THREE.MeshBasicMaterial({ color: glowColor }),
    );
    ring.position.set(-0.26, 0.72, -0.08);
    body.add(ring);
  }

  // Hit volume covering full figure cleanly
  const hitMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 1.1, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitMesh.position.y = 0.55;
  hitMesh.userData = { pawnId };
  body.add(hitMesh);

  // Ground indicator ring
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.26, 0.34, 24),
    new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: isRivalParty ? 0.28 : 0.6,
      side: THREE.DoubleSide,
    }),
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.03;

  root.add(aura, body);

  return {
    root,
    body,
    capePivot,
    hipL,
    hipR,
    eyeL,
    eyeR,
    aura,
    hitMesh,
    pos: new THREE.Vector3(),
    facingYaw: 0,
    blinkTimer: 1.4 + pawnId * 0.8,
    fallVelY: 0,
    fallRotX: (pawnId % 2 === 0 ? 1 : -1) * 1.4,
    fallRotZ: (pawnId % 2 === 0 ? -1 : 1) * 1.1,
  };
}
