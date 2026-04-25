import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { WorkItemsController } from "./work-items.controller";
import { WorkItemsService } from "./work-items.service";

@Module({
  imports: [AiModule],
  controllers: [WorkItemsController],
  providers: [WorkItemsService],
  exports: [WorkItemsService]
})
export class WorkItemsModule {}
