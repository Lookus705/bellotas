import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AiModule } from "../ai/ai.module";
import { ConversationModule } from "../conversation/conversation.module";
import { OperationsModule } from "../operations/operations.module";
import { PayrollModule } from "../payroll/payroll.module";
import { RemindersModule } from "../reminders/reminders.module";
import { StorageModule } from "../storage/storage.module";
import { WorkItemsModule } from "../work-items/work-items.module";
import { CanonicalIngressController } from "./canonical-ingress.controller";
import { CanonicalIngressSupportService } from "./canonical-ingress.support";
import { CustomerMessagesService } from "./customer-messages.service";
import { DocumentsIngressService } from "./documents-ingress.service";
import { EmailEventsService } from "./email-events.service";
import { EmployeeEventsService } from "./employee-events.service";
import { ErpEventsService } from "./erp-events.service";

@Module({
  imports: [
    AuditModule,
    AiModule,
    ConversationModule,
    OperationsModule,
    PayrollModule,
    RemindersModule,
    StorageModule,
    WorkItemsModule
  ],
  controllers: [CanonicalIngressController],
  providers: [
    CanonicalIngressSupportService,
    EmployeeEventsService,
    CustomerMessagesService,
    EmailEventsService,
    ErpEventsService,
    DocumentsIngressService
  ],
  exports: [
    CanonicalIngressSupportService,
    EmployeeEventsService,
    CustomerMessagesService,
    EmailEventsService,
    ErpEventsService,
    DocumentsIngressService
  ]
})
export class CanonicalIngressModule {}
