import Peer, { DataConnection } from 'peerjs';
import { CharacterProfile } from '../engine/model';

export type RoomMsg =
  | { kind: 'hello'; senderId: string; profile: CharacterProfile; seed: number; isHost: boolean }
  | { kind: 'welcome'; senderId: string; profile: CharacterProfile; seed: number }
  | { kind: 'hop'; senderId: string; row: number; col: number }
  | { kind: 'hunch'; senderId: string; row: number; col: number; mark: number }
  | { kind: 'retry'; senderId: string; attempt: number };

export interface RoomCallbacks {
  onStatusChange: (statusText: string) => void;
  onPeerJoined: (profile: CharacterProfile, seed: number) => void;
  onPeerHop: (row: number, col: number) => void;
  onPeerHunch: (row: number, col: number, mark: number) => void;
  onPeerRetry: (attempt: number) => void;
}

const ROOM_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

export function generateRandomTraveler(): CharacterProfile {
  const names = ['Sora', 'Meera', 'Arjun', 'Lyra', 'Kabir', 'Zara', 'Dev', 'Iris'];
  const heads: CharacterProfile['head'][] = ['hood', 'crown', 'turban', 'hat', 'hair'];
  const cloaks: CharacterProfile['cloak'][] = ['long', 'poncho', 'split', 'shawl'];
  const charms: CharacterProfile['charm'][] = ['lantern', 'staff', 'compass', 'none'];
  return {
    name: names[Math.floor(Math.random() * names.length)],
    head: heads[Math.floor(Math.random() * heads.length)],
    cloak: cloaks[Math.floor(Math.random() * cloaks.length)],
    paletteIndex: Math.floor(Math.random() * 6),
    charm: charms[Math.floor(Math.random() * charms.length)],
  };
}

/**
 * Dual-transport multiplayer relay:
 * 1) Real WebRTC P2P across the internet (PeerJS) — works on Vercel / custom domains!
 * 2) Local BroadcastChannel — instant zero-latency sync between tabs on one device.
 */
export class RoomRelay {
  readonly senderId = Math.random().toString(36).slice(2, 10);
  roomCode = '';
  isHost = false;
  peerConnected = false;
  peerProfile: CharacterProfile | null = null;
  transportLabel = 'Offline';

  private channel: BroadcastChannel | null = null;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private callbacks: RoomCallbacks;

  constructor(callbacks: RoomCallbacks) {
    this.callbacks = callbacks;
  }

  connect(code: string, isHost: boolean, myProfile: CharacterProfile, seed: number): void {
    this.disconnect();
    this.roomCode = code.trim().toUpperCase();
    this.isHost = isHost;
    this.peerConnected = false;
    this.peerProfile = null;

    const cleanRoomId = `dreamogic-v1-${this.roomCode.replace(/[^A-Z0-9]/g, '')}`;

    // 1. Local same-browser BroadcastChannel (instant on localhost / multi-tab)
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`dreamogic_room_${this.roomCode}`);
      this.channel.onmessage = (ev: MessageEvent<RoomMsg>) => {
        this.handleIncoming(ev.data, myProfile, seed, 'Local Tab Relay');
      };
      this.channel.postMessage({
        kind: 'hello',
        senderId: this.senderId,
        profile: myProfile,
        seed,
        isHost,
      });
    }

    // 2. Real Cross-Web WebRTC DataChannel via PeerJS (works across Vercel / custom domain!)
    try {
      this.callbacks.onStatusChange(
        isHost
          ? `Hosting ${this.roomCode} — share Invite Link to play across the web…`
          : `Connecting across the web to ${this.roomCode}…`,
      );
      this.peer = isHost ? new Peer(cleanRoomId) : new Peer();

      this.peer.on('open', () => {
        if (!isHost && this.peer) {
          const dc = this.peer.connect(cleanRoomId, { reliable: true });
          this.wireDataConn(dc, myProfile, seed);
        } else {
          this.transportLabel = 'WebRTC Ready';
          this.callbacks.onStatusChange(
            `Room ${this.roomCode} live on WebRTC P2P — share Invite Link!`,
          );
        }
      });

      this.peer.on('connection', (dc) => {
        this.wireDataConn(dc, myProfile, seed);
      });

      this.peer.on('error', () => {
        if (!this.peerConnected) {
          this.transportLabel = 'Local Relay';
          this.callbacks.onStatusChange(
            `Room ${this.roomCode} ready locally (open another tab or retry P2P when online).`,
          );
        }
      });
    } catch {
      this.transportLabel = 'Local Relay';
      this.callbacks.onStatusChange(`Room ${this.roomCode} active via Local Tab Relay.`);
    }
  }

  private wireDataConn(dc: DataConnection, myProfile: CharacterProfile, seed: number): void {
    this.conn = dc;
    dc.on('open', () => {
      this.transportLabel = 'WebRTC P2P Live';
      dc.send({
        kind: 'hello',
        senderId: this.senderId,
        profile: myProfile,
        seed,
        isHost: this.isHost,
      } satisfies RoomMsg);
    });
    dc.on('data', (data) => {
      this.handleIncoming(data as RoomMsg, myProfile, seed, 'WebRTC P2P Live');
    });
    dc.on('close', () => {
      this.peerConnected = false;
      this.callbacks.onStatusChange(`Partner left Room ${this.roomCode}.`);
    });
  }

  private handleIncoming(
    msg: RoomMsg,
    myProfile: CharacterProfile,
    seed: number,
    via: string,
  ): void {
    if (!msg || msg.senderId === this.senderId) return;

    if (msg.kind === 'hello') {
      this.peerConnected = true;
      this.peerProfile = msg.profile;
      this.transportLabel = via;
      this.callbacks.onStatusChange(`Connected (${via}) with ${msg.profile.name}!`);
      this.callbacks.onPeerJoined(msg.profile, msg.seed);
      if (this.isHost) {
        this.post({ kind: 'welcome', senderId: this.senderId, profile: myProfile, seed });
      }
    } else if (msg.kind === 'welcome') {
      this.peerConnected = true;
      this.peerProfile = msg.profile;
      this.transportLabel = via;
      this.callbacks.onStatusChange(`Connected (${via}) with ${msg.profile.name}!`);
      this.callbacks.onPeerJoined(msg.profile, msg.seed);
    } else if (msg.kind === 'hop') {
      this.callbacks.onPeerHop(msg.row, msg.col);
    } else if (msg.kind === 'hunch') {
      this.callbacks.onPeerHunch(msg.row, msg.col, msg.mark);
    } else if (msg.kind === 'retry') {
      this.callbacks.onPeerRetry(msg.attempt);
    }
  }

  sendHop(row: number, col: number): void {
    this.post({ kind: 'hop', senderId: this.senderId, row, col });
  }

  sendHunch(row: number, col: number, mark: number): void {
    this.post({ kind: 'hunch', senderId: this.senderId, row, col, mark });
  }

  sendRetry(attempt: number): void {
    this.post({ kind: 'retry', senderId: this.senderId, attempt });
  }

  disconnect(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.roomCode = '';
    this.peerConnected = false;
    this.peerProfile = null;
    this.transportLabel = 'Offline';
  }

  private post(msg: RoomMsg): void {
    this.channel?.postMessage(msg);
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }
}
