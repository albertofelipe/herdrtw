import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";


import { find, clearChrome } from "../lib/common.js";

export class Tabs {
  static COMMANDS = ["worktree", "bg"];
  command(name) {
    if (name === "worktree") openOverlay({ mod: "herdrtw", kind: "dialog", width: 440, height: 630, props: { part: "worktree", action: "new" } });
    if (name === "bg") openOverlay({ mod: "herdrtw", kind: "dialog", width: 420, height: 340, props: { part: "bg" } });
  }
  init() {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = clearChrome(theme());
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(30).flex_none().flex().items_center().justify_center().rounded(8).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const single = shown.length === 1;
    const marker = (status) => {
      if (status === "working") return div().size(6).rounded(3).flex_none().bg(t.foreground).loop("opacity", { from: 0.3, to: 1, period: 1600 });
      if (status === "blocked") return div().size(7).rounded(1).flex_none().bg(t.foreground).loop("opacity", { from: 0.2, to: 1, period: 900 });
      if (status === "done") return div().flex_none().text_size(12).font_bold().text_color(t.foreground).child("\u2713");
      return null;
    };
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = c.named ? c.name : program?.name ?? "Terminal";
      const label = c.zoomed ? `${name} Z` : name;
      const hot = this.hoverTab === c.id;
      const mark = marker(c.status);
      const iconOnly = single && Boolean(program?.icon);
      return h_flex().id(`tab-${c.id}`).h(30).px(iconOnly ? 9 : 14).gap(7).rounded(8).items_center().flex_none().text_size(13)
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .when(!iconOnly, el => el.bg(c.active ? t.raised : t.chrome))
        .text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_hover((on, cx) => { if (on) this.hoverTab = c.id; else if (this.hoverTab === c.id) this.hoverTab = null; cx.notify(); })
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(iconOnly, el => el.tooltip(label))
        .when(Boolean(program?.icon), el => el.child(svg(program.icon).size(15).text_color(c.active ? t.accent : t.muted)))
        .when(!iconOnly, el => el.child(div().max_w(140).truncate().child(label)))
        .when(Boolean(mark), el => el.child(mark))
        .when(!iconOnly && hot, el => el.child(div().id(`close-${c.id}`).flex_none().text_color(t.dim).hover(x => x.text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(30).px(6).gap(0).flex_none().items_center().rounded(8)
        .text_size(13).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14));
    };
    return h_flex().size_full().min_w(0).px(6).pl(lightsPadding).gap(3).items_center().bg(t.chrome)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .child(h_flex().id("worktree-new").h(30).px(6).flex_none().items_center().rounded(8).text_size(13).bg(t.chrome).text_color(t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => openOverlay({ mod: "herdrtw", kind: "dialog", width: 440, height: 630, props: { part: "worktree", space: spaces().find(p => p.active)?.id, action: "new" } }))
        .child(svg("mods/herdrtw/git.svg").size(14)))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")));
  }
}
