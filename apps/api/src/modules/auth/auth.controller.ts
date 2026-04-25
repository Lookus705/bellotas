import { Body, Controller, Get, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthService } from "./auth.service";
import { AuthGuard } from "../../common/auth.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { AuthUser } from "../../common/auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("web/login")
  async loginWeb(
    @Body() body: { tenantSlug: string; employeeCode: string; pin: string },
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.loginWeb(body.tenantSlug, body.employeeCode, body.pin);
    response.cookie("access_token", result.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    });
    response.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    });
    return { user: result.user };
  }

  @Post("web/logout")
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie("access_token");
    response.clearCookie("refresh_token");
    return { ok: true };
  }

  @Post("web/refresh")
  async refresh(@Res({ passthrough: true }) response: Response) {
    const refreshToken = response.req.cookies?.refresh_token;
    const result = await this.authService.refreshWebSession(refreshToken);
    response.cookie("access_token", result.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    });
    response.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    });
    return { user: result.user };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() authUser: AuthUser) {
    return this.authService.getUserProfile(authUser.userId);
  }
}
