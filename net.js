// Online multiplayer for up to 12 players per room.
//
// Topology: a star. The host is a player too and relays everything, so clients only ever talk to the host.
// Transport: PeerJS (WebRTC data channels, free public signalling server), loaded lazily from the CDN only when
// someone opens "PLAY ONLINE", so single player never downloads it.
//   ?net=local          -> BroadcastChannel transport: two tabs of the same browser can test without internet.
//   ?peerserver=host:9000 -> use your own PeerServer instead of the free public one.
//
// Messages (all small JSON):
//   client -> host   hello {name} | p {v:[x,z]} (12 Hz) | e {k:'d'|'f'|'x', time}
//   host   -> client welcome {slot} | no {why} | lobby {players} | start {players}
//                    s {p:{slot:[x,z]}} (12 Hz) | g {rate} | r {dur} | e {slot,k,time,rank}
//   k: 'd' = eliminated, 'f' = finished (host assigns the rank), 'x' = out of time, 'gone' = left the room.
// The host also decides every Green / Red phase (chant speed, red length), so the doll is the same for everybody.

export const MAX_PLAYERS = 12;
export const slotX = (s) => -11 + s * 2; // spawn lane on the start line
export const slotIdx = (s) => s * 2; // which AI contestant slot a remote human replaces (0..22)
const SEND_HZ = 12;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I / O
const PEERJS_URL =
  "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
const r2 = (v) => Math.round(v * 100) / 100;
const makeCode = () =>
  Array.from(
    { length: 4 },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join("");
const cleanName = (n, fallback) => {
  const s = String(n || "")
    .replace(/[^\w \-.]/g, "")
    .trim()
    .slice(0, 12);
  return s || fallback || "Player";
};

// ---------------------------------------------------------------- transports
function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = PEERJS_URL;
    s.onload = () => res();
    s.onerror = () =>
      rej(new Error("Could not load the online library. Check your internet."));
    document.head.appendChild(s);
  });
}
function peerOptions() {
  const o = { debug: 0 };
  const ps = new URLSearchParams(location.search).get("peerserver");
  if (ps) {
    const [h, p] = ps.split(":");
    Object.assign(o, { host: h, port: +p || 9000, path: "/", secure: false });
  }
  return o;
}

// Interface used by Net: host(code) / join(code) -> Promise, toHost(d), toPeer(id, d), toAll(d), close(),
// callbacks onPeerOpen(id), onPeerClose(id), onData(id, d), onClosed().
class PeerTransport {
  constructor() {
    this.peer = null;
    this.up = null; // client: connection to the host
    this.conns = new Map(); // host: peerId -> connection
  }
  async host(code) {
    await loadPeerJS();
    await new Promise((res, rej) => {
      const t = setTimeout(
        () =>
          rej(new Error("The matchmaking server did not answer. Try again.")),
        12000,
      );
      const peer = (this.peer = new window.Peer("rlgl-" + code, peerOptions()));
      peer.on("open", () => {
        clearTimeout(t);
        res();
      });
      peer.on("error", (e) => {
        clearTimeout(t);
        rej(
          e.type === "unavailable-id"
            ? new Error("taken")
            : new Error(
                "Could not reach the matchmaking server (" + e.type + ").",
              ),
        );
      });
      peer.on("connection", (c) => {
        c.on("open", () => {
          this.conns.set(c.peer, c);
          this.onPeerOpen && this.onPeerOpen(c.peer);
        });
        c.on("data", (d) => this.onData && this.onData(c.peer, d));
        c.on("close", () => {
          this.conns.delete(c.peer);
          this.onPeerClose && this.onPeerClose(c.peer);
        });
      });
      peer.on("disconnected", () => {
        try {
          peer.reconnect();
        } catch (e) {
          /* ignore */
        }
      });
    });
  }
  async join(code) {
    await loadPeerJS();
    await new Promise((res, rej) => {
      const t = setTimeout(
        () => rej(new Error("Room not found, or the host cannot be reached.")),
        12000,
      );
      const peer = (this.peer = new window.Peer(peerOptions()));
      peer.on("error", (e) => {
        clearTimeout(t);
        rej(
          new Error(
            e.type === "peer-unavailable"
              ? "Room not found. Check the code."
              : "Connection error (" + e.type + ").",
          ),
        );
      });
      peer.on("open", () => {
        const c = (this.up = peer.connect("rlgl-" + code, {
          reliable: true,
          serialization: "json",
        }));
        c.on("open", () => {
          clearTimeout(t);
          res();
        });
        c.on("data", (d) => this.onData && this.onData("host", d));
        c.on("close", () => this.onClosed && this.onClosed());
      });
    });
  }
  toHost(d) {
    if (this.up && this.up.open) this.up.send(d);
  }
  toPeer(id, d) {
    const c = this.conns.get(id);
    if (c && c.open) c.send(d);
  }
  toAll(d) {
    for (const c of this.conns.values()) if (c.open) c.send(d);
  }
  close() {
    try {
      if (this.peer) this.peer.destroy();
    } catch (e) {
      /* ignore */
    }
    this.peer = this.up = null;
    this.conns.clear();
  }
}

