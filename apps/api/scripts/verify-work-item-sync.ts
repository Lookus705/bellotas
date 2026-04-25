import { PrismaClient, WorkItemStatus, WorkType } from "@prisma/client";

const prisma = new PrismaClient();

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
  const driver = await prisma.user.findUniqueOrThrow({
    where: {
      tenantId_employeeCode: {
        tenantId: tenant.id,
        employeeCode: "DRV001"
      }
    }
  });

  await prisma.driverInvoice.deleteMany({
    where: {
      route: {
        tenantId: tenant.id,
        driverUserId: driver.id
      }
    }
  });
  await prisma.driverRoute.deleteMany({
    where: {
      tenantId: tenant.id,
      driverUserId: driver.id
    }
  });
  await prisma.workItemEvent.deleteMany({
    where: {
      workItem: {
        tenantId: tenant.id,
        title: "Sync verification route"
      }
    }
  });
  await prisma.workAssignment.deleteMany({
    where: {
      workItem: {
        tenantId: tenant.id,
        title: "Sync verification route"
      }
    }
  });
  await prisma.operationalNote.deleteMany({
    where: {
      workItem: {
        tenantId: tenant.id,
        title: "Sync verification route"
      }
    }
  });
  await prisma.workItem.deleteMany({
    where: {
      tenantId: tenant.id,
      title: "Sync verification route"
    }
  });

  const workItem = await prisma.workItem.create({
    data: {
      tenantId: tenant.id,
      workType: WorkType.route,
      status: WorkItemStatus.assigned,
      title: "Sync verification route",
      summary: "Should sync with route lifecycle",
      assignedUserId: driver.id,
      createdByUserId: driver.id
    }
  });

  await prisma.workAssignment.create({
    data: {
      tenantId: tenant.id,
      workItemId: workItem.id,
      assignedUserId: driver.id,
      assignedByUserId: driver.id
    }
  });

  await postEmployeeEvent(
    {
      tenantSlug: "demo-logistica",
      channel: "automation",
      provider: "verification-script",
      employeeCode: "DRV001",
      eventType: "route.start",
      payload: {
        vehicleLabel: "TRK-SYNC",
        odometer: 101010
      }
    },
    `verify-work-item-start-${Date.now()}`
  );

  const afterStart = await prisma.workItem.findUniqueOrThrow({
    where: { id: workItem.id }
  });
  if (afterStart.status !== WorkItemStatus.acknowledged) {
    throw new Error(
      `Expected work item to become acknowledged after route.start, got ${afterStart.status}`
    );
  }

  await postEmployeeEvent(
    {
      tenantSlug: "demo-logistica",
      channel: "automation",
      provider: "verification-script",
      employeeCode: "DRV001",
      eventType: "route.end",
      payload: {
        odometer: 101111,
        invoices: []
      }
    },
    `verify-work-item-end-${Date.now()}`
  );

  const afterEnd = await prisma.workItem.findUniqueOrThrow({
    where: { id: workItem.id }
  });
  if (afterEnd.status !== WorkItemStatus.completed) {
    throw new Error(
      `Expected work item to become completed after route.end, got ${afterEnd.status}`
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        workItemId: workItem.id,
        statusAfterStart: afterStart.status,
        statusAfterEnd: afterEnd.status
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
