import { Prisma, PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? "1025"),
  secure: false
});

async function sendTelegram(recipient: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`${process.env.TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: recipient,
      text
    })
  });
}

async function processPendingNotifications() {
  let pending: Prisma.IncidentNotificationGetPayload<{
    include: { incident: true };
  }>[];
  try {
    pending = await prisma.incidentNotification.findMany({
      where: { status: "pending" },
      include: { incident: true }
    });
  } catch (error) {
    console.error("worker waiting for migrated database", error);
    return;
  }

  for (const notification of pending) {
    try {
      const text = `[${notification.incident.severity.toUpperCase()}] ${notification.incident.title}: ${notification.incident.description}`;
      if (notification.channel === "email") {
        await transporter.sendMail({
          from: process.env.SMTP_FROM,
          to: notification.recipient,
          subject: `Alerta de incidencia ${notification.incident.severity}`,
          text
        });
      }

      if (notification.channel === "telegram") {
        await sendTelegram(notification.recipient, text);
      }

      await prisma.incidentNotification.update({
        where: { id: notification.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          errorText: null
        }
      });
    } catch (error) {
      await prisma.incidentNotification.update({
        where: { id: notification.id },
        data: {
          status: "failed",
          errorText: error instanceof Error ? error.message : "unknown error"
        }
      });
    }
  }
}

async function bootstrap() {
  await prisma.$connect();
  setInterval(() => {
    void processPendingNotifications();
  }, 5000);
  await processPendingNotifications();
}

void bootstrap();
