import { Dream, isWalkableKind, ModifierKind } from './model';

export type SimStatus = 'playing' | 'won' | 'voided';
export type VoidCause = 'tooManyMistakes' | 'tileCollapse' | 'gateClosed' | 'gateUnwinnable';
export type MistakeCause = 'rule' | 'once' | 'stillness' | 'tether';

export type SimEventKind =
  | 'hop'
  | 'land'
  | 'wilt'
  | 'collapse'
  | 'blocked'
  | 'goldLit'
  | 'goldSpent'
  | 'doorOpen'
  | 'doorClose'
  | 'exited'
  | 'tetherSnap'
  | 'won'
  | 'voided';

export interface SimEvent {
  kind: SimEventKind;
  atMs: number;
  pawn: number;
  row: number;
  col: number;
  cause?: MistakeCause;
  voidCause?: VoidCause;
}

export interface PawnRt {
  id: number;
  party: 0 | 1; // 0 = player party, 1 = unrelated shared-room party
  row: number;
  col: number;
  toRow: number;
  toCol: number;
  hopStartMs: number;
  hopEndMs: number;
  landedAtMs: number;
  nextStillAt: number;
  exited: boolean;
  active: boolean; // false when playing pure 1-player solo without partner or rival party
}

export interface TileRt {
  strikes: number;
  voided: boolean;
  visits: number;
  lastStrikeAtMs: number;
}

export interface GateRt {
  open: boolean;
  everOpened: boolean;
  dead: boolean;
  openUntilMs: number;
  pressedAt: [number, number];
  spent: [boolean, boolean];
  hold: [number, number];
  reserve: [number, number];
}

export interface SimOptions {
  hasPartner?: boolean; // false = pure 1-player solo
  hasRivalParty?: boolean; // true = shared common room with 2nd unrelated party!
}

export class DreamSim {
  readonly dream: Dream;
  readonly tiles: TileRt[][];
  readonly gate: GateRt;
  /** Up to 4 pawns: 0 (You), 1 (Partner / P2), 2..3 (Optional Unrelated Shared-Room Party). */
  readonly pawns: PawnRt[];
  readonly hasPartner: boolean;
  readonly hasRivalParty: boolean;
  nowMs = 0;
  status: SimStatus = 'playing';
  voidCause?: VoidCause;
  mistakes = 0;

  private tetherStrainMs = 0;
  private failAtMs = -1;
  private failCause?: VoidCause;
  private events: SimEvent[] = [];

  constructor(dream: Dream, opts: SimOptions = {}) {
    this.dream = dream;
    this.hasPartner = opts.hasPartner ?? true;
    this.hasRivalParty = opts.hasRivalParty ?? false;

    this.tiles = dream.grid.map((row) =>
      row.map(() => ({ strikes: 0, voided: false, visits: 0, lastStrikeAtMs: -1 })),
    );
    this.gate = {
      open: false,
      everOpened: false,
      dead: false,
      openUntilMs: 0,
      pressedAt: [-1, -1],
      spent: [false, false],
      hold: [0, 0],
      reserve: [dream.gate.reserveMs, dream.gate.reserveMs],
    };

    const p0Col = dream.startCols[0];
    const p1Col = dream.startCols[1];
    const r0Col = dream.rivalStartCols[0];
    const r1Col = dream.rivalStartCols[1];

    this.pawns = [
      { id: 0, party: 0, row: 0, col: p0Col, toRow: -1, toCol: -1, hopStartMs: 0, hopEndMs: 0, landedAtMs: 0, nextStillAt: 1e12, exited: false, active: true },
      { id: 1, party: 0, row: 0, col: p1Col, toRow: -1, toCol: -1, hopStartMs: 0, hopEndMs: 0, landedAtMs: 0, nextStillAt: 1e12, exited: !this.hasPartner, active: this.hasPartner },
      { id: 2, party: 1, row: 0, col: r0Col, toRow: -1, toCol: -1, hopStartMs: 0, hopEndMs: 0, landedAtMs: 0, nextStillAt: 1e12, exited: !this.hasRivalParty, active: this.hasRivalParty },
      { id: 3, party: 1, row: 0, col: r1Col, toRow: -1, toCol: -1, hopStartMs: 0, hopEndMs: 0, landedAtMs: 0, nextStillAt: 1e12, exited: !this.hasRivalParty, active: this.hasRivalParty },
    ];
  }

