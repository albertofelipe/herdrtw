import { appHome, readTextFile, writeTextFile, window, shared } from "herdr";

const CFG = () => `${appHome()}/mods/herdrtw/bg.json`;
const LAYOUT = () => `${appHome()}/layouts/herdrtw.json`;
const IDLE_CHECK_MS = 2000;
const FRAME_PATH = /backgrounds\/herdrtw-bg-[^"]*\.(png|webp)/;

export class BgLoop {
  constructor() {
    this.anim = null;
    this.index = 0;
    this.busy = false;
    this.raw = null;
    this.checked = 0;
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.step();
    } catch {
      this.raw = null;
    }
    this.busy = false;
  }

  async refresh() {
    const text = await readTextFile(CFG());
    const anim = JSON.parse(text ?? "{}").anim ?? null;
    const changed = anim?.base !== this.anim?.base;
    this.anim = anim && anim.frames > 1 ? anim : null;
    if (changed) this.index = 0;
  }

  async step() {
    const now = Date.now();
    if (this.anim || now - this.checked >= IDLE_CHECK_MS) {
      this.checked = now;
      await this.refresh();
    }
    if (!this.anim) return;
    if (window()?.active === false) return;
    if (shared("layout") !== "herdrtw") return;
    const raw = this.raw ?? (await readTextFile(LAYOUT()));
    if (!raw) return;
    this.index = (this.index + 1) % this.anim.frames;
    const frame = String(this.index).padStart(2, "0");
    const next = raw.replace(FRAME_PATH, `backgrounds/${this.anim.base}-${frame}.png`);
    if (next === raw) {
      this.raw = null;
      return;
    }
    await writeTextFile(LAYOUT(), next, raw);
    this.raw = next;
  }
}
