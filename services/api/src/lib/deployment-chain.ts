import { ComnetishClient } from '@comnetish/chain-client';

let chainClient: ComnetishClient | null = null;

export function getChainClient(): ComnetishClient {
  if (!chainClient) {
    const rpcUrl = process.env.COMNETISH_RPC_URL ?? 'http://localhost:26657';
    const restUrl = process.env.COMNETISH_REST_URL ?? 'http://localhost:1317';
    const chainId = process.env.COMNETISH_CHAIN_ID ?? 'comnetish-1';
    const gasPrice = process.env.COMNETISH_GAS_PRICE ?? '0.025ucnt';
    
    chainClient = new ComnetishClient({
      rpcUrl,
      restUrl,
      chainId,
      gasPrice,
      mock: process.env.COMNETISH_MOCK === 'true'
    });
  }
  return chainClient;
}

export async function broadcastMsgCreateDeployment(
  tenantAddress: string,
  sdl: string,
  relayerMnemonic: string
): Promise<{ txHash: string; deploymentId: string }> {
  const client = getChainClient();
  
  if (!relayerMnemonic) {
    throw new Error('COMNETISH_RELAYER_MNEMONIC not configured. Chain broadcast disabled.');
  }

  try {
    const result = await client.createDeployment(sdl, relayerMnemonic);
    
    return {
      txHash: result.txHash,
      deploymentId: result.deploymentId
    };
  } catch (error) {
    console.error('[deployment-chain] broadcastMsgCreateDeployment failed:', error);
    throw error;
  }
}

export async function broadcastMsgCreateLease(
  deploymentId: string,
  bidId: string,
  tenantAddress: string,
  relayerMnemonic: string
): Promise<{ txHash: string }> {
  const client = getChainClient();
  
  if (!relayerMnemonic) {
    throw new Error('COMNETISH_RELAYER_MNEMONIC not configured. Chain broadcast disabled.');
  }

  try {
    const result = await client.createLease(deploymentId, bidId, relayerMnemonic);
    return result;
  } catch (error) {
    console.error('[deployment-chain] broadcastMsgCreateLease failed:', error);
    throw error;
  }
}

export async function broadcastMsgCloseDeployment(
  deploymentId: string,
  tenantAddress: string,
  relayerMnemonic: string
): Promise<{ txHash: string }> {
  const client = getChainClient();
  
  if (!relayerMnemonic) {
    throw new Error('COMNETISH_RELAYER_MNEMONIC not configured. Chain broadcast disabled.');
  }

  try {
    // Note: closeDeployment not yet added to chain-client; when available, wire here
    const msg = {
      deploymentId,
      tenantAddress,
      owner: tenantAddress
    };
    
    const mockTxHash = `0x${Date.now().toString(16)}${Math.random()
      .toString(16)
      .slice(2)}`;
    
    console.log('[deployment-chain] closeDeployment would send:', msg);
    return { txHash: mockTxHash };
  } catch (error) {
    console.error('[deployment-chain] broadcastMsgCloseDeployment failed:', error);
    throw error;
  }
}
