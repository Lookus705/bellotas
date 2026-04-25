import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import { AuthUser } from "../../common/auth.types";
import { AuthGuard } from "../../common/auth.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { HrService } from "./hr.service";

@Controller("hr")
@UseGuards(AuthGuard, RolesGuard)
@Roles("manager", "rrhh", "admin")
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Get("employees")
  listEmployees(@CurrentUser() authUser: AuthUser) {
    return this.hrService.listEmployees(authUser.tenantId);
  }

  @Post("employees")
  createEmployee(
    @CurrentUser() authUser: AuthUser,
    @Body()
    body: {
      employeeCode: string;
      fullName: string;
      email?: string;
      phone?: string;
      roles: UserRole[];
    }
  ) {
    return this.hrService.createEmployee({
      tenantId: authUser.tenantId,
      actorUserId: authUser.userId,
      actorRoles: authUser.roles,
      employeeCode: body.employeeCode,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      roles: body.roles
    });
  }

  @Patch("employees/:userId")
  updateEmployee(
    @CurrentUser() authUser: AuthUser,
    @Param("userId") userId: string,
    @Body()
    body: {
      fullName?: string;
      email?: string | null;
      phone?: string | null;
      status?: UserStatus;
      roles?: UserRole[];
    }
  ) {
    return this.hrService.updateEmployee({
      tenantId: authUser.tenantId,
      actorUserId: authUser.userId,
      actorRoles: authUser.roles,
      userId,
      ...body
    });
  }

  @Post("employees/:userId/reset-pin")
  resetPin(@CurrentUser() authUser: AuthUser, @Param("userId") userId: string) {
    return this.hrService.resetEmployeePin({
      tenantId: authUser.tenantId,
      actorUserId: authUser.userId,
      actorRoles: authUser.roles,
      userId
    });
  }
}