  get playing(): boolean {
    return this.status === 'playing';
  }

  get mainPartyExited(): boolean {
    return this.pawns[0].exited && (!this.hasPartner || this.pawns[1].exited);
  }

  takeEvents(): SimEvent[] {
    if (this.events.length === 0) return [];
    const copy = this.events;
    this.events = [];
    return copy;
  }

  get tetherStrain(): number {
    if (!this.hasPartner || this.dream.modifier.kind !== 'tether') return 0;
    return Math.min(1, Math.max(0, this.tetherStrainMs / this.dream.modifier.tetherGraceMs));
  }

  stillProgress(pawnId: number): number {
    if (this.dream.modifier.kind !== 'stillness') return 0;
    const p = this.pawns[pawnId];
    if (!p || !p.active || p.toRow >= 0 || p.exited) return 0;
    if (this.dream.grid[p.row][p.col].kind !== 'path') return 0;
    return Math.min(1, Math.max(0, (this.nowMs - p.landedAtMs) / this.dream.modifier.stillMs));
  }

  reserveFraction(idx: number): number {
    if (this.gate.spent[idx] || this.gate.dead) return 0;
    const denom =
      this.dream.gate.mode === 'unison' && !this.gate.open
        ? this.dream.gate.unisonGapMs
        : this.dream.gate.reserveMs;
    if (denom <= 0) return 0;
    return Math.min(1, Math.max(0, this.gate.reserve[idx] / denom));
  }

  get doorRemaining(): number {
    if (!this.gate.open) return 0;
    return Math.min(1, Math.max(0, (this.gate.openUntilMs - this.nowMs) / this.dream.gate.windowMs));
  }

  canHop(id: number, row: number, col: number): boolean {
    if (!this.playing) return false;
    const p = this.pawns[id];
    if (!p || !p.active || p.exited || p.toRow >= 0) return false;
    if (row < 0 || row >= this.dream.rows || col < 0 || col >= this.dream.cols) return false;
    const tile = this.dream.grid[row][col];
    if (!isWalkableKind(tile.kind)) return false;
    const dr = row - p.row;
    const dc = col - p.col;
    if ((dr === 0 && dc === 0) || Math.abs(dr) > 1 || Math.abs(dc) > 1) return false;
    if (this.tiles[row][col].voided) return false;
    if (tile.kind === 'door' && !this.gate.open) return false;
    return true;
  }

  hop(id: number, row: number, col: number): boolean {
    if (!this.playing) return false;
    const p = this.pawns[id];
    if (!p || !p.active || p.exited || p.toRow >= 0) return false;
    if (row < 0 || row >= this.dream.rows || col < 0 || col >= this.dream.cols) return false;
    const tile = this.dream.grid[row][col];
    if (!isWalkableKind(tile.kind)) return false;
    const dr = row - p.row;
    const dc = col - p.col;
    if ((dr === 0 && dc === 0) || Math.abs(dr) > 1 || Math.abs(dc) > 1) return false;
    if (this.tiles[row][col].voided) return false;
    if (tile.kind === 'door' && !this.gate.open) {
      this.emit('blocked', id, row, col);
      return false;
    }
    p.toRow = row;
    p.toCol = col;
    p.hopStartMs = this.nowMs;
    p.hopEndMs = this.nowMs + this.dream.hopMs;
    this.emit('hop', id, row, col);
    return true;
  }

  tick(dtMs: number): void {
    let rem = dtMs;
    while (rem > 0 && this.playing) {
      const step = Math.min(20, rem);
      rem -= step;
      this.nowMs += step;
      this.advance(step);
    }
  }

  private emit(
    kind: SimEventKind,
    pawn = -1,
    row = -1,
    col = -1,
    cause?: MistakeCause,
    voidCause?: VoidCause,
  ): void {
    this.events.push({ kind, atMs: this.nowMs, pawn, row, col, cause, voidCause });
  }

  private advance(step: number): void {
    for (const p of this.pawns) {
      if (p.active && p.toRow >= 0 && this.nowMs >= p.hopEndMs) {
        this.land(p);
      }
      if (!this.playing) return;
    }
    this.tickGate(step);
    this.tickStillness();
    this.tickTether(step);
    if (this.failAtMs >= 0 && this.nowMs >= this.failAtMs && this.playing) {
      this.doVoid(this.failCause ?? 'gateClosed');
    }
  }

