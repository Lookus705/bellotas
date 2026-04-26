import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UploadPayrollDto {
  @IsString()
  @IsNotEmpty()
  employeeCode!: string;

  @IsString()
  @IsNotEmpty()
  periodYear!: string;

  @IsString()
  @IsNotEmpty()
  periodMonth!: string;
}

export class PayrollDispatchDto {
  @IsString()
  @IsNotEmpty()
  periodYear!: string;

  @IsString()
  @IsNotEmpty()
  periodMonth!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  payrollIds?: string[];
}
