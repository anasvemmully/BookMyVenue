import { Prisma } from "@prisma/client";

import { prisma } from "../config/db";

import type { Request, Response, NextFunction } from "express";

export interface VenueFilters {
  city?: string;
  categoryId?: string;
  status?: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PUBLISHED";
  ownerId?: string;
  search?: string;
}

type VenueSubmitPayload = {
  title: string;
  description?: string;
  venueType?: "OFFLINE" | "ONLINE" | "HYBRID";
  indoorOutdoor?: "INDOOR" | "OUTDOOR" | "BOTH";
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  categoryId?: string;
  cleanUpBufferMinutes?: number;
  advancePaymentAllowed?: boolean;
  minDepositPercentage?: number;
  bannerImageUrl?: string;
};

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = req.query as unknown as VenueFilters;
    const where: Prisma.VenueWhereInput = {};

    if (filters.city) where.city = { equals: filters.city, mode: "insensitive" };
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.status) where.status = filters.status;
    if (filters.ownerId) where.ownerId = filters.ownerId;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const result = await prisma.venue.findMany({
      where,
      include: { category: true, images: true },
      orderBy: { createdAt: "desc" },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.venue.findUnique({
      where: { id: req.params.id as string },
      include: {
        owner: { select: { id: true, email: true, profile: true } },
        category: true,
        images: true,
        videos: true,
        amenities: { include: { amenity: true } },
        availability: { include: { ticketTiers: true } },
      },
    });

    if (!result) {
      return res.status(404).json({ error: "Venue not found" });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: VenueSubmitPayload = req.body;
    let categoryId = data.categoryId;

    if (!categoryId) {
      const defaultCategory = await prisma.venueCategory.upsert({
        where: { slug: "default" },
        update: {},
        create: { name: "Default Category", slug: "default" },
      });
      categoryId = defaultCategory.id;
    }

    const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

    const result = await prisma.venue.create({
      data: {
        title: data.title,
        slug,
        description: data.description,
        venueType: data.venueType || "OFFLINE",
        indoorOutdoor: data.indoorOutdoor || "INDOOR",
        addressLine1: data.addressLine1,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        categoryId,
        ownerId: req.user!.id,
        status: "PENDING_REVIEW",
        cleanUpBufferMinutes: data.cleanUpBufferMinutes || 0,
        advancePaymentAllowed: data.advancePaymentAllowed || false,
        minDepositPercentage: new Prisma.Decimal(data.minDepositPercentage ?? 100.0),
        bannerImageUrl: data.bannerImageUrl,
      },
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const edit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.venue.findUnique({ where: { id: req.params.id as string } });
    if (!existing) throw new Error("Venue not found");
    if (existing.ownerId !== req.user!.id) throw new Error("Unauthorized to edit this listing");

    const data: Partial<VenueSubmitPayload> = req.body;
    const updateData: Record<string, unknown> = { ...data };
    if (data.minDepositPercentage !== undefined) {
      updateData.minDepositPercentage = new Prisma.Decimal(data.minDepositPercentage);
    }

    const result = await prisma.venue.update({
      where: { id: req.params.id as string },
      data: updateData,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const approve = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.body.approve === true ? "APPROVED" : "REJECTED";
    const result = await prisma.venue.update({
      where: { id: req.params.id as string },
      data: { status },
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const addAvailabilitySlot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const venue = await prisma.venue.findUnique({ where: { id: req.params.id as string } });
    if (!venue) throw new Error("Venue not found");
    if (venue.ownerId !== req.user!.id) throw new Error("Unauthorized to add slot availability");

    const data = {
      availableDate: new Date(req.body.availableDate),
      startTime: new Date(req.body.startTime),
      endTime: new Date(req.body.endTime),
      totalCapacity: Number(req.body.totalCapacity),
      pricePerTicket: Number(req.body.pricePerTicket),
      ticketTiers: req.body.ticketTiers as
        | Array<{ name: string; price: number; capacity: number }>
        | undefined,
    };

    const overlap = await prisma.venueAvailability.findFirst({
      where: {
        venueId: req.params.id as string,
        availableDate: data.availableDate,
        OR: [
          { AND: [{ startTime: { lte: data.startTime } }, { endTime: { gt: data.startTime } }] },
          { AND: [{ startTime: { lt: data.endTime } }, { endTime: { gte: data.endTime } }] },
        ],
      },
    });
    if (overlap) throw new Error("Time slot overlaps with existing availability");

    const result = await prisma.venueAvailability.create({
      data: {
        venueId: req.params.id as string,
        availableDate: data.availableDate,
        startTime: data.startTime,
        endTime: data.endTime,
        totalCapacity: data.totalCapacity,
        pricePerTicket: new Prisma.Decimal(data.pricePerTicket),
        ticketTiers: data.ticketTiers
          ? {
              create: data.ticketTiers.map((tier) => ({
                name: tier.name,
                price: new Prisma.Decimal(tier.price),
                capacity: tier.capacity,
              })),
            }
          : undefined,
      },
      include: { ticketTiers: true },
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const setTicketTiers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const availability = await prisma.venueAvailability.findUnique({
      where: { id: req.params.id as string },
      include: { venue: true },
    });
    if (!availability) throw new Error("Availability slot not found");
    if (availability.venue.ownerId !== req.user!.id)
      throw new Error("Unauthorized to configure tiers");

    const tiers: Array<{ name: string; price: number; capacity: number }> = req.body.tiers;

    await prisma.ticketTier.deleteMany({ where: { availabilityId: req.params.id as string } });

    const result = await prisma.ticketTier.createMany({
      data: tiers.map((tier) => ({
        availabilityId: req.params.id as string,
        name: tier.name,
        price: new Prisma.Decimal(tier.price),
        capacity: tier.capacity,
      })),
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const venueController = {
  getAll,
  getById,
  create,
  edit,
  approve,
  addAvailabilitySlot,
  setTicketTiers,
};
