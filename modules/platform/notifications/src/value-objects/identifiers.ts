import crypto from "node:crypto";

export abstract class BaseIdentifier {
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

export class NotificationId extends BaseIdentifier {
  constructor(value: string) {
    super(value, "NotificationId");
  }

  static generate(): NotificationId {
    return new NotificationId(crypto.randomUUID());
  }

  static fromString(value: string): NotificationId {
    return new NotificationId(value);
  }

  equals(other?: NotificationId | null): boolean {
    if (!other || !(other instanceof NotificationId)) {
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
