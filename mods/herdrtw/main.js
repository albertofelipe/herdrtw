import { View, div } from "gpui-kit";
import { props, nextCommand } from "herdr";
import { Tabs } from "./parts/tabs.js";
import { Spaces } from "./parts/spaces.js";
import { Agents } from "./parts/agents.js";
import { Chrome } from "./parts/chrome.js";
import { Context } from "./parts/context.js";
import { Worktree } from "./parts/worktree.js";
import { Bg } from "./parts/bg.js";

const PARTS = { tabs: Tabs, spaces: Spaces, agents: Agents, chrome: Chrome, context: Context, worktree: Worktree, bg: Bg };

class Missing {
  constructor(name) { this.name = name; }
  render() { return div().p(8).child(`herdrtw: unknown part "${this.name}"`); }
}

export default class Herdrtw extends View {
  init(_props, cx) {
    const p = props() ?? {};
    const Part = PARTS[p.part];
    this.part = Part ? new Part() : new Missing(p.part);
    this.part.init?.(p, cx);
    if (this.part.command) cx.spawn(async () => {
      for (;;) {
        const name = await nextCommand();
        if (this.part.constructor.COMMANDS?.includes(name)) this.part.command(name, cx);
      }
    });
  }

  render(cx) {
    return this.part.render(cx);
  }
}
