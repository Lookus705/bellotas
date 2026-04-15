import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthUser } from "./auth.types";

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.authUser;
});
