import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { validateRequiredEnv } from "./common/env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  validateRequiredEnv();
  app.enableCors({
    origin: [process.env.WEB_BASE_URL ?? "http://localhost:3001"],
    credentials: true
  });
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(4000, "0.0.0.0");
}

bootstrap();
