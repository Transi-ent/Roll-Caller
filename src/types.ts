export type CallStrategy = "random" | "roundRobin" | "noRepeatRandom";

export interface Person {
  id: string;
  name: string;
  group?: string;
  extra?: string;
}

export interface Roster {
  id: string;
  name: string;
  createdAt: string;
  people: Person[];
}

export interface CallHistoryEntry {
  timestamp: string;
  person: Person;
  rosterId: string;
  rosterName: string;
}
