import { defineConfig } from "hardhat/config";

import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatLedger from "@nomicfoundation/hardhat-ledger";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatUpgrades from "@openzeppelin/hardhat-upgrades";
import hardhatContractSizer from "@solidstate/hardhat-contract-sizer";

import { createBaseConfig } from "../hardhat.base.js";

const base = createBaseConfig({
    viaIR: true,
});

export default defineConfig({
    ...base,
    plugins: [
        hardhatEthers,
        hardhatLedger,
        hardhatVerify,
        hardhatUpgrades,
        hardhatContractSizer,
    ],
    paths: {
        ...base.paths,
        tests: {
            solidity: "./test",
        },
    },
    test: {
        solidity: {
            ffi: true,
        },
    },
    coverage: {
        skipFiles: ["interfaces"],
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        only: [/DMDAggregator/i],
    },
});
