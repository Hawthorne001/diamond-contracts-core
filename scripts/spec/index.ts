import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { encodeDeployData, encodeFunctionData, type Address, type Hex } from "viem";

import {
    getConstructorArgsCount,
    loadArtifact,
    repositoryRoot,
    type Artifact,
} from "./artifacts.ts";
import { loadConfiguration, type NetworkConfiguration } from "./config.ts";
import { initializerArguments, proxyOwner } from "./initializers.ts";
import { ConfigError } from "./validation.ts";
import { ContractRegistry, type ContractEntry } from "./registry.ts";

const ProxyContractName = "TransparentUpgradeableProxy";

interface SpecAccount {
    balance: string;
    constructor?: Hex;
}

interface SpecContract {
    entry: ContractEntry;
    implementationBytecode: Hex;
    proxyBytecode: Hex;
    initializerData: Hex;
    proxyOwnerAddress: Address;
}

function implementationBytecode(artifact: Artifact, entry: ContractEntry): Hex {
    if (getConstructorArgsCount(artifact) !== 0) {
        throw new Error(
            `Contract "${entry.name}" takes constructor arguments, which a genesis account cannot supply. ` +
                `Move the arguments into initialize().`,
        );
    }

    return artifact.bytecode;
}

function prepareContract(
    entry: ContractEntry,
    registry: ContractRegistry,
    config: NetworkConfiguration,
): SpecContract {
    const artifact = loadArtifact(entry.package, entry.name);
    const proxyArtifact = loadArtifact(entry.package, ProxyContractName);
    const proxyOwnerAddress = proxyOwner(entry.name, registry, config);

    const initializerData = encodeFunctionData({
        abi: artifact.abi,
        functionName: "initialize",
        args: initializerArguments(entry.name, registry, config),
    });

    const proxyBytecode = encodeDeployData({
        abi: proxyArtifact.abi,
        bytecode: proxyArtifact.bytecode,
        args: [entry.implementationAddress, proxyOwnerAddress, initializerData],
    });

    return {
        entry,
        implementationBytecode: implementationBytecode(artifact, entry),
        proxyBytecode,
        initializerData,
        proxyOwnerAddress,
    };
}

function specAccounts(contract: SpecContract): Record<string, SpecAccount> {
    const { entry } = contract;

    return {
        [entry.implementationAddress]: { balance: "0", constructor: contract.implementationBytecode },
        [entry.proxyAddress]: { balance: "0", constructor: contract.proxyBytecode },
    };
}

function createVerificationScript(contracts: SpecContract[], network: string): string {
    const lines = [
        "#!/bin/sh",
        "",
        "set -o pipefail",
        "",
    ];

    for (const contract of contracts) {
        const { entry } = contract;
        const verify = `pnpm --dir ${entry.package} hardhat verify --network ${network}`;

        lines.push(
            `### ${entry.name} (${entry.package}) ###`,
            `echo "verifying ${entry.name} at ${entry.implementationAddress}"`,
            `${verify} ${entry.implementationAddress}`,
            `echo "verifying proxy for ${entry.name} at ${entry.proxyAddress}"`,
            `${verify} ${entry.proxyAddress} ${entry.implementationAddress} ${contract.proxyOwnerAddress} ${contract.initializerData}`,
            "",
        );
    }

    return lines.join("\n");
}

function main(): void {
    // "pnpm run spec -- --flag" forwards the separator itself.
    const args = process.argv.slice(2);
    if (args[0] === "--") {
        args.shift();
    }

    const { values } = parseArgs({
        args,
        options: {
            "init-data": { type: "string" },
            "init-contracts": { type: "string", default: "initial-contracts.json" },
            template: { type: "string", default: path.join("templates", "spec_hbbft.json") },
            out: { type: "string", default: "spec_hbbft.json" },
            "verification-script": { type: "string", default: "blockscout_verify.sh" },
            "verification-network": { type: "string", default: "mainnet" },
        },
    });

    if (values["init-data"] === undefined) {
        throw new Error(
            "Missing --init-data <file>. See templates/init-data.example.yaml for the expected contents.",
        );
    }

    // Relative paths resolve against the repository root, not the caller's cwd.
    const fromRoot = (file: string) => path.resolve(repositoryRoot, file);

    const registry = ContractRegistry.fromFile(fromRoot(values["init-contracts"]));
    const config = loadConfiguration(fromRoot(values["init-data"]));

    console.log(`Network:   ${config.networkName} (id ${config.networkId})`);
    console.log(`Owner:     ${config.owner}`);
    console.log(`Validators: ${config.initialMiningAddresses.length}`);
    console.log(`Contracts: ${registry.contracts.length} across core, dao and views`);

    const spec = JSON.parse(readFileSync(fromRoot(values.template), "utf-8"));

    spec.name = config.networkName;
    spec.params.networkID = config.networkId;

    if (config.minimumBlockTime > 0) {
        spec.engine.hbbft.params.minimumBlockTime = config.minimumBlockTime;
    }

    if (config.maximumBlockTime > 0) {
        spec.engine.hbbft.params.maximumBlockTime = config.maximumBlockTime;
    }

    if (config.initialFund !== undefined) {
        spec.accounts[config.initialFund.address] = { balance: config.initialFund.balance.toString() };
    }

    const contracts: SpecContract[] = [];
    for (const entry of registry.contracts) {
        console.log(`Preparing ${entry.package}/${entry.name}`);

        const contract = prepareContract(entry, registry, config);
        contracts.push(contract);

        spec.accounts = { ...spec.accounts, ...specAccounts(contract) };
    }

    spec.engine.hbbft.params.blockRewardContractAddress = registry.addressOf("BlockRewardHbbft");
    spec.params.transactionPermissionContract = registry.addressOf("TxPermissionHbbft");
    spec.params.transactionPermissionContractTransition = "0x0";

    const specFile = fromRoot(values.out);
    writeFileSync(specFile, JSON.stringify(spec, null, "  "), "utf-8");
    console.log(`Wrote ${specFile}`);

    const scriptFile = fromRoot(values["verification-script"]);
    writeFileSync(scriptFile, createVerificationScript(contracts, values["verification-network"]), "utf-8");
    console.log(`Wrote ${scriptFile}`);
}

try {
    main();
} catch (error) {
    if (error instanceof ConfigError) {
        console.error(`Invalid configuration, ${error.message}`);
        process.exit(1);
    }

    throw error;
}
