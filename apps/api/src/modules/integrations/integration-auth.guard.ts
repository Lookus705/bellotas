import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.header("x-api-key");

    if (!apiKey) {
      throw new UnauthorizedException("Missing x-api-key");
    }

    const keyHash = createHash("sha256").update(apiKey).digest("hex");
    const integration = await this.prisma.integrationApiKey.findUnique({
      where: { keyHash },
      include: { tenant: true }
    });

    if (!integration || !integration.isActive) {
      throw new ForbiddenException("Invalid integration credentials");
    }

    await this.prisma.integrationApiKey.update({
      where: { id: integration.id },
      data: { lastUsedAt: new Date() }
    });

    request.integrationAuth = {
      tenantId: integration.tenantId,
      tenantSlug: integration.tenant.slug,
      integrationId: integration.id,
      integrationName: integration.name,
      scopes: integration.scopes
    };

    return true;
  }
}
