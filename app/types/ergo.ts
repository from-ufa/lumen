export interface NodeInfo {
  currentTime: number;
  headersHeight: number;
  fullHeight: number;
  maxPeerHeight?: number;
  peersCount: number;
  launchTime: number;
  stateType: string;
  isMining?: boolean;
  /** Node name from GET /info (e.g. netim_node) */
  name?: string;
  appVersion?: string;
  network?: string;
  unconfirmedCount?: number;
}

export interface Peer {
  address: string;
  lastMessage: number;
  lastMessageType?: number;
  lastHandshake?: number;
  declaredAddress?: string;
  name?: string;
  connectionType?: string;
  features?: any[];
}

export interface UnconfirmedTx {
  id: string;
  // more fields if needed
}

export interface RecentBlock {
  height: number;
  timestamp: number;
  txCount: number;
  id?: string;
}
