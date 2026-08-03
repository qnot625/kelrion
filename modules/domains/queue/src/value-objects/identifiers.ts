import crypto from "node:crypto";

abstract class BaseIdentifier {
  protected readonly _value: string;

  constructor(value: string, typeName: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${typeName} value must be a non-empty string.`);
    }
    this._value = value.trim();
    Object.freeze(this);
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }

  toJSON(): string {
    return this._value;
  }
}

export class QueueId extends BaseIdentifier {
  constructor(value: string) {
    super(value, "QueueId");
  }

  static generate(): QueueId {
    return new QueueId(crypto.randomUUID());
  }

  static fromString(value: string): QueueId {
    return new QueueId(value);
  }

  equals(other?: QueueId | null): boolean {
    if (!other || !(other instanceof QueueId)) {
      return false;
    }
    return this._value === other._value;
  }
}

export class TicketId extends BaseIdentifier {
  constructor(value: string) {
    super(value, "TicketId");
  }

  static generate(): TicketId {
    return new TicketId(crypto.randomUUID());
  }

  static fromString(value: string): TicketId {
    return new TicketId(value);
  }

  equals(other?: TicketId | null): boolean {
    if (!other || !(other instanceof TicketId)) {
      return false;
    }
    return this._value === other._value;
  }
}

export class TenantId extends BaseIdentifier {
  constructor(value: string) {
    super(value, "TenantId");
  }

  static generate(): TenantId {
    return new TenantId(crypto.randomUUID());
  }

  static fromString(value: string): TenantId {
    return new TenantId(value);
  }

  equals(other?: TenantId | null): boolean {
    if (!other || !(other instanceof TenantId)) {
      return false;
    }
    return this._value === other._value;
  }
}

export class BranchId extends BaseIdentifier {
  constructor(value: string) {
    super(value, "BranchId");
  }

  static generate(): BranchId {
    return new BranchId(crypto.randomUUID());
  }

  static fromString(value: string): BranchId {
    return new BranchId(value);
  }

  equals(other?: BranchId | null): boolean {
    if (!other || !(other instanceof BranchId)) {
      return false;
    }
    return this._value === other._value;
  }
}
