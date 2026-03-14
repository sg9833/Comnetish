import { time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

type MintableToken = {
  connect: (runner: unknown) => MintableToken;
  waitForDeployment: () => Promise<unknown>;
  getAddress: () => Promise<string>;
  mint: (to: string, amount: bigint) => Promise<unknown>;
  approve: (spender: string, amount: bigint) => Promise<unknown>;
  balanceOf: (owner: string) => Promise<bigint>;
};

type EscrowContract = {
  interface: unknown;
  connect: (runner: unknown) => EscrowContract;
  waitForDeployment: () => Promise<unknown>;
  getAddress: () => Promise<string>;
  depositForLease: (id: number, provider: string, amount: bigint, duration: number) => Promise<unknown>;
  settleLease: (id: number) => Promise<unknown>;
  cancelLease: (id: number) => Promise<unknown>;
  markLeaseStarted: (id: number) => Promise<unknown>;
};

describe('PaymentEscrow', function () {
  async function deployFixture() {
    const [owner, tenant, provider, stranger] = await hre.ethers.getSigners();
    if (!owner || !tenant || !provider || !stranger) {
      throw new Error('Insufficient signers to run marketplace tests.');
    }

    const tokenFactory = await hre.ethers.getContractFactory('CNTToken');
    const usdc = (await tokenFactory.deploy('USD Coin (Mock)', 'USDC', 6)) as unknown as MintableToken;
    await usdc.waitForDeployment();

    const escrowFactory = await hre.ethers.getContractFactory('PaymentEscrow');
    const escrow = (await escrowFactory.deploy(await usdc.getAddress(), owner.address)) as unknown as EscrowContract;
    await escrow.waitForDeployment();

    const funded = hre.ethers.parseUnits('1000', 6);
    await usdc.connect(owner).mint(tenant.address, funded);

    return { owner, tenant, provider, stranger, usdc, escrow };
  }

  it('creates lease escrow and emits LeaseCreated', async function () {
    const { tenant, provider, usdc, escrow } = await deployFixture();
    const amount = hre.ethers.parseUnits('250', 6);

    await usdc.connect(tenant).approve(await escrow.getAddress(), amount);

    await expect(escrow.connect(tenant).depositForLease(1, provider.address, amount, 3600))
      .to.emit(escrow, 'LeaseCreated')
      .withArgs(1, tenant.address, provider.address, amount, 3600);

    expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(amount);
  });

  it('oracle settles lease and releases payment to provider', async function () {
    const { owner, tenant, provider, usdc, escrow } = await deployFixture();
    const amount = hre.ethers.parseUnits('100', 6);

    await usdc.connect(tenant).approve(await escrow.getAddress(), amount);
    await escrow.connect(tenant).depositForLease(2, provider.address, amount, 3600);

    await expect(escrow.connect(owner).settleLease(2))
      .to.emit(escrow, 'PaymentReleased')
      .withArgs(2, provider.address, amount)
      .and.to.emit(escrow, 'LeaseSettled')
      .withArgs(2, owner.address, amount);

    expect(await usdc.balanceOf(provider.address)).to.equal(amount);
  });

  it('tenant can cancel lease within 5-minute window if not started', async function () {
    const { tenant, provider, usdc, escrow } = await deployFixture();
    const amount = hre.ethers.parseUnits('40', 6);

    await usdc.connect(tenant).approve(await escrow.getAddress(), amount);
    await escrow.connect(tenant).depositForLease(3, provider.address, amount, 3600);

    await expect(escrow.connect(tenant).cancelLease(3))
      .to.emit(escrow, 'LeaseCancelled')
      .withArgs(3, tenant.address, amount);

    expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(0);
  });

  it('cannot cancel if cancellation window expired', async function () {
    const { tenant, provider, usdc, escrow } = await deployFixture();
    const amount = hre.ethers.parseUnits('30', 6);

    await usdc.connect(tenant).approve(await escrow.getAddress(), amount);
    await escrow.connect(tenant).depositForLease(4, provider.address, amount, 3600);

    await time.increase(301);

    await expect(escrow.connect(tenant).cancelLease(4)).to.be.revertedWithCustomError(
      escrow,
      'CancellationWindowExpired'
    );
  });

  it('anyone can settle lease if max duration exceeded', async function () {
    const { tenant, provider, stranger, usdc, escrow } = await deployFixture();
    const amount = hre.ethers.parseUnits('55', 6);

    await usdc.connect(tenant).approve(await escrow.getAddress(), amount);
    await escrow.connect(tenant).depositForLease(5, provider.address, amount, 120);

    await time.increase(121);

    await expect(escrow.connect(stranger).settleLease(5))
      .to.emit(escrow, 'LeaseSettled')
      .withArgs(5, stranger.address, amount);

    expect(await usdc.balanceOf(provider.address)).to.equal(amount);
  });

  it('cannot cancel lease after oracle marks it as started', async function () {
    const { owner, tenant, provider, usdc, escrow } = await deployFixture();
    const amount = hre.ethers.parseUnits('70', 6);

    await usdc.connect(tenant).approve(await escrow.getAddress(), amount);
    await escrow.connect(tenant).depositForLease(6, provider.address, amount, 3600);

    await escrow.connect(owner).markLeaseStarted(6);

    await expect(escrow.connect(tenant).cancelLease(6)).to.be.revertedWithCustomError(
      escrow,
      'LeaseAlreadyStarted'
    );
  });
});