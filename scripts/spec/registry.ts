import { readFileSync } from "node:fs";

import type { Address } from "viem";
import { getAddress, isAddress } from "viem";

import { PackageNames, type PackageName } from "./artifacts.ts";

export interface ContractEntry {
    package: PackageName;
    name: string;
    proxyAddress: Address;
    implementationAddress: Address;
}

interface RawContractEntry {
    name?: string;
    proxyAddress?: string;
    implementationAddress?: string;
}

function parseEntry(pkg: PackageName, raw: RawContractEntry): ContractEntry {
    if (raw.name === undefined || raw.name === "") {
        throw new Error(`Contract entry in package "${pkg}" is missing a name.`);
    }

    for (const [field, value] of [
        ["proxyAddress", raw.proxyAddress],
        ["implementationAddress", raw.implementationAddress],
    ] as const) {
        if (value === undefined || !isAddress(value, { strict: false })) {
            throw new Error(`Contract "${raw.name}" has an invalid ${field}: ${String(value)}`);
        }
    }

    return {
        package: pkg,
        name: raw.name,
        proxyAddress: getAddress(raw.proxyAddress!),
        implementationAddress: getAddress(raw.implementationAddress!),
    };
}

export class ContractRegistry {
    readonly contracts: ContractEntry[];

    private constructor(contracts: ContractEntry[]) {
        this.contracts = contracts;
    }

    static fromFile(fileName: string): ContractRegistry {
        const raw = JSON.parse(readFileSync(fileName, "utf-8")) as Record<string, RawContractEntry[]>;

        const contracts: ContractEntry[] = [];
        for (const [key, entries] of Object.entries(raw)) {
            if (!PackageNames.includes(key as PackageName)) {
                throw new Error(
                    `Unknown package "${key}" in ${fileName}.`,
                );
            }

            for (const entry of entries) {
                contracts.push(parseEntry(key as PackageName, entry));
            }
        }

        const seen = new Set<string>();
        for (const contract of contracts) {
            if (seen.has(contract.name)) {
                throw new Error(`Contract "${contract.name}" is declared more than once in ${fileName}.`);
            }
            seen.add(contract.name);
        }

        return new ContractRegistry(contracts);
    }

    addressOf(name: string): Address {
        const contract = this.contracts.find((entry) => entry.name === name);
        if (contract === undefined) {
            throw new Error(`Contract "${name}" is not declared in the initial contracts file.`);
        }

        return contract.proxyAddress;
    }
}
