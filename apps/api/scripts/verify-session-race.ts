import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function postJson(url: string, body: Record<string, unknown>, idempotencyKey: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "bellotas-demo-n8n-key",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`${url} ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "demo-logistica" }
  });

  const endpointExternalId = `race-endpoint-${Date.now()}`;
  const parallelPosts = Array.from({ length: 5 }, (_, index) =>
    postJson(
      "http://localhost:4000/api/customer-messages",
      {
        channel: "telegram",
        provider: "verification-script",
        endpointExternalId,
        accountHints: { name: "Hotel Melia" },
        personHints: { fullName: "Pepe" },
        message: { text: `mensaje concurrente ${index + 1}` }
      },
      `verify-session-race-${Date.now()}-${index}`
    )
  );

  await Promise.all(parallelPosts);

  const endpoint = await prisma.channelEndpoint.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      endpointExternalId
    }
  });

  const activeSessions = await prisma.conversationSession.count({
    where: {
      tenantId: tenant.id,
      channel: "telegram",
      userId: null,
      accountId: endpoint.accountId,
      contactPersonId: endpoint.currentPersonId,
      channelEndpointId: endpoint.id,
      status: "ACTIVE"
    }
  });

  if (activeSessions !== 1) {
    throw new Error(`Expected exactly 1 active external session, got ${activeSessions}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        endpointId: endpoint.id,
        activeSessions
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