  private land(p: PawnRt): void {
    p.row = p.toRow;
    p.col = p.toCol;
    p.toRow = -1;
    p.toCol = -1;
    p.landedAtMs = this.nowMs;
    p.nextStillAt = this.nowMs + this.dream.modifier.stillMs;

    const tile = this.dream.grid[p.row][p.col];
    const ts = this.tiles[p.row][p.col];
    const priorVisits = ts.visits;
    ts.visits++;
    this.emit('land', p.id, p.row, p.col);

    if (tile.kind === 'path') {
      const cause = this.violation(p.row, p.col, priorVisits, this.dream.modifier.kind);
      if (cause) this.mistake(p, ts, cause);
    } else if (tile.kind === 'gold') {
      const gIdx = tile.col === this.dream.goldCols[0] ? 0 : 1;
      this.onGoldLand(gIdx);
    } else if (tile.kind === 'door') {
      p.exited = true;
      this.emit('exited', p.id, p.row, p.col);
      if (p.party === 0 && this.mainPartyExited) {
        this.status = 'won';
        this.emit('won');
      }
    }
  }

  private violation(
    row: number,
    col: number,
    priorVisits: number,
    mod: ModifierKind,
  ): MistakeCause | undefined {
    if (!this.dream.safeCols[row].has(col)) return 'rule';
    if (mod === 'once' && priorVisits > 0) return 'once';
    return undefined;
  }

  private mistake(p: PawnRt, ts: TileRt, cause: MistakeCause): void {
    if (ts.lastStrikeAtMs === this.nowMs) return;
    ts.lastStrikeAtMs = this.nowMs;

    // Rival party mistakes crack the shared floor too, but only void if main party steps there or collapses!
    if (ts.strikes >= 1) {
      ts.voided = true;
      this.emit('collapse', p.id, p.row, p.col, cause);
      if (p.party === 0) {
        this.doVoid('tileCollapse');
      } else {
        p.exited = true;
        p.active = false;
      }
      return;
    }

    ts.strikes = 1;
    if (p.party === 0) {
      this.mistakes++;
      this.emit('wilt', p.id, p.row, p.col, cause);
      if (this.mistakes > this.dream.tolerance) {
        this.doVoid('tooManyMistakes');
      }
    } else {
      this.emit('wilt', p.id, p.row, p.col, cause);
    }
  }

  private doVoid(cause: VoidCause): void {
    if (!this.playing) return;
    this.status = 'voided';
    this.voidCause = cause;
    this.emit('voided', -1, -1, -1, undefined, cause);
  }

  private openDoor(): void {
    this.gate.open = true;
    this.gate.everOpened = true;
    this.gate.openUntilMs = this.nowMs + this.dream.gate.windowMs;
    this.emit('doorOpen', -1, this.dream.gateRow, this.dream.doorCol);
  }

  private onGoldLand(idx: number): void {
    if (this.gate.spent[idx] || this.gate.dead) return;
    const col = this.dream.goldCols[idx];
    this.emit('goldLit', -1, this.dream.gateRow, col);

    // Notice: even in pure 1-player solo, unison still allows stepping left-to-right or auto-opening if no partner
    const effMode =
      !this.hasPartner && this.dream.gate.mode === 'unison'
        ? 'patience'
        : this.dream.gate.mode;

    if (effMode === 'doorbell') {
      if (!this.gate.everOpened) this.openDoor();
    } else if (effMode === 'unison') {
      this.gate.pressedAt[idx] = this.nowMs;
      const other = 1 - idx;
      if (
        !this.gate.everOpened &&
        !this.gate.spent[other] &&
        this.gate.pressedAt[other] >= 0 &&
        this.nowMs - this.gate.pressedAt[other] <= this.dream.gate.unisonGapMs
      ) {
        this.openDoor();
      }
    }
  }

  private checkGateDead(): void {
    if (this.gate.everOpened || this.gate.dead) return;
    const effMode =
      !this.hasPartner && this.dream.gate.mode === 'unison'
        ? 'patience'
        : this.dream.gate.mode;
    const dead =
      effMode === 'unison'
        ? this.gate.spent[0] || this.gate.spent[1]
        : effMode === 'patience'
          ? this.gate.spent[0] && this.gate.spent[1]
          : false;
    if (dead) {
      this.gate.dead = true;
      this.failAtMs = this.nowMs + 1000;
      this.failCause = 'gateUnwinnable';
    }
  }

