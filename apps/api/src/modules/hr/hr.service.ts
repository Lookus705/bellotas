import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { randomInt } from "crypto";

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async listEmployees(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      include: {
        roles: true,
        telegramLinks: {
          where: { revokedAt: null },
          orderBy: { linkedAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return users.map((user) => ({
      id: user.id,
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: user.roles.map((role) => role.role),
      telegramLinked: user.telegramLinks.length > 0,
      telegramLastSeenAt: user.telegramLinks[0]?.lastSeenAt ?? null,
      createdAt: user.createdAt
    }));
  }

  async createEmployee(params: {
    tenantId: string;
    actorUserId: string;
    actorRoles: UserRole[];
    employeeCode: string;
    fullName: string;
    email?: string;
    phone?: string;
    roles: UserRole[];
  }) {
    const existing = await this.prisma.user.findUnique({
      where: {
        tenantId_employeeCode: {
          tenantId: params.tenantId,
          employeeCode: params.employeeCode
        }
      }
    });

    if (existing) {
      throw new ForbiddenException("Ya existe un empleado con ese codigo");
    }

    this.assertAllowedRoles(params.actorRoles, params.roles);

    const temporaryPin = this.generateTemporaryPin();
    const pinHash = await argon2.hash(temporaryPin);
    const user = await this.prisma.user.create({
      data: {
        tenantId: params.tenantId,
        employeeCode: params.employeeCode,
        pinHash,
        mustChangePin: true,
        pinUpdatedAt: new Date(),
        fullName: params.fullName,
        email: params.email,
        phone: params.phone,
        roles: {
          create: params.roles.map((role) => ({
            tenantId: params.tenantId,
            role
          }))
        }
      },
      include: { roles: true }
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: "hr.employee.created",
      targetType: "user",
      targetId: user.id
    });

    return {
      id: user.id,
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      roles: user.roles.map((role) => role.role),
      status: user.status,
      temporaryPin
    };
  }

  async updateEmployee(params: {
    tenantId: string;
    actorUserId: string;
    actorRoles: UserRole[];
    userId: string;
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    status?: UserStatus;
    roles?: UserRole[];
  }) {
    const employee = await this.prisma.user.findFirst({
      where: { id: params.userId, tenantId: params.tenantId },
      include: { roles: true }
    });

    if (!employee) {
      throw new NotFoundException("Empleado no encontrado");
    }

    this.assertEmployeeIsManageable(params.actorRoles, employee.roles.map((role) => role.role));
    if (params.roles) {
      this.assertAllowedRoles(params.actorRoles, params.roles);
    }

    const data: {
      fullName?: string;
      email?: string | null;
      phone?: string | null;
      status?: UserStatus;
      mustChangePin?: boolean;
    } = {};

    if (params.fullName !== undefined) data.fullName = params.fullName;
    if (params.email !== undefined) data.email = params.email;
    if (params.phone !== undefined) data.phone = params.phone;
    if (params.status !== undefined) data.status = params.status;

    const updated = await this.prisma.user.update({
      where: { id: employee.id },
      data
    });

    if (params.roles) {
      await this.prisma.userRoleAssignment.deleteMany({
        where: { userId: employee.id }
      });
      await this.prisma.userRoleAssignment.createMany({
        data: params.roles.map((role) => ({
          tenantId: params.tenantId,
          userId: employee.id,
          role
        }))
      });
    }

    if (params.status === UserStatus.INACTIVE) {
      await this.prisma.telegramLink.updateMany({
        where: {
          tenantId: params.tenantId,
          userId: employee.id,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });

      await this.prisma.channelEndpoint.updateMany({
        where: {
          tenantId: params.tenantId,
          userId: employee.id,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });
    }

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: "hr.employee.updated",
      targetType: "user",
      targetId: updated.id
    });

    return this.prisma.user.findUnique({
      where: { id: updated.id },
      include: { roles: true }
    });
  }

  async resetEmployeePin(params: {
    tenantId: string;
    actorUserId: string;
    actorRoles: UserRole[];
    userId: string;
  }) {
    const employee = await this.prisma.user.findFirst({
      where: { id: params.userId, tenantId: params.tenantId },
      include: { roles: true }
    });

    if (!employee) {
      throw new NotFoundException("Empleado no encontrado");
    }

    this.assertEmployeeIsManageable(params.actorRoles, employee.roles.map((role) => role.role));

    const temporaryPin = this.generateTemporaryPin();
    await this.prisma.user.update({
      where: { id: employee.id },
      data: {
        pinHash: await argon2.hash(temporaryPin),
        mustChangePin: true,
        pinUpdatedAt: new Date()
      }
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: "hr.employee.pin_reset",
      targetType: "user",
      targetId: employee.id
    });

    return {
      userId: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      temporaryPin
    };
  }

  private generateTemporaryPin() {
    return String(randomInt(100000, 999999));
  }

  private assertAllowedRoles(actorRoles: UserRole[], requestedRoles: UserRole[]) {
    if (actorRoles.includes(UserRole.admin)) {
      return;
    }

    if (requestedRoles.includes(UserRole.admin)) {
      throw new ForbiddenException("No puedes asignar el rol admin");
    }
  }

  private assertEmployeeIsManageable(actorRoles: UserRole[], targetRoles: UserRole[]) {
    if (actorRoles.includes(UserRole.admin)) {
      return;
    }

    if (targetRoles.includes(UserRole.admin)) {
      throw new ForbiddenException("No puedes gestionar usuarios admin");
    }
  }
}
