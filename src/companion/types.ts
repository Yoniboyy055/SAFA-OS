export type CompanionChannel = "desktop" | "mobile";

export interface CompanionStatus {
  channel: CompanionChannel;
  connected: boolean;
  lastSeenAt?: string;
  notes?: string;
}
