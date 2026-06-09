import { Prisma } from "@prisma/client";

import { prisma } from "../config/db";

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

export async function getVenueById(id: string) {
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

  return venue;
}

export async function getVenues(filters: VenueFilters = {}) {
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

export async function submitVenue(ownerId: string, data: VenueSubmitPayload) {
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
      categoryId,
      ownerId,
      status: "PENDING_REVIEW",
      cleanUpBufferMinutes: data.cleanUpBufferMinutes || 0,
      advancePaymentAllowed: data.advancePaymentAllowed || false,
      minDepositPercentage: new Prisma.Decimal(data.minDepositPercentage ?? 100.0),
      bannerImageUrl: data.bannerImageUrl,
    },
  });

  return venue;
}

export async function editVenue(id: string, ownerId: string, data: Partial<VenueSubmitPayload>) {
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

  return venue;
}

export async function approveVenue(id: string, approve: boolean) {
  const status = approve ? "APPROVED" : "REJECTED";
  const venue = await prisma.venue.update({
    where: { id },
    data: { status },
  });

  return venue;
}

export async function addAvailability(
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

  return availability;
}

export async function configureTicketTiers(
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

  await prisma.ticketTier.deleteMany({ where: { availabilityId } });

  const createdTiers = await prisma.ticketTier.createMany({
    data: tiers.map((tier) => ({
      availabilityId,
      name: tier.name,
      price: new Prisma.Decimal(tier.price),
      capacity: tier.capacity,
    })),
  });

  return createdTiers;
}

export const venueService = {
  getVenueById,
  getVenues,
  submitVenue,
  editVenue,
  approveVenue,
  addAvailability,
  configureTicketTiers,
};
