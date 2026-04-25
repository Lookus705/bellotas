import { PrismaClient, UserRole, Severity } from "@prisma/client";
import * as argon2 from "argon2";
import { createHash } from "crypto";

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
    { employeeCode: "ADMIN001", fullName: "Admin Demo", roles: [UserRole.admin] },
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

  const apiKeyPlain = "bellotas-demo-n8n-key";
  const apiKeyHash = createHash("sha256").update(apiKeyPlain).digest("hex");

  await prisma.integrationApiKey.upsert({
    where: { keyHash: apiKeyHash },
    update: {
      tenantId: tenant.id,
      name: "n8n-demo",
      isActive: true,
      scopes: {
        set: [
          "employee_events",
          "customer_messages",
          "email_events",
          "erp_events",
          "documents",
          "check_in",
          "check_out",
          "incidents",
          "warehouse",
          "payroll:read",
          "conversation"
        ]
      }
    },
    create: {
      tenantId: tenant.id,
      name: "n8n-demo",
      keyHash: apiKeyHash,
      isActive: true,
      scopes: [
        "employee_events",
        "customer_messages",
        "email_events",
        "erp_events",
        "documents",
        "check_in",
        "check_out",
        "incidents",
        "warehouse",
        "payroll:read",
        "conversation"
      ]
    }
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {
      companyName: "Demo Logistica",
      businessProfile: "logistics",
      companyDescription: "Empresa de logistica, almacen y reparto con operacion guiada por Telegram.",
      companyTimezone: "America/Santo_Domingo",
      operationalHours: "Lunes a Sabado 6:00-18:00",
      responsibleName: "Manager Demo",
      responsibleEmail: "manager@demo-logistica.local",
      telegramEnabled: true,
      emailProvider: "smtp",
      outboundEmailFrom: "no-reply@demo-logistica.local",
      smtpHost: "mailhog",
      smtpPort: 1025,
      smtpUser: "",
      smtpPassword: "",
      aiProvider: "openai",
      aiModel: "gpt-4.1-mini",
      assistantInstructions: "Responde en espanol, tono operativo y claro. Si faltan datos, pide aclaracion antes de cerrar el reporte.",
      operationalInstructions: "Para rutas de chofer exige camion y kilometraje. Para incidencias graves prioriza accidente, averia, pinchada y frio.",
      hrInstructions: "Las consultas de nomina deben responder con el archivo PDF disponible y tono formal.",
      integrationNotes: "Preparado para integrar n8n como capa de automatizacion."
    },
    create: {
      tenantId: tenant.id,
      companyName: "Demo Logistica",
      businessProfile: "logistics",
      companyDescription: "Empresa de logistica, almacen y reparto con operacion guiada por Telegram.",
      companyTimezone: "America/Santo_Domingo",
      operationalHours: "Lunes a Sabado 6:00-18:00",
      responsibleName: "Manager Demo",
      responsibleEmail: "manager@demo-logistica.local",
      telegramEnabled: true,
      emailProvider: "smtp",
      outboundEmailFrom: "no-reply@demo-logistica.local",
      smtpHost: "mailhog",
      smtpPort: 1025,
      smtpUser: "",
      smtpPassword: "",
      aiProvider: "openai",
      aiModel: "gpt-4.1-mini",
      assistantInstructions: "Responde en espanol, tono operativo y claro. Si faltan datos, pide aclaracion antes de cerrar el reporte.",
      operationalInstructions: "Para rutas de chofer exige camion y kilometraje. Para incidencias graves prioriza accidente, averia, pinchada y frio.",
      hrInstructions: "Las consultas de nomina deben responder con el archivo PDF disponible y tono formal.",
      integrationNotes: "Preparado para integrar n8n como capa de automatizacion."
    }
  });

  const commercialAccount = await prisma.commercialAccount.upsert({
    where: {
      tenantId_externalRef: {
        tenantId: tenant.id,
        externalRef: "MELIA-COMPRAS"
      }
    },
    update: {
      name: "Hotel Melia"
    },
    create: {
      tenantId: tenant.id,
      externalRef: "MELIA-COMPRAS",
      name: "Hotel Melia"
    }
  });

  const contactPerson = await prisma.contactPerson.create({
    data: {
      tenantId: tenant.id,
      accountId: commercialAccount.id,
      fullName: "Pepe"
    }
  }).catch(async () => {
    return prisma.contactPerson.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        accountId: commercialAccount.id,
        fullName: "Pepe"
      }
    });
  });

  await prisma.channelEndpoint.upsert({
    where: {
      tenantId_channel_provider_endpointExternalId: {
        tenantId: tenant.id,
        channel: "telegram",
        provider: "telegram",
        endpointExternalId: "compras1-melia"
      }
    },
    update: {
      accountId: commercialAccount.id,
      currentPersonId: contactPerson.id,
      label: "compras1 de Melia",
      revokedAt: null
    },
    create: {
      tenantId: tenant.id,
      channel: "telegram",
      provider: "telegram",
      endpointExternalId: "compras1-melia",
      label: "compras1 de Melia",
      accountId: commercialAccount.id,
      currentPersonId: contactPerson.id
    }
  });

  console.log("Integration API key demo:", apiKeyPlain);
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
