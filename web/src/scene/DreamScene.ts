import * as THREE from 'three';
import {
  CharacterProfile,
  Dream,
  isWalkableKind,
  tellStrength,
} from '../engine/model';
import { DreamSim, SimEvent } from '../engine/sim';
import { buildTravelerRig, CharacterRig } from './CharacterBuilder';

export type HunchMark = 0 | 1 | 2 | 3; // 0 none, 1 safe, 2 danger, 3 unsure

export interface SceneCallbacks {
  onTileClick: (row: number, col: number, rightClick: boolean) => void;
  onPawnClick: (pawnId: number) => void;
}

const TILE_STEP = 2.08;
const TILE_SIZE = 1.98;

interface TileVisual {
  row: number;
  col: number;
  kind: Dream['grid'][0][0]['kind'];
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  topMat: THREE.MeshStandardMaterial;
  reachRing: THREE.Mesh;
  wiltCrack: THREE.Mesh;
  onceRing: THREE.Mesh;
  treeGroup: THREE.Group;
  rootGroup: THREE.Group;
  hunchMesh: THREE.Group;
  hunchMat: THREE.MeshStandardMaterial;
  phase: number;
  collapseDelay: number;
  collapseVelY: number;
  collapseRotX: number;
  collapseRotZ: number;
  goldLiquid?: THREE.Mesh;
  goldLiquidMat?: THREE.MeshStandardMaterial;
  goldStreamL?: THREE.Mesh;
  goldStreamR?: THREE.Mesh;
  goldConduit?: THREE.Mesh;
  goldDrops?: { mesh: THREE.Mesh; phase: number; side: number }[];
}

export class DreamScene {
  private readonly container: HTMLElement;
  private readonly callbacks: SceneCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  private boardGroup = new THREE.Group();
  private fxGroup = new THREE.Group();
  private tileVisuals: TileVisual[][] = [];
  private hitMeshes: THREE.Mesh[] = [];
  private pawnRigs: CharacterRig[] = [];
  private profiles: CharacterProfile[] = [
    { name: 'You', head: 'hood', cloak: 'split', paletteIndex: 1, charm: 'lantern' },
    { name: 'Partner', head: 'turban', cloak: 'shawl', paletteIndex: 0, charm: 'staff' },
    { name: 'Stray 1', head: 'hat', cloak: 'long', paletteIndex: 2, charm: 'compass' },
    { name: 'Stray 2', head: 'hair', cloak: 'poncho', paletteIndex: 5, charm: 'lantern' },
  ];

  private whispererRig: THREE.Group | null = null;
  private whispererTime = 0;
  private echoGhosts: { group: THREE.Group; basePos: THREE.Vector3; phase: number }[] = [];
  private tetherLine: THREE.Line;
  private tetherMat: THREE.LineBasicMaterial;
  private starPoints: THREE.Points;
  private doorLeftPivot: THREE.Group | null = null;
  private doorRightPivot: THREE.Group | null = null;
  private doorPortalMesh: THREE.Mesh | null = null;
  private exitArchGroup: THREE.Group | null = null;
  private stillRingMesh: THREE.Mesh;
  private stillRingMat: THREE.MeshBasicMaterial;

  private sim: DreamSim | null = null;
  private dream: Dream | null = null;
  private hunches: Map<string, HunchMark> = new Map();
  private lucidHeld = false;
  private activePawn = 0;
  private hoverKey = '';
  private pointerX = 0;
  private pointerY = 0;
  private camPos = new THREE.Vector3(0, 9.2, 8.8);
  private camLook = new THREE.Vector3(0, 0.4, -5);
  private shakeAmp = 0;
  private voidAnimTimer = 0;
  private reducedMotion = false;
  private lowPower = false;

