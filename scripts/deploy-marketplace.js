import hre from "hardhat";

async function main() {
  const networkFlagIndex = process.argv.indexOf("--network");
  const networkName = networkFlagIndex !== -1 ? process.argv[networkFlagIndex + 1] : "localhost";
  const { ethers } = await hre.network.connect(networkName);

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
