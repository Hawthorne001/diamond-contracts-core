import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Abi, Hex } from "viem";

export type PackageName = "core" | "dao" | "views";

export const PackageNames: PackageName[] = ["core", "dao", "views"];

export const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

export interface Artifact {
    contractName: string;
    sourceName: string;
    abi: Abi;
    bytecode: Hex;
}

const artifactIndex = new Map<PackageName, Map<string, string>>();

function indexArtifacts(pkg: PackageName): Map<string, string> {
    const cached = artifactIndex.get(pkg);
    if (cached !== undefined) {
        return cached;
    }

    const artifactsDir = path.join(repositoryRoot, pkg, "artifacts");

    let entries: string[];
    try {
        entries = readdirSync(artifactsDir, { recursive: true, encoding: "utf8" });
    } catch {
        throw new Error(`no compiled artifacts found in ${artifactsDir}`);
    }

    const index = new Map<string, string>();
    for (const entry of entries) {
        if (!entry.endsWith(".json") || entry.startsWith("build-info")) {
            continue;
        }

        if (!path.basename(path.dirname(entry)).endsWith(".sol")) {
            continue;
        }

        const contractName = path.basename(entry, ".json");
        const previous = index.get(contractName);
        if (previous !== undefined) {
            throw new Error(
                `Ambiguous contract "${contractName}" in package "${pkg}": ` +
                    `found in both ${previous} and ${entry}.`,
            );
        }

        index.set(contractName, entry);
    }

    artifactIndex.set(pkg, index);

    return index;
}

export function loadArtifact(pkg: PackageName, contractName: string): Artifact {
    const relativePath = indexArtifacts(pkg).get(contractName);
    if (relativePath === undefined) {
        throw new Error(`"${contractName}" contract artifact was not found in "${pkg}"`);
    }

    const artifactPath = path.join(repositoryRoot, pkg, "artifacts", relativePath);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf-8")) as Artifact;

    if (artifact.bytecode === undefined || artifact.bytecode === "0x") {
        throw new Error(`Missing bytecode for contract "${contractName}" in package "${pkg}"`);
    }

    return artifact;
}

export function getConstructorArgsCount(artifact: Artifact): number {
    const constructorAbi = artifact.abi.find((entry) => entry.type === "constructor");

    return constructorAbi === undefined ? 0 : constructorAbi.inputs.length;
}
