import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { ConversationModule } from "../conversation/conversation.module";
import { OperationsModule } from "../operations/operations.module";
import { PayrollModule } from "../payroll/payroll.module";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";

@Module({
  imports: [AuthModule, ConversationModule, AiModule, OperationsModule, PayrollModule],
  controllers: [TelegramController],
  providers: [TelegramService]
})
export class TelegramModule {}
