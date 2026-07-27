import type { FastifyInstance } from "fastify";
import { prisma } from "@venture-pilot/db";
import { CreateProductSchema, CreateProductVersionSchema, NotFoundError, actorToJson } from "@venture-pilot/shared";
import type { Prisma } from "@venture-pilot/db";
import { parseBody } from "../lib/validate.js";

export function registerProductRoutes(app: FastifyInstance): void {
  app.post("/products", async (request, reply) => {
    const body = parseBody(CreateProductSchema, request.body);
    const product = await prisma.product.create({ data: body });
    await prisma.auditEvent.create({
      data: {
        actorJson: actorToJson(request.actor!) as Prisma.InputJsonValue,
        action: "product.registered",
        newStateJson: { productId: product.id, key: product.key } as Prisma.InputJsonValue,
        reason: "Admin registered a new product",
        relatedProductId: product.id,
        sourceRoute: "POST /products",
        authorityClassification: "admin_action",
      },
    });
    reply.status(201).send(product);
  });

  app.get("/products", async () => {
    return prisma.product.findMany({
      include: { versions: { where: { isActive: true }, orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "asc" },
    });
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (request) => {
    const product = await prisma.product.findUnique({
      where: { id: request.params.id },
      include: {
        versions: {
          include: { features: true, healthChecks: true },
          orderBy: { createdAt: "desc" },
        },
        environmentTypes: true,
        datasets: { include: { versions: { orderBy: { createdAt: "desc" } } } },
      },
    });
    if (!product) throw new NotFoundError("Product", request.params.id);
    return product;
  });

  app.post<{ Params: { id: string } }>("/products/:id/versions", async (request, reply) => {
    const body = parseBody(CreateProductVersionSchema, request.body);
    const product = await prisma.product.findUnique({ where: { id: request.params.id } });
    if (!product) throw new NotFoundError("Product", request.params.id);

    const version = await prisma.productVersion.create({
      data: {
        productId: product.id,
        version: body.version,
        adapterKey: body.adapterKey,
        releaseNotes: body.releaseNotes,
        features: { create: body.features },
        healthChecks: { create: body.healthChecks },
      },
      include: { features: true, healthChecks: true },
    });

    for (const envType of body.environmentTypes) {
      await prisma.productEnvironmentType.upsert({
        where: { productId_key: { productId: product.id, key: envType.key } },
        update: { label: envType.label, description: envType.description },
        create: { productId: product.id, ...envType },
      });
    }

    await prisma.auditEvent.create({
      data: {
        actorJson: actorToJson(request.actor!) as Prisma.InputJsonValue,
        action: "product.version_registered",
        newStateJson: { productId: product.id, versionId: version.id, version: body.version } as Prisma.InputJsonValue,
        reason: "Admin registered a new product version",
        relatedProductId: product.id,
        sourceRoute: "POST /products/:id/versions",
        authorityClassification: "admin_action",
      },
    });

    reply.status(201).send(version);
  });
}
