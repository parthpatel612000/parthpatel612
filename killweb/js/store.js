// Kill Web: saving the campaign. Each viewer's save lives in their private db subtree when the page runs inside claude.ai,
// with a copy in this browser's localStorage so a save survives when the store is unavailable.
const LS_KEY = 'killweb.save.v1';
const LS_SET = 'killweb.settings.v1';

function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

export class Store {
  constructor() {
    this.db = null; this.uid = null; this.ref = null;
    this.writing = null; this.pending = null; this.remoteOk = false; this.status = 'local';
  }
  // resolves quickly with whatever is local; the cloud copy, if newer, arrives through onRemote
  async init(onRemote) {
    const local = lsGet(LS_KEY);
    this.connect(local, onRemote);
    return local;
  }
  async connect(local, onRemote) {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const uid = await user.id();
      if (!uid) return;
      this.db = db; this.uid = uid;
      this.ref = db.doc('data/users/' + uid + '/save');
      const snap = await this.ref.get();
      this.remoteOk = true; this.status = 'cloud';
      const remote = snap.exists ? snap.data() : null;
      const rp = remote && remote.profile ? remote.profile : null;
      if (rp && (!local || (rp.savedAt || 0) > (local.savedAt || 0))) {
        lsSet(LS_KEY, rp);
        if (onRemote) onRemote(JSON.parse(JSON.stringify(rp)));
      } else if (local && (!rp || (local.savedAt || 0) > (rp.savedAt || 0))) {
        this.push(local);
      }
    } catch (e) {
      this.remoteOk = false; this.status = 'local';
    }
  }
  save(profile) {
    profile.savedAt = Date.now();
    lsSet(LS_KEY, profile);
    if (this.ref && this.remoteOk) this.push(profile);
  }
  // one write at a time; a burst collapses into the latest state
  push(profile) {
    this.pending = JSON.parse(JSON.stringify(profile));
    if (this.writing) return;
    const run = async () => {
      while (this.pending) {
        const body = this.pending; this.pending = null;
        try { await this.ref.set({ profile: body, v: 1 }); this.status = 'cloud'; }
        catch (e) {
          if (e && (e.code === 'unavailable')) { await new Promise((r) => setTimeout(r, 800 + Math.random() * 800)); try { await this.ref.set({ profile: body, v: 1 }); continue; } catch (e2) { /* fall through */ } }
          this.remoteOk = false; this.status = 'local'; this.pending = null;
        }
      }
      this.writing = null;
    };
    this.writing = run();
  }
  async wipe() {
    lsDel(LS_KEY);
    if (this.ref && this.remoteOk) { try { await this.ref.delete(); } catch (e) { /* ignore */ } }
  }
  loadSettings() { return lsGet(LS_SET) || {}; }
  saveSettings(s) { lsSet(LS_SET, s); }
}
