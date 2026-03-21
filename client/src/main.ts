import { switchTabs } from "./switch-helpers";
import type { TabStates } from "./types/states.types";

const tabs = document.querySelectorAll<HTMLButtonElement>("[data-tab]")!;
const panels = document.querySelectorAll<HTMLDivElement>("[data-panel]")!;
const sendStates = document.querySelectorAll<HTMLDivElement>("#send-panel > div[data-state]");
const receiveStates = document.querySelectorAll<HTMLDivElement>("#receive-panel > div[data-state]");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab as TabStates;
    switchTabs(tabs, panels, target);
  });
});
