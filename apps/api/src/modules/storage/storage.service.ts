import { Injectable } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { PrismaService } from "../../common/prisma.service";
import { FileKind } from "@prisma/client";
import { NotFoundException } from "@nestjs/common";

@Injectable()
export class StorageService {
  private readonly client = new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    region: process.env.MINIO_REGION,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? ""
    },
    forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE ?? "true") === "true"
  });

  constructor(private readonly prisma: PrismaService) {}

  async saveFile(params: {
    tenantId: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    fileKind: FileKind;
    createdByUserId?: string;
  }) {
    const extension = params.fileName.includes(".") ? params.fileName.split(".").pop() : "bin";
    const storageKey = `${params.tenantId}/${params.fileKind}/${randomUUID()}.${extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: process.env.MINIO_BUCKET,
        Key: storageKey,
        Body: params.buffer,
        ContentType: params.mimeType
      })
    );

    return this.prisma.storedFile.create({
      data: {
        tenantId: params.tenantId,
        storageKey,
        originalName: params.fileName,
        mimeType: params.mimeType,
        sizeBytes: params.buffer.byteLength,
        fileKind: params.fileKind,
        createdByUserId: params.createdByUserId
      }
    });
  }

  async getFileBuffer(tenantId: string, fileId: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, tenantId }
    });

    if (!file) {
      throw new NotFoundException("Archivo no encontrado");
    }

    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: process.env.MINIO_BUCKET,
        Key: file.storageKey
      })
    );

    const bytes = await object.Body?.transformToByteArray();

    return {
      file,
      buffer: Buffer.from(bytes ?? [])
    };
  }
}
