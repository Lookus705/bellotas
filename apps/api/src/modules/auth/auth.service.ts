import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../common/prisma.service";
import * as argon2 from "argon2";
import { createHash, randomUUID } from "crypto";
import { AuditService } from "../audit/audit.service";
import { UserRole } from "@prisma/client";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService
  ) {}

  async loginWeb(tenantSlug: string, employeeCode: string, pin: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_employeeCode: {
          tenantId: tenant.id,
          employeeCode
        }
      },
      include: { roles: true }
    });

    if (!user || !(await argon2.verify(user.pinHash, pin))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const roles = user.roles.map((role) => role.role);
    if (
      !roles.some(
        (role) => role === UserRole.manager || role === UserRole.rrhh || role === UserRole.admin
      )
    ) {
      throw new UnauthorizedException("Web access not allowed");
    }

    const tokens = await this.issueTokens(user.id, tenant.id, employeeCode, roles);

    await this.auditService.log({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "auth.web.login",
      targetType: "user",
      targetId: user.id
    });

    return {
      user: {
        id: user.id,
        tenantId: tenant.id,
        fullName: user.fullName,
        employeeCode: user.employeeCode,
        roles
      },
      ...tokens
    };
  }

  async issueTokens(userId: string, tenantId: string, employeeCode: string, roles: UserRole[]) {
    const accessToken = await this.jwtService.signAsync(
      { userId, tenantId, employeeCode, roles },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: "15m" }
    );
    const refreshToken = randomUUID();
    const refreshTokenHash = createHash("sha256").update(refreshToken).digest("hex");

    await this.prisma.webSession.create({
      data: {
        tenantId,
        userId,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
      }
    });

    return { accessToken, refreshToken };
  }

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true, tenant: true }
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
      fullName: user.fullName,
      employeeCode: user.employeeCode,
      roles: user.roles.map((role) => role.role)
    };
  }

  async validateTelegramLogin(
    tenantSlug: string,
    employeeCode: string,
    pin: string,
    telegramUserId: string,
    telegramChatId: string
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_employeeCode: {
          tenantId: tenant.id,
          employeeCode
        }
      },
      include: { roles: true }
    });

    if (!user || !(await argon2.verify(user.pinHash, pin))) {
      throw new UnauthorizedException("Codigo o PIN invalido");
    }

    const existing = await this.prisma.telegramLink.findFirst({
      where: {
        tenantId: tenant.id,
        telegramUserId
      }
    });

    if (existing) {
      await this.prisma.telegramLink.update({
        where: { id: existing.id },
        data: {
          userId: user.id,
          telegramChatId,
          revokedAt: null,
          lastSeenAt: new Date()
        }
      });
    } else {
      await this.prisma.telegramLink.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          telegramUserId,
          telegramChatId,
          lastSeenAt: new Date()
        }
      });
    }

    await this.auditService.log({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "auth.telegram.linked",
      targetType: "telegram_link",
      targetId: user.id,
      meta: { telegramUserId }
    });

    return {
      tenant,
      user: {
        id: user.id,
        fullName: user.fullName,
        roles: user.roles.map((role) => role.role)
      }
    };
  }

  async getTelegramUserByLink(tenantSlug: string, telegramUserId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const link = await this.prisma.telegramLink.findFirst({
      where: {
        tenantId: tenant.id,
        telegramUserId,
        revokedAt: null
      },
      include: {
        user: { include: { roles: true } }
      }
    });

    if (!link) {
      return null;
    }

    await this.prisma.telegramLink.update({
      where: { id: link.id },
      data: { lastSeenAt: new Date() }
    });

    return {
      tenant,
      user: {
        id: link.user.id,
        tenantId: tenant.id,
        fullName: link.user.fullName,
        employeeCode: link.user.employeeCode,
        roles: link.user.roles.map((role) => role.role)
      }
    };
  }
}
