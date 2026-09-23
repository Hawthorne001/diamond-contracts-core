import { createDeploymentContext, deployProxy, verifyContract } from "../utils/deployment.js";

async function deploy() {
  const context = await createDeploymentContext();
  const [deployer] = await context.ethers.getSigners();

  console.log("Deploying from: ", deployer.address);

  const args = [
    deployer.address, // Initial Owner
    "0x1100000000000000000000000000000000000001", // Staking
    "0x1000000000000000000000000000000000000001", // ValidatorSet
    "0x4000000000000000000000000000000000000001", // TxPermission
  ];

  const aggregator = await deployProxy(context, "DMDAggregatorUpgradeable", args);

  console.log("DMDAggregator deployed at: ", await aggregator.getAddress());

  console.log("Verifying DMDAggregator contract...");

  await verifyContract(aggregator, args, 60);

  console.log("Done.");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deploy().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
