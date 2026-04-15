import {
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
    return this.payrollService.uploadPayroll({
      tenantId: authUser.tenantId,
      uploadedByUserId: authUser.userId,
      employeeCode: body.employeeCode,
      periodYear: Number(body.periodYear),
      periodMonth: Number(body.periodMonth),
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
}
