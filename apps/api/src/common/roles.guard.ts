import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { ROLES_KEY } from "./roles.decorator";
import { AuthUser } from "./auth.types";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { authUser?: AuthUser }>();
    const authUser = request.authUser;

    if (!authUser) {
      throw new ForbiddenException("Missing authenticated user");
    }

    const allowed = requiredRoles.some((role) => authUser.roles.includes(role as never));
    if (!allowed) {
      throw new ForbiddenException("Insufficient role");
    }

    return true;
  }
}
