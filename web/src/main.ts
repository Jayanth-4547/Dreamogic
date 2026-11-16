import '@fontsource/fraunces/600.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import './styles/tokens.css';
import './styles/app.css';

import { soundEngine } from './audio/soundEngine';
import {
  buildDailyDream,
  buildDream,
  hypothesisSafe,
  relayoutDream,
  STORY_CHAPTERS,
  StoryShard,
} from './engine/dream';
import {
  CHARACTER_PALETTES,
  CharmStyle,
  ClassifierKind,
  CloakStyle,
  Dream,
  GateMode,
  HeadStyle,
  isWalkableKind,
  PlayMode,
} from './engine/model';
import {
  generatePartnerThought,
  LANGUAGES,
  LanguageCode,
  text,
  whisperWithMotherTongue,
} from './engine/packs';
import { SeedCode } from './engine/rng';
import { DreamSim, SimEvent } from './engine/sim';
import { DreamScene, HunchMark } from './scene/DreamScene';
import {
  generateInviteCode,
  generateRandomTraveler,
  RoomRelay,
} from './services/multiplayer';
import { Storage } from './services/storage';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

type ScreenMode = 'title' | 'story' | 'daily' | 'forge';

const MODE_LABELS: Record<PlayMode, string> = {
  'solo-ai': 'Solo + AI',
  'solo-pure': 'Pure Solo',
  'couch-duo': '2P Couch',
  'room-group': 'Web Room',
  'room-random': 'Random',
};

const PATH_NAMES: Record<ClassifierKind, string> = {
  quiet: 'Fewest Trees',
  loud: 'Crowded Trees',
  odd: 'Odd Trees',
  even: 'Even Trees',
  hue: 'Lantern Hue',
  flowUp: 'Roots Ahead',
  flowDown: 'Roots Back',
};

class DreamogicApp {
  private readonly scene: DreamScene;
  private readonly relay: RoomRelay;
  private sim: DreamSim;
  private currentDream: Dream;
  private currentShard: StoryShard | null = STORY_CHAPTERS[0].shards[0];
  private screenMode: ScreenMode = 'title';
  private attempt = 1;
  private activePawn = 0; // 0 = You (main), 1 = Partner/P2
  private hunchMode: HunchMark = 0;
  private hintShown = false;
  private whisperCollapsed = false;
  private chosenPathGuess: ClassifierKind | null = null;
  private chosenGateGuess: GateMode | null = null;
  private resultShown = false;
  private lastPartnerAutoAt = 0;
  private lastRivalAutoAt = 0;
  private dailyDayNumber = 0;
  private lastTrigger: HTMLElement | null = null;
  private selectedChapter = 1;
  private forgedPreview: Dream | null = null;
  private toastTimer = 0;

  private readonly elTitle = $<HTMLElement>('title-overlay');
  private readonly elOnboarding = $<HTMLElement>('onboarding-overlay');
  private readonly elWhispers = $<HTMLElement>('gameplay-whispers');
  private readonly elHudBottom = $<HTMLElement>('hud-bottom');
  private readonly elResult = $<HTMLElement>('result-overlay');
  private readonly elHomeBtn = $<HTMLButtonElement>('btn-home');
  private readonly elPips = $<HTMLElement>('mistake-pips');
  private readonly elAnnouncer = $<HTMLElement>('live-announcer');

  constructor() {
    this.scene = new DreamScene($<HTMLElement>('canvas-mount'), {
      onTileClick: (row, col, rightClick) => this.handleTileClick(row, col, rightClick),
      onPawnClick: (pawnId) => this.selectPawn(pawnId),
    });

    this.relay = new RoomRelay({
      onStatusChange: (statusText) => {
        const el = document.getElementById('party-room-status');
        if (el) {
          el.hidden = false;
          el.textContent = statusText;
        }
      },
      onPeerJoined: (profile, seed) => {
        Storage.updatePartnerProfile(profile);
        this.syncSceneProfiles();
        this.updatePartySummary();
        this.renderPartnerThought();
        this.showToast(`${profile.name} joined your room!`);
        if (!this.relay.isHost && seed !== this.currentDream.seed) {
          this.currentShard = null;
          this.enterDream(buildDream(seed), 'forge');
        }
      },
      onPeerHop: (row, col) => {
        if (this.sim.playing && this.sim.canHop(1, row, col)) {
          this.sim.hop(1, row, col);
          soundEngine.playHop(row, col);
        }
      },
      onPeerHunch: (row, col, mark) => {
        this.scene.setHunch(row, col, mark as HunchMark);
      },
      onPeerRetry: (att) => {
        this.attempt = att;
        this.resultShown = false;
        this.elResult.hidden = true;
        this.loadDreamInstance(relayoutDream(this.currentDream, att));
      },
    });

    // Load a wide courtyard shard (1-3) for the live Title backdrop, or deep-linked room seed!
    const previewShard = STORY_CHAPTERS[0].shards[2];
    this.currentShard = STORY_CHAPTERS[0].shards[0];
    this.currentDream = buildDream(previewShard.seed, previewShard.spec);
    this.sim = new DreamSim(this.currentDream, this.currentSimOpts());

    this.applySettingsToRuntime();
    this.syncSceneProfiles();
    this.scene.loadDream(this.sim);
    this.scene.setActivePawn(0);

    this.bindUi();
    this.initOnboarding();
    this.handleUrlInvite();
    this.refreshModeChips();
    this.refreshMoonlight();
    this.refreshContinueLabel();
    this.updatePartySummary();
    this.startLoop();
  }

  private handleUrlInvite(): void {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const seedRaw = params.get('seed');
    if (room) {
      const cleanRoom = room.trim().toUpperCase();
      Storage.updateSettings({ playMode: 'room-group' });
      const seed = seedRaw ? SeedCode.fromInput(seedRaw) : STORY_CHAPTERS[0].shards[0].seed;
      this.currentShard = null;
      const dream = buildDream(seed);
      this.relay.connect(cleanRoom, false, Storage.playerProfile, dream.seed);
      this.enterDream(dream, 'forge');
      $<HTMLInputElement>('party-room-input').value = cleanRoom;
      $<HTMLElement>('party-share-row').hidden = false;
      this.showToast(`Joining Web Room ${cleanRoom}…`);
    }
  }

