import fp from "fastify-plugin";
import { AppError } from "../utils/errors";
import { ZodError } from "zod";
import type { FastifyError, FastifyRequest, FastifyReply } from "fastify";

export const errorHandler = fp(async (app) => {
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues.map((e) => ({ path: e.path.join("."), message: e.message })),
      });
    }

    // Postgres unique violation or foreign key violation
    if (["23505", "23503"].includes((error as unknown as Record<string, unknown>).code as string)) {
      return reply.code(409).send({
        code: "CONFLICT",
        message: "Resource already exists or has dependencies",
      });
    }

    // Fastify validation error
    const fastifyErr = error as FastifyError;
    if (fastifyErr.validation) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: fastifyErr.validation,
      });
    }

    // Fastify JSON body error
    if ((error as FastifyError).code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      return reply.code(400).send({
        code: "BAD_REQUEST",
        message: "Request body cannot be empty",
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  });
});