import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { OperationalNoteType, WorkType } from "@prisma/client";
import { CurrentUser } from "../../common/current-user.decorator";
import { AuthUser } from "../../common/auth.types";
import { AuthGuard } from "../../common/auth.guard";
import { RolesGuard } from "../../common/roles.guard";
import { Roles } from "../../common/roles.decorator";
import { WorkItemsService } from "./work-items.service";

@Controller("work-items")
@UseGuards(AuthGuard, RolesGuard)
@Roles("manager", "admin")
export class WorkItemsController {
  constructor(private readonly workItemsService: WorkItemsService) {}

  @Get("context/options")
  getWorkItemContextOptions(@CurrentUser() authUser: AuthUser) {
    return this.workItemsService.getContextOptions(authUser.tenantId);
  }

  @Get()
  listWorkItems(
    @CurrentUser() authUser: AuthUser,
    @Query("status") status?: string,
    @Query("workType") workType?: string,
    @Query("assignedUserId") assignedUserId?: string
  ) {
    return this.workItemsService.listWorkItems(authUser.tenantId, {
      status,
      workType: workType as WorkType | undefined,
      assignedUserId
    });
  }

  @Get(":workItemId")
  getWorkItem(@CurrentUser() authUser: AuthUser, @Param("workItemId") workItemId: string) {
    return this.workItemsService.getWorkItemDetail(authUser.tenantId, workItemId);
  }

  @Post()
  createWorkItem(
    @CurrentUser() authUser: AuthUser,
    @Body()
    body: {
      workType: WorkType;
      title: string;
      summary?: string;
      accountId?: string;
      contactPersonId?: string;
      assignedUserId?: string;
      targetAt?: string;
      metadata?: Record<string, unknown>;
      deliveryChannel?: string;
      deliveryProvider?: string;
    }
  ) {
    return this.workItemsService.createWorkItem(authUser.tenantId, authUser.userId, body);
  }

  @Post(":workItemId/assign")
  assignWorkItem(
    @CurrentUser() authUser: AuthUser,
    @Param("workItemId") workItemId: string,
    @Body()
    body: {
      assignedUserId: string;
      targetAt?: string;
      summary?: string;
      metadata?: Record<string, unknown>;
      deliveryChannel?: string;
      deliveryProvider?: string;
    }
  ) {
    return this.workItemsService.assignWorkItem(authUser.tenantId, authUser.userId, workItemId, body);
  }

  @Post(":workItemId/notes")
  addWorkItemNote(
    @CurrentUser() authUser: AuthUser,
    @Param("workItemId") workItemId: string,
    @Body()
    body: {
      content: string;
      title?: string;
      type?: OperationalNoteType;
      sourceMessageId?: string;
    }
  ) {
    return this.workItemsService.addWorkItemNote(authUser.tenantId, authUser.userId, workItemId, body);
  }

  @Post(":workItemId/notes/:noteId/promote")
  promoteWorkItemNote(
    @CurrentUser() authUser: AuthUser,
    @Param("workItemId") workItemId: string,
    @Param("noteId") noteId: string,
    @Body()
    body: {
      type?: OperationalNoteType;
      target?: "work_item" | "account" | "person";
      title?: string;
      summary?: string;
    }
  ) {
    return this.workItemsService.promoteNoteToMemory(
      authUser.tenantId,
      authUser.userId,
      workItemId,
      noteId,
      body
    );
  }
}
