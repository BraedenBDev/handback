import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  RETENTION_CHOICES,
  describeExpiry,
  expiryFrom,
  hasExpired,
  isValidRetention,
} from "../shared/expiry.ts";

const AT = new Date("2026-08-27T12:00:00.000Z");

describe("retention choices", () => {
  it("defaults to a week, the span people already expect from a transfer link", () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(7);
    expect(RETENTION_CHOICES.some((c) => c.days === DEFAULT_RETENTION_DAYS)).toBe(true);
  });

  it("offers a never option, because some handoffs are records", () => {
    expect(RETENTION_CHOICES.some((c) => c.days === null)).toBe(true);
  });
});

describe("validating a retention window", () => {
  it("accepts null and whole days inside the ceiling", () => {
    for (const value of [null, 1, 7, 30, MAX_RETENTION_DAYS]) expect(isValidRetention(value)).toBe(true);
  });

  it("rejects zero, negatives, fractions and anything past the ceiling", () => {
    for (const value of [0, -1, 1.5, MAX_RETENTION_DAYS + 1]) expect(isValidRetention(value)).toBe(false);
  });

  it("rejects values that are not numbers at all", () => {
    for (const value of ["7", undefined, {}, [], NaN, Infinity]) expect(isValidRetention(value)).toBe(false);
  });
});

describe("computing the expiry", () => {
  it("adds the window to the starting point", () => {
    expect(expiryFrom(7, AT)).toBe("2026-09-03T12:00:00.000Z");
    expect(expiryFrom(1, AT)).toBe("2026-08-28T12:00:00.000Z");
  });

  it("returns nothing at all for never", () => {
    expect(expiryFrom(null, AT)).toBeNull();
  });

  it("accepts an ISO string as the starting point, as the Worker passes", () => {
    expect(expiryFrom(1, AT.toISOString())).toBe("2026-08-28T12:00:00.000Z");
  });
});

describe("deciding whether something has expired", () => {
  it("treats a handoff with no expiry as permanent", () => {
    expect(hasExpired(null, AT)).toBe(false);
    expect(hasExpired(undefined, AT)).toBe(false);
  });

  it("expires on the boundary rather than a moment after it", () => {
    expect(hasExpired(AT.toISOString(), AT)).toBe(true);
  });

  it("separates past from future", () => {
    expect(hasExpired("2026-08-26T12:00:00.000Z", AT)).toBe(true);
    expect(hasExpired("2026-08-28T12:00:00.000Z", AT)).toBe(false);
  });
});

describe("describing the expiry to a person", () => {
  it("uses days when there are days left", () => {
    expect(describeExpiry("2026-09-02T12:00:00.000Z", AT)).toBe("in 6 days");
  });

  it("switches to hours inside two days", () => {
    expect(describeExpiry("2026-08-28T08:00:00.000Z", AT)).toBe("in 20 hours");
    expect(describeExpiry("2026-08-27T13:00:00.000Z", AT)).toBe("in 1 hour");
  });

  it("switches to minutes in the last hour, and never says zero", () => {
    expect(describeExpiry("2026-08-27T12:30:00.000Z", AT)).toBe("in 30 minutes");
    expect(describeExpiry("2026-08-27T12:00:10.000Z", AT)).toBe("in 1 minute");
  });

  it("says so plainly once it is gone", () => {
    expect(describeExpiry("2026-08-26T12:00:00.000Z", AT)).toBe("expired");
  });

  it("says nothing when there is no expiry to describe", () => {
    expect(describeExpiry(null, AT)).toBeNull();
  });
});
