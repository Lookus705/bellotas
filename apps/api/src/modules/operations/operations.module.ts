import { Module } from "@nestjs/common";
import { IncidentsModule } from "../incidents/incidents.module";
import { OperationsService } from "./operations.service";

@Module({
  imports: [IncidentsModule],
  providers: [OperationsService],
  exports: [OperationsService]
})
export class OperationsModule {}