  private showToast(msg: string): void {
    const el = $<HTMLElement>('toast-banner');
    el.textContent = msg;
    el.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      el.hidden = true;
    }, 2800);
  }

  private initOnboarding(): void {
    const motherSel = $<HTMLSelectElement>('onb-mother');
    motherSel.replaceChildren();
    for (const l of LANGUAGES) {
      motherSel.add(
        new Option(`${l.label} (${l.native})`, l.code, false, l.code === Storage.settings.motherTongue),
      );
    }

    const palWrap = $<HTMLElement>('onb-palette-opts');
    const renderOnbPalettes = () => {
      palWrap.replaceChildren();
      CHARACTER_PALETTES.forEach((pal, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `choice-chip ${Storage.playerProfile.paletteIndex === idx ? 'selected' : ''}`;
        const dot = document.createElement('span');
        dot.className = 'swatch-dot';
        dot.style.background = pal.glow;
        b.append(dot, document.createTextNode(pal.name));
        b.addEventListener('click', () => {
          Storage.updatePlayerProfile({ paletteIndex: idx });
          this.syncSceneProfiles();
          renderOnbPalettes();
        });
        palWrap.appendChild(b);
      });
    };
    renderOnbPalettes();

    $<HTMLButtonElement>('btn-onb-next').addEventListener('click', () => {
      $<HTMLElement>('onb-step-1').hidden = true;
      $<HTMLElement>('onb-step-2').hidden = false;
      $<HTMLInputElement>('onb-name').value =
        Storage.playerProfile.name === 'You' ? '' : Storage.playerProfile.name;
      $<HTMLInputElement>('onb-name').focus();
    });
    $<HTMLButtonElement>('btn-onb-back').addEventListener('click', () => {
      $<HTMLElement>('onb-step-2').hidden = true;
      $<HTMLElement>('onb-step-1').hidden = false;
    });
    $<HTMLButtonElement>('btn-onb-skip').addEventListener('click', () => {
      Storage.completeOnboarding();
      this.elOnboarding.hidden = true;
    });
    $<HTMLFormElement>('onb-step-2').addEventListener('submit', (e) => {
      e.preventDefault();
      const rawName = $<HTMLInputElement>('onb-name').value.trim() || 'Dreamer';
      Storage.updatePlayerProfile({ name: rawName });
      Storage.updateSettings({ motherTongue: motherSel.value as LanguageCode });
      Storage.completeOnboarding();
      this.syncSceneProfiles();
      this.updatePartySummary();
      this.elOnboarding.hidden = true;
      this.showToast(`Welcome, ${rawName} (${Storage.playerTag})`);
    });

    if (!Storage.onboarded && !new URLSearchParams(window.location.search).get('room')) {
      this.elOnboarding.hidden = false;
    }
  }

  private currentSimOpts() {
    const mode = Storage.settings.playMode;
    return {
      hasPartner: mode !== 'solo-pure',
      hasRivalParty: Storage.settings.sharedHallEnabled,
    };
  }

  private syncSceneProfiles(): void {
    const rival1 = generateRandomTraveler();
    const rival2 = generateRandomTraveler();
    this.scene.setProfiles([
      Storage.playerProfile,
      Storage.partnerProfile,
      rival1,
      rival2,
    ]);
  }

  private applySettingsToRuntime(): void {
    const s = Storage.settings;
    soundEngine.setEnabled(s.soundEnabled);
    this.scene.setLowPower(s.lowPowerGpu);
  }

  private bindUi(): void {
    window.addEventListener('resize', () => this.scene.resize());
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.setLucid(false);
    });

    document.querySelectorAll<HTMLButtonElement>('#title-mode-strip .mode-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as PlayMode;
        this.setPlayMode(mode);
        if (mode === 'room-group' || mode === 'room-random') {
          this.openDialog('dlg-party', btn);
          this.renderPartyDialog();
        }
      });
    });

    $<HTMLButtonElement>('btn-play-continue').addEventListener('click', () => {
      const next = this.nextUnfinishedShard();
      this.enterStoryShard(next, 'story');
    });
    $<HTMLButtonElement>('btn-open-story').addEventListener('click', (e) => {
      this.openDialog('dlg-story', e.currentTarget as HTMLElement);
      this.renderStoryDialog();
    });
    $<HTMLButtonElement>('btn-play-daily').addEventListener('click', () => {
      const { dayNumber, dream } = buildDailyDream();
      this.dailyDayNumber = dayNumber;
      this.currentShard = null;
      this.enterDream(dream, 'daily');
    });
    $<HTMLButtonElement>('btn-open-forge').addEventListener('click', (e) => {
      this.openDialog('dlg-forge', e.currentTarget as HTMLElement);
      this.renderForgeDialog();
    });

    $<HTMLButtonElement>('btn-avatar').addEventListener('click', (e) => {
      this.openDialog('dlg-avatar', e.currentTarget as HTMLElement);
      this.renderAvatarDialog();
    });
    $<HTMLButtonElement>('btn-replay-intro').addEventListener('click', () => {
      this.closeDialog('dlg-avatar');
      $<HTMLElement>('onb-step-1').hidden = false;
      $<HTMLElement>('onb-step-2').hidden = true;
      this.elOnboarding.hidden = false;
    });
    $<HTMLButtonElement>('btn-party').addEventListener('click', (e) => {
      this.openDialog('dlg-party', e.currentTarget as HTMLElement);
      this.renderPartyDialog();
    });
    $<HTMLButtonElement>('btn-journal').addEventListener('click', (e) => {
      this.openDialog('dlg-journal', e.currentTarget as HTMLElement);
      this.renderJournalDialog();
    });
    $<HTMLButtonElement>('btn-settings').addEventListener('click', (e) => {
      this.openDialog('dlg-settings', e.currentTarget as HTMLElement);
      this.renderSettingsDialog();
    });
    this.elHomeBtn.addEventListener('click', () => this.returnToTitle());

    $<HTMLButtonElement>('btn-whisper-collapse').addEventListener('click', () => {
      this.whisperCollapsed = !this.whisperCollapsed;
      $<HTMLElement>('whisper-lines').hidden = this.whisperCollapsed;
      $<HTMLButtonElement>('btn-whisper-collapse').textContent = this.whisperCollapsed
        ? 'Show'
        : 'Hide';
    });

    $<HTMLButtonElement>('btn-pawn-switch').addEventListener('click', () => {
      if (this.sim.hasPartner && Storage.settings.playMode !== 'couch-duo') {
        this.selectPawn(1 - this.activePawn);
      }
    });
    $<HTMLButtonElement>('btn-mode-cycle').addEventListener('click', (e) => {
      this.openDialog('dlg-party', e.currentTarget as HTMLElement);
      this.renderPartyDialog();
    });
    $<HTMLButtonElement>('btn-hunch-cycle').addEventListener('click', () => {
      this.hunchMode = ((this.hunchMode + 1) % 4) as HunchMark;
      const labels = ['Pin: Move', 'Pin: Safe ✓', 'Pin: Danger ✕', 'Pin: Unsure ?'];
      $<HTMLElement>('hunch-label').textContent = labels[this.hunchMode];
      $<HTMLButtonElement>('btn-hunch-cycle').classList.toggle('active', this.hunchMode !== 0);
    });

    const lensBtn = $<HTMLButtonElement>('btn-lens');
    lensBtn.addEventListener('pointerdown', () => this.setLucid(true));
    lensBtn.addEventListener('pointerup', () => this.setLucid(false));
    lensBtn.addEventListener('pointerleave', () => this.setLucid(false));

    $<HTMLButtonElement>('btn-hint').addEventListener('click', () => {
      this.hintShown = true;
      this.renderWhisperCard();
      $<HTMLButtonElement>('btn-hint').hidden = true;
    });

    const openDebate = (e: Event) => {
      this.openDialog('dlg-debate', e.currentTarget as HTMLElement);
      this.renderDebateDialog();
    };
    $<HTMLButtonElement>('btn-open-debate').addEventListener('click', openDebate);
    $<HTMLButtonElement>('btn-solo-theory').addEventListener('click', openDebate);

    $<HTMLButtonElement>('btn-save-debate').addEventListener('click', () => {
      this.closeDialog('dlg-debate');
      this.refreshTheoryBadge();
      this.renderPartnerThought();
      this.showToast('Theory locked in!');
    });

    // Room hosting, joining, copy invite link & random match
    $<HTMLButtonElement>('btn-room-host').addEventListener('click', () => {
      const code = generateInviteCode();
      $<HTMLInputElement>('party-room-input').value = code;
      this.setPlayMode('room-group');
      this.relay.connect(code, true, Storage.playerProfile, this.currentDream.seed);
      $<HTMLElement>('party-share-row').hidden = false;
      this.renderPartyDialog();
      this.showToast(`Hosted Web Room ${code}`);
    });

    $<HTMLButtonElement>('btn-room-join').addEventListener('click', () => {
      const code = $<HTMLInputElement>('party-room-input').value.trim().toUpperCase();
      if (!code) {
        this.showToast('Enter a room code first.');
        return;
      }
      this.setPlayMode('room-group');
      this.relay.connect(code, false, Storage.playerProfile, this.currentDream.seed);
      $<HTMLElement>('party-share-row').hidden = false;
      this.showToast(`Connecting to ${code}…`);
    });

    $<HTMLButtonElement>('btn-copy-invite').addEventListener('click', () => {
      const code = this.relay.roomCode || $<HTMLInputElement>('party-room-input').value.trim().toUpperCase();
      if (!code) return;
      const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(code)}&seed=${encodeURIComponent(this.currentDream.code)}`;
      void navigator.clipboard?.writeText(url);
      this.showToast('Invite link copied to clipboard!');
    });

    $<HTMLButtonElement>('btn-match-random').addEventListener('click', () => {
      this.setPlayMode('room-random');
      const matched = generateRandomTraveler();
      Storage.updatePartnerProfile(matched);
      this.syncSceneProfiles();
      this.updatePartySummary();
      this.renderPartnerThought();
      const status = $<HTMLElement>('party-room-status');
      status.hidden = false;
      status.textContent = `Paired with "${matched.name}" (AI-guided stranger; use Web Room for cross-device human co-op).`;
      this.showToast(`Matched with ${matched.name}!`);
    });

    $<HTMLFormElement>('friend-add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $<HTMLInputElement>('friend-name-input').value.trim();
      const tag = $<HTMLInputElement>('friend-tag-input').value.trim();
      if (!name || !tag) {
        this.showToast('Enter both friend name and tag.');
        return;
      }
      const rand = generateRandomTraveler();
      Storage.addFriend({
        name,
        tag,
        paletteIndex: rand.paletteIndex,
        head: rand.head,
        cloak: rand.cloak,
        charm: rand.charm,
      });
      $<HTMLInputElement>('friend-name-input').value = '';
      $<HTMLInputElement>('friend-tag-input').value = '';
      this.renderPartyDialog();
      this.showToast(`Added ${name} to Friends!`);
    });

    $<HTMLFormElement>('forge-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = $<HTMLInputElement>('forge-input').value;
      const seed = SeedCode.fromInput(raw);
      this.forgedPreview = buildDream(seed);
      this.renderForgePreview();
    });

    document.querySelectorAll<HTMLButtonElement>('[data-close-dialog]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.closeDialog;
        if (id) this.closeDialog(id);
      });
    });
    document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dlg) => {
      dlg.addEventListener('close', () => {
        this.lastTrigger?.focus();
        this.lastTrigger = null;
      });
    });
  }

  private setPlayMode(mode: PlayMode): void {
    const prevPartner = this.sim.hasPartner;
    Storage.updateSettings({ playMode: mode });
    this.refreshModeChips();
    this.updatePartySummary();
    this.refreshSwitchButtonLabel();

    const nextPartner = mode !== 'solo-pure';
    if (this.screenMode === 'title' || prevPartner !== nextPartner) {
      this.loadDreamInstance(this.currentDream);
    }
  }

  private refreshModeChips(): void {
    const cur = Storage.settings.playMode;
    document.querySelectorAll<HTMLButtonElement>('#title-mode-strip .mode-chip, #party-mode-chips .mode-chip').forEach((b) => {
      b.classList.toggle('selected', b.dataset.mode === cur);
    });
    $<HTMLElement>('playmode-label').textContent = MODE_LABELS[cur];
  }

  private updatePartySummary(): void {
    const s = Storage.settings;
    const pName = Storage.playerProfile.name || 'You';
    const partName = Storage.partnerProfile.name || 'Partner';
    const shared = s.sharedHallEnabled ? ' · Shared Hall ON (2 Parties)' : '';
    const desc =
      s.playMode === 'solo-pure'
        ? `Solo: ${pName}${shared}`
        : `Party (${MODE_LABELS[s.playMode]}): ${pName} & ${partName}${shared}`;
    $<HTMLElement>('party-summary-line').textContent =
      `${desc} · Tap any floor slab or Arrows/WASD · Right-click to pin a hunch`;
    $<HTMLElement>('partner-label').textContent = partName;
  }

  private openDialog(id: string, trigger: HTMLElement): void {
    this.lastTrigger = trigger;
    const dlg = $<HTMLDialogElement>(id);
    if (!dlg.open) dlg.showModal();
  }

  private closeDialog(id: string): void {
    const dlg = $<HTMLDialogElement>(id);
    if (dlg.open) dlg.close();
  }

  private setLucid(on: boolean): void {
    this.scene.setLucid(on);
    $<HTMLButtonElement>('btn-lens').classList.toggle('active', on);
  }

  private selectPawn(id: number): void {
    if (id === 1 && !this.sim.hasPartner) return;
    this.activePawn = id;
    this.scene.setActivePawn(id);
    this.refreshSwitchButtonLabel();
  }

  private refreshSwitchButtonLabel(): void {
    const isCouch = Storage.settings.playMode === 'couch-duo' && this.sim.hasPartner;
    if (isCouch) {
      $<HTMLElement>('active-pawn-label').textContent = 'P1: WASD · P2: Arrows';
      $<HTMLElement>('active-pawn-swatch').style.background = 'var(--accent-mint)';
      return;
    }
    const prof = this.activePawn === 0 ? Storage.playerProfile : Storage.partnerProfile;
    const pal = CHARACTER_PALETTES[prof.paletteIndex % CHARACTER_PALETTES.length];
    $<HTMLElement>('active-pawn-label').textContent = `Moving: ${prof.name}`;
    $<HTMLElement>('active-pawn-swatch').style.background = pal.glow;
  }

  private nextUnfinishedShard(): StoryShard {
    const done = Storage.completedShards;
    for (const ch of STORY_CHAPTERS) {
      for (const s of ch.shards) if (!done[s.id]) return s;
    }
    return STORY_CHAPTERS[0].shards[0];
  }

  private refreshContinueLabel(): void {
    const s = this.nextUnfinishedShard();
    $<HTMLElement>('continue-shard-label').textContent = `Shard ${s.id} · ${s.title}`;
  }

  private refreshMoonlight(): void {
    $<HTMLElement>('hud-moonlight').textContent = String(Storage.moonlight);
  }

  private refreshTheoryBadge(): void {
    const badge = $<HTMLElement>('theory-locked-badge');
    if (this.chosenPathGuess) {
      badge.hidden = false;
      badge.textContent = PATH_NAMES[this.chosenPathGuess];
    } else {
      badge.hidden = true;
    }
  }

  private enterStoryShard(shard: StoryShard, mode: ScreenMode): void {
    this.currentShard = shard;
    this.enterDream(buildDream(shard.seed, shard.spec), mode);
  }

  private enterDream(dream: Dream, mode: ScreenMode): void {
    this.screenMode = mode;
    this.attempt = 1;
    this.hintShown = false;
    this.resultShown = false;
    this.chosenPathGuess = null;
    this.chosenGateGuess = null;
    this.whisperCollapsed = false;
    $<HTMLElement>('whisper-lines').hidden = false;
    $<HTMLButtonElement>('btn-whisper-collapse').textContent = 'Hide';
    $<HTMLButtonElement>('btn-hint').hidden = true;
    this.refreshTheoryBadge();

    this.loadDreamInstance(dream);

    this.elTitle.hidden = true;
    this.elResult.hidden = true;
    this.elWhispers.hidden = false;
    this.elHudBottom.hidden = false;
    this.elHomeBtn.hidden = false;
    this.elPips.hidden = false;
    $<HTMLElement>('hud-brand-crest').hidden = true;

    soundEngine.playWhisper();
  }

  private loadDreamInstance(dream: Dream): void {
    this.currentDream = dream;
    this.sim = new DreamSim(dream, this.currentSimOpts());
    this.activePawn = 0;
    this.scene.loadDream(this.sim);
    this.selectPawn(0);
    $<HTMLButtonElement>('btn-pawn-switch').hidden = !this.sim.hasPartner;
    $<HTMLElement>('partner-bubble').hidden = !this.sim.hasPartner;
    $<HTMLButtonElement>('btn-solo-theory').hidden = this.sim.hasPartner;
    $<HTMLElement>('gold-hud-pill').hidden = true;
    soundEngine.setBiomeTuning(dream.biome.rootMidi, dream.biome.scale);

    const sharedTag = this.sim.hasRivalParty ? ' · Shared Hall' : '';
    $<HTMLElement>('hud-shard-title').textContent = this.currentShard
      ? `Shard ${this.currentShard.id} · ${dream.name}`
      : dream.name;
    $<HTMLElement>('hud-shard-sub').textContent =
      `${dream.biome.name} · ${dream.cols}×${dream.rows} Hall · Attempt ${this.attempt}${sharedTag}`;

    this.renderMistakePips();
    this.renderWhisperCard();
    this.renderPartnerThought();
  }

  private returnToTitle(): void {
    this.screenMode = 'title';
    this.elTitle.hidden = false;
    this.elWhispers.hidden = true;
    this.elHudBottom.hidden = true;
    this.elResult.hidden = true;
    this.elHomeBtn.hidden = true;
    this.elPips.hidden = true;
    $<HTMLElement>('hud-brand-crest').hidden = false;
    $<HTMLElement>('hud-shard-title').textContent = 'Dreamogic';
    $<HTMLElement>('hud-shard-sub').textContent = 'Offline · Procedural Chambers';
    this.refreshContinueLabel();
  }

  private renderMistakePips(): void {
    this.elPips.replaceChildren();
    const total = this.currentDream.tolerance + 1;
    for (let i = 0; i < total; i++) {
      const pip = document.createElement('span');
      pip.className = i < this.sim.mistakes ? 'pip spent' : 'pip';
      this.elPips.appendChild(pip);
    }
  }

  private renderWhisperCard(): void {
    const container = $<HTMLElement>('whisper-lines');
    container.replaceChildren();
    const s = Storage.settings;

    this.currentDream.whisper.lines.forEach((line, idx) => {
      const res = whisperWithMotherTongue(
        line.id,
        s.language,
        s.motherTongue,
        s.motherTongueEnabled,
        idx,
      );
      const p = document.createElement('div');
      const mainSpan = document.createElement('span');
      mainSpan.textContent = `“${res.main}”`;
      p.appendChild(mainSpan);
      if (res.echo) {
        const echoP = document.createElement('div');
        echoP.className = 'whisper-echo';
        echoP.textContent = res.echo;
        p.appendChild(echoP);
      }
      container.appendChild(p);
    });

    const hintEl = $<HTMLElement>('whisper-hint-line');
    if (this.hintShown && this.currentDream.whisper.hintIds.length > 0) {
      hintEl.hidden = false;
      hintEl.textContent = `Second Whisper: ${this.currentDream.whisper.hintIds
        .map((id) => text(id, s.language))
        .join(' ')}`;
    } else {
      hintEl.hidden = true;
    }
    this.announce(this.currentDream.whisper.lines.map((l) => text(l.id, s.language)).join(' '));
  }

  private renderPartnerThought(): void {
    if (!this.sim.hasPartner) return;
    const s = Storage.settings;
    const partnerProf = Storage.partnerProfile;
    const pal = CHARACTER_PALETTES[partnerProf.paletteIndex % CHARACTER_PALETTES.length];
    $<HTMLElement>('partner-dot').style.background = pal.glow;
    $<HTMLElement>('partner-label').textContent = partnerProf.name;

    if (this.chosenPathGuess) {
      $<HTMLElement>('partner-thought-text').textContent =
        `${partnerProf.name}: "Alright—I'll stick with your ${PATH_NAMES[this.chosenPathGuess]} theory. Watch the gold at the end!"`;
      $<HTMLElement>('partner-thought-echo').hidden = true;
      return;
    }

    const thought = generatePartnerThought(
      partnerProf.name,
      this.currentDream.classifier,
      this.currentDream.modifier.kind,
      this.currentDream.gate.mode,
      this.attempt,
      s.motherTongue,
      s.motherTongueEnabled,
    );
    $<HTMLElement>('partner-thought-text').textContent = thought.text;
    const echoEl = $<HTMLElement>('partner-thought-echo');
    if (thought.motherEcho) {
      echoEl.hidden = false;
      echoEl.textContent = thought.motherEcho;
    } else {
      echoEl.hidden = true;
    }
  }

  /**
   * Smart 1-step pathfinder so clicking/tapping a visible stone several slabs ahead
   * smoothly steps 1 walkable tile toward your destination instead of ignoring the click!
   */
  private findNextStepToward(pawnId: number, targetRow: number, targetCol: number): [number, number] | null {
    const p = this.sim.pawns[pawnId];
    if (!p || !p.active || p.exited || p.toRow >= 0) return null;
    if (this.sim.canHop(pawnId, targetRow, targetCol)) return [targetRow, targetCol];
    const tile = this.currentDream.grid[targetRow]?.[targetCol];
    if (!tile || !isWalkableKind(tile.kind)) return null;

    const visited = new Set<string>([`${p.row}:${p.col}`]);
    const queue: { r: number; c: number; firstR: number; firstC: number }[] = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = p.row + dr;
        const nc = p.col + dc;
        if (this.sim.canHop(pawnId, nr, nc)) {
          visited.add(`${nr}:${nc}`);
          queue.push({ r: nr, c: nc, firstR: nr, firstC: nc });
        }
      }
    }

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.r === targetRow && cur.c === targetCol) return [cur.firstR, cur.firstC];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cur.r + dr;
          const nc = cur.c + dc;
          const key = `${nr}:${nc}`;
          if (visited.has(key)) continue;
          const nt = this.currentDream.grid[nr]?.[nc];
          if (!nt || !isWalkableKind(nt.kind)) continue;
          if (this.sim.tiles[nr][nc].voided) continue;
          if (nt.kind === 'door' && !this.sim.gate.open) continue;
          visited.add(key);
          queue.push({ r: nr, c: nc, firstR: cur.firstR, firstC: cur.firstC });
        }
      }
    }
    return null;
  }

  private handleTileClick(row: number, col: number, rightClick: boolean): void {
    if (this.screenMode === 'title' || !this.sim.playing) return;

    if (rightClick || this.hunchMode !== 0) {
      const wantMark: HunchMark = rightClick ? 3 : this.hunchMode;
      const cur = this.scene.getHunch(row, col);
      const nextMark: HunchMark = cur === wantMark ? 0 : wantMark;
      this.scene.setHunch(row, col, nextMark);
      this.relay.sendHunch(row, col, nextMark);
      soundEngine.playPin();
      return;
    }

    const step = this.findNextStepToward(this.activePawn, row, col);
    if (step) {
      this.performHop(this.activePawn, step[0], step[1]);
      return;
    }
    if (this.sim.hasPartner && this.sim.canHop(1 - this.activePawn, row, col)) {
      this.selectPawn(1 - this.activePawn);
      this.performHop(this.activePawn, row, col);
    }
  }

  private performHop(pawnId: number, row: number, col: number): void {
    if (this.sim.hop(pawnId, row, col)) {
      soundEngine.playHop(row, col);
      if (pawnId === 0) {
        this.lastPartnerAutoAt = this.sim.nowMs;
        this.relay.sendHop(row, col);
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Space' && this.screenMode !== 'title') {
      e.preventDefault();
      this.setLucid(true);
      return;
    }
    if (e.code === 'Tab' && this.screenMode !== 'title' && this.sim.hasPartner) {
      e.preventDefault();
      this.selectPawn(1 - this.activePawn);
      return;
    }
    if (this.screenMode === 'title' || !this.sim.playing) return;

    const isCouch = Storage.settings.playMode === 'couch-duo' && this.sim.hasPartner;
    let pawn = this.activePawn;
    let dr = 0;
    let dc = 0;

    if (e.code === 'ArrowUp') { pawn = isCouch ? 1 : this.activePawn; dr = 1; }
    else if (e.code === 'ArrowDown') { pawn = isCouch ? 1 : this.activePawn; dr = -1; }
    else if (e.code === 'ArrowLeft') { pawn = isCouch ? 1 : this.activePawn; dc = -1; }
    else if (e.code === 'ArrowRight') { pawn = isCouch ? 1 : this.activePawn; dc = 1; }
    else if (e.code === 'KeyW') { pawn = isCouch ? 0 : this.activePawn; dr = 1; }
    else if (e.code === 'KeyS') { pawn = isCouch ? 0 : this.activePawn; dr = -1; }
    else if (e.code === 'KeyA') { pawn = isCouch ? 0 : this.activePawn; dc = -1; }
    else if (e.code === 'KeyD') { pawn = isCouch ? 0 : this.activePawn; dc = 1; }
    else return;

    e.preventDefault();
    const p = this.sim.pawns[pawn];
    if (this.sim.canHop(pawn, p.row + dr, p.col + dc)) {
      this.performHop(pawn, p.row + dr, p.col + dc);
    }
  }

  private updateGoldHud(): void {
    const pill = $<HTMLElement>('gold-hud-pill');
    const nearGate =
      this.sim.pawns.some((p) => p.active && p.row >= this.currentDream.pathRows) ||
      this.sim.gate.everOpened;
    if (this.screenMode === 'title' || !nearGate) {
      pill.hidden = true;
      return;
    }
    pill.hidden = false;
    const f0 = this.sim.reserveFraction(0);
    const f1 = this.sim.reserveFraction(1);
    const frac = Math.max(f0, f1);
    $<HTMLElement>('gold-hud-pct').textContent = `${Math.round(frac * 100)}%`;
    $<HTMLElement>('gold-track-fill').style.width = `${Math.round(frac * 100)}%`;
    $<HTMLElement>('gold-hud-label').textContent = this.sim.gate.open
      ? 'Exit Archway Open — Escape!'
      : 'Molten Gold Reservoir';
  }

  private tickPartnerCompanion(): void {
    const mode = Storage.settings.playMode;
    if (!this.sim.hasPartner || mode === 'couch-duo' || (mode === 'room-group' && this.relay.peerConnected)) {
      return;
    }
    if (!this.sim.playing) return;

    const you = this.sim.pawns[0];
    const partner = this.sim.pawns[1];
    if (!partner.active || partner.exited || partner.toRow >= 0) return;
    if (this.sim.nowMs - this.lastPartnerAutoAt < 240) return;

    if (this.sim.gate.open && this.sim.canHop(1, this.currentDream.gateRow, this.currentDream.doorCol)) {
      this.sim.hop(1, this.currentDream.gateRow, this.currentDream.doorCol);
      soundEngine.playHop(this.currentDream.gateRow, this.currentDream.doorCol);
      this.lastPartnerAutoAt = this.sim.nowMs;
      return;
    }

    const gateRow = this.currentDream.gateRow;
    const [g0, g1] = this.currentDream.goldCols;
    if (you.row === gateRow && (you.col === g0 || you.col === g1) && partner.row === gateRow - 1) {
      const targetGold = you.col === g0 ? g1 : g0;
      const steps = Array.from({ length: this.currentDream.cols }, (_, c) => c)
        .filter((c) => this.sim.canHop(1, gateRow, c))
        .sort((a, b) => Math.abs(a - targetGold) - Math.abs(b - targetGold));
      if (steps.length > 0) {
        this.sim.hop(1, gateRow, steps[0]);
        soundEngine.playHop(gateRow, steps[0]);
        this.lastPartnerAutoAt = this.sim.nowMs;
        return;
      }
    }

    if (partner.row < you.row || (you.exited && partner.row < gateRow)) {
      const nextRow = Math.min(gateRow, partner.row + 1);
      const guess =
        this.chosenPathGuess ??
        generatePartnerThought(
          Storage.partnerProfile.name,
          this.currentDream.classifier,
          this.currentDream.modifier.kind,
          this.currentDream.gate.mode,
          this.attempt,
          Storage.settings.motherTongue,
          false,
        ).hypothesis;

      let opts = Array.from({ length: this.currentDream.cols }, (_, c) => c).filter((c) =>
        this.sim.canHop(1, nextRow, c),
      );
      if (nextRow <= this.currentDream.pathRows) {
        const believed = hypothesisSafe(guess, this.currentDream.grid[nextRow], this.currentDream.lanternHue);
        const match = opts.filter((c) => believed.has(c));
        if (match.length > 0) opts = match;
      }
      if (opts.length > 0) {
        const chosen = opts.includes(you.col) ? you.col : opts[0];
        this.sim.hop(1, nextRow, chosen);
        soundEngine.playHop(nextRow, chosen);
        this.lastPartnerAutoAt = this.sim.nowMs;
      }
    }
  }

  private tickRivalParty(): void {
    if (!this.sim.hasRivalParty || !this.sim.playing) return;
    if (this.sim.nowMs - this.lastRivalAutoAt < 1150) return;
    this.lastRivalAutoAt = this.sim.nowMs;

    for (const rid of [2, 3]) {
      const rp = this.sim.pawns[rid];
      if (!rp.active || rp.exited || rp.toRow >= 0) continue;

      if (this.sim.gate.open && this.sim.canHop(rid, this.currentDream.gateRow, this.currentDream.doorCol)) {
        this.sim.hop(rid, this.currentDream.gateRow, this.currentDream.doorCol);
        continue;
      }
      const nextRow = Math.min(this.currentDream.gateRow, rp.row + 1);
      const opts = Array.from({ length: this.currentDream.cols }, (_, c) => c).filter((c) =>
        this.sim.canHop(rid, nextRow, c),
      );
      if (opts.length > 0) {
        const safe = this.currentDream.safeCols[nextRow];
        const safeOpts = opts.filter((c) => safe.has(c));
        const pick =
          safeOpts.length > 0 && Math.random() < 0.72
            ? safeOpts[0]
            : opts[Math.floor(Math.random() * opts.length)];
        this.sim.hop(rid, nextRow, pick);
      }
    }
  }

  private processEvents(events: SimEvent[]): void {
    this.scene.handleSimEvents(events);
    for (const ev of events) {
      if (ev.kind === 'wilt' || ev.kind === 'collapse' || ev.kind === 'tetherSnap') {
        soundEngine.playWilt();
        this.renderMistakePips();
      } else if (ev.kind === 'goldLit') {
        soundEngine.playGoldLit();
      } else if (ev.kind === 'doorOpen') {
        soundEngine.playDoorOpen();
        this.announce('Molten gold awakens the Exit Archway! Escape before the reservoir drains!');
      } else if (ev.kind === 'doorClose') {
        soundEngine.playDoorClose();
        this.announce('The gold poured dry and the Exit Archway sealed!');
      } else if (ev.kind === 'won') {
        soundEngine.playWin();
        this.showWinResult();
      } else if (ev.kind === 'voided') {
        soundEngine.playVoid();
        setTimeout(() => this.showVoidResult(ev.voidCause), 2450);
      }
    }
  }

  private showVoidResult(cause?: string): void {
    if (this.resultShown || this.screenMode === 'title') return;
    this.resultShown = true;
    const key = cause ? `void.${cause}` : 'void.tileCollapse';
    $<HTMLElement>('result-eyebrow').textContent = 'The Exit Vanished · Chamber Collapsed';
    $<HTMLElement>('result-title').textContent = 'Swallowed by the Void';
    $<HTMLElement>('result-desc').textContent = text(key, Storage.settings.language);
    $<HTMLElement>('result-truth').hidden = true;
    $<HTMLElement>('result-stats').textContent = `Attempt ${this.attempt} · Same rule, newly shaped dungeon`;

    const primary = $<HTMLButtonElement>('btn-result-primary');
    primary.textContent = 'Re-enter Chamber';
    primary.onclick = () => {
      this.attempt += 1;
      this.resultShown = false;
      this.elResult.hidden = true;
      if (this.attempt >= 2) $<HTMLButtonElement>('btn-hint').hidden = false;
      this.relay.sendRetry(this.attempt);
      this.loadDreamInstance(relayoutDream(this.currentDream, this.attempt));
    };

    const secondary = $<HTMLButtonElement>('btn-result-secondary');
    secondary.textContent = 'Debate Theory';
    secondary.onclick = (e) => {
      this.openDialog('dlg-debate', e.currentTarget as HTMLElement);
      this.renderDebateDialog();
    };

    this.elResult.hidden = false;
  }

  private showWinResult(): void {
    if (this.resultShown || this.screenMode === 'title') return;
    this.resultShown = true;

    const stars = this.sim.mistakes === 0 && this.attempt <= 3 ? 3 : this.sim.mistakes <= 1 ? 2 : 1;
    let theoryHits = 0;
    if (this.chosenPathGuess === this.currentDream.classifier) theoryHits += 1;
    if (this.chosenGateGuess === this.currentDream.gate.mode) theoryHits += 1;

    const firstClear = this.currentShard ? !Storage.completedShards[this.currentShard.id] : false;
    const moonlightGain =
      10 + stars * 5 + (this.currentDream.rarity - 1) * 3 + theoryHits * 4 + (firstClear ? 10 : 0);

    Storage.addMoonlight(moonlightGain);
    Storage.recordTruth(`truth.${this.currentDream.classifier}`);
    Storage.recordTruth(`truth.${this.currentDream.gate.mode}`);
    if (this.currentDream.modifier.kind !== 'none') {
      Storage.recordTruth(`truth.${this.currentDream.modifier.kind}`);
    }
    if (this.currentDream.flipRow >= 0) Storage.recordTruth('truth.flip');

    if (this.screenMode === 'story' && this.currentShard) {
      Storage.recordShardClear(this.currentShard.id, stars, this.attempt);
    } else if (this.screenMode === 'daily') {
      Storage.recordDailySolve(this.dailyDayNumber);
    }
    this.refreshMoonlight();

    $<HTMLElement>('result-eyebrow').textContent = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · Escaped Before the Gold Died`;
    $<HTMLElement>('result-title').textContent = `${this.currentDream.name} Cleared`;

    let desc = 'Crossed the sanctuary before the molten gold poured dry.';
    if (this.currentShard?.boss) {
      const ch = STORY_CHAPTERS.find((c) => c.number === this.currentShard?.chapter);
      if (ch) desc = ch.outro;
    }
    $<HTMLElement>('result-desc').textContent = desc;

    const truthEl = $<HTMLElement>('result-truth');
    truthEl.hidden = false;
    truthEl.textContent = `Truth Uncovered: ${text(`truth.${this.currentDream.classifier}`, Storage.settings.language)} · ${text(`truth.${this.currentDream.gate.mode}`, Storage.settings.language)}`;
    $<HTMLElement>('result-stats').textContent =
      `+${moonlightGain} Moonlight · Mistakes: ${this.sim.mistakes} · Theory hits: ${theoryHits}/2`;

    const primary = $<HTMLButtonElement>('btn-result-primary');
    const nextShard = this.findNextShard();
    if (this.screenMode === 'story' && nextShard) {
      primary.textContent = `Next: Shard ${nextShard.id}`;
      primary.onclick = () => this.enterStoryShard(nextShard, 'story');
    } else {
      primary.textContent = 'Play Again';
      primary.onclick = () => this.enterDream(this.currentDream, this.screenMode);
    }

    const secondary = $<HTMLButtonElement>('btn-result-secondary');
    secondary.textContent = 'Title Menu';
    secondary.onclick = () => this.returnToTitle();

    this.elResult.hidden = false;
  }

  private findNextShard(): StoryShard | null {
    if (!this.currentShard) return null;
    const flat = STORY_CHAPTERS.flatMap((c) => c.shards);
    const idx = flat.findIndex((s) => s.id === this.currentShard?.id);
    return idx >= 0 && idx + 1 < flat.length ? flat[idx + 1] : null;
  }

  private renderAvatarDialog(): void {
    const p = Storage.playerProfile;
    $<HTMLElement>('av-tag-display').textContent = Storage.playerTag;
    const nameInput = $<HTMLInputElement>('av-name');
    nameInput.value = p.name;
    nameInput.oninput = () => {
      Storage.updatePlayerProfile({ name: nameInput.value.trim() || 'Dreamer' });
      this.updatePartySummary();
      this.refreshSwitchButtonLabel();
    };

    const heads: { id: HeadStyle; label: string }[] = [
      { id: 'hood', label: 'Traveler Hood' },
      { id: 'crown', label: 'Moonlit Crown' },
      { id: 'turban', label: 'Wrapped Turban' },
      { id: 'hat', label: 'Stargazer Hat' },
      { id: 'hair', label: 'Swept Hair' },
    ];
    this.renderChipGroup('av-head-opts', heads, p.head, (val) => {
      Storage.updatePlayerProfile({ head: val as HeadStyle });
      this.syncSceneProfiles();
      this.renderAvatarDialog();
    });

    const cloaks: { id: CloakStyle; label: string }[] = [
      { id: 'split', label: 'Split Mantle' },
      { id: 'long', label: 'Long Cape' },
      { id: 'poncho', label: 'Short Poncho' },
      { id: 'shawl', label: 'Nomad Shawl' },
    ];
    this.renderChipGroup('av-cloak-opts', cloaks, p.cloak, (val) => {
      Storage.updatePlayerProfile({ cloak: val as CloakStyle });
      this.syncSceneProfiles();
      this.renderAvatarDialog();
    });

    const palWrap = $<HTMLElement>('av-palette-opts');
    palWrap.replaceChildren();
    CHARACTER_PALETTES.forEach((pal, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `choice-chip ${p.paletteIndex === idx ? 'selected' : ''}`;
      const dot = document.createElement('span');
      dot.className = 'swatch-dot';
      dot.style.background = pal.glow;
      b.append(dot, document.createTextNode(pal.name));
      b.addEventListener('click', () => {
        Storage.updatePlayerProfile({ paletteIndex: idx });
        this.syncSceneProfiles();
        this.renderAvatarDialog();
      });
      palWrap.appendChild(b);
    });

    const charms: { id: CharmStyle; label: string }[] = [
      { id: 'lantern', label: 'Brass Lantern' },
      { id: 'staff', label: 'Cedar Staff' },
      { id: 'compass', label: 'Astrolabe Ring' },
      { id: 'none', label: 'Unburdened' },
    ];
    this.renderChipGroup('av-charm-opts', charms, p.charm, (val) => {
      Storage.updatePlayerProfile({ charm: val as CharmStyle });
      this.syncSceneProfiles();
      this.renderAvatarDialog();
    });
  }

  private renderChipGroup(
    elId: string,
    opts: { id: string; label: string }[],
    selected: string,
    onPick: (val: string) => void,
  ): void {
    const wrap = $<HTMLElement>(elId);
    wrap.replaceChildren();
    for (const o of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `choice-chip ${selected === o.id ? 'selected' : ''}`;
      b.textContent = o.label;
      b.addEventListener('click', () => onPick(o.id));
      wrap.appendChild(b);
    }
  }

  private renderPartyDialog(): void {
    const modes: { id: PlayMode; label: string }[] = [
      { id: 'solo-ai', label: 'Solo + AI' },
      { id: 'solo-pure', label: 'Pure Solo' },
      { id: 'couch-duo', label: '2P Couch' },
      { id: 'room-group', label: 'Web Room' },
      { id: 'room-random', label: 'Random' },
    ];
    const modeWrap = $<HTMLElement>('party-mode-chips');
    modeWrap.replaceChildren();
    for (const m of modes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mode-chip ${Storage.settings.playMode === m.id ? 'selected' : ''}`;
      b.textContent = m.label;
      b.addEventListener('click', () => {
        this.setPlayMode(m.id);
        this.renderPartyDialog();
      });
      modeWrap.appendChild(b);
    }

    const sharedCheck = $<HTMLInputElement>('set-shared-hall');
    sharedCheck.checked = Storage.settings.sharedHallEnabled;
    sharedCheck.onchange = () => {
      Storage.updateSettings({ sharedHallEnabled: sharedCheck.checked });
      this.updatePartySummary();
      this.loadDreamInstance(this.currentDream);
      this.showToast(sharedCheck.checked ? 'Shared Hall enabled (2 Parties)' : 'Shared Hall disabled');
    };

    const shareRow = $<HTMLElement>('party-share-row');
    shareRow.hidden = !this.relay.roomCode;

    const status = $<HTMLElement>('party-room-status');
    if (this.relay.roomCode) {
      status.hidden = false;
      status.textContent = this.relay.peerConnected
        ? `Connected (${this.relay.transportLabel}) with ${this.relay.peerProfile?.name} in Room ${this.relay.roomCode}`
        : `Room ${this.relay.roomCode} (${this.relay.transportLabel}) — share Invite Link to connect!`;
    }

    const list = $<HTMLElement>('friends-list');
    list.replaceChildren();
    for (const f of Storage.friends) {
      const row = document.createElement('div');
      row.className = 'shard-row';

      const left = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'shard-row-title';
      title.textContent = f.name;
      const meta = document.createElement('div');
      meta.className = 'shard-row-meta';
      meta.textContent = f.tag;
      left.append(title, meta);

      const right = document.createElement('div');
      right.className = 'whisper-actions';

      const invite = document.createElement('button');
      invite.type = 'button';
      invite.className = 'btn-secondary';
      invite.textContent = Storage.partnerProfile.name === f.name ? 'In Party ✓' : 'Party Up';
      invite.addEventListener('click', () => {
        Storage.updatePartnerProfile({
          name: f.name,
          head: f.head,
          cloak: f.cloak,
          paletteIndex: f.paletteIndex,
          charm: f.charm,
        });
        this.setPlayMode('solo-ai');
        this.syncSceneProfiles();
        this.renderPartnerThought();
        this.renderPartyDialog();
        this.showToast(`${f.name} joined your party!`);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.setAttribute('aria-label', `Remove ${f.name}`);
      del.textContent = '×';
      del.addEventListener('click', () => {
        Storage.removeFriend(f.tag);
        this.renderPartyDialog();
      });

      right.append(invite, del);
      row.append(left, right);
      list.appendChild(row);
    }
  }

  private renderStoryDialog(): void {
    const tabs = $<HTMLElement>('chapter-tabs');
    tabs.replaceChildren();
    for (const ch of STORY_CHAPTERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chapter-tab';
      b.textContent = `Ch ${ch.number}: ${ch.title}`;
      b.setAttribute('aria-selected', String(ch.number === this.selectedChapter));
      b.addEventListener('click', () => {
        this.selectedChapter = ch.number;
        this.renderStoryDialog();
      });
      tabs.appendChild(b);
    }

    const ch = STORY_CHAPTERS.find((c) => c.number === this.selectedChapter) ?? STORY_CHAPTERS[0];
    $<HTMLElement>('chapter-intro').textContent = `${ch.whisperer}\n${ch.intro}`;

    const list = $<HTMLElement>('shard-list');
    list.replaceChildren();
    const done = Storage.completedShards;
    for (const shard of ch.shards) {
      const rec = done[shard.id];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'shard-row';

      const left = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'shard-row-title';
      title.textContent = `${shard.id} · ${shard.title}${shard.boss ? ' (Finale)' : ''}`;
      const meta = document.createElement('div');
      meta.className = 'shard-row-meta';
      meta.textContent = `${shard.spec.pathRows ?? 10} rows · ${shard.spec.tier ?? 'standard'}`;
      left.append(title, meta);

      const right = document.createElement('div');
      right.className = 'tabular';
      right.textContent = rec ? `${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}` : 'Play →';

      row.append(left, right);
      row.addEventListener('click', () => {
        this.closeDialog('dlg-story');
        this.enterStoryShard(shard, 'story');
      });
      list.appendChild(row);
    }
  }

  private renderForgeDialog(): void {
    if (!this.forgedPreview) {
      this.forgedPreview = buildDream(SeedCode.fromInput('SANCTUARY'));
    }
    this.renderForgePreview();

    const list = $<HTMLElement>('anchored-list');
    list.replaceChildren();
    const anchored = Storage.anchored;
    if (anchored.length === 0) {
      const p = document.createElement('p');
      p.className = 'chapter-intro';
      p.textContent = 'No dreams anchored yet. Forge one above and anchor favorites here.';
      list.appendChild(p);
      return;
    }
    for (const item of anchored) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shard-row';
      const l = document.createElement('span');
      l.textContent = `${item.name} (${item.code})`;
      const r = document.createElement('span');
      r.textContent = 'Enter →';
      btn.append(l, r);
      btn.addEventListener('click', () => {
        this.closeDialog('dlg-forge');
        this.currentShard = null;
        this.enterDream(buildDream(SeedCode.fromInput(item.code)), 'forge');
      });
      list.appendChild(btn);
    }
  }

  private renderForgePreview(): void {
    const d = this.forgedPreview;
    if (!d) return;
    const box = $<HTMLElement>('forge-preview');
    box.replaceChildren();

    const title = document.createElement('div');
    title.className = 'shard-row-title';
    title.textContent = `${d.name} · Seed ${d.code}`;

    const meta = document.createElement('p');
    meta.className = 'chapter-intro';
    meta.textContent = `${d.biome.name} · ${d.cols}×${d.rows} dungeon hall · ${d.tier} · Rarity ${'★'.repeat(d.rarity)}`;

    const actions = document.createElement('div');
    actions.className = 'result-actions';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'btn-primary';
    playBtn.textContent = 'Enter Forged Chamber';
    playBtn.addEventListener('click', () => {
      this.closeDialog('dlg-forge');
      this.currentShard = null;
      this.enterDream(d, 'forge');
    });

    const already = Storage.anchored.some((a) => a.code === d.code);
    const anchorBtn = document.createElement('button');
    anchorBtn.type = 'button';
    anchorBtn.className = 'btn-secondary';
    anchorBtn.textContent = already ? 'Anchored ✓' : 'Anchor Offline';
    anchorBtn.addEventListener('click', () => {
      Storage.anchorDream(d.code, d.name, d.rarity);
      this.renderForgeDialog();
      this.showToast(`Anchored ${d.name}`);
    });

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-secondary';
    copyBtn.textContent = 'Copy Seed';
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard?.writeText(d.code);
      this.showToast(`Copied seed ${d.code}`);
    });

    actions.append(playBtn, anchorBtn, copyBtn);
    box.append(title, meta, actions);
  }

  private renderJournalDialog(): void {
    const unlocked = Storage.truths;
    const keys = [
      'truth.quiet',
      'truth.loud',
      'truth.odd',
      'truth.even',
      'truth.hue',
      'truth.flowUp',
      'truth.flowDown',
      'truth.stillness',
      'truth.once',
      'truth.tether',
      'truth.flip',
      'truth.doorbell',
      'truth.unison',
      'truth.patience',
    ];
    $<HTMLElement>('journal-count').textContent = `Uncovered ${unlocked.size} of ${keys.length} dream truths.`;
    const list = $<HTMLElement>('journal-list');
    list.replaceChildren();
    const lang = Storage.settings.language;

    for (const k of keys) {
      const known = unlocked.has(k);
      const row = document.createElement('div');
      row.className = 'journal-row';
      const title = document.createElement('span');
      title.textContent = known ? text(k, lang) : 'A forgotten dream truth…';
      title.style.color = known ? 'var(--ink-1)' : 'var(--ink-3)';
      const badge = document.createElement('span');
      badge.textContent = known ? 'Known' : 'Locked';
      badge.style.color = known ? 'var(--accent-mint)' : 'var(--ink-3)';
      row.append(title, badge);
      list.appendChild(row);
    }
  }

  private renderDebateDialog(): void {
    const pathOpts: { id: ClassifierKind; label: string }[] = [
      { id: 'quiet', label: 'Fewest Trees' },
      { id: 'loud', label: 'Crowded Trees' },
      { id: 'odd', label: 'Odd Trees' },
      { id: 'even', label: 'Even Trees' },
      { id: 'hue', label: 'Lantern Colour' },
      { id: 'flowUp', label: 'Roots Ahead' },
      { id: 'flowDown', label: 'Roots Back' },
    ];
    this.renderChipGroup('debate-path-opts', pathOpts, this.chosenPathGuess ?? '', (id) => {
      this.chosenPathGuess = id as ClassifierKind;
      this.renderDebateDialog();
    });

    const gateOpts: { id: GateMode; label: string }[] = [
      { id: 'doorbell', label: 'Ring Gold & Flee' },
      { id: 'unison', label: 'Step on Gold Together' },
      { id: 'patience', label: 'Hold Until Arch Opens' },
    ];
    this.renderChipGroup('debate-gate-opts', gateOpts, this.chosenGateGuess ?? '', (id) => {
      this.chosenGateGuess = id as GateMode;
      this.renderDebateDialog();
    });
  }

  private renderSettingsDialog(): void {
    const s = Storage.settings;
    const primarySel = $<HTMLSelectElement>('set-lang');
    const motherSel = $<HTMLSelectElement>('set-mother-lang');
    primarySel.replaceChildren();
    motherSel.replaceChildren();

    for (const l of LANGUAGES) {
      primarySel.add(new Option(`${l.label} (${l.native})`, l.code, false, l.code === s.language));
      motherSel.add(new Option(`${l.label} (${l.native})`, l.code, false, l.code === s.motherTongue));
    }

    const motherOn = $<HTMLInputElement>('set-mother-on');
    const soundOn = $<HTMLInputElement>('set-sound');
    const slowOn = $<HTMLInputElement>('set-slow');
    const lowGpu = $<HTMLInputElement>('set-lowgpu');
    motherOn.checked = s.motherTongueEnabled;
    soundOn.checked = s.soundEnabled;
    slowOn.checked = s.slowMode;
    lowGpu.checked = s.lowPowerGpu;

    primarySel.onchange = () => {
      Storage.updateSettings({ language: primarySel.value as LanguageCode });
      this.renderWhisperCard();
    };
    motherSel.onchange = () => {
      Storage.updateSettings({ motherTongue: motherSel.value as LanguageCode });
      this.renderWhisperCard();
      this.renderPartnerThought();
    };
    motherOn.onchange = () => {
      Storage.updateSettings({ motherTongueEnabled: motherOn.checked });
      this.renderWhisperCard();
      this.renderPartnerThought();
    };
    soundOn.onchange = () => {
      Storage.updateSettings({ soundEnabled: soundOn.checked });
      soundEngine.setEnabled(soundOn.checked);
    };
    slowOn.onchange = () => {
      Storage.updateSettings({ slowMode: slowOn.checked });
    };
    lowGpu.onchange = () => {
      Storage.updateSettings({ lowPowerGpu: lowGpu.checked });
      this.scene.setLowPower(lowGpu.checked);
    };
  }

  private announce(msg: string): void {
    this.elAnnouncer.textContent = msg;
  }

  private startLoop(): void {
    let last = performance.now();
    const start = last;
    const frame = (now: number) => {
      const rawDtMs = Math.min(50, Math.max(0, now - last));
      last = now;
      const slowFactor = Storage.settings.slowMode ? 0.72 : 1.0;

      if (this.screenMode !== 'title' && this.sim.playing) {
        this.sim.tick(Math.round(rawDtMs * slowFactor));
        this.tickPartnerCompanion();
        this.tickRivalParty();
        this.updateGoldHud();
        const events = this.sim.takeEvents();
        if (events.length > 0) this.processEvents(events);
      }

      this.scene.render(rawDtMs / 1000, (now - start) / 1000);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

new DreamogicApp();