// Test transport: same interface over BroadcastChannel (same browser, same origin)
class LocalTransport {
  constructor() {
    this.id = "L" + Math.random().toString(36).slice(2, 8);
    this.isHost = false;
    this.hostId = null;
    this.ch = null;
    this.waiting = null;
    this.peers = new Set();
    this.unload = () => this.close();
    addEventListener("beforeunload", this.unload);
  }
  open(code) {
    this.ch = new BroadcastChannel("rlgl-" + code);
    this.ch.onmessage = (ev) => this.recv(ev.data);
  }
  post(to, d) {
    if (this.ch) this.ch.postMessage({ from: this.id, to, d });
  }
  recv(m) {
    if (m.from === this.id) return;
    if (m.to !== "*" && m.to !== this.id) return;
    const d = m.d;
    if (this.isHost) {
      if (d.t === "_hi") {
        this.peers.add(m.from);
        this.post(m.from, { t: "_ack" });
        this.onPeerOpen && this.onPeerOpen(m.from);
      } else if (d.t === "_bye") {
        this.peers.delete(m.from);
        this.onPeerClose && this.onPeerClose(m.from);
      } else if (this.peers.has(m.from)) this.onData && this.onData(m.from, d);
      return;
    }
    if (d.t === "_ack" && this.waiting) {
      this.hostId = m.from;
      this.waiting();
    } else if (m.from === this.hostId) {
      if (d.t === "_bye") this.onClosed && this.onClosed();
      else this.onData && this.onData("host", d);
    }
  }
  async host(code) {
    this.isHost = true;
    this.open(code);
  }
  join(code) {
    this.open(code);
    return new Promise((res, rej) => {
      const t = setTimeout(
        () => rej(new Error("Room not found. Check the code.")),
        3000,
      );
      this.waiting = () => {
        clearTimeout(t);
        this.waiting = null;
        res();
      };
      this.post("*", { t: "_hi" });
    });
  }
  toHost(d) {
    this.post(this.hostId, d);
  }
  toPeer(id, d) {
    this.post(id, d);
  }
  toAll(d) {
    this.post("*", d);
  }
  close() {
    if (!this.ch) return;
    this.post(this.isHost ? "*" : this.hostId, { t: "_bye" });
    this.ch.close();
    this.ch = null;
    removeEventListener("beforeunload", this.unload);
  }
}
const makeTransport = () =>
  new URLSearchParams(location.search).get("net") === "local"
    ? new LocalTransport()
    : new PeerTransport();

// ---------------------------------------------------------------- room logic
export const Net = {
  active: false, // in a room (lobby or playing)
  role: null, // 'host' | 'client'
  slot: 0, // my seat, 0..11 (the host is always 0)
  code: "",
  name: "",
  players: [], // [{slot, name}]
  playing: false,
  rank: 0, // my finishing place once I have finished
  tr: null,
  acc: 0,
  finCount: 0,
  pos: {}, // host: latest [x, z] per slot
  peerSlot: new Map(), // host: transport peer id -> slot
  waitJoin: null,
  // callbacks set by main.js
  onLobby: null,
  onStart: null,
  onMsg: null,
  onClosed: null,

  async host(name) {
    Net.leave();
    for (let i = 0; i < 6; i++) {
      const code = makeCode(),
        tr = makeTransport();
      tr.onData = hostData;
      tr.onPeerClose = hostLeft;
      try {
        await tr.host(code);
      } catch (e) {
        tr.onData = tr.onPeerClose = null;
        tr.close();
        if (e && e.message === "taken") continue;
        throw e;
      }
      Net.tr = tr;
      Net.role = "host";
      Net.active = true;
      Net.code = code;
      Net.name = cleanName(name, "Player 1");
      Net.slot = 0;
      Net.players = [{ slot: 0, name: Net.name }];
      Net.playing = false;
      Net.rank = 0;
      Net.pos = {};
      Net.peerSlot.clear();
      Net.lobbyChanged();
      return code;
    }
    throw new Error("Could not create a room. Try again.");
  },

  async join(code, name) {
    Net.leave();
    code = String(code || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);
    if (code.length !== 4) throw new Error("Enter the 4-letter room code.");
    const tr = makeTransport();
    tr.onData = (id, d) => clientData(d);
    tr.onClosed = () => Net.closed("The host left the room.");
    try {
      await tr.join(code);
    } catch (e) {
      tr.onData = tr.onClosed = null;
      tr.close();
      throw e;
    }
    Net.tr = tr;
    Net.role = "client";
    Net.active = true;
    Net.code = code;
    Net.name = cleanName(name, "Player");
    Net.players = [];
    Net.playing = false;
    Net.rank = 0;
    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error("The host did not answer.")),
          8000,
        );
        Net.waitJoin = {
          ok: () => {
            clearTimeout(t);
            resolve();
          },
          no: (why) => {
            clearTimeout(t);
            reject(new Error(why || "Could not join."));
          },
        };
        tr.toHost({ t: "hello", name: Net.name });
      });
    } catch (e) {
      Net.leave();
      throw e;
    }
  },

  leave() {
    const tr = Net.tr;
    Net.tr = null;
    if (tr) {
      tr.onData = tr.onClosed = tr.onPeerClose = tr.onPeerOpen = null;
      tr.close();
    }
    Net.active = false;
    Net.role = null;
    Net.playing = false;
    Net.players = [];
    Net.rank = 0;
    Net.waitJoin = null;
    Net.peerSlot.clear();
    Net.pos = {};
  },

  closed(why) {
    if (!Net.active) return;
    const cb = Net.onClosed;
    Net.leave();
    if (cb) cb(why);
  },

  lobbyChanged() {
    if (Net.role === "host" && Net.tr)
      Net.tr.toAll({ t: "lobby", players: Net.players });
    if (Net.onLobby) Net.onLobby();
  },

  // host presses START
  start() {
    if (Net.role !== "host" || !Net.active) return;
    Net.playing = true;
    Net.finCount = 0;
    Net.rank = 0;
    Net.pos = {};
    const m = { t: "start", players: Net.players.slice() };
    Net.tr.toAll(m);
    if (Net.onStart) Net.onStart(m);
  },
  toLobby() {
    if (Net.role === "host") Net.playing = false;
    Net.rank = 0;
  },

  // host only: Green / Red phase announcements
  phase(m) {
    if (Net.role === "host" && Net.tr) Net.tr.toAll(m);
  },
  // player events: 'd' eliminated, 'f' finished (extra: {time}), 'x' out of time
  sendEvent(k, extra) {
    if (!Net.active || !Net.tr) return;
    const d = Object.assign({ t: "e", k }, extra);
    if (Net.role === "host") hostEvent(Net.slot, d);
    else Net.tr.toHost(d);
  },

  // call every frame with the REAL dt. live = I am still racing (clients only send while live; the host keeps relaying).
  tick(dt, p, live) {
    if (!Net.active || !Net.tr) return;
    if (Net.role === "host" && !Net.playing) return;
    if (Net.role === "client" && !live) return;
    Net.acc += dt;
    if (Net.acc < 1 / SEND_HZ) return;
    Net.acc = 0;
    if (Net.role === "host") {
      if (live) Net.pos[Net.slot] = [r2(p.pos.x), r2(p.pos.z)];
      Net.tr.toAll({ t: "s", p: Net.pos });
    } else Net.tr.toHost({ t: "p", v: [r2(p.pos.x), r2(p.pos.z)] });
  },
};

