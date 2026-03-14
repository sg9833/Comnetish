import { promises as fs } from 'fs';
import path from 'path';
import hre from 'hardhat';

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const networkName = hre.network.name;

  console.log(`Deploying contracts to ${networkName} with account ${deployer.address}`);

  const tokenFactory = await hre.ethers.getContractFactory('CNTToken');

  const cnt = await tokenFactory.deploy('Comnetish Token', 'CNT', 18);
  await cnt.waitForDeployment();

  const usdc = await tokenFactory.deploy('USD Coin (Mock)', 'USDC', 6);
  await usdc.waitForDeployment();

  const escrowFactory = await hre.ethers.getContractFactory('PaymentEscrow');
  const escrow = await escrowFactory.deploy(await usdc.getAddress(), deployer.address);
  await escrow.waitForDeployment();

  const addresses = {
    network: networkName,
    deployer: deployer.address,
    cntToken: await cnt.getAddress(),
    usdcToken: await usdc.getAddress(),
    paymentEscrow: await escrow.getAddress(),
    deployedAt: new Date().toISOString()
  };

  const escrowArtifact = await hre.artifacts.readArtifact('PaymentEscrow');
  const tokenArtifact = await hre.artifacts.readArtifact('CNTToken');

  const exportRoot = path.join(process.cwd(), 'exports');
  await writeJson(path.join(exportRoot, 'addresses', `${networkName}.json`), addresses);
  await writeJson(path.join(exportRoot, 'abi', 'PaymentEscrow.json'), escrowArtifact.abi);
  await writeJson(path.join(exportRoot, 'abi', 'CNTToken.json'), tokenArtifact.abi);

  console.log('Deployment complete:');
  console.log(addresses);
  console.log(`ABI + addresses exported under ${path.join(exportRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});