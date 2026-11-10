import type { NetworkManager } from '../systems/NetworkManager';

/** Shared reference to the NetworkManager used by DeskPanel. */
let networkManagerRef: NetworkManager | null = null;

export function setDeskPanelNetworkManager(nm: NetworkManager) {
  networkManagerRef = nm;
}

export function getDeskPanelNetworkManager(): NetworkManager | null {
  return networkManagerRef;
}
