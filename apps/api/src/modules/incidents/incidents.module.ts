import { Module } from "@nestjs/common";
import { IncidentsService } from "./incidents.service";

@Module({
  providers: [IncidentsService],
  exports: [IncidentsService]
})
export class IncidentsModule {}
