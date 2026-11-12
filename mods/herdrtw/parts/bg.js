import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, exec, appHome, readTextFile, writeTextFile, window } from "herdr";

const CFG = () => `${appHome()}/mods/herdrtw/bg.json`;
const LAYOUT = () => `${appHome()}/layouts/herdrtw.json`;
const BG_DIR = () => `${appHome()}/backgrounds`;
const W = 1920;
const H = 1080;
const PICK =
  'if command -v zenity >/dev/null 2>&1; then zenity --file-selection --title="Choose a background image" --file-filter="Images | *.png *.jpg *.jpeg *.webp *.bmp *.gif"; ' +
  'elif command -v kdialog >/dev/null 2>&1; then kdialog --getopenfilename "$HOME" "image/*"; ' +
  'elif command -v osascript >/dev/null 2>&1; then osascript -e \'POSIX path of (choose file of type {"public.image"})\'; ' +
  "else exit 3; fi";
const PICK_WIN =
  "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Filter = 'Images|*.png;*.jpg;*.jpeg;*.webp;*.bmp'; if ($d.ShowDialog() -eq 'OK') { [Console]::Write($d.FileName) }";

const base = (p) => p.replace(/\\/g, "/").split("/").pop();

export class Bg {
  init(_props, cx) {
    this.cfg = { source: "", opacity: 15, blur: 8 };
    this.cfgRaw = null;
    this.busy = false;
    this.msg = "";
    cx.spawn(async (cx) => {
      try {
        this.cfgRaw = await readTextFile(CFG());
        this.cfg = { ...this.cfg, ...JSON.parse(this.cfgRaw ?? "{}") };
      } catch {}
      cx.notify();
    });
  }
  async save() {
    const text = JSON.stringify(this.cfg, null, 2);
    await writeTextFile(CFG(), text, this.cfgRaw);
    this.cfgRaw = text;
  }
  async setLayoutBackground(value) {
    const raw = await readTextFile(LAYOUT());
    if (!raw) throw new Error("layouts/herdrtw.json not found.");
    const d = JSON.parse(raw);
    d.background = value;
    await writeTextFile(LAYOUT(), JSON.stringify(d, null, 2), raw);
  }
  async pick(cx) {
    if (this.busy) return;
    this.busy = true;
    this.msg = "";
    cx.notify();
    try {
      const win = window()?.platform === "windows";
      const r = win ? await exec("powershell.exe", ["-NoProfile", "-Command", PICK_WIN]) : await exec("sh", ["-c", PICK]);
      if (r.code === 3) this.msg = "No file picker found (install zenity or kdialog).";
      else if (r.code === 0 && r.stdout.trim()) {
        this.cfg.source = r.stdout.trim();
        await this.save();
      }
    } catch (error) {
      this.msg = String(error);
    }
    this.busy = false;
    cx.notify();
  }
  async apply(cx) {
    if (this.busy) return;
    if (!this.cfg.source) {
      this.msg = "Choose an image first.";
      return cx.notify();
    }
    this.busy = true;
    this.msg = "Rendering…";
    cx.notify();
    try {
      const name = `herdrtw-bg-${Date.now()}.png`;
      const out = `${BG_DIR()}/${name}`;
      await exec("mkdir", ["-p", BG_DIR()]);
      const bg = String(theme().background || "#000000").replace("#", "").slice(0, 6);
      const alpha = (Math.max(0, Math.min(100, this.cfg.opacity)) / 100).toFixed(2);
      const blur = this.cfg.blur > 0 ? `,gblur=sigma=${this.cfg.blur}` : "";
      const graph = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${blur},format=rgba,colorchannelmixer=aa=${alpha}[img];[1:v][img]overlay=format=auto,format=rgb24`;
      const r = await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", this.cfg.source, "-f", "lavfi", "-i", `color=c=0x${bg}:s=${W}x${H}`, "-filter_complex", graph, "-frames:v", "1", "-update", "1", out], { timeout: 120000 });
      if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || "ffmpeg failed.");
      await this.setLayoutBackground({ image: `backgrounds/${name}`, fit: "cover" });
      await exec("sh", ["-c", 'for f in "$1"/herdrtw-bg-*.png; do [ "$f" != "$2" ] && rm -f "$f"; done; true', "x", BG_DIR(), out]);
      await this.save();
      this.msg = "Applied.";
    } catch (error) {
      this.msg = String(error).replace(/^Error: /, "");
    }
    this.busy = false;
    cx.notify();
  }
  async remove(cx) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.setLayoutBackground("canvas");
      await exec("sh", ["-c", 'rm -f "$1"/herdrtw-bg-*.png; true', "x", BG_DIR()]);
      this.cfg.source = "";
      await this.save();
      this.msg = "Removed.";
    } catch (error) {
      this.msg = String(error).replace(/^Error: /, "");
    }
    this.busy = false;
    cx.notify();
  }
  button(t, id, label, action, strong = false) {
    return div()
      .id(id)
      .h(30)
      .px(12)
      .flex()
      .items_center()
      .rounded(6)
      .border(1)
      .border_color(strong ? t.foreground : t.input)
      .text_color(strong ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => action(cx))
      .child(label);
  }
  stepper(t, id, title, value, suffix, min, max, step, key) {
    const bump = (d) => (cx) => {
      this.cfg[key] = Math.max(min, Math.min(max, this.cfg[key] + d));
      cx.notify();
    };
    const small = (sid, label, action) =>
      div().id(`${id}-${sid}`).size(28).flex().items_center().justify_center().rounded(6).border(1).border_color(t.input).text_color(t.muted).hover((s) => s.bg(t.hover)).on_click((_e, cx) => action(cx)).child(label);
    return h_flex()
      .items_center()
      .justify_between()
      .child(div().text_color(t.foreground).child(title))
      .child(h_flex().items_center().gap(8).child(small("minus", "−", bump(-step))).child(div().w(52).flex().justify_center().text_color(t.foreground).child(`${value}${suffix}`)).child(small("plus", "+", bump(step))));
  }
  render() {
    const t = theme();
    return v_flex()
      .id("herdrtw-bg")
      .size_full()
      .p(16)
      .gap(14)
      .bg(t.popover)
      .text_size(13)
      .child(div().font_semibold().text_color(t.foreground).child("Background image"))
      .child(div().text_size(11).text_color(t.dim).child("Used by the herdrtw layout. A blurred, dimmed copy is generated, the original is never changed."))
      .child(
        h_flex()
          .items_center()
          .gap(8)
          .child(div().flex_1().min_w(0).truncate().text_color(this.cfg.source ? t.foreground : t.dim).child(this.cfg.source ? base(this.cfg.source) : "No image chosen"))
          .child(this.button(t, "pick", "Choose…", (cx) => this.pick(cx))),
      )
      .child(this.stepper(t, "opacity", "Opacity", this.cfg.opacity, "%", 5, 100, 5, "opacity"))
      .child(this.stepper(t, "blur", "Blur", this.cfg.blur, "px", 0, 40, 2, "blur"))
      .child(div().flex_1())
      .child(div().h(16).text_size(11).text_color(t.dim).child(this.busy && !this.msg ? "working…" : this.msg))
      .child(
        h_flex()
          .gap(8)
          .justify_end()
          .child(this.button(t, "remove", "Remove", (cx) => this.remove(cx)))
          .child(this.button(t, "apply", "Apply", (cx) => this.apply(cx), true)),
      );
  }
}
