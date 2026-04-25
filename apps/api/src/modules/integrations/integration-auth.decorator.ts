import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { IntegrationAuthContext } from "./integration-auth.types";

export const IntegrationAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IntegrationAuthContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.integrationAuth as IntegrationAuthContext;
  }
);
