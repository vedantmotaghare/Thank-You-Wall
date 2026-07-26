import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🚀 Starting TipJar contract deployment...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📍 Deploying with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH");

  const TipJarFactory = await hre.ethers.getContractFactory("TipJar");
  const tipJar = await TipJarFactory.deploy();

  await tipJar.waitForDeployment();
  const contractAddress = await tipJar.getAddress();

  console.log("✅ TipJar contract deployed successfully!");
  console.log("📜 Contract Address:", contractAddress);

  // Save Contract Address & ABI for Frontend consumption
  const configDir = path.join(__dirname, "../src/contracts");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const contractArtifact = await hre.artifacts.readArtifact("TipJar");

  const configData = {
    address: contractAddress,
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    deployedAt: new Date().toISOString(),
    owner: deployer.address,
    abi: contractArtifact.abi
  };

  const outputPath = path.join(configDir, "TipJar.json");
  fs.writeFileSync(outputPath, JSON.stringify(configData, null, 2));

  console.log("📄 Saved deployment artifact to:", outputPath);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
