export class TicketNumber {
  private readonly _prefix: string;
  private readonly _sequence: number;
  private readonly _padding: number;

  constructor(prefix: string, sequence: number, padding = 3) {
    if (typeof prefix !== "string" || prefix.trim().length === 0) {
      throw new Error("Ticket number prefix must be a non-empty string.");
    }
    const cleanPrefix = prefix.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/i.test(cleanPrefix)) {
      throw new Error(`Ticket number prefix '${prefix}' contains invalid characters. Must be alphanumeric.`);
    }

    if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 1) {
      throw new Error(`Ticket number sequence must be a positive integer >= 1. Received: ${sequence}`);
    }

    if (typeof padding !== "number" || !Number.isInteger(padding) || padding < 1) {
      throw new Error(`Ticket number padding must be a positive integer >= 1. Received: ${padding}`);
    }

    this._prefix = cleanPrefix;
    this._sequence = sequence;
    this._padding = padding;
    Object.freeze(this);
  }

  get prefix(): string {
    return this._prefix;
  }

  get sequence(): number {
    return this._sequence;
  }

  get padding(): number {
    return this._padding;
  }

  get formatted(): string {
    const seqStr = String(this._sequence).padStart(this._padding, "0");
    return `${this._prefix}${seqStr}`;
  }

  static create(prefix: string, sequence: number, padding = 3): TicketNumber {
    return new TicketNumber(prefix, sequence, padding);
  }

  /**
   * Parses a formatted string like 'A001', 'B042', or 'VIP017' into a TicketNumber instance.
   */
  static parse(formattedStr: string, defaultPadding = 3): TicketNumber {
    if (typeof formattedStr !== "string" || formattedStr.trim().length === 0) {
      throw new Error("Cannot parse empty ticket number string.");
    }

    const trimmed = formattedStr.trim();
    // Match prefix starting with letters followed by digits
    const match = /^([A-Za-z]+[A-Za-z0-9]*?)([0-9]+)$/.exec(trimmed);
    
    if (!match) {
      throw new Error(`Invalid ticket number format: '${formattedStr}'. Expected format <Prefix><Sequence> (e.g. A001).`);
    }

    const prefix = match[1];
    const seqStr = match[2];
    const sequence = parseInt(seqStr, 10);
    const padding = Math.max(defaultPadding, seqStr.length);

    return new TicketNumber(prefix, sequence, padding);
  }

  equals(other?: TicketNumber | null): boolean {
    if (!other || !(other instanceof TicketNumber)) {
      return false;
    }
    return this.formatted === other.formatted;
  }

  toString(): string {
    return this.formatted;
  }

  toJSON(): string {
    return this.formatted;
  }
}
