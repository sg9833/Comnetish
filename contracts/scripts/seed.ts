import { existsSync, readFileSync } from 'fs';
import path from 'path';
import hre from 'hardhat';

type MintableToken = {
  connect: (runner: unknown) => MintableToken;
  mint: (to: string, amount: bigint) => Promise<unknown>;
};

type AddressExport = {
  cntToken: string;
  usdcToken: string;
  paymentEscrow: string;
};

function readAddresses(networkName: string): AddressExport {
  const file = path.join(process.cwd(), 'exports', 'addresses', `${networkName}.json`);
  if (!existsSync(file)) {
    throw new Error(
      `Address export not found for network '${networkName}' at ${file}. Run deploy script first.`
    );
  }

  return JSON.parse(readFileSync(file, 'utf8')) as AddressExport;
}

async function main() {
  const [deployer, tenant1, provider1, provider2] = await hre.ethers.getSigners();
  if (!deployer || !tenant1 || !provider1 || !provider2) {
    throw new Error('Insufficient signers to run seed script.');
  }
  const networkName = hre.network.name;
  const addresses = readAddresses(networkName);

  const tokenFactory = await hre.ethers.getContractFactory('CNTToken');
  const cnt = tokenFactory.attach(addresses.cntToken) as unknown as MintableToken;
  const usdc = tokenFactory.attach(addresses.usdcToken) as unknown as MintableToken;

  const cntAmount = hre.ethers.parseUnits('100000', 18);
  const usdcAmount = hre.ethers.parseUnits('25000', 6);

  const wallets = [
    { name: 'tenant1', signer: tenant1 },
    { name: 'provider1', signer: provider1 },
    { name: 'provider2', signer: provider2 }
  ];

  for (const wallet of wallets) {
    await cnt.connect(deployer).mint(wallet.signer.address, cntAmount);
    await usdc.connect(deployer).mint(wallet.signer.address, usdcAmount);
    console.log(`Seeded ${wallet.name} (${wallet.signer.address}) with CNT + USDC`);
  }

  console.log(`Seed complete on ${networkName}. Escrow: ${addresses.paymentEscrow}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
