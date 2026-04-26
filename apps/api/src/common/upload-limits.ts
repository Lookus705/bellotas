import { BadRequestException } from "@nestjs/common";

export const documentUploadOptions = {
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (
    _request: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void
  ) => {
    const allowedMimeTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/png"
    ]);

    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new BadRequestException("Tipo de archivo no permitido"), false);
      return;
    }

    callback(null, true);
  }
};

export const payrollUploadOptions = {
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (
    _request: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void
  ) => {
    if (file.mimetype !== "application/pdf") {
      callback(new BadRequestException("La nomina debe ser un PDF"), false);
      return;
    }

    callback(null, true);
  }
};
