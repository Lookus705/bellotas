import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./common/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { TelegramModule } from "./modules/telegram/telegram.module";
import { ConversationModule } from "./modules/conversation/conversation.module";
import { AiModule } from "./modules/ai/ai.module";
import { OperationsModule } from "./modules/operations/operations.module";
import { IncidentsModule } from "./modules/incidents/incidents.module";
import { PayrollModule } from "./modules/payroll/payroll.module";
import { StorageModule } from "./modules/storage/storage.module";
import { ManagerModule } from "./modules/manager/manager.module";
import { AuditModule } from "./modules/audit/audit.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { HrModule } from "./modules/hr/hr.module";
import { RemindersModule } from "./modules/reminders/reminders.module";
import { CanonicalIngressModule } from "./modules/canonical-ingress/canonical-ingress.module";
import { WorkItemsModule } from "./modules/work-items/work-items.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    PrismaModule,
    AuditModule,
    StorageModule,
    SettingsModule,
    AuthModule,
    HrModule,
    RemindersModule,
    AiModule,
    ConversationModule,
    IncidentsModule,
    OperationsModule,
    PayrollModule,
    ManagerModule,
    WorkItemsModule,
    TelegramModule,
    IntegrationsModule,
    CanonicalIngressModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
