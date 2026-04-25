import { PrismaClient, WorkAssignmentStatus, WorkItemStatus, WorkType } from "@prisma/client";

const prisma = new PrismaClient();

async function postConversationMessage(body: Record<string, unknown>, idempotencyKey: string) {
  const response = await fetch("http://localhost:4000/api/integrations/conversation/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "bellotas-demo-n8n-key",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`conversation/message ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function postEmployeeEvent(body: Record<string, unknown>, idempotencyKey: string) {
  const response = await fetch("http://localhost:4000/api/employee-events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "bellotas-demo-n8n-key",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`employee-events ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "demo-logistica" }
  });
  const warehouseUser = await prisma.user.findUniqueOrThrow({
    where: {
      tenantId_employeeCode: {
        tenantId: tenant.id,
        employeeCode: "ALM001"
      }
    }
  });

  const account = await prisma.commercialAccount.findFirstOrThrow({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" }
  });
  const person = await prisma.contactPerson.findFirst({
    where: {
      tenantId: tenant.id,
      accountId: account.id
    },
    orderBy: { createdAt: "asc" }
  });

  await prisma.workItemEvent.deleteMany({
    where: {
      workItem: {
        tenantId: tenant.id,
        title: "Conversation verification order"
      }
    }
  });
  await prisma.workAssignment.deleteMany({
    where: {
      workItem: {
        tenantId: tenant.id,
        title: "Conversation verification order"
      }
    }
  });
  await prisma.operationalNote.deleteMany({
    where: {
      workItem: {
        tenantId: tenant.id,
        title: "Conversation verification order"
      }
    }
  });
  await prisma.workItem.deleteMany({
    where: {
      tenantId: tenant.id,
      title: "Conversation verification order"
    }
  });

  const workItem = await prisma.workItem.create({
    data: {
      tenantId: tenant.id,
      workType: WorkType.order,
      status: WorkItemStatus.assigned,
      title: "Conversation verification order",
      summary: "Entregar pedido de prueba con notas operativas",
      assignedUserId: warehouseUser.id,
      createdByUserId: warehouseUser.id,
      accountId: account.id,
      contactPersonId: person?.id ?? null,
      metadataJson: {
        vehicleLabel: "TRK-ALM-77",
        orderRef: "PED-CONV-77",
        routeRef: "R-CONV-77"
      }
    }
  });

  await prisma.workAssignment.create({
    data: {
      tenantId: tenant.id,
      workItemId: workItem.id,
      assignedUserId: warehouseUser.id,
      assignedByUserId: warehouseUser.id,
      status: WorkAssignmentStatus.active
    }
  });

  await prisma.operationalNote.create({
    data: {
      tenantId: tenant.id,
      type: "account_rule",
      workItemId: workItem.id,
      accountId: account.id,
      contactPersonId: person?.id ?? null,
      content: "Meliá descansa de 2 a 3 y prefiere entrega por la puerta lateral.",
      summary: "Entrega por puerta lateral y evitar 2-3 PM",
      createdByUserId: warehouseUser.id
    }
  });

  const detailResponse = await postConversationMessage(
    {
      tenantSlug: "demo-logistica",
      channel: "automation",
      provider: "verification-script",
      employeeCode: "ALM001",
      text: "detalle de mi trabajo"
    },
    `verify-assigned-work-detail-${Date.now()}`
  );

  const assistantMessage = String(detailResponse.assistantMessage ?? "");
  if (!assistantMessage.includes("Conversation verification order")) {
    throw new Error(`Expected work detail to include title, got: ${assistantMessage}`);
  }

  await postEmployeeEvent(
    {
      tenantSlug: "demo-logistica",
      channel: "automation",
      provider: "verification-script",
      employeeCode: "ALM001",
      eventType: "warehouse.loading",
      payload: {
        vehicleLabel: "TRK-ALM-77",
        boxCount: 24,
        weightKg: 1200
      }
    },
    `verify-warehouse-loading-sync-${Date.now()}`
  );

  const afterLoading = await prisma.workItem.findUniqueOrThrow({
    where: { id: workItem.id }
  });
  if (afterLoading.status !== WorkItemStatus.acknowledged) {
    throw new Error(
      `Expected work item to become acknowledged after warehouse.loading, got ${afterLoading.status}`
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        workItemId: workItem.id,
        conversationIntent: detailResponse.intent,
        afterLoadingStatus: afterLoading.status,
        assistantMessage
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
