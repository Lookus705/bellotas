import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { IsArray, IsBase64, IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { IntegrationAuth } from "./integration-auth.decorator";
import { IntegrationAuthGuard } from "./integration-auth.guard";
import { IntegrationAuthContext } from "./integration-auth.types";
import { IntegrationsService } from "./integrations.service";

class CheckInDto {
  @IsString()
  employeeCode!: string;

  @IsString()
  vehicleLabel!: string;

  @IsNumber()
  odometer!: number;

  @IsOptional()
  @IsString()
  channel?: string;
}

class CheckOutDto {
  @IsString()
  employeeCode!: string;

  @IsNumber()
  odometer!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoices?: string[];
}

class IncidentDto {
  @IsString()
  employeeCode!: string;

  @IsIn(["driver", "warehouse"])
  sourceType!: "driver" | "warehouse";

  @IsString()
  incidentType!: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsIn(["low", "medium", "high", "critical"])
  severity?: "low" | "medium" | "high" | "critical";
}

class WarehousePickingDto {
  @IsString()
  employeeCode!: string;

  @IsString()
  orderRef!: string;

  @IsOptional()
  @IsString()
  routeRef?: string;

  @IsOptional()
  @IsString()
  vehicleLabel?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  channel?: string;
}

class WarehouseLoadingDto {
  @IsString()
  employeeCode!: string;

  @IsString()
  vehicleLabel!: string;

  @IsOptional()
  @IsNumber()
  boxCount?: number;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  channel?: string;
}

class ConversationMessageDto {
  @IsString()
  employeeCode!: string;

  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  channel?: string;
}

class ConversationAudioDto {
  @IsString()
  employeeCode!: string;

  @IsBase64()
  base64Audio!: string;

  @IsOptional()
  @IsString()
  channel?: string;
}

@Controller("integrations")
@UseGuards(IntegrationAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post("check-in")
  driverCheckIn(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: CheckInDto
  ) {
    return this.integrationsService.driverCheckIn(auth, idempotencyKey, body);
  }

  @Post("check-out")
  driverCheckOut(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: CheckOutDto
  ) {
    return this.integrationsService.driverCheckOut(auth, idempotencyKey, body);
  }

  @Post("incidents")
  registerIncident(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: IncidentDto
  ) {
    return this.integrationsService.registerIncident(auth, idempotencyKey, body);
  }

  @Post("warehouse/picking")
  warehousePicking(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: WarehousePickingDto
  ) {
    return this.integrationsService.warehousePicking(auth, idempotencyKey, body);
  }

  @Post("warehouse/loading")
  warehouseLoading(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: WarehouseLoadingDto
  ) {
    return this.integrationsService.warehouseLoading(auth, idempotencyKey, body);
  }

  @Get("operational/employee/:employeeCode")
  getEmployee(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Param("employeeCode") employeeCode: string
  ) {
    return this.integrationsService.getEmployee(auth, employeeCode);
  }

  @Get("payroll/:employeeCode/latest")
  payrollQuery(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Param("employeeCode") employeeCode: string
  ) {
    return this.integrationsService.payrollQuery(auth, employeeCode);
  }

  @Post("conversation/message")
  conversationMessage(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: ConversationMessageDto
  ) {
    return this.integrationsService.conversationMessage(auth, idempotencyKey, body);
  }

  @Post("conversation/audio")
  conversationAudio(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: ConversationAudioDto
  ) {
    return this.integrationsService.conversationAudio(auth, idempotencyKey, body);
  }
}
