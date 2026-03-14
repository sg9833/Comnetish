import { PrismaClient, ProviderStatus } from '@prisma/client';

const prisma = new PrismaClient();

const providers = [
  {
    address: 'comnetish1providerusw91z7m0y7l3n',
    region: 'US-West',
    cpu: 48,
    memory: 196608,
    storage: 2500,
    pricePerCpu: 0.36,
    status: ProviderStatus.ACTIVE
  },
  {
    address: 'comnetish1provideruse5d9u0q2k4m4',
    region: 'US-East',
    cpu: 32,
    memory: 131072,
    storage: 1800,
    pricePerCpu: 0.34,
    status: ProviderStatus.ACTIVE
  },
  {
    address: 'comnetish1providereuc1f7k8v8p6z',
    region: 'EU-Central',
    cpu: 64,
    memory: 262144,
    storage: 3200,
    pricePerCpu: 0.41,
    status: ProviderStatus.ACTIVE
  },
  {
    address: 'comnetish1providereuw2f2u3h6n9x',
    region: 'EU-West',
    cpu: 24,
    memory: 98304,
    storage: 1200,
    pricePerCpu: 0.33,
    status: ProviderStatus.MAINTENANCE
  },
  {
    address: 'comnetish1providerasia1w3p8m4r2',
    region: 'Asia-Singapore',
    cpu: 40,
    memory: 163840,
    storage: 2200,
    pricePerCpu: 0.38,
    status: ProviderStatus.ACTIVE
  }
];

async function main() {
  console.log('Starting seed...');

  // Seed providers
  const seededProviders = [];
  for (const provider of providers) {
    const seededProvider = await prisma.provider.upsert({
      where: { address: provider.address },
      update: {
        region: provider.region,
        cpu: provider.cpu,
        memory: provider.memory,
        storage: provider.storage,
        pricePerCpu: provider.pricePerCpu,
        status: provider.status,
        lastSeen: new Date()
      },
      create: {
        ...provider,
        lastSeen: new Date()
      }
    });
    seededProviders.push(seededProvider);
  }

  console.log(`Seeded ${seededProviders.length} providers across US, EU, and Asia.`);

  // Seed sample deployments
  const deployments = [
    {
      tenantAddress: 'comnetish1tenantdemoa99f0u29k3f',
      sdl: 'version: "3.0"\nservices:\n  web:\n    image: nginx:latest\n    expose:\n      - port: 80\n        as: 80\n        to:\n          - global: true'
    },
    {
      tenantAddress: 'comnetish1tenant2b3c4d5e6f7g8h9i',
      sdl: 'version: "3.0"\nservices:\n  api:\n    image: python:3.11\n    expose:\n      - port: 5000\n        as: 5000\n        to:\n          - global: true'
    },
    {
      tenantAddress: 'comnetish1tenant3j9k8l7m6n5o4p3',
      sdl: 'version: "3.0"\nservices:\n  database:\n    image: postgres:15\n    expose:\n      - port: 5432\n        as: 5432\n        to:\n          - global: true'
    },
    {
      tenantAddress: 'comnetish1tenant4q2w3e4r5t6y7u8',
      sdl: 'version: "3.0"\nservices:\n  redis:\n    image: redis:7\n    expose:\n      - port: 6379\n        as: 6379\n        to:\n          - global: true'
    }
  ];

  const seededDeployments = [];
  for (const deployment of deployments) {
    const seededDeployment = await prisma.deployment.upsert({
      where: { id: `deploy-${deployment.tenantAddress}-0` },
      update: {
        ...deployment,
        status: 'OPEN'
      },
      create: {
        id: `deploy-${deployment.tenantAddress}-0`,
        ...deployment,
        status: 'OPEN'
      }
    });
    seededDeployments.push(seededDeployment);
  }

  console.log(`Seeded ${seededDeployments.length} deployments.`);

  // Seed sample bids for open deployments
  if (seededDeployments.length > 0 && seededProviders.length > 0) {
    let bidCount = 0;
    for (let i = 0; i < seededDeployments.length; i++) {
      const deployment = seededDeployments[i];
      // Create 2-3 bids per deployment
      const bidCount_for_deployment = Math.floor(Math.random() * 2) + 2;
      for (let j = 0; j < bidCount_for_deployment; j++) {
        const provider = seededProviders[j % seededProviders.length];
        // Vary prices slightly
        const basePrice = provider.pricePerCpu;
        const priceVariation = (Math.random() - 0.5) * 0.1;
        const price = Math.max(0.1, basePrice + priceVariation);

        await prisma.bid.upsert({
          where: { id: `bid-${deployment.id}-${provider.id}-0` },
          update: {
            price,
            status: 'OPEN'
          },
          create: {
            id: `bid-${deployment.id}-${provider.id}-0`,
            deploymentId: deployment.id,
            providerId: provider.id,
            price,
            status: 'OPEN'
          }
        });
        bidCount++;
      }
    }
    console.log(`Seeded ${bidCount} bids.`);
  }

  // Seed sample leases (for active deployments showing real workflows)
  if (seededDeployments.length > 1 && seededProviders.length > 0) {
    let leaseCount = 0;

    // Convert first deployment to ACTIVE with a lease
    const firstDeployment = seededDeployments[0];
    const firstProvider = seededProviders[0];

    // Update deployment to ACTIVE
    await prisma.deployment.update({
      where: { id: firstDeployment.id },
      data: { status: 'ACTIVE' }
    });

    // Create a lease
    await prisma.lease.upsert({
      where: { id: `lease-${firstDeployment.id}-${firstProvider.id}-0` },
      update: {
        status: 'ACTIVE'
      },
      create: {
        id: `lease-${firstDeployment.id}-${firstProvider.id}-0`,
        deploymentId: firstDeployment.id,
        providerId: firstProvider.id,
        status: 'ACTIVE',
        pricePerBlock: 0.1,
        startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Started 24 hours ago
      }
    });
    leaseCount++;

    // Convert second deployment to ACTIVE with a lease
    if (seededDeployments.length > 1) {
      const secondDeployment = seededDeployments[1];
      const secondProvider = seededProviders[1];

      await prisma.deployment.update({
        where: { id: secondDeployment.id },
        data: { status: 'ACTIVE' }
      });

      await prisma.lease.upsert({
        where: { id: `lease-${secondDeployment.id}-${secondProvider.id}-0` },
        update: {
          status: 'ACTIVE'
        },
        create: {
          id: `lease-${secondDeployment.id}-${secondProvider.id}-0`,
          deploymentId: secondDeployment.id,
          providerId: secondProvider.id,
          status: 'ACTIVE',
          pricePerBlock: 0.08,
          startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) // Started 48 hours ago
        }
      });
      leaseCount++;
    }

    console.log(`Seeded ${leaseCount} leases.`);
  }

  // Seed sample transactions
  if (seededProviders.length > 0) {
    let txCount = 0;
    for (let i = 0; i < 8; i++) {
      const fromProvider = seededProviders[i % seededProviders.length];
      const toProvider = seededProviders[(i + 1) % seededProviders.length];
      const amount = Math.random() * 100 + 10; // 10-110 CNT/USDC

      await prisma.transaction.upsert({
        where: { id: `tx-seed-${i}` },
        update: {
          amount
        },
        create: {
          id: `tx-seed-${i}`,
          type: 'lease_payment',
          from: fromProvider.address,
          to: toProvider.address,
          amount,
          token: i % 2 === 0 ? 'CNT' : 'USDC',
          txHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`
        }
      });
      txCount++;
    }
    console.log(`Seeded ${txCount} sample transactions.`);
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
