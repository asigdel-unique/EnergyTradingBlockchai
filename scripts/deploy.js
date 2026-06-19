import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();

  console.log("Deploying contract...");

  const EnergyTrading = await ethers.getContractFactory("EnergyTrading");
  const contract = await EnergyTrading.deploy();
  await contract.waitForDeployment();

  console.log("Deployment done");
  console.log("Contract address:", await contract.getAddress());
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
