import { CharacterProfile, PlayMode } from '../engine/model';
import { LanguageCode } from '../engine/packs';

export interface ShardRecord {
  id: string;
  stars: number;
  attempts: number;
  clearedAt: number;
}

export interface AnchoredDream {
  code: string;
  name: string;
  rarity: number;
  createdAt: number;
}

export interface FriendEntry {
  tag: string;
  name: string;
  paletteIndex: number;
  head: CharacterProfile['head'];
  cloak: CharacterProfile['cloak'];
  charm: CharacterProfile['charm'];
}

export interface GameSettings {
  language: LanguageCode;
  motherTongue: LanguageCode;
  motherTongueEnabled: boolean;
  soundEnabled: boolean;
  slowMode: boolean;
  lowPowerGpu: boolean;
  playMode: PlayMode;
  sharedHallEnabled: boolean;
}

interface SaveData {
  onboarded: boolean;
  playerTag: string;
  moonlight: number;
  completedShards: Record<string, ShardRecord>;
  truths: string[];
  dailyStreak: number;
  lastDailyDay: number;
  anchored: AnchoredDream[];
  playerProfile: CharacterProfile;
  partnerProfile: CharacterProfile;
  friends: FriendEntry[];
  settings: GameSettings;
}

const STORAGE_KEY = 'dreamogic_save_v2';

function makeTag(name: string): string {
  const clean = (name || 'DREAMER').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'DREAM';
  const num = 100 + Math.floor(Math.random() * 899);
  return `${clean}#${num}`;
}

const DEFAULT_SAVE: SaveData = {
  onboarded: false,
  playerTag: makeTag('DREAMER'),
  moonlight: 30,
  completedShards: {},
  truths: [],
  dailyStreak: 0,
  lastDailyDay: -1,
  anchored: [],
  playerProfile: {
    name: 'You',
    head: 'hood',
    cloak: 'split',
    paletteIndex: 1,
    charm: 'lantern',
  },
  partnerProfile: {
    name: 'Partner',
    head: 'turban',
    cloak: 'shawl',
    paletteIndex: 0,
    charm: 'staff',
  },
  friends: [
    { tag: 'KIRAN#402', name: 'Kiran', paletteIndex: 2, head: 'crown', cloak: 'long', charm: 'compass' },
    { tag: 'NOOR#719', name: 'Noor', paletteIndex: 5, head: 'hood', cloak: 'poncho', charm: 'lantern' },
  ],
  settings: {
    language: 'en',
    motherTongue: 'hi',
    motherTongueEnabled: true,
    soundEnabled: true,
    slowMode: false,
    lowPowerGpu: false,
    playMode: 'solo-ai',
    sharedHallEnabled: false,
  },
};

function load(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...DEFAULT_SAVE,
      ...parsed,
      playerProfile: { ...DEFAULT_SAVE.playerProfile, ...(parsed.playerProfile ?? {}) },
      partnerProfile: { ...DEFAULT_SAVE.partnerProfile, ...(parsed.partnerProfile ?? {}) },
      friends: Array.isArray(parsed.friends) ? parsed.friends : DEFAULT_SAVE.friends,
      settings: { ...DEFAULT_SAVE.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

let state: SaveData = load();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Offline fallback
  }
}

export const Storage = {
  get onboarded(): boolean {
    return state.onboarded;
  },
  completeOnboarding(): void {
    state.onboarded = true;
    state.playerTag = makeTag(state.playerProfile.name);
    persist();
  },
  get playerTag(): string {
    return state.playerTag;
  },
  get moonlight(): number {
    return state.moonlight;
  },
  addMoonlight(delta: number): void {
    state.moonlight = Math.max(0, state.moonlight + delta);
    persist();
  },
  get completedShards(): Record<string, ShardRecord> {
    return state.completedShards;
  },
  recordShardClear(id: string, stars: number, attempts: number): void {
    const prev = state.completedShards[id];
    if (!prev || stars > prev.stars) {
      state.completedShards[id] = { id, stars, attempts, clearedAt: Date.now() };
      persist();
    }
  },
  get truths(): Set<string> {
    return new Set(state.truths);
  },
  recordTruth(key: string): void {
    if (!state.truths.includes(key)) {
      state.truths.push(key);
      persist();
    }
  },
  get dailyStreak(): number {
    return state.dailyStreak;
  },
  get lastDailyDay(): number {
    return state.lastDailyDay;
  },
  recordDailySolve(dayNumber: number): void {
    if (state.lastDailyDay === dayNumber - 1) state.dailyStreak += 1;
    else if (state.lastDailyDay !== dayNumber) state.dailyStreak = 1;
    state.lastDailyDay = dayNumber;
    persist();
  },
  get anchored(): AnchoredDream[] {
    return state.anchored;
  },
  anchorDream(code: string, name: string, rarity: number): void {
    if (!state.anchored.some((d) => d.code === code)) {
      state.anchored.unshift({ code, name, rarity, createdAt: Date.now() });
      persist();
    }
  },
  get playerProfile(): CharacterProfile {
    return state.playerProfile;
  },
  updatePlayerProfile(patch: Partial<CharacterProfile>): void {
    state.playerProfile = { ...state.playerProfile, ...patch };
    persist();
  },
  get partnerProfile(): CharacterProfile {
    return state.partnerProfile;
  },
  updatePartnerProfile(patch: Partial<CharacterProfile>): void {
    state.partnerProfile = { ...state.partnerProfile, ...patch };
    persist();
  },
  get friends(): FriendEntry[] {
    return state.friends;
  },
  addFriend(entry: FriendEntry): void {
    const cleanTag = entry.tag.trim().toUpperCase();
    if (!cleanTag) return;
    if (!state.friends.some((f) => f.tag === cleanTag)) {
      state.friends.unshift({ ...entry, tag: cleanTag });
      persist();
    }
  },
  removeFriend(tag: string): void {
    state.friends = state.friends.filter((f) => f.tag !== tag);
    persist();
  },
  get settings(): GameSettings {
    return state.settings;
  },
  updateSettings(patch: Partial<GameSettings>): void {
    state.settings = { ...state.settings, ...patch };
    persist();
  },
};
