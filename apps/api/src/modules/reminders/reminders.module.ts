import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { RemindersService } from "./reminders.service";

@Module({
  imports: [AuditModule],
  providers: [RemindersService],
  exports: [RemindersService]
})
export class RemindersModule {}