  // Shared geometries for fast integrated-GPU performance
  private readonly sharedFloorGeo = new THREE.BoxGeometry(TILE_SIZE, 0.36, TILE_SIZE);
  private readonly sharedFloorSubGeo = new THREE.BoxGeometry(TILE_SIZE * 0.94, 0.55, TILE_SIZE * 0.94);
  private readonly sharedPillarGeo = new THREE.CylinderGeometry(0.46, 0.54, 2.1, 8);
  private readonly sharedRingGeo = new THREE.RingGeometry(0.68, 0.84, 24);
  private readonly sharedTrunkGeo = new THREE.CylinderGeometry(0.03, 0.044, 0.22, 6);
  private readonly sharedConeLowGeo = new THREE.ConeGeometry(0.15, 0.28, 6);
  private readonly sharedConeTopGeo = new THREE.ConeGeometry(0.105, 0.22, 6);
  private readonly sharedRootGeo = new THREE.CylinderGeometry(0.038, 0.018, 0.66, 6);
  private readonly sharedHunchGeo = new THREE.OctahedronGeometry(0.18, 0);

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a173b');
    this.scene.fog = new THREE.FogExp2('#251e4d', 0.017);

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 150);
    this.camera.position.copy(this.camPos);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    this.renderer.setSize(w, h);
    this.updateDpr();
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight('#d6dcff', '#2a1f47', 1.45);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#ffebc6', 1.48);
    keyLight.position.set(8, 18, 11);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#86e3b8', 0.72);
    rimLight.position.set(-10, 9, -12);
    this.scene.add(rimLight);

    this.starPoints = this.createFireflies();
    this.scene.add(this.starPoints);

    this.stillRingMat = new THREE.MeshBasicMaterial({
      color: '#ff7a7a',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.stillRingMesh = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.8, 28), this.stillRingMat);
    this.stillRingMesh.rotation.x = -Math.PI / 2;
    this.stillRingMesh.position.y = 0.22;
    this.scene.add(this.stillRingMesh);

    this.tetherMat = new THREE.LineBasicMaterial({ color: '#ffc857', transparent: true, opacity: 0 });
    const tGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.tetherLine = new THREE.Line(tGeo, this.tetherMat);
    this.scene.add(this.tetherLine);

    this.scene.add(this.boardGroup);
    this.scene.add(this.fxGroup);

    this.rebuildPawnRigs();
    this.bindEvents();
  }

  private tileWorldPos(row: number, col: number): THREE.Vector3 {
    const cols = this.dream?.cols ?? 5;
    const x = (col - (cols - 1) / 2) * TILE_STEP;
    const z = -row * TILE_STEP;
    return new THREE.Vector3(x, 0, z);
  }

  private updateDpr(): void {
    const cap = this.lowPower ? 1.15 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }

  setLowPower(low: boolean): void {
    this.lowPower = low;
    this.updateDpr();
  }

  setLucid(active: boolean): void {
    this.lucidHeld = active;
  }

  setActivePawn(id: number): void {
    this.activePawn = id;
  }

  setProfiles(list: CharacterProfile[]): void {
    for (let i = 0; i < Math.min(list.length, 4); i++) {
      this.profiles[i] = list[i];
    }
    this.rebuildPawnRigs();
    if (this.sim) this.syncPawnRigPositions(this.sim);
  }

  private rebuildPawnRigs(): void {
    for (const r of this.pawnRigs) {
      this.scene.remove(r.root);
    }
    this.pawnRigs = [
      buildTravelerRig(0, this.profiles[0], false),
      buildTravelerRig(1, this.profiles[1], false),
      buildTravelerRig(2, this.profiles[2], true),
      buildTravelerRig(3, this.profiles[3], true),
    ];
    for (const r of this.pawnRigs) this.scene.add(r.root);
  }

  getHunch(row: number, col: number): HunchMark {
    return this.hunches.get(`${row}:${col}`) ?? 0;
  }

  setHunch(row: number, col: number, mark: HunchMark): void {
    const key = `${row}:${col}`;
    if (mark === 0) this.hunches.delete(key);
    else this.hunches.set(key, mark);
    const tv = this.tileVisuals[row]?.[col];
    if (tv) this.applyHunchVisual(tv, mark);
  }

  private applyHunchVisual(tv: TileVisual, mark: HunchMark): void {
    if (mark === 0) {
      tv.hunchMesh.visible = false;
      return;
    }
    tv.hunchMesh.visible = true;
    const color = mark === 1 ? '#7bc8a4' : mark === 2 ? '#ff7a7a' : '#ffc857';
    tv.hunchMat.color.set(color);
    tv.hunchMat.emissive.set(color);
  }

  loadDream(sim: DreamSim): void {
    this.sim = sim;
    this.dream = sim.dream;
    this.hunches.clear();
    this.voidAnimTimer = 0;
    this.whispererTime = 0;

    this.scene.background = new THREE.Color(this.dream.biome.skyTop);
    (this.scene.fog as THREE.FogExp2).color.set(this.dream.biome.fogColor);

    this.disposeChildren(this.boardGroup);
    this.disposeChildren(this.fxGroup);
    this.tileVisuals = [];
    this.hitMeshes = [];
    this.echoGhosts = [];
    this.doorLeftPivot = null;
    this.doorRightPivot = null;
    this.doorPortalMesh = null;
    this.exitArchGroup = null;

    this.buildDungeon(this.dream);
    this.spawnWhisperer(this.dream);
    this.spawnEchoGhosts(this.dream);
    this.syncPawnRigPositions(sim);

    const startPos = this.tileWorldPos(0, this.dream.startCols[0]);
    this.camPos.set(startPos.x, 9.2, 8.6);
    this.camLook.set(0, 0.3, -4.5);
  }

  private syncPawnRigPositions(sim: DreamSim): void {
    for (let i = 0; i < 4; i++) {
      const p = sim.pawns[i];
      const rig = this.pawnRigs[i];
      rig.fallVelY = 0;
      rig.body.rotation.set(0, 0, 0);
      if (!p || !p.active) {
        rig.root.visible = false;
        continue;
      }
      const base = this.tileWorldPos(p.row, p.col);
      rig.pos.set(base.x, 0.18, base.z);
      rig.root.position.copy(rig.pos);
      rig.root.scale.set(1, 1, 1);
      rig.root.visible = true;
    }
  }

  handleSimEvents(events: SimEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'wilt' || ev.kind === 'collapse' || ev.kind === 'doorClose') {
        this.shakeAmp = Math.max(this.shakeAmp, ev.kind === 'collapse' ? 0.24 : 0.12);
      } else if (ev.kind === 'voided') {
        this.shakeAmp = 0.34;
      }
    }
  }

  private buildDungeon(dream: Dream): void {
    const b = dream.biome;
    const isHueRule = dream.classifier === 'hue';

    // Entrance Lantern Shrine placed on left corner of entrance floor
    const lanternColor = isHueRule
      ? new THREE.Color().setHSL(dream.lanternHue / 24, 0.85, 0.56)
      : new THREE.Color(b.accent);
    const leftStart = Math.max(0, dream.startCols[0] - 1);
    const shrine = this.createLanternShrine(lanternColor, isHueRule);
    shrine.position.copy(this.tileWorldPos(0, leftStart).add(new THREE.Vector3(-0.75, 0.18, -0.35)));
    this.boardGroup.add(shrine);

    // Outer flanking dungeon walls beyond grid bounds — low near camera so foreground is never blocked
    const wallMat = new THREE.MeshStandardMaterial({ color: b.wallColor, roughness: 0.78 });
    const wallTrimMat = new THREE.MeshStandardMaterial({ color: b.tileSide, roughness: 0.72 });

    for (let r = 0; r <= dream.rows; r++) {
      for (const sideC of [-1, dream.cols]) {
        const wPos = this.tileWorldPos(r, sideC);
        const hBase = r <= 1 ? 0.95 : r <= 3 ? 1.45 : 2.15;
        const hVar = hBase + ((Math.abs(r * 7 + sideC * 13) % 4) * 0.22);
        const wallMesh = new THREE.Mesh(
          new THREE.BoxGeometry(TILE_STEP, hVar, TILE_STEP),
          wallMat,
        );
        wallMesh.position.set(wPos.x, hVar / 2 - 0.28, wPos.z);
        this.boardGroup.add(wallMesh);
      }
    }

    for (let r = 0; r < dream.rows; r++) {
      const rowList: TileVisual[] = [];
      const rowTiles = dream.grid[r];
      const strength = r === 0 || r === dream.gateRow ? 1.0 : tellStrength(dream, r);

      if (dream.flipRow >= 0 && r === dream.flipRow) {
        this.boardGroup.add(this.createMoonFlipArch(r, dream.cols));
      }

      for (let c = 0; c < dream.cols; c++) {
        const t = rowTiles[c];
        const pos = this.tileWorldPos(r, c);
        const group = new THREE.Group();
        group.position.copy(pos);

        // 1) Solid Wall or Pillar cells (non-walkable architectural dungeon blocks)
        if (t.kind === 'wall' || t.kind === 'pillar') {
          const isPillar = t.kind === 'pillar';
          // Base plinth
          const base = new THREE.Mesh(this.sharedFloorGeo, wallTrimMat);
          group.add(base);

          if (isPillar) {
            const pil = new THREE.Mesh(this.sharedPillarGeo, wallMat);
            pil.position.y = 1.05;
            group.add(pil);
            const cap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.24, 1.15), wallTrimMat);
            cap.position.y = 2.15;
            group.add(cap);
          } else {
            const hBase = r <= 1 ? 0.85 : r <= 3 ? 1.25 : 1.75;
            const hVar = hBase + (t.decor % 4) * 0.18;
            const block = new THREE.Mesh(
              new THREE.BoxGeometry(TILE_STEP, hVar, TILE_STEP),
              wallMat,
            );
            block.position.y = hVar / 2 - 0.15;
            group.add(block);

            // Glowing wall torch sconce
            if (r % 3 === 1 && c > 0 && c < dream.cols - 1) {
              const torch = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.16, 0),
                new THREE.MeshBasicMaterial({ color: b.accent }),
              );
              torch.position.set(0, hVar - 0.25, TILE_STEP * 0.52);
              group.add(torch);
            }
          }

          this.boardGroup.add(group);
          rowList.push({
            row: r,
            col: c,
            kind: t.kind,
            group,
            hitMesh: base,
            topMat: wallMat,
            reachRing: base,
            wiltCrack: base,
            onceRing: base,
            treeGroup: new THREE.Group(),
            rootGroup: new THREE.Group(),
            hunchMesh: new THREE.Group(),
            hunchMat: wallMat,
            phase: 0,
            collapseDelay: 99,
            collapseVelY: 0,
            collapseRotX: 0,
            collapseRotZ: 0,
          });
          continue;
        }

        // 2) Walkable Contiguous Dungeon Floor Slabs (flush & grounded!)
        const topColor = new THREE.Color(t.kind === 'start' ? b.tileSide : b.tileTop);
        if (t.kind === 'gold') topColor.set('#5a4b32');
        else if (t.kind === 'door') topColor.set('#373358');
        else if (isHueRule && t.kind === 'path') {
          const cHue = new THREE.Color().setHSL(t.hue / 24, 0.78, 0.55);
          topColor.lerp(cHue, Math.max(0.3, strength * 0.72));
        } else if (t.kind === 'path') {
          // Subtle organic checkerboard/stone masonry variation
          const shift = ((r + c) % 2 === 0 ? 0.04 : -0.04);
          topColor.offsetHSL(0, 0, shift);
        }

        const sideMat = new THREE.MeshStandardMaterial({ color: b.tileSide, roughness: 0.86 });
        const topMat = new THREE.MeshStandardMaterial({
          color: topColor,
          roughness: t.kind === 'door' ? 0.5 : 0.78,
          metalness: 0.06,
          emissive:
            isHueRule && t.kind === 'path'
              ? new THREE.Color().setHSL(t.hue / 24, 0.7, 0.35)
              : new THREE.Color('#000000'),
          emissiveIntensity: isHueRule && t.kind === 'path' ? 0.25 * strength : 0,
        });

        const subSlab = new THREE.Mesh(this.sharedFloorSubGeo, sideMat);
        subSlab.position.y = -0.35;
        group.add(subSlab);

        const slab = new THREE.Mesh(this.sharedFloorGeo, topMat);
        slab.position.y = 0;
        slab.userData = { row: r, col: c };
        group.add(slab);
        this.hitMeshes.push(slab);

        const reachRing = new THREE.Mesh(
          this.sharedRingGeo,
          new THREE.MeshBasicMaterial({
            color: '#f6efe3',
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
          }),
        );
        reachRing.rotation.x = -Math.PI / 2;
        reachRing.position.y = 0.19;
        group.add(reachRing);

        const wiltCrack = new THREE.Mesh(
          new THREE.RingGeometry(0.28, 0.78, 7),
          new THREE.MeshBasicMaterial({
            color: '#ff7a7a',
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
          }),
        );
        wiltCrack.rotation.x = -Math.PI / 2;
        wiltCrack.position.y = 0.195;
        group.add(wiltCrack);

        const onceRing = new THREE.Mesh(
          new THREE.RingGeometry(0.38, 0.5, 18),
          new THREE.MeshBasicMaterial({
            color: '#7bc8a4',
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
          }),
        );
        onceRing.rotation.x = -Math.PI / 2;
        onceRing.position.y = 0.193;
        group.add(onceRing);

        const treeGroup = new THREE.Group();
        treeGroup.position.y = 0.18;
        group.add(treeGroup);

        const rootGroup = new THREE.Group();
        group.add(rootGroup);

        if (t.kind === 'path') {
          this.populateTrees(treeGroup, t.sprouts, t.seed, strength, b.sprout, b.sproutTip);
          this.populateRoots(rootGroup, t.root, strength, b.root);
        }

        // Flowing Liquid Gold Basins!
        let goldLiquid: THREE.Mesh | undefined;
        let goldLiquidMat: THREE.MeshStandardMaterial | undefined;
        let goldStreamL: THREE.Mesh | undefined;
        let goldStreamR: THREE.Mesh | undefined;
        let goldConduit: THREE.Mesh | undefined;
        let goldDrops: { mesh: THREE.Mesh; phase: number; side: number }[] | undefined;

        if (t.kind === 'gold') {
          const basin = this.buildGoldBasin(c < dream.doorCol ? 1 : -1);
          group.add(basin.group);
          goldLiquid = basin.liquid;
          goldLiquidMat = basin.liquidMat;
          goldStreamL = basin.streamL;
          goldStreamR = basin.streamR;
          goldConduit = basin.conduit;
          goldDrops = basin.drops;
        } else if (t.kind === 'door') {
          this.exitArchGroup = this.buildExitArchway(group);
        }

        const hunchMat = new THREE.MeshStandardMaterial({
          color: '#7bc8a4',
          emissive: '#7bc8a4',
          emissiveIntensity: 0.5,
          roughness: 0.25,
        });
        const hunchMesh = new THREE.Group();
        hunchMesh.add(new THREE.Mesh(this.sharedHunchGeo, hunchMat));
        hunchMesh.position.set(0.58, 0.72, 0.45);
        hunchMesh.visible = false;
        group.add(hunchMesh);

        this.boardGroup.add(group);

        // Collapse wave starts at Exit row and sweeps backward smoothly
        const distFromGate = Math.max(0, dream.gateRow - r);
        const colJitter = ((t.seed % 7) / 7) * 0.18;
        rowList.push({
          row: r,
          col: c,
          kind: t.kind,
          group,
          hitMesh: slab,
          topMat,
          reachRing,
          wiltCrack,
          onceRing,
          treeGroup,
          rootGroup,
          hunchMesh,
          hunchMat,
          phase: ((t.seed % 1000) / 1000) * Math.PI * 2,
          collapseDelay: distFromGate * 0.085 + colJitter,
          collapseVelY: 0,
          collapseRotX: (t.seed % 2 === 0 ? 1 : -1) * 0.55,
          collapseRotZ: (t.seed % 3 === 0 ? 1 : -1) * 0.75,
          goldLiquid,
          goldLiquidMat,
          goldStreamL,
          goldStreamR,
          goldConduit,
          goldDrops,
        });
      }
      this.tileVisuals.push(rowList);
    }
  }

  private buildGoldBasin(inwardDir: number): {
    group: THREE.Group;
    liquid: THREE.Mesh;
    liquidMat: THREE.MeshStandardMaterial;
    streamL: THREE.Mesh;
    streamR: THREE.Mesh;
    conduit: THREE.Mesh;
    drops: { mesh: THREE.Mesh; phase: number; side: number }[];
  } {
    const g = new THREE.Group();
    const curbMat = new THREE.MeshStandardMaterial({ color: '#6b532b', roughness: 0.58, metalness: 0.28 });

    // Sunken rim around the molten gold basin
    const rimFB = new THREE.BoxGeometry(1.78, 0.22, 0.18);
    const rimLR = new THREE.BoxGeometry(0.18, 0.22, 1.42);
    const f = new THREE.Mesh(rimFB, curbMat);
    f.position.set(0, 0.22, -0.8);
    const b = new THREE.Mesh(rimFB, curbMat);
    b.position.set(0, 0.22, 0.8);
    const l = new THREE.Mesh(rimLR, curbMat);
    l.position.set(-0.8, 0.22, 0);
    const r = new THREE.Mesh(rimLR, curbMat);
    r.position.set(0.8, 0.22, 0);
    g.add(f, b, l, r);

    // Molten Liquid Gold Surface inside the well (sinks downward as it drains!)
    const liquidMat = new THREE.MeshStandardMaterial({
      color: '#ffd060',
      emissive: '#ff9b1a',
      emissiveIntensity: 0.85,
      roughness: 0.18,
      metalness: 0.55,
    });
    const liquid = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.28, 1.42), liquidMat);
    liquid.position.y = 0.16;
    g.add(liquid);

    // Flowing side runoff streams pouring out through carved spouts!
    const streamMat = new THREE.MeshBasicMaterial({
      color: '#ffcf5c',
      transparent: true,
      opacity: 0,
    });
    const streamGeo = new THREE.BoxGeometry(0.16, 0.95, 0.12);
    const streamL = new THREE.Mesh(streamGeo, streamMat);
    streamL.position.set(-0.94, -0.25, 0.15);
    streamL.rotation.z = 0.12;
    const streamR = new THREE.Mesh(streamGeo, streamMat.clone());
    streamR.position.set(0.94, -0.25, -0.15);
    streamR.rotation.z = -0.12;
    g.add(streamL, streamR);

    // Golden floor conduit vein channeling inward toward the Exit Archway
    const conduit = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.05, 0.2),
      new THREE.MeshBasicMaterial({ color: '#ffc857', transparent: true, opacity: 0.75 }),
    );
    conduit.position.set(inwardDir * 0.95, 0.19, 0);
    g.add(conduit);

    // Falling liquid gold droplets
    const drops: { mesh: THREE.Mesh; phase: number; side: number }[] = [];
    const dropGeo = new THREE.SphereGeometry(0.065, 6, 6);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(dropGeo, streamMat);
      m.visible = false;
      g.add(m);
      drops.push({ mesh: m, phase: i / 6, side: i % 2 === 0 ? -1 : 1 });
    }

    return { group: g, liquid, liquidMat, streamL, streamR, conduit, drops };
  }

  private populateTrees(
    group: THREE.Group,
    count: number,
    seed: number,
    strength: number,
    leafHex: string,
    tipHex: string,
  ): void {
    if (count <= 0) return;
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4734', roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: leafHex,
      emissive: tipHex,
      emissiveIntensity: 0.14,
      roughness: 0.72,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: tipHex,
      emissive: tipHex,
      emissiveIntensity: 0.2,
      roughness: 0.65,
    });

    const tellScale = 0.28 + 0.82 * strength;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996 + (seed % 97) * 0.13;
      const radius = 0.14 + ((seed + i * 31) % 10) * 0.042;
      const tx = Math.cos(angle) * radius;
      const tz = Math.sin(angle) * radius;
      const variant = 0.85 + (((seed + i * 17) % 7) / 6) * 0.3;

      const tree = new THREE.Group();
      tree.position.set(tx, 0, tz);
      tree.scale.setScalar(tellScale * variant);

      const trunk = new THREE.Mesh(this.sharedTrunkGeo, trunkMat);
      trunk.position.y = 0.1;
      const cone1 = new THREE.Mesh(this.sharedConeLowGeo, leafMat);
      cone1.position.y = 0.26;
      const cone2 = new THREE.Mesh(this.sharedConeTopGeo, tipMat);
      cone2.position.y = 0.41;
      tree.add(trunk, cone1, cone2);
      group.add(tree);
    }
  }

  private populateRoots(group: THREE.Group, dir: number, strength: number, rootHex: string): void {
    const mat = new THREE.MeshStandardMaterial({
      color: rootHex,
      emissive: rootHex,
      emissiveIntensity: 0.12,
      roughness: 0.85,
    });
    const yaw = dir === 0 ? 0 : dir === 1 ? -Math.PI / 2 : dir === 2 ? Math.PI : Math.PI / 2;
    group.rotation.y = yaw;

    const rootScale = 0.36 + 0.64 * strength;
    for (const offset of [-0.24, 0, 0.24]) {
      const tendril = new THREE.Mesh(this.sharedRootGeo, mat);
      tendril.scale.setScalar(rootScale);
      tendril.rotation.x = -Math.PI / 2.2;
      tendril.position.set(offset * 0.85, 0.21, -0.58 * rootScale - (offset === 0 ? 0.12 : 0));
      group.add(tendril);
    }
  }

  private createLanternShrine(color: THREE.Color, isHueRule: boolean): THREE.Group {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 1.4, 7),
      new THREE.MeshStandardMaterial({ color: '#463b5e', roughness: 0.8 }),
    );
    post.position.y = 0.7;
    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: isHueRule ? 1.45 : 0.75,
        roughness: 0.2,
      }),
    );
    orb.position.y = 1.56;
    g.add(post, orb);
    if (isHueRule) {
      const point = new THREE.PointLight(color, 3.4, 9);
      point.position.y = 1.6;
      g.add(point);
    }
    return g;
  }

  private createMoonFlipArch(row: number, cols: number): THREE.Group {
    const g = new THREE.Group();
    const span = cols * TILE_STEP * 0.52;
    g.position.set(0, 0, -row * TILE_STEP + TILE_STEP * 0.5);
    const mat = new THREE.MeshStandardMaterial({
      color: '#959ee0',
      emissive: '#5862b8',
      emissiveIntensity: 0.3,
    });
    const pGeo = new THREE.CylinderGeometry(0.14, 0.18, 2.7, 8);
    const l = new THREE.Mesh(pGeo, mat);
    l.position.set(-span, 1.35, 0);
    const r = new THREE.Mesh(pGeo, mat);
    r.position.set(span, 1.35, 0);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(span, 0.1, 8, 28, Math.PI), mat);
    arc.position.set(0, 2.7, 0);
    g.add(l, r, arc);
    return g;
  }

  private buildExitArchway(group: THREE.Group): THREE.Group {
    const archGroup = new THREE.Group();
    const archMat = new THREE.MeshStandardMaterial({
      color: '#4e4578',
      emissive: '#221b40',
      roughness: 0.62,
    });
    const pillarGeo = new THREE.BoxGeometry(0.3, 2.8, 0.4);
    const lPillar = new THREE.Mesh(pillarGeo, archMat);
    lPillar.position.set(-0.82, 1.4, -0.2);
    const rPillar = new THREE.Mesh(pillarGeo, archMat);
    rPillar.position.set(0.82, 1.4, -0.2);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.48), archMat);
    lintel.position.set(0, 2.85, -0.2);
    const crest = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.25, 0),
      new THREE.MeshStandardMaterial({ color: '#ffc857', emissive: '#ffc857', emissiveIntensity: 0.9 }),
    );
    crest.position.set(0, 3.3, -0.2);

    this.doorPortalMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.36, 2.4),
      new THREE.MeshBasicMaterial({
        color: '#ffe89a',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      }),
    );
    this.doorPortalMesh.position.set(0, 1.38, -0.22);

    const doorMat = new THREE.MeshStandardMaterial({ color: '#332c54', roughness: 0.52, metalness: 0.35 });
    this.doorLeftPivot = new THREE.Group();
    this.doorLeftPivot.position.set(-0.66, 1.38, -0.15);
    const lLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.38, 0.1), doorMat);
    lLeaf.position.x = 0.325;
    this.doorLeftPivot.add(lLeaf);

    this.doorRightPivot = new THREE.Group();
    this.doorRightPivot.position.set(0.66, 1.38, -0.15);
    const rLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.38, 0.1), doorMat);
    rLeaf.position.x = -0.325;
    this.doorRightPivot.add(rLeaf);

    archGroup.add(lPillar, rPillar, lintel, crest, this.doorPortalMesh, this.doorLeftPivot, this.doorRightPivot);
    group.add(archGroup);
    return archGroup;
  }

  private spawnWhisperer(dream: Dream): void {
    const g = new THREE.Group();
    const cloak = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 1.15, 9),
      new THREE.MeshStandardMaterial({
        color: '#6b65a8',
        emissive: '#352f69',
        emissiveIntensity: 0.45,
        transparent: true,
        opacity: 0.92,
      }),
    );
    cloak.position.y = 0.6;
    const head = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.2, 1),
      new THREE.MeshStandardMaterial({
        color: '#dcd6ff',
        emissive: '#897fd1',
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.95,
      }),
    );
    head.position.y = 1.24;

    const lCol =
      dream.classifier === 'hue'
        ? new THREE.Color().setHSL(dream.lanternHue / 24, 0.85, 0.6)
        : new THREE.Color('#ffc857');
    const lantern = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshStandardMaterial({ color: lCol, emissive: lCol, emissiveIntensity: 1.4 }),
    );
    lantern.position.set(0.34, 0.92, 0.2);

    g.add(cloak, head, lantern);
    const center = this.tileWorldPos(Math.min(3, dream.pathRows), Math.floor(dream.cols / 2));
    g.position.set(center.x, 0.22, center.z);
    this.whispererRig = g;
    this.fxGroup.add(g);
  }

  private spawnEchoGhosts(dream: Dream): void {
    const echoMat = new THREE.MeshBasicMaterial({ color: '#a8b4f8', transparent: true, opacity: 0.24 });
    for (const r of [2, 5, Math.max(6, dream.pathRows - 1)]) {
      if (r >= dream.pathRows) continue;
      const unsafeCols = dream.grid[r]
        .filter((t) => t.kind === 'path' && !dream.safeCols[r].has(t.col))
        .map((t) => t.col);
      if (unsafeCols.length === 0) continue;
      const col = unsafeCols[0];
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 7), echoMat);
      body.position.y = 0.32;
      g.add(body);
      const pos = this.tileWorldPos(r, col).add(new THREE.Vector3(0.32, 0.2, 0.22));
      g.position.copy(pos);
      this.fxGroup.add(g);
      this.echoGhosts.push({ group: g, basePos: pos, phase: r * 1.4 });
    }
  }

  private createFireflies(): THREE.Points {
    const count = 110;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 32;
      positions[i * 3 + 1] = Math.random() * 8 - 0.5;
      positions[i * 3 + 2] = 6 - Math.random() * 44;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
      grad.addColorStop(0, 'rgba(255, 240, 185, 1)');
      grad.addColorStop(0.45, 'rgba(255, 224, 138, 0.45)');
      grad.addColorStop(1, 'rgba(255, 224, 138, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.PointsMaterial({
      color: '#ffe8ad',
      map: tex,
      size: 0.34,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, mat);
  }

  private disposeChildren(group: THREE.Group): void {
    while (group.children.length > 0) group.remove(group.children[0]);
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', (e) => {
      const rect = dom.getBoundingClientRect();
      this.pointerX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      this.pointerNdc.set(this.pointerX, this.pointerY);
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const hits = this.raycaster.intersectObjects(this.hitMeshes, false);
      if (hits.length > 0) {
        const { row, col } = hits[0].object.userData as { row: number; col: number };
        this.hoverKey = `${row}:${col}`;
        dom.style.cursor = 'pointer';
      } else {
        this.hoverKey = '';
        dom.style.cursor = 'default';
      }
    });

    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    dom.addEventListener('pointerdown', (e) => {
      const rect = dom.getBoundingClientRect();
      this.pointerNdc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      );
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);

      const pawnHits = this.raycaster.intersectObjects(
        this.pawnRigs.filter((r) => r.root.visible).map((r) => r.hitMesh),
        false,
      );
      if (pawnHits.length > 0 && e.button === 0) {
        const { pawnId } = pawnHits[0].object.userData as { pawnId: number };
        if (pawnId < 2) {
          this.callbacks.onPawnClick(pawnId);
          return;
        }
      }

      const tileHits = this.raycaster.intersectObjects(this.hitMeshes, false);
      if (tileHits.length > 0) {
        const { row, col } = tileHits[0].object.userData as { row: number; col: number };
        this.callbacks.onTileClick(row, col, e.button === 2);
      }
    });
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render(dtSec: number, elapsedSec: number): void {
    const sim = this.sim;
    const dream = this.dream;
    if (!sim || !dream) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const isVoided = sim.status === 'voided';
    if (isVoided) this.voidAnimTimer += dtSec;

    if (!this.reducedMotion) {
      this.starPoints.rotation.y = Math.sin(elapsedSec * 0.08) * 0.04;
      this.starPoints.position.y = Math.sin(elapsedSec * 0.35) * 0.22;
    }

    // Whisperer intro crossing
    if (this.whispererRig) {
      this.whispererTime += dtSec;
      const t = Math.min(1, this.whispererTime / 5.2);
      const zFrom = -Math.min(4, dream.pathRows) * TILE_STEP;
      const zTo = -1.6 * TILE_STEP;
      this.whispererRig.position.z = THREE.MathUtils.lerp(zFrom, zTo, Math.min(1, t * 1.4));
      this.whispererRig.position.y = 0.22 + Math.sin(elapsedSec * 2.1) * 0.06 + t * 0.7;
      const fade = t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);
      this.whispererRig.visible = fade > 0.02 && !isVoided;
      this.whispererRig.scale.setScalar(0.85 + fade * 0.15);
    }

    for (const eg of this.echoGhosts) {
      eg.group.position.y = eg.basePos.y + Math.sin(elapsedSec * 1.7 + eg.phase) * 0.06;
      eg.group.visible = !isVoided;
    }

    // Update Exit Archway visibility during play & Dramatic Void Exit vanishing
    if (this.exitArchGroup) {
      if (isVoided) {
        const vanish = Math.max(0.01, 1 - Math.max(0, this.voidAnimTimer - 0.35) * 0.9);
        this.exitArchGroup.scale.set(vanish, vanish, vanish);
        this.exitArchGroup.position.y = -Math.max(0, this.voidAnimTimer - 0.35) * 1.6;
      } else {
        this.exitArchGroup.scale.set(1, 1, 1);
        this.exitArchGroup.position.y = 0;
      }
    }

    if (this.doorLeftPivot && this.doorRightPivot && this.doorPortalMesh) {
      const targetAngle = sim.gate.open && !isVoided ? -Math.PI * 0.58 : 0;
      this.doorLeftPivot.rotation.y = THREE.MathUtils.lerp(
        this.doorLeftPivot.rotation.y,
        targetAngle,
        0.18,
      );
      this.doorRightPivot.rotation.y = THREE.MathUtils.lerp(
        this.doorRightPivot.rotation.y,
        -targetAngle,
        0.18,
      );
      const pMat = this.doorPortalMesh.material as THREE.MeshBasicMaterial;
      pMat.opacity = sim.gate.open && !isVoided ? 0.55 + 0.25 * Math.sin(elapsedSec * 5) : 0;
    }

    // Update Dungeon Tiles + Flowing Gold Basins + Chain-Reaction Collapse
    for (let r = 0; r < this.tileVisuals.length; r++) {
      for (let c = 0; c < this.tileVisuals[r].length; c++) {
        const tv = this.tileVisuals[r][c];
        if (tv.kind === 'wall' || tv.kind === 'pillar') continue;

        const ts = sim.tiles[r][c];
        const tileWalkable = isWalkableKind(tv.kind);

        // Chain-reaction floor slab falling off during Void loss!
        if (ts.voided || (isVoided && tileWalkable)) {
          if (ts.voided || this.voidAnimTimer >= tv.collapseDelay) {
            tv.collapseVelY += dtSec * 12.5;
            tv.group.position.y -= tv.collapseVelY * dtSec;
            tv.group.rotation.x += tv.collapseRotX * dtSec * 1.4;
            tv.group.rotation.z += tv.collapseRotZ * dtSec * 1.5;
            tv.group.visible = tv.group.position.y > -18;
          } else {
            // Pre-fall tremor!
            tv.group.position.y = (Math.random() - 0.5) * 0.07;
          }
          continue;
        }

        const dropY = ts.strikes > 0 ? -0.09 : 0;
        tv.group.position.y = dropY;
        tv.group.rotation.z = ts.strikes > 0 ? 0.06 : 0;

        const wiltMat = tv.wiltCrack.material as THREE.MeshBasicMaterial;
        wiltMat.opacity = ts.strikes > 0 ? 0.85 : 0;
        if (ts.strikes > 0) {
          tv.topMat.emissive.set('#9e2b2b');
          tv.topMat.emissiveIntensity = 0.42;
        }

        const onceMat = tv.onceRing.material as THREE.MeshBasicMaterial;
        onceMat.opacity =
          dream.modifier.kind === 'once' && ts.visits > 0 && tv.kind === 'path' ? 0.72 : 0;

        const can = sim.canHop(this.activePawn, r, c);
        const hovered = this.hoverKey === `${r}:${c}`;
        const reachMat = tv.reachRing.material as THREE.MeshBasicMaterial;
        if (can) {
          reachMat.color.set(hovered ? '#ffc857' : '#f6efe3');
          reachMat.opacity = hovered ? 0.78 : 0.18 + 0.07 * Math.sin(elapsedSec * 3.5);
        } else {
          reachMat.opacity = hovered ? 0.28 : 0;
        }

        const targetTreeScale = this.lucidHeld && tv.kind === 'path' ? 1.48 : 1.0;
        tv.treeGroup.scale.setScalar(THREE.MathUtils.lerp(tv.treeGroup.scale.x, targetTreeScale, 0.16));
        tv.rootGroup.scale.setScalar(THREE.MathUtils.lerp(tv.rootGroup.scale.x, targetTreeScale, 0.16));

        if (tv.hunchMesh.visible) {
          tv.hunchMesh.rotation.y += dtSec * 1.8;
          tv.hunchMesh.position.y = 0.72 + Math.sin(elapsedSec * 2.6 + tv.phase) * 0.07;
        }

        // Flowing & Depleting Gold Basin animation!
        if (tv.kind === 'gold' && tv.goldLiquid && tv.goldLiquidMat && tv.goldStreamL && tv.goldStreamR && tv.goldConduit && tv.goldDrops) {
          const gi = c === dream.goldCols[0] ? 0 : 1;
          const frac = sim.reserveFraction(gi);
          const dead = sim.gate.spent[gi] || sim.gate.dead;
          const isDraining = !dead && (frac < 0.99 || sim.gate.open || sim.gate.hold[gi] > 0.02);

          // Sinking molten gold level inside carved stone basin
          tv.goldLiquid.scale.y = dead ? 0.05 : Math.max(0.08, frac);
          tv.goldLiquid.position.y = 0.02 + 0.16 * tv.goldLiquid.scale.y;

          if (dead) {
            tv.goldLiquidMat.color.set('#3d3847');
            tv.goldLiquidMat.emissive.set('#14121b');
            tv.goldLiquidMat.emissiveIntensity = 0.05;
            (tv.goldStreamL.material as THREE.MeshBasicMaterial).opacity = 0;
            (tv.goldStreamR.material as THREE.MeshBasicMaterial).opacity = 0;
            (tv.goldConduit.material as THREE.MeshBasicMaterial).opacity = 0.08;
            for (const d of tv.goldDrops) d.mesh.visible = false;
          } else {
            tv.goldLiquidMat.color.set('#ffd060');
            tv.goldLiquidMat.emissive.set('#ff9b1a');
            tv.goldLiquidMat.emissiveIntensity = 0.4 + frac * 0.85 + sim.gate.hold[gi] * 0.7;

            const streamAlpha = isDraining ? 0.55 + 0.25 * Math.sin(elapsedSec * 9) : 0.12;
            (tv.goldStreamL.material as THREE.MeshBasicMaterial).opacity = streamAlpha;
            (tv.goldStreamR.material as THREE.MeshBasicMaterial).opacity = streamAlpha;
            (tv.goldConduit.material as THREE.MeshBasicMaterial).opacity = 0.25 + frac * 0.65;

            for (const d of tv.goldDrops) {
              if (!isDraining) {
                d.mesh.visible = false;
              } else {
                d.mesh.visible = true;
                const loop = (elapsedSec * 1.45 + d.phase) % 1;
                d.mesh.position.set(d.side * (0.94 + loop * 0.18), 0.12 - loop * 0.95, d.side * 0.12);
                d.mesh.scale.setScalar(1 - loop * 0.5);
              }
            }
          }
        }
      }
    }

    // Update all 4 Articulated Traveler Rigs + Dramatic Falling Physics
    for (let i = 0; i < 4; i++) {
      const p = sim.pawns[i];
      const rig = this.pawnRigs[i];
      if (!p || !p.active) {
        rig.root.visible = false;
        continue;
      }

      if (p.exited) {
        rig.root.scale.lerp(new THREE.Vector3(0.01, 0.01, 0.01), 0.16);
        if (rig.root.scale.x < 0.04) rig.root.visible = false;
        continue;
      }

      // Dramatic fall when tile collapses beneath them or Void phase reaches them!
      const tvUnder = this.tileVisuals[p.row]?.[p.col];
      const floorGone =
        isVoided &&
        tvUnder &&
        (this.voidAnimTimer >= tvUnder.collapseDelay + 0.08 || this.voidAnimTimer >= 0.95);

      if (floorGone) {
        rig.fallVelY += dtSec * 13.5;
        rig.pos.y -= rig.fallVelY * dtSec;
        rig.root.position.copy(rig.pos);
        rig.body.rotation.x += rig.fallRotX * dtSec * 2.2;
        rig.body.rotation.z += rig.fallRotZ * dtSec * 1.9;
        // Flailing legs & billowing cape!
        rig.hipL.rotation.x = Math.sin(elapsedSec * 18) * 0.75;
        rig.hipR.rotation.x = -Math.sin(elapsedSec * 18) * 0.75;
        rig.capePivot.rotation.x = -0.95;
        (rig.aura.material as THREE.MeshBasicMaterial).opacity = 0;
        continue;
      }

      // Count co-occupants on the same tile so characters never overlap!
      const co = sim.pawns.filter(
        (o) => o.active && !o.exited && o.toRow < 0 && o.row === p.row && o.col === p.col,
      );
      const slot = Math.max(0, co.findIndex((o) => o.id === p.id));
      const sideOffX = co.length <= 1 ? 0 : (slot - (co.length - 1) / 2) * 0.48;

      let targetX: number;
      let targetY = 0.18;
      let targetZ: number;
      let stride = 0;
      let capeLift = 0.05;

      if (p.toRow >= 0) {
        const from = this.tileWorldPos(p.row, p.col);
        const to = this.tileWorldPos(p.toRow, p.toCol);
        const span = Math.max(1, p.hopEndMs - p.hopStartMs);
        const t = Math.min(1, Math.max(0, (sim.nowMs - p.hopStartMs) / span));
        targetX = THREE.MathUtils.lerp(from.x, to.x, t);
        targetZ = THREE.MathUtils.lerp(from.z, to.z, t);
        const arc = Math.sin(t * Math.PI);
        targetY = 0.18 + arc * 0.78;
        stride = Math.sin(t * Math.PI) * 0.65;
        capeLift = -0.35 * arc;

        const dx = to.x - from.x;
        const dz = to.z - from.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.01) {
          rig.facingYaw = Math.atan2(-dx, -dz);
        }
      } else {
        const base = this.tileWorldPos(p.row, p.col);
        targetX = base.x + sideOffX;
        targetZ = base.z;
      }

      rig.pos.x = THREE.MathUtils.lerp(rig.pos.x, targetX, 0.32);
      rig.pos.y = THREE.MathUtils.lerp(rig.pos.y, targetY, 0.45);
      rig.pos.z = THREE.MathUtils.lerp(rig.pos.z, targetZ, 0.32);
      rig.root.position.copy(rig.pos);
      rig.body.rotation.y = THREE.MathUtils.lerp(rig.body.rotation.y, rig.facingYaw, 0.22);

      // Walk stride & cape flutter
      rig.hipL.rotation.x = THREE.MathUtils.lerp(rig.hipL.rotation.x, stride, 0.3);
      rig.hipR.rotation.x = THREE.MathUtils.lerp(rig.hipR.rotation.x, -stride, 0.3);
      rig.capePivot.rotation.x = THREE.MathUtils.lerp(
        rig.capePivot.rotation.x,
        capeLift + Math.sin(elapsedSec * 2.5 + i) * 0.04,
        0.2,
      );

      if (p.party === 0) {
        (rig.aura.material as THREE.MeshBasicMaterial).opacity =
          i === this.activePawn ? 0.75 + Math.sin(elapsedSec * 4) * 0.14 : 0.22;
      }

      rig.blinkTimer -= dtSec;
      if (rig.blinkTimer <= 0) {
        rig.eyeL.scale.y = 0.15;
        rig.eyeR.scale.y = 0.15;
        if (rig.blinkTimer < -0.11) {
          rig.blinkTimer = 2.5 + Math.random() * 2.5;
          rig.eyeL.scale.y = 1;
          rig.eyeR.scale.y = 1;
        }
      }
    }

    // Stillness & Tether overlays
    if (dream.modifier.kind === 'stillness' && !isVoided) {
      const s0 = sim.stillProgress(0);
      const s1 = sim.hasPartner ? sim.stillProgress(1) : 0;
      const maxS = Math.max(s0, s1);
      if (maxS > 0.15) {
        const focusRig = s0 >= s1 ? this.pawnRigs[0] : this.pawnRigs[1];
        this.stillRingMesh.position.set(focusRig.pos.x, 0.2, focusRig.pos.z);
        this.stillRingMesh.scale.setScalar(0.5 + maxS * 0.85);
        this.stillRingMat.opacity = maxS * 0.78;
      } else {
        this.stillRingMat.opacity = 0;
      }
    } else {
      this.stillRingMat.opacity = 0;
    }

    if (
      sim.hasPartner &&
      dream.modifier.kind === 'tether' &&
      !sim.pawns[0].exited &&
      !sim.pawns[1].exited &&
      !isVoided
    ) {
      const a = this.pawnRigs[0].pos.clone().add(new THREE.Vector3(0, 0.5, 0));
      const b = this.pawnRigs[1].pos.clone().add(new THREE.Vector3(0, 0.5, 0));
      const mid = a.clone().lerp(b, 0.5);
      const strain = sim.tetherStrain;
      mid.y -= (1 - strain) * 0.28;
      this.tetherLine.geometry.setFromPoints([a, mid, b]);
      this.tetherMat.color.set(strain > 0.35 ? '#ff7a7a' : '#ffc857');
      this.tetherMat.opacity = 0.75;
    } else {
      this.tetherMat.opacity = 0;
    }

    // Camera tracking — and Dramatic Pull-Back Camera showing BOTH the Exit AND falling player on Void!
    const portrait = this.camera.aspect < 0.85;
    let wantPos: THREE.Vector3;
    let wantLook: THREE.Vector3;

    if (isVoided) {
      const lead = this.pawnRigs[this.activePawn];
      const gateWorld = this.tileWorldPos(dream.gateRow, dream.doorCol);
      const midZ = (lead.pos.z + gateWorld.z) * 0.5;
      wantPos = new THREE.Vector3(lead.pos.x * 0.4 + 4.8, portrait ? 12.2 : 9.8, lead.pos.z + 7.2);
      wantLook = new THREE.Vector3(gateWorld.x * 0.3, Math.max(-3.5, lead.pos.y - 0.8), midZ - 1.5);
    } else {
      const leadPawn = sim.pawns[this.activePawn]?.exited
        ? sim.pawns[0]
        : sim.pawns[this.activePawn] ?? sim.pawns[0];
      const leadPos = this.tileWorldPos(leadPawn.row, leadPawn.col);
      const camDistZ = portrait ? 8.6 : 7.2;
      const camHeight = portrait ? 8.9 : 7.4;
      const parallaxX = this.reducedMotion ? 0 : this.pointerX * 0.42;
      wantPos = new THREE.Vector3(leadPos.x * 0.45 + parallaxX, camHeight, leadPos.z + camDistZ);
      wantLook = new THREE.Vector3(leadPos.x * 0.28, 0.35, leadPos.z - 4.0);
    }

    const followRate = isVoided ? 2.6 : 4.6;
    this.camPos.lerp(wantPos, Math.min(1, dtSec * followRate));
    this.camLook.lerp(wantLook, Math.min(1, dtSec * followRate));

    this.shakeAmp = Math.max(0, this.shakeAmp - dtSec * 0.85);
    const sx = (Math.random() - 0.5) * this.shakeAmp;
    const sy = (Math.random() - 0.5) * this.shakeAmp;
    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook);

    this.renderer.render(this.scene, this.camera);
  }
}
