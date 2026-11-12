import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, spaces, shared } from "herdr";

const norm = (x) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const WORD = (pr) => (pr.state === "MERGED" ? "merged" : pr.state === "CLOSED" ? "closed" : pr.draft ? "draft" : "open");

export class Context {
  render() {
    const t = theme();
    const row = h_flex().size_full().px(12).gap(8).items_center().text_size(12.5).text_color(t.dim);
    const space = spaces().find((s) => s.active);
    const info = space ? shared("herdrtw.ctx")?.[space.id] : null;
    if (!info?.branch) return row;
    const pr = info.pr?.number ? info.pr : null;
    const dot = pr ? div().size(7).rounded(4).flex_none().when(pr.state === "MERGED", (d) => d.bg(t.dim)).when(pr.state !== "MERGED", (d) => d.border(1).border_color(t.dim)) : null;
    return row
      .child(div().min_w(0).truncate().text_color(t.muted).child(info.branch))
      .when(space.name && norm(space.name) !== norm(info.branch), (r) => r.child(div().flex_none().child("·")).child(div().min_w(0).truncate().child(space.name)))
      .when(info.ahead > 0, (r) => r.child(div().flex_none().text_color(t.muted).child(`↑${info.ahead}`)))
      .when(info.behind > 0, (r) => r.child(div().flex_none().text_color(t.muted).child(`↓${info.behind}`)))
      .when(Boolean(pr), (r) =>
        r.child(
          h_flex().id("ctx-pr").flex_none().gap(6).items_center().tooltip(`PR #${pr.number} · ${WORD(pr)}`).child(dot).child(div().text_color(t.muted).child(`#${pr.number} ${WORD(pr)}`)),
        ),
      );
  }
}
