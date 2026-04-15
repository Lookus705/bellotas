import { UserRole } from "@prisma/client";

export interface AuthUser {
  userId: string;
  tenantId: string;
  roles: UserRole[];
  employeeCode: string;
}
