import { timingSafeEqual } from "crypto";
import { FastifyReply, FastifyRequest } from "fastify";

export const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("cache-control", "no-store");
    const token = process.env.STARPOINT_ADMIN_TOKEN;
    if (!token) {
        return reply.status(503).send({ error: "Unavailable", message: "Admin mutation tools are disabled." });
    }
    const expected = Buffer.from(token);
    const supplied = /^Bearer (.+)$/i.exec(request.headers.authorization ?? "")?.[1] ?? "";
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        reply.header("www-authenticate", "Bearer");
        return reply.status(401).send({ error: "Unauthorized", message: "An admin token is required." });
    }
    const mediaType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
        return reply.status(415).send({ error: "Unsupported Media Type", message: "Admin mutations require application/json." });
    }
};
