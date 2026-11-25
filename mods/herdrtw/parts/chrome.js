import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, window } from "herdr";
import { BgLoop } from "./bgloop.js";

const LOOP_MS = 125;

export class Chrome {
  init(_props, cx) {
    this.loop = new BgLoop();
    cx.timer.every(LOOP_MS, () => this.loop.tick());
  }

  render() {
    const t = theme();
    const w = window();
    const stop = (_e, cx) => cx.stop_propagation();
    const win = w?.platform === "windows";
    const button = (id, child, action) =>
      div().id(id).size(30).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop).on_click(action).child(child);
    const row = h_flex().size_full().px(8).gap(2).items_center();
    if (!w?.buttons) return row;
    return row
      .child(button("close-window", win ? svg("mods/herdrtw/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close")))
      .child(button("minimize", win ? svg("mods/herdrtw/win-min.svg").size(16) : "−", () => run("window.minimize")));
  }
}
