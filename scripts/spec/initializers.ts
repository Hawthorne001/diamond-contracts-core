import type { Address } from "viem";

import type { NetworkConfiguration } from "./config.ts";
import type { ContractRegistry } from "./registry.ts";

export function proxyOwner(
    contractName: string,
    registry: ContractRegistry,
    config: NetworkConfiguration,
): Address {
    switch (contractName) {
        case "DiamondDao":
        case "DiamondDaoLowMajority":
            return registry.addressOf("DiamondDao");
        default:
            return config.owner;
    }
}

export function initializerArguments(
    contractName: string,
    registry: ContractRegistry,
    config: NetworkConfiguration,
): unknown[] {
    const address = (name: string) => registry.addressOf(name);

    switch (contractName) {
        case "ValidatorSetHbbft":
            return [
                config.owner,
                {
                    blockRewardContract: address("BlockRewardHbbft"),
                    randomContract: address("RandomHbbft"),
                    stakingContract: address("StakingHbbft"),
                    keyGenHistoryContract: address("KeyGenHistory"),
                    bonusScoreContract: address("BonusScoreSystem"),
                    connectivityTrackerContract: address("ConnectivityTrackerHbbft"),
                    validatorInactivityThreshold: config.validatorInactivityThreshold,
                },
                config.initialMiningAddresses,
                config.initialStakingAddresses,
            ];
        case "BlockRewardHbbft":
            return [config.owner, address("ValidatorSetHbbft"), address("ConnectivityTrackerHbbft")];
        case "RandomHbbft":
            return [config.owner, address("ValidatorSetHbbft")];
        case "TxPermissionHbbft":
            return [
                config.permittedAddresses,
                address("CertifierHbbft"),
                address("ValidatorSetHbbft"),
                address("KeyGenHistory"),
                address("ConnectivityTrackerHbbft"),
                config.owner,
            ];
        case "CertifierHbbft":
            return [config.permittedAddresses, address("ValidatorSetHbbft"), config.owner];
        case "KeyGenHistory":
            return [
                config.owner,
                address("ValidatorSetHbbft"),
                config.initialMiningAddresses,
                config.parts,
                config.acks,
            ];
        case "StakingHbbft":
            return [
                config.owner,
                {
                    _validatorSetContract: address("ValidatorSetHbbft"),
                    _bonusScoreContract: address("BonusScoreSystem"),
                    ...config.stakingParams,
                },
                config.publicKeys,
                config.internetAddresses,
            ];
        case "ConnectivityTrackerHbbft":
            return [
                config.owner,
                address("ValidatorSetHbbft"),
                address("StakingHbbft"),
                address("BlockRewardHbbft"),
                address("BonusScoreSystem"),
                config.reportDisallowPeriod,
            ];
        case "BonusScoreSystem":
            return [
                config.owner,
                address("ValidatorSetHbbft"),
                address("ConnectivityTrackerHbbft"),
                address("StakingHbbft"),
            ];
        case "DiamondDao":
            return [
                address("DiamondDao"),
                address("ValidatorSetHbbft"),
                address("StakingHbbft"),
                address("BlockRewardHbbft"),
                address("TxPermissionHbbft"),
                address("BonusScoreSystem"),
                address("DiamondDaoLowMajority"),
                config.daoCreateProposalFee,
                BigInt(Math.floor(Date.now() / 1000)),
            ];
        case "DiamondDaoLowMajority":
            return [address("DiamondDao")];
        case "DMDAggregatorUpgradeable":
            return [
                config.owner,
                address("StakingHbbft"),
                address("ValidatorSetHbbft"),
                address("TxPermissionHbbft"),
            ];
        default:
            throw new Error(`No initializer arguments defined for "${contractName}"`);
    }
}