  private tickGate(step: number): void {
    if (this.gate.open) {
      const remFrac = this.doorRemaining;
      this.gate.reserve[0] = Math.round(remFrac * this.dream.gate.reserveMs);
      this.gate.reserve[1] = Math.round(remFrac * this.dream.gate.reserveMs);
    }

    if (this.gate.open && this.nowMs >= this.gate.openUntilMs) {
      this.gate.open = false;
      this.gate.spent[0] = true;
      this.gate.spent[1] = true;
      this.gate.reserve[0] = 0;
      this.gate.reserve[1] = 0;
      this.emit('doorClose', -1, this.dream.gateRow, this.dream.doorCol);
      if (!this.mainPartyExited) {
        this.failAtMs = this.nowMs + 600;
        this.failCause = 'gateClosed';
      }
    }
    if (this.gate.everOpened) return;

    const effMode =
      !this.hasPartner && this.dream.gate.mode === 'unison'
        ? 'patience'
        : this.dream.gate.mode;

    if (effMode === 'unison') {
      for (let i = 0; i < 2; i++) {
        if (this.gate.pressedAt[i] >= 0 && !this.gate.spent[i]) {
          const elapsed = this.nowMs - this.gate.pressedAt[i];
          this.gate.reserve[i] = Math.max(0, this.dream.gate.unisonGapMs - elapsed);
          if (elapsed > this.dream.gate.unisonGapMs) {
            this.gate.spent[i] = true;
            this.gate.reserve[i] = 0;
            this.emit('goldSpent', -1, this.dream.gateRow, this.dream.goldCols[i]);
            this.checkGateDead();
          }
        }
      }
    } else if (effMode === 'patience') {
      for (let i = 0; i < 2; i++) {
        if (this.gate.spent[i]) continue;
        const goldCol = this.dream.goldCols[i];
        const standing = this.pawns.some(
          (p) =>
            p.active &&
            !p.exited &&
            p.toRow < 0 &&
            p.row === this.dream.gateRow &&
            p.col === goldCol,
        );
        if (standing) {
          this.gate.hold[i] += step / this.dream.gate.holdMs;
          this.gate.reserve[i] = Math.max(0, this.gate.reserve[i] - step);
        } else {
          this.gate.hold[i] = Math.max(0, this.gate.hold[i] - step / (this.dream.gate.holdMs * 2));
        }
        if (this.gate.hold[i] >= 1) {
          this.gate.hold[i] = 1;
          this.openDoor();
          return;
        }
        if (this.gate.reserve[i] <= 0) {
          this.gate.spent[i] = true;
          this.emit('goldSpent', -1, this.dream.gateRow, goldCol);
          this.checkGateDead();
        }
      }
    }
  }

  private tickStillness(): void {
    if (this.dream.modifier.kind !== 'stillness') return;
    const seen = new Set<number>();
    for (const p of this.pawns) {
      if (!p.active || p.toRow >= 0 || p.exited) continue;
      if (this.dream.grid[p.row][p.col].kind !== 'path') continue;
      const key = p.row * this.dream.cols + p.col;
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.nowMs >= p.nextStillAt) {
        p.nextStillAt += this.dream.modifier.stillMs;
        for (const other of this.pawns) {
          if (other.row === p.row && other.col === p.col) other.nextStillAt = p.nextStillAt;
        }
        this.mistake(p, this.tiles[p.row][p.col], 'stillness');
        if (!this.playing) return;
      }
    }
  }

  private tickTether(step: number): void {
    if (!this.hasPartner || this.dream.modifier.kind !== 'tether') return;
    if (this.pawns[0].exited || this.pawns[1].exited) {
      this.tetherStrainMs = 0;
      return;
    }
    const gap = Math.abs(this.pawns[0].row - this.pawns[1].row);
    if (gap > this.dream.modifier.tetherRows) {
      this.tetherStrainMs += step;
    } else {
      this.tetherStrainMs = Math.max(0, this.tetherStrainMs - step * 2);
    }
    if (this.tetherStrainMs >= this.dream.modifier.tetherGraceMs) {
      this.tetherStrainMs = 0;
      this.mistakes++;
      this.emit('tetherSnap', -1, -1, -1, 'tether');
      if (this.mistakes > this.dream.tolerance) {
        this.doVoid('tooManyMistakes');
      }
    }
  }
}
