import { Body, Controller, Headers, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { IntegrationAuth } from "../integrations/integration-auth.decorator";
import { IntegrationAuthGuard } from "../integrations/integration-auth.guard";
import { IntegrationAuthContext } from "../integrations/integration-auth.types";
import { CustomerMessagesService } from "./customer-messages.service";
import { DocumentsIngressService } from "./documents-ingress.service";
import { EmailEventsService } from "./email-events.service";
import { EmployeeEventsService } from "./employee-events.service";
import { ErpEventsService } from "./erp-events.service";

class FileDto {
  @IsString()
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsString()
  base64Content!: string;
}

class EmployeeEventsDto {
  @IsString()
  channel!: string;

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  externalEventId?: string;

  @IsOptional()
  @IsString()
  endpointExternalId?: string;

  @IsString()
  employeeCode!: string;

  @IsString()
  eventType!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  timestamp?: string;
}

class AccountHintsDto {
  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

class PersonHintsDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  alias?: string;
}

class MessageDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;
}

class CustomerMessagesDto {
  @IsString()
  channel!: string;

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  externalEventId?: string;

  @IsString()
  endpointExternalId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccountHintsDto)
  accountHints?: AccountHintsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonHintsDto)
  personHints?: PersonHintsDto;

  @ValidateNested()
  @Type(() => MessageDto)
  message!: MessageDto;

  @IsOptional()
  @IsArray()
  attachments?: FileDto[];

  @IsOptional()
  @IsString()
  timestamp?: string;
}

class EmailEventsDto {
  @IsString()
  channel!: string;

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  externalEventId?: string;

  @IsString()
  endpointExternalId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccountHintsDto)
  accountHints?: AccountHintsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonHintsDto)
  personHints?: PersonHintsDto;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  attachments?: FileDto[];

  @IsOptional()
  @IsString()
  timestamp?: string;
}

class ErpEventsDto {
  @IsString()
  channel!: string;

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  externalEventId?: string;

  @IsString()
  entityType!: string;

  @IsString()
  eventType!: string;

  @IsString()
  externalId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccountHintsDto)
  accountHints?: AccountHintsDto;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  timestamp?: string;
}

class CanonicalDocumentDto {
  @IsString()
  sourceType!: string;

  @IsString()
  channel!: string;

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  externalEventId?: string;

  @IsOptional()
  @IsString()
  endpointExternalId?: string;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccountHintsDto)
  accountHints?: AccountHintsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonHintsDto)
  personHints?: PersonHintsDto;

  @IsString()
  area!: string;

  @IsString()
  category!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  useForAi?: boolean;

  @ValidateNested()
  @Type(() => FileDto)
  file!: FileDto;
}

@Controller()
@UseGuards(IntegrationAuthGuard)
export class CanonicalIngressController {
  constructor(
    private readonly employeeEventsService: EmployeeEventsService,
    private readonly customerMessagesService: CustomerMessagesService,
    private readonly emailEventsService: EmailEventsService,
    private readonly erpEventsService: ErpEventsService,
    private readonly documentsIngressService: DocumentsIngressService
  ) {}

  @Post("employee-events")
  employeeEvents(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: EmployeeEventsDto
  ) {
    return this.employeeEventsService.ingest(auth, idempotencyKey, body);
  }

  @Post("customer-messages")
  customerMessages(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: CustomerMessagesDto
  ) {
    return this.customerMessagesService.ingest(auth, idempotencyKey, body);
  }

  @Post("email-events")
  emailEvents(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: EmailEventsDto
  ) {
    return this.emailEventsService.ingest(auth, idempotencyKey, body);
  }

  @Post("erp-events")
  erpEvents(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: ErpEventsDto
  ) {
    return this.erpEventsService.ingest(auth, idempotencyKey, body);
  }

  @Post("documents")
  documents(
    @IntegrationAuth() auth: IntegrationAuthContext,
    @Headers("x-idempotency-key") idempotencyKey: string,
    @Body() body: CanonicalDocumentDto
  ) {
    return this.documentsIngressService.ingest(auth, idempotencyKey, body);
  }
}
