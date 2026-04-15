import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AuthGuard } from "../../common/auth.guard";
import { RolesGuard } from "../../common/roles.guard";
import { Roles } from "../../common/roles.decorator";
import { CurrentUser } from "../../common/current-user.decorator";
import { AuthUser } from "../../common/auth.types";

@Controller("manager")
@UseGuards(AuthGuard, RolesGuard)
@Roles("manager", "admin")
export class ManagerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("driver-routes")
  getDriverRoutes(@CurrentUser() authUser: AuthUser, @Query("employeeCode") employeeCode?: string) {
    return this.prisma.driverRoute.findMany({
      where: {
        tenantId: authUser.tenantId,
        ...(employeeCode ? { driver: { employeeCode } } : {})
      },
      include: { driver: true, invoices: true },
      orderBy: { startedAt: "desc" }
    });
  }

  @Get("warehouse-pickings")
  getWarehousePickings(@CurrentUser() authUser: AuthUser) {
    return this.prisma.warehousePicking.findMany({
      where: { tenantId: authUser.tenantId },
      include: { worker: true },
      orderBy: { pickedAt: "desc" }
    });
  }

  @Get("truck-loadings")
  getTruckLoadings(@CurrentUser() authUser: AuthUser) {
    return this.prisma.truckLoading.findMany({
      where: { tenantId: authUser.tenantId },
      include: { worker: true },
      orderBy: { loadedAt: "desc" }
    });
  }

  @Get("incidents")
  getIncidents(
    @CurrentUser() authUser: AuthUser,
    @Query("severity") severity?: string,
    @Query("sourceType") sourceType?: string
  ) {
    return this.prisma.incident.findMany({
      where: {
        tenantId: authUser.tenantId,
        ...(severity ? { severity: severity as never } : {}),
        ...(sourceType ? { sourceType } : {})
      },
      include: { reportedBy: true, relatedRoute: true, notifications: true },
      orderBy: { createdAt: "desc" }
    });
  }
}