function hostData(id, d) {
  if (!d) return;
  if (d.t === "hello") {
    if (Net.peerSlot.has(id)) return;
    if (Net.playing)
      return Net.tr.toPeer(id, {
        t: "no",
        why: "The game has already started. Wait for the next round.",
      });
    if (Net.players.length >= MAX_PLAYERS)
      return Net.tr.toPeer(id, {
        t: "no",
        why: "The room is full (" + MAX_PLAYERS + "/" + MAX_PLAYERS + ").",
      });
    let slot = 1;
    while (Net.players.some((p) => p.slot === slot)) slot++;
    Net.peerSlot.set(id, slot);
    Net.players.push({ slot, name: cleanName(d.name, "Player " + (slot + 1)) });
    Net.tr.toPeer(id, { t: "welcome", slot });
    Net.lobbyChanged();
    return;
  }
  const slot = Net.peerSlot.get(id);
  if (slot === undefined) return;
  if (d.t === "p" && Array.isArray(d.v)) Net.pos[slot] = d.v;
  else if (d.t === "e") hostEvent(slot, d);
}

function hostEvent(slot, d) {
  const m = { t: "e", slot, k: d.k, time: d.time };
  if (d.k === "f") {
    m.rank = ++Net.finCount;
    if (slot === Net.slot) Net.rank = m.rank;
  }
  if (Net.tr) Net.tr.toAll(m);
  if (Net.onMsg) Net.onMsg(m);
}

function hostLeft(id) {
  const slot = Net.peerSlot.get(id);
  if (slot === undefined) return;
  Net.peerSlot.delete(id);
  Net.players = Net.players.filter((p) => p.slot !== slot);
  delete Net.pos[slot];
  if (Net.playing) hostEvent(slot, { k: "gone" });
  Net.lobbyChanged();
}

function clientData(d) {
  if (!d) return;
  switch (d.t) {
    case "welcome":
      Net.slot = d.slot;
      if (Net.waitJoin) Net.waitJoin.ok();
      break;
    case "no":
      if (Net.waitJoin) Net.waitJoin.no(d.why);
      break;
    case "lobby":
      Net.players = d.players || [];
      if (Net.onLobby) Net.onLobby();
      break;
    case "start":
      Net.players = d.players || Net.players;
      Net.playing = true;
      Net.rank = 0;
      if (Net.onStart) Net.onStart(d);
      break;
    case "e":
      if (d.k === "f" && d.slot === Net.slot) Net.rank = d.rank;
    // falls through
    default:
      if (Net.onMsg) Net.onMsg(d);
  }
}
