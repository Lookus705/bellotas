import { Body, Controller, Param, Post } from "@nestjs/common";
import { TelegramService } from "./telegram.service";

@Controller("telegram")
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post("webhook/:tenantSlug")
  webhook(@Param("tenantSlug") tenantSlug: string, @Body() body: any) {
    return this.telegramService.handleWebhook(tenantSlug, body);
  }
}
