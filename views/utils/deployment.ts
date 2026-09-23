import { BaseContract } from "ethers";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

export async function createDeploymentContext() {
  const connection = await hre.network.create();
  const upgradesApi = await upgrades(hre, connection);

  return {
    connection,
    ethers: connection.ethers,
    upgrades: upgradesApi,
  };
}

type DeploymentContext = Awaited<ReturnType<typeof createDeploymentContext>>;

export async function deployContract(
  context: DeploymentContext,
  contractName: string,
  args: unknown[],
) {
  const contractFactory = await context.ethers.getContractFactory(contractName);
  const contract = await contractFactory.deploy(...args);

  await contract.waitForDeployment();

  return contract;
}

export async function deployProxy(
  context: DeploymentContext,
  contractName: string,
  args: unknown[],
) {
  const contractFactory = await context.ethers.getContractFactory(contractName);

  const contract = await context.upgrades.deployProxy(contractFactory, args, {
    initializer: "initialize",
  });

  await contract.waitForDeployment();

  return contract;
}

export async function upgradeProxy(
  context: DeploymentContext,
  contractName: string,
  proxyAddress: string,
  timeoutSec: number,
) {
  const contractFactory = await context.ethers.getContractFactory(contractName);

  const contract = await context.upgrades.upgradeProxy(proxyAddress, contractFactory);

  await new Promise((r) => setTimeout(r, timeoutSec * 1000));

  const newImplementationAddress = await context.upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("Proxy upgraded: ", proxyAddress);
  console.log("New implementation address: ", newImplementationAddress);

  return contract;
}

export async function verifyContract(contract: BaseContract, args: unknown[], timeoutSec: number) {
  await new Promise((r) => setTimeout(r, timeoutSec * 1000));

  try {
    await hre.tasks.getTask("verify").run({
      address: await contract.getAddress(),
      constructorArgs: args,
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
