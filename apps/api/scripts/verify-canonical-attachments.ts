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
  const endpointExternalId = `attachments-check-${Date.now()}`;

  const beforeDocuments = await prisma.tenantDocument.count({
    where: {
      tenantId: tenant.id,
      sourceType: {
        in: ["customer_message", "email_event"]
      }
    }
  });

  const customerResponse = await postJson(
    "http://localhost:4000/api/customer-messages",
    {
      channel: "telegram",
      provider: "verification-script",
      endpointExternalId,
      accountHints: { name: "Hotel Melia" },
      personHints: { fullName: "Pepe" },
      message: { text: "Adjunto la nota del pedido." },
      attachments: [
        {
          fileName: "pedido.txt",
          mimeType: "text/plain",
          base64Content: Buffer.from("pedido demo").toString("base64")
        }
      ]
    },
    `verify-customer-attachments-${Date.now()}`
  );

  const emailResponse = await postJson(
    "http://localhost:4000/api/email-events",
    {
      channel: "email",
      provider: "verification-script",
      endpointExternalId: `mail-${endpointExternalId}`,
      accountHints: { name: "Hotel Melia" },
      personHints: { fullName: "Pepe" },
      subject: "Documentos",
      body: "Adjunto una ficha.",
      attachments: [
        {
          fileName: "ficha.txt",
          mimeType: "text/plain",
          base64Content: Buffer.from("ficha demo").toString("base64")
        }
      ]
    },
    `verify-email-attachments-${Date.now()}`
  );

  const afterDocuments = await prisma.tenantDocument.count({
    where: {
      tenantId: tenant.id,
      sourceType: {
        in: ["customer_message", "email_event"]
      }
    }
  });

  const savedDocumentMessages = await prisma.conversationMessage.count({
    where: {
      tenantId: tenant.id,
      channelEndpoint: {
        endpointExternalId: {
          in: [endpointExternalId, `mail-${endpointExternalId}`]
        }
      },
      messageType: "document"
    }
  });

  if (afterDocuments - beforeDocuments < 2) {
    throw new Error(`Expected at least 2 saved documents, got delta ${afterDocuments - beforeDocuments}`);
  }

  if (savedDocumentMessages < 2) {
    throw new Error(`Expected document conversation messages, got ${savedDocumentMessages}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        customerAttachments: customerResponse.attachments?.length ?? 0,
        emailAttachments: emailResponse.attachments?.length ?? 0,
        storedDocumentsDelta: afterDocuments - beforeDocuments,
        documentMessages: savedDocumentMessages
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
