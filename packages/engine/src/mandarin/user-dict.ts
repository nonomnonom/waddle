/**
 * User dict: pembelajaran sederhana berbasis frekuensi + recency.
 * Diserialisasi ke JSON oleh pemanggil (desktop menyimpannya di App Support, mode 0600).
 */
export interface UserEntry {
  hanzi: string;
  syllables: string[];
  count: number;
  lastUsed: number;
}

const HALF_LIFE_DAYS = 21;

export class UserDict {
  private map = new Map<string, UserEntry>();

  constructor(entries: UserEntry[] = []) {
    for (const e of entries) this.map.set(key(e.hanzi, e.syllables), e);
  }

  record(hanzi: string, syllables: string[], now = Date.now()): void {
    const k = key(hanzi, syllables);
    const prev = this.map.get(k);
    this.map.set(k, {
      hanzi,
      syllables,
      count: (prev?.count ?? 0) + 1,
      lastUsed: now,
    });
  }

  /** boost 0..1; memudar sesuai half-life supaya kata lama tidak membeku di puncak */
  boost(hanzi: string, syllables: string[], now = Date.now()): number {
    const e = this.map.get(key(hanzi, syllables));
    if (!e) return 0;
    const ageDays = (now - e.lastUsed) / 86_400_000;
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    return Math.min(1, Math.log1p(e.count) * 0.45) * decay;
  }

  entries(): UserEntry[] {
    return [...this.map.values()];
  }

  get size(): number {
    return this.map.size;
  }

  static fromJSON(json: string): UserDict {
    return new UserDict(JSON.parse(json) as UserEntry[]);
  }

  toJSON(): UserEntry[] {
    return this.entries();
  }
}

const key = (hanzi: string, syllables: string[]): string => `${hanzi}|${syllables.join(' ')}`;
