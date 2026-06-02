import { venueService, type VenueFilters } from "../services/venueService.js";

import type { Request, Response, NextFunction } from "express";

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await venueService.getVenues(req.query as unknown as VenueFilters);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await venueService.getVenueById(req.params.id as string);
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
    const result = await venueService.submitVenue(req.user!.userId, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const edit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await venueService.editVenue(
      req.params.id as string,
      req.user!.userId,
      req.body
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const approve = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { approve } = req.body;
    const result = await venueService.approveVenue(req.params.id as string, approve === true);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const addAvailabilitySlot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await venueService.addAvailability(req.params.id as string, req.user!.userId, {
      availableDate: new Date(req.body.availableDate),
      startTime: new Date(req.body.startTime),
      endTime: new Date(req.body.endTime),
      totalCapacity: Number(req.body.totalCapacity),
      pricePerTicket: Number(req.body.pricePerTicket),
      ticketTiers: req.body.ticketTiers,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const setTicketTiers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await venueService.configureTicketTiers(
      req.params.id as string,
      req.user!.userId,
      req.body.tiers
    );
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
