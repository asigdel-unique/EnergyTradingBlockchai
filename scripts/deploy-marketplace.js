import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect("localhost");

  console.log("Deploying EnergyMarketplace...");

  const EnergyMarketplace = await ethers.getContractFactory("EnergyMarketplace");
  const contract = await EnergyMarketplace.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("Contract address:", address);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
