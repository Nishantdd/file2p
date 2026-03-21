import { switchTabs } from "./helpers/switch-helpers";
import type { TabStates } from "./types/states.types";
import "./send";
import "./receive";

const tabs = document.querySelectorAll<HTMLButtonElement>("[data-tab]");
const panels = document.querySelectorAll<HTMLDivElement>("[data-panel]");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab as TabStates;
    switchTabs(tabs, panels, target);
  });
});
