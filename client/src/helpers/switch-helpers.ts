import type { TabStates, ReceiveStates, SendStates } from "../types/states.types";

export const switchTabs = (
  tabs: NodeListOf<HTMLButtonElement>,
  panels: NodeListOf<HTMLDivElement>,
  targetTab: TabStates
) => {
  tabs.forEach(tab => (tab.dataset.active = String(targetTab === tab.dataset.tab)));
  panels.forEach(panel => (panel.dataset.active = String(targetTab === panel.dataset.panel)));
};

export const switchSendStates = (sendStates: NodeListOf<HTMLDivElement>, targetState: SendStates) =>
  sendStates.forEach(state => (state.dataset.active = String(targetState === state.dataset.state)));

export const switchReceiveStates = (receiveStates: NodeListOf<HTMLDivElement>, targetState: ReceiveStates) =>
  receiveStates.forEach(state => (state.dataset.active = String(targetState === state.dataset.state)));
