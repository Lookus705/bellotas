import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { ConversationModule } from "../conversation/conversation.module";
import { CanonicalIngressModule } from "../canonical-ingress/canonical-ingress.module";
import { OperationsModule } from "../operations/operations.module";
import { PayrollModule } from "../payroll/payroll.module";
import { PrismaModule } from "../../common/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { StorageModule } from "../storage/storage.module";
import { RemindersModule } from "../reminders/reminders.module";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";

@Module({
  imports: [
    AuthModule,
    ConversationModule,
    AiModule,
    CanonicalIngressModule,
    OperationsModule,
    PayrollModule,
    PrismaModule,
    SettingsModule,
    StorageModule,
    RemindersModule
  ],
  controllers: [TelegramController],
  providers: [TelegramService]
})
export class TelegramModule {}
