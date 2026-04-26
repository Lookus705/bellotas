import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { AuthGuard } from "../../common/auth.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { AuthUser } from "../../common/auth.types";
import { WebLoginDto } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("web/login")
  async loginWeb(
    @Body() body: WebLoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.loginWeb(
      body.tenantSlug.trim(),
      body.employeeCode.trim(),
      body.pin
    );
    response.cookie("access_token", result.accessToken, this.cookieOptions());
    response.cookie("refresh_token", result.refreshToken, this.cookieOptions());
    return { user: result.user };
  }

  @Post("web/logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.authService.logoutWeb(request.cookies?.refresh_token);
    response.clearCookie("access_token", this.cookieOptions());
    response.clearCookie("refresh_token", this.cookieOptions());
    return { ok: true };
  }

  @Post("web/refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const refreshToken = request.cookies?.refresh_token;
    const result = await this.authService.refreshWebSession(refreshToken);
    response.cookie("access_token", result.accessToken, this.cookieOptions());
    response.cookie("refresh_token", result.refreshToken, this.cookieOptions());
    return { user: result.user };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() authUser: AuthUser) {
    return this.authService.getUserProfile(authUser.userId);
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.useSecureCookies()
    };
  }

  private useSecureCookies() {
    return process.env.NODE_ENV === "production";
  }
}
