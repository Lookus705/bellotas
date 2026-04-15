import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthUser } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { authUser?: AuthUser }>();
    const token = request.cookies?.access_token || request.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      throw new UnauthorizedException("Missing access token");
    }

    try {
      const payload = this.jwtService.verify<AuthUser>(token, {
        secret: process.env.JWT_ACCESS_SECRET
      });
      request.authUser = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
  }
}
