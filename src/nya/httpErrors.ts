import { FastifyInstance } from "fastify";

export const registerErrorHandlers = (fastify: FastifyInstance) => {
    fastify.setNotFoundHandler((request, reply) => {
        console.log("Request not found", { method: request.method, route: "unmatched" });
        return reply.status(404).send({ error: "Not Found" });
    });

    fastify.setErrorHandler((error, request, reply) => {
        const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
        console.error("Request failed", {
            status,
            method: request.method,
            route: request.routeOptions.url ?? "unmatched",
            code: error.code ?? "UNEXPECTED_ERROR"
        });
        return reply.status(status).send({ error: status < 500 ? "Bad Request" : "Internal Server Error" });
    });
};
