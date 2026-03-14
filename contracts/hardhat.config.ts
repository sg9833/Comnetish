import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';

dotenv.config();

const sepoliaUrl = process.env.SEPOLIA_RPC_URL ?? '';
const privateKey = process.env.PRIVATE_KEY ?? '';

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  networks: {
    hardhat: {},
    sepolia: {
      url: sepoliaUrl,
      accounts: privateKey ? [privateKey] : []
    }
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  }
};

export default config;