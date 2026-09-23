import type { Address, Hex } from "viem";
import { getAddress, isAddress, parseEther } from "viem";

export class ConfigError extends Error {
    constructor(path: string, problem: string) {
        super(`${path}: ${problem}`);
        this.name = "ConfigError";
    }
}

export function section(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new ConfigError(path, "must be a mapping");
    }

    return value as Record<string, unknown>;
}

export function requireString(value: unknown, path: string): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new ConfigError(path, `must be a non-empty string, got ${describe(value)}`);
    }

    return value.trim();
}

export function requireAddress(value: unknown, path: string): Address {
    const text = requireString(value, path);
    if (!isAddress(text, { strict: false })) {
        throw new ConfigError(path, `must be a 20 byte address, got "${text}"`);
    }

    return getAddress(text);
}

export function requireAddressList(value: unknown, path: string): Address[] {
    return requireList(value, path).map((entry, index) => requireAddress(entry, `${path}[${index}]`));
}

export function requireHex(value: unknown, path: string, byteLength?: number): Hex {
    const text = requireString(value, path);
    if (!/^0x[0-9a-fA-F]*$/.test(text)) {
        throw new ConfigError(path, `must be 0x-prefixed hex, got "${truncate(text)}"`);
    }

    if (text.length % 2 !== 0) {
        throw new ConfigError(path, "must contain a whole number of bytes");
    }

    if (byteLength !== undefined && (text.length - 2) / 2 !== byteLength) {
        throw new ConfigError(path, `must be ${byteLength} bytes, got ${(text.length - 2) / 2}`);
    }

    return text as Hex;
}

export function requireHexList(value: unknown, path: string, byteLength?: number): Hex[] {
    return requireList(value, path).map((entry, index) => requireHex(entry, `${path}[${index}]`, byteLength));
}

export function requireList(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new ConfigError(path, `must be a list, got ${describe(value)}`);
    }

    return value;
}

export function requireInteger(value: unknown, path: string, options: { min?: number } = {}): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw new ConfigError(path, `must be an integer, got ${describe(value)}`);
    }

    if (options.min !== undefined && value < options.min) {
        throw new ConfigError(path, `must be at least ${options.min}, got ${value}`);
    }

    return value;
}

// Durations and counters stay inside the safe integer range, but the contracts
// take them as uint256, so they are widened here.
export function requireDuration(value: unknown, path: string): bigint {
    return BigInt(requireInteger(value, path, { min: 0 }));
}

// Amounts are written in whole DMD ("1.5") because wei values exceed the
// precision a YAML or JSON number can carry.
export function requireAmount(value: unknown, path: string): bigint {
    const text = requireString(value, path);
    try {
        return parseEther(text);
    } catch {
        throw new ConfigError(path, `must be a decimal amount in DMD, got "${text}"`);
    }
}

export function optional<T>(
    value: unknown,
    fallback: T,
    read: (value: unknown) => T,
): T {
    return value === undefined || value === null ? fallback : read(value);
}

function describe(value: unknown): string {
    if (value === undefined) {
        return "nothing";
    }

    if (typeof value === "number") {
        return `the number ${value} (quote it if this should be text)`;
    }

    return `${typeof value}`;
}

function truncate(text: string): string {
    return text.length > 24 ? `${text.slice(0, 21)}...` : text;
}
