import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma.module";
import { AiModule } from "../ai/ai.module";
import { AuditModule } from "../audit/audit.module";
import { ConversationModule } from "../conversation/conversation.module";
import { CanonicalIngressModule } from "../canonical-ingress/canonical-ingress.module";
import { OperationsModule } from "../operations/operations.module";
import { PayrollModule } from "../payroll/payroll.module";
import { WorkItemsModule } from "../work-items/work-items.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationAuthGuard } from "./integration-auth.guard";
import { IntegrationsService } from "./integrations.service";

@Module({
  imports: [
    PrismaModule,
    AiModule,
    AuditModule,
    ConversationModule,
    CanonicalIngressModule,
    OperationsModule,
    PayrollModule,
    WorkItemsModule
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationAuthGuard]
})
export class IntegrationsModule {}
