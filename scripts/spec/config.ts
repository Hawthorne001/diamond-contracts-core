import { readFileSync } from "node:fs";

import type { Address, Hex } from "viem";
import YAML from "yaml";

import {
    optional,
    requireAddress,
    requireAddressList,
    requireAmount,
    requireDuration,
    requireHexList,
    requireInteger,
    requireList,
    requireString,
    section,
    ConfigError,
} from "./validation.ts";

export interface StakingParams {
    _initialStakingAddresses: Address[];
    _delegatorMinStake: bigint;
    _candidateMinStake: bigint;
    _maxStake: bigint;
    _stakingFixedEpochDuration: bigint;
    _stakingTransitionTimeframeLength: bigint;
    _stakingWithdrawDisallowPeriod: bigint;
}

export interface InitialFund {
    address: Address;
    balance: bigint;
}

export interface NetworkConfiguration {
    networkName: string;
    networkId: string;
    owner: Address;
    permittedAddresses: Address[];
    initialFund?: InitialFund;

    initialMiningAddresses: Address[];
    initialStakingAddresses: Address[];
    publicKeys: Hex[];
    internetAddresses: Hex[];
    parts: Hex[];
    acks: Hex[][];

    stakingParams: StakingParams;

    minimumBlockTime: number;
    maximumBlockTime: number;
    validatorInactivityThreshold: number;
    reportDisallowPeriod: number;

    daoCreateProposalFee: bigint;
}

// Public keys are supplied as one 64 byte value per validator, the contracts
// expect the two 32 byte halves as separate entries.
function splitPublicKeys(values: Hex[]): Hex[] {
    return values.flatMap((key) => [key.slice(0, 66) as Hex, `0x${key.slice(66)}` as Hex]);
}

function readAcks(value: unknown, path: string): Hex[][] {
    return requireList(value, path).map((entry, index) => requireHexList(entry, `${path}[${index}]`));
}

function readNetworkId(value: unknown, path: string): string {
    // Accepted as a number for convenience, the spec file carries it as a string.
    if (typeof value === "number") {
        return String(requireInteger(value, path, { min: 0 }));
    }

    return requireString(value, path);
}

export function loadConfiguration(fileName: string): NetworkConfiguration {
    const parsed = YAML.parse(readFileSync(fileName, "utf-8"));
    const root = section(parsed, "<root>");

    const network = section(root.network, "network");
    const validators = section(root.validators, "validators");
    const staking = section(root.staking, "staking");
    const dao = section(root.dao ?? {}, "dao");
    const connectivity = section(root.connectivity ?? {}, "connectivity");

    const owner = requireAddress(root.owner, "owner");

    const miningAddresses = requireAddressList(validators.miningAddresses, "validators.miningAddresses");
    const stakingAddresses = requireAddressList(validators.stakingAddresses, "validators.stakingAddresses");
    const publicKeys = requireHexList(validators.publicKeys, "validators.publicKeys", 64);
    const internetAddresses = requireHexList(validators.ipAddresses, "validators.ipAddresses", 16);
    const parts = requireHexList(validators.parts, "validators.parts");
    const acks = readAcks(validators.acks, "validators.acks");

    for (const [path, list] of [
        ["validators.stakingAddresses", stakingAddresses],
        ["validators.publicKeys", publicKeys],
        ["validators.ipAddresses", internetAddresses],
        ["validators.parts", parts],
        ["validators.acks", acks],
    ] as const) {
        if (list.length !== miningAddresses.length) {
            throw new ConfigError(
                path,
                `has ${list.length} entries but validators.miningAddresses has ${miningAddresses.length}; ` +
                    "these lists are matched by position",
            );
        }
    }

    const initialFundSection = root.initialFund === undefined ? undefined : section(root.initialFund, "initialFund");

    return {
        networkName: requireString(network.name, "network.name"),
        networkId: readNetworkId(network.id, "network.id"),
        owner,
        permittedAddresses: [owner],
        initialFund:
            initialFundSection === undefined
                ? undefined
                : {
                      address: requireAddress(initialFundSection.address, "initialFund.address"),
                      balance: requireAmount(initialFundSection.balance, "initialFund.balance"),
                  },

        initialMiningAddresses: miningAddresses,
        initialStakingAddresses: stakingAddresses,
        publicKeys: splitPublicKeys(publicKeys),
        internetAddresses,
        parts,
        acks,

        stakingParams: {
            _initialStakingAddresses: stakingAddresses,
            _delegatorMinStake: requireAmount(staking.delegatorMinStake, "staking.delegatorMinStake"),
            _candidateMinStake: requireAmount(staking.candidateMinStake, "staking.candidateMinStake"),
            _maxStake: requireAmount(staking.maxStake, "staking.maxStake"),
            _stakingFixedEpochDuration: requireDuration(staking.epochDuration, "staking.epochDuration"),
            _stakingTransitionTimeframeLength: requireDuration(
                staking.transitionWindowLength,
                "staking.transitionWindowLength",
            ),
            _stakingWithdrawDisallowPeriod: requireDuration(
                staking.withdrawDisallowPeriod,
                "staking.withdrawDisallowPeriod",
            ),
        },

        minimumBlockTime: optional(network.minimumBlockTime, 0, (value) =>
            requireInteger(value, "network.minimumBlockTime", { min: 0 }),
        ),
        maximumBlockTime: optional(network.maximumBlockTime, 0, (value) =>
            requireInteger(value, "network.maximumBlockTime", { min: 0 }),
        ),
        validatorInactivityThreshold: requireInteger(
            validators.inactivityThreshold,
            "validators.inactivityThreshold",
            { min: 0 },
        ),
        reportDisallowPeriod: optional(connectivity.reportDisallowPeriod, 10, (value) =>
            requireInteger(value, "connectivity.reportDisallowPeriod", { min: 0 }),
        ),

        daoCreateProposalFee: requireAmount(dao.createProposalFee, "dao.createProposalFee"),
    };
}
