import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { PayrollService } from "./payroll.service";
import { AuthGuard } from "../../common/auth.guard";
import { RolesGuard } from "../../common/roles.guard";
import { Roles } from "../../common/roles.decorator";
import { CurrentUser } from "../../common/current-user.decorator";
import { AuthUser } from "../../common/auth.types";

@Controller("payroll")
@UseGuards(AuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post("upload")
  @Roles("rrhh", "admin")
  @UseInterceptors(FileInterceptor("file"))
  uploadPayroll(
    @CurrentUser() authUser: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { employeeCode: string; periodYear: string; periodMonth: string }
  ) {
    if (!file) {
      throw new BadRequestException("Debes adjuntar un archivo de nomina");
    }
    if (!body.employeeCode?.trim()) {
      throw new BadRequestException("El codigo de empleado es obligatorio");
    }
    const periodYear = this.parsePeriodYear(body.periodYear);
    const periodMonth = this.parsePeriodMonth(body.periodMonth);

    return this.payrollService.uploadPayroll({
      tenantId: authUser.tenantId,
      uploadedByUserId: authUser.userId,
      employeeCode: body.employeeCode.trim(),
      periodYear,
      periodMonth,
      fileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer
    });
  }

  @Get()
  @Roles("rrhh", "admin")
  listPayrolls(@CurrentUser() authUser: AuthUser) {
    return this.payrollService.listPayrolls(authUser.tenantId);
  }

  @Post("dispatch")
  @Roles("rrhh", "admin")
  dispatchPayrolls(
    @CurrentUser() authUser: AuthUser,
    @Body() body: { periodYear: string; periodMonth: string; payrollIds?: string[] }
  ) {
    const periodYear = this.parsePeriodYear(body.periodYear);
    const periodMonth = this.parsePeriodMonth(body.periodMonth);

    return this.payrollService.dispatchPayrolls({
      tenantId: authUser.tenantId,
      actorUserId: authUser.userId,
      periodYear,
      periodMonth,
      payrollIds: body.payrollIds
    });
  }

  @Post("dispatch/validate")
  @Roles("rrhh", "admin")
  validateDispatchPayrolls(
    @CurrentUser() authUser: AuthUser,
    @Body() body: { periodYear: string; periodMonth: string; payrollIds?: string[] }
  ) {
    const periodYear = this.parsePeriodYear(body.periodYear);
    const periodMonth = this.parsePeriodMonth(body.periodMonth);

    return this.payrollService.validatePayrollDispatch({
      tenantId: authUser.tenantId,
      periodYear,
      periodMonth,
      payrollIds: body.payrollIds
    });
  }

  private parsePeriodYear(value: string) {
    const periodYear = Number(value);
    if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) {
      throw new BadRequestException("El ano de nomina no es valido");
    }
    return periodYear;
  }

  private parsePeriodMonth(value: string) {
    const periodMonth = Number(value);
    if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
      throw new BadRequestException("El mes de nomina no es valido");
    }
    return periodMonth;
  }
}
