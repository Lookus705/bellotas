import { IsNotEmpty, IsString } from "class-validator";

export class WebLoginDto {
  @IsString()
  @IsNotEmpty()
  tenantSlug!: string;

  @IsString()
  @IsNotEmpty()
  employeeCode!: string;

  @IsString()
  @IsNotEmpty()
  pin!: string;
}
