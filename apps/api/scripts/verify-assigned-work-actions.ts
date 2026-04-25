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

  await prisma.workItemEvent.deleteMany({
    where: {
      workItem: {
        tenantId: tenant.id,
        title: "Conversation state transition work"
      }
    }
  });
  await prisma.workAssignment.deleteMany({
    where: {
      workItem: {
        tenantId: tenant.id,
        title: "Conversation state transition work"
      }
    }
  });
  await prisma.operationalNote.deleteMany({
    where: {
      workItem: {
        tenantId: tenant.id,
        title: "Conversation state transition work"
      }
    }
  });
  await prisma.workItem.deleteMany({
    where: {
      tenantId: tenant.id,
      title: "Conversation state transition work"
    }
  });

  const workItem = await prisma.workItem.create({
    data: {
      tenantId: tenant.id,
      workType: WorkType.task,
      status: WorkItemStatus.assigned,
      title: "Conversation state transition work",
      summary: "Trabajo para validar recibido y completado por chat",
      assignedUserId: warehouseUser.id,
      createdByUserId: warehouseUser.id,
      metadataJson: {
        routeRef: "R-CONV-STATE-1"
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

  const detailResponse = await postConversationMessage(
    {
      tenantSlug: "demo-logistica",
      channel: "automation",
      provider: "verification-script",
      employeeCode: "ALM001",
      text: "detalle de mi trabajo"
    },
    `verify-work-detail-before-${Date.now()}`
  );

  if (detailResponse.intent !== "assigned_work_detail_query") {
    throw new Error(`Expected assigned_work_detail_query, got ${detailResponse.intent}`);
  }

  const acknowledgeResponse = await postConversationMessage(
    {
      tenantSlug: "demo-logistica",
      channel: "automation",
      provider: "verification-script",
      employeeCode: "ALM001",
      text: "trabajo recibido"
    },
    `verify-work-ack-${Date.now()}`
  );

  const afterAcknowledge = await prisma.workItem.findUniqueOrThrow({
    where: { id: workItem.id }
  });
  if (afterAcknowledge.status !== WorkItemStatus.acknowledged) {
    throw new Error(`Expected acknowledged after conversation, got ${afterAcknowledge.status}`);
  }

  const completeResponse = await postConversationMessage(
    {
      tenantSlug: "demo-logistica",
      channel: "automation",
      provider: "verification-script",
      employeeCode: "ALM001",
      text: "trabajo completado"
    },
    `verify-work-complete-${Date.now()}`
  );

  const afterComplete = await prisma.workItem.findUniqueOrThrow({
    where: { id: workItem.id }
  });
  if (afterComplete.status !== WorkItemStatus.completed) {
    throw new Error(`Expected completed after conversation, got ${afterComplete.status}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        workItemId: workItem.id,
        detailIntent: detailResponse.intent,
        acknowledgeIntent: acknowledgeResponse.intent,
        completeIntent: completeResponse.intent,
        acknowledgeMessage: acknowledgeResponse.assistantMessage,
        completeMessage: completeResponse.assistantMessage,
        afterAcknowledgeStatus: afterAcknowledge.status,
        afterCompleteStatus: afterComplete.status
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
