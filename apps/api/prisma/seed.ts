import { PrismaClient, UserRole, Severity } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-logistica" },
    update: {},
    create: {
      name: "Demo Logistica",
      slug: "demo-logistica",
      timezone: "America/Santo_Domingo"
    }
  });

  const pinHash = await argon2.hash("1234");

  const demoUsers = [
    { employeeCode: "MGR001", fullName: "Manager Demo", roles: [UserRole.manager] },
    { employeeCode: "RRHH001", fullName: "RRHH Demo", roles: [UserRole.rrhh] },
    { employeeCode: "DRV001", fullName: "Chofer Demo", roles: [UserRole.chofer] },
    { employeeCode: "ALM001", fullName: "Almacen Demo", roles: [UserRole.almacenista] }
  ];

  for (const item of demoUsers) {
    const user = await prisma.user.upsert({
      where: {
        tenantId_employeeCode: {
          tenantId: tenant.id,
          employeeCode: item.employeeCode
        }
      },
      update: {
        pinHash,
        fullName: item.fullName
      },
      create: {
        tenantId: tenant.id,
        employeeCode: item.employeeCode,
        pinHash,
        fullName: item.fullName
      }
    });

    await prisma.userRoleAssignment.deleteMany({ where: { userId: user.id } });
    await prisma.userRoleAssignment.createMany({
      data: item.roles.map((role) => ({
        tenantId: tenant.id,
        userId: user.id,
        role
      }))
    });
  }

  await prisma.tenantAlertTarget.deleteMany({
    where: { tenantId: tenant.id }
  });

  await prisma.tenantAlertTarget.createMany({
    data: [
      {
        tenantId: tenant.id,
        incidentType: null,
        severityMin: Severity.high,
        channel: "email",
        targetValue: "alertas@demo-logistica.local"
      },
      {
        tenantId: tenant.id,
        incidentType: null,
        severityMin: Severity.high,
        channel: "telegram",
        targetValue: "123456789"
      }
    ]
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
