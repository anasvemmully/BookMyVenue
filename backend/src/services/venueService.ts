import { Prisma } from "@prisma/client";

import { prisma } from "../config/db.js";

import { cacheService } from "./cacheService.js";

export interface VenueFilters {
  city?: string;
  categoryId?: string;
  status?: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PUBLISHED";
  ownerId?: string;
  search?: string;
}

export class VenueService {
  private getCacheKey(id: string): string {
    return `venue:detail:${id}`;
  }

  async getVenueById(id: string) {
    const cacheKey = this.getCacheKey(id);
    const cached = await cacheService.get<unknown>(cacheKey);
    if (cached) return cached;

    const venue = await prisma.venue.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true, profile: true } },
        category: true,
        images: true,
        videos: true,
        amenities: { include: { amenity: true } },
        availability: { include: { ticketTiers: true } },
      },
    });

    if (venue) {
      await cacheService.set(cacheKey, venue, 3600);
    }

    return venue;
  }

  async getVenues(filters: VenueFilters = {}) {
    const where: Prisma.VenueWhereInput = {};

    if (filters.city) {
      where.city = { equals: filters.city, mode: "insensitive" };
    }
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.ownerId) {
      where.ownerId = filters.ownerId;
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return prisma.venue.findMany({
      where,
      include: { category: true, images: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async submitVenue(
    ownerId: string,
    data: {
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
    }
  ) {
    // Resolve CategoryId safely
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

    const venue = await prisma.venue.create({
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
        categoryId: categoryId,
        ownerId,
        status: "PENDING_REVIEW", // Awaiting Approval
        cleanUpBufferMinutes: data.cleanUpBufferMinutes || 0,
        advancePaymentAllowed: data.advancePaymentAllowed || false,
        minDepositPercentage: new Prisma.Decimal(data.minDepositPercentage ?? 100.0),
        bannerImageUrl: data.bannerImageUrl,
      },
    });

    await cacheService.deletePattern("venue:*");
    return venue;
  }

  async editVenue(
    id: string,
    ownerId: string,
    data: Partial<Parameters<VenueService["submitVenue"]>[1]>
  ) {
    const existing = await prisma.venue.findUnique({ where: { id } });
    if (!existing) throw new Error("Venue not found");
    if (existing.ownerId !== ownerId) throw new Error("Unauthorized to edit this listing");

    const updateData: Record<string, unknown> = { ...data };
    if (data.minDepositPercentage !== undefined) {
      updateData.minDepositPercentage = new Prisma.Decimal(data.minDepositPercentage);
    }

    const venue = await prisma.venue.update({
      where: { id },
      data: updateData,
    });

    await cacheService.delete(this.getCacheKey(id));
    await cacheService.deletePattern("venue:*");
    return venue;
  }

  async approveVenue(id: string, approve: boolean) {
    const status = approve ? "APPROVED" : "REJECTED";
    const venue = await prisma.venue.update({
      where: { id },
      data: { status },
    });

    await cacheService.delete(this.getCacheKey(id));
    await cacheService.deletePattern("venue:*");
    return venue;
  }

  async addAvailability(
    venueId: string,
    ownerId: string,
    data: {
      availableDate: Date;
      startTime: Date;
      endTime: Date;
      totalCapacity: number;
      pricePerTicket: number;
      ticketTiers?: Array<{ name: string; price: number; capacity: number }>;
    }
  ) {
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error("Venue not found");
    if (venue.ownerId !== ownerId) throw new Error("Unauthorized to add slot availability");

    // Overlap validation within availability slots
    const overlap = await prisma.venueAvailability.findFirst({
      where: {
        venueId,
        availableDate: data.availableDate,
        OR: [
          {
            AND: [{ startTime: { lte: data.startTime } }, { endTime: { gt: data.startTime } }],
          },
          {
            AND: [{ startTime: { lt: data.endTime } }, { endTime: { gte: data.endTime } }],
          },
        ],
      },
    });

    if (overlap) throw new Error("Time slot overlaps with existing availability");

    const availability = await prisma.venueAvailability.create({
      data: {
        venueId,
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

    await cacheService.delete(this.getCacheKey(venueId));
    return availability;
  }

  async configureTicketTiers(
    availabilityId: string,
    ownerId: string,
    tiers: Array<{ name: string; price: number; capacity: number }>
  ) {
    const availability = await prisma.venueAvailability.findUnique({
      where: { id: availabilityId },
      include: { venue: true },
    });

    if (!availability) throw new Error("Availability slot not found");
    if (availability.venue.ownerId !== ownerId) throw new Error("Unauthorized to configure tiers");

    // Clear existing tiers first
    await prisma.ticketTier.deleteMany({ where: { availabilityId } });

    // Create new tiers
    const createdTiers = await prisma.ticketTier.createMany({
      data: tiers.map((tier) => ({
        availabilityId,
        name: tier.name,
        price: new Prisma.Decimal(tier.price),
        capacity: tier.capacity,
      })),
    });

    await cacheService.delete(this.getCacheKey(availability.venueId));
    return createdTiers;
  }
}

export const venueService = new VenueService();
