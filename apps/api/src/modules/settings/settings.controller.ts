import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { AuthUser } from "../../common/auth.types";
import { AuthGuard } from "../../common/auth.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { documentUploadOptions } from "../../common/upload-limits";
import { UpdateSettingsDto, UploadDocumentDto } from "./settings.dto";
import { SettingsService } from "./settings.service";

@Controller("settings")
@UseGuards(AuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles("admin")
  getSettings(@CurrentUser() authUser: AuthUser) {
    return this.settingsService.getSettings(authUser.tenantId);
  }

  @Put()
  @Roles("admin")
  updateSettings(
    @CurrentUser() authUser: AuthUser,
    @Body() body: UpdateSettingsDto
  ) {
    return this.settingsService.updateSettings(authUser.tenantId, authUser.userId, body);
  }

  @Get("documents")
  @Roles("manager", "rrhh", "admin")
  listDocuments(@CurrentUser() authUser: AuthUser, @Query("area") area?: string) {
    return this.settingsService.listDocuments(authUser.tenantId, authUser.roles, area);
  }

  @Post("documents/upload")
  @Roles("manager", "rrhh", "admin")
  @UseInterceptors(FileInterceptor("file", documentUploadOptions))
  uploadDocument(
    @CurrentUser() authUser: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadDocumentDto
  ) {
    if (!file) {
      throw new BadRequestException("Debes adjuntar un archivo");
    }
    if (!body.title?.trim()) {
      throw new BadRequestException("El documento necesita un titulo");
    }
    if (!body.category?.trim()) {
      throw new BadRequestException("El documento necesita una categoria");
    }
    if (!body.area?.trim()) {
      throw new BadRequestException("El documento necesita un area");
    }

    return this.settingsService.uploadDocument({
      tenantId: authUser.tenantId,
      uploadedByUserId: authUser.userId,
      actorRoles: authUser.roles,
      area: body.area.trim(),
      category: body.category.trim(),
      title: body.title.trim(),
      description: body.description,
      useForAi: body.useForAi === true || body.useForAi === "true",
      fileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer
    });
  }

  @Get("documents/:documentId/download")
  @Roles("manager", "rrhh", "admin")
  async downloadDocument(
    @CurrentUser() authUser: AuthUser,
    @Param("documentId") documentId: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const { file, buffer } = await this.settingsService.downloadDocument(
      authUser.tenantId,
      authUser.roles,
      documentId
    );
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", `inline; filename="${file.originalName}"`);
    return new StreamableFile(buffer);
  }
}
