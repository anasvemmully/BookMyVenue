import { prisma } from "../config/db";
import { AppError } from "../utils/AppError";

import type { UpdateProfileInput } from "../validators/userSchemas";
import type { User, UserProfile } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

type UserWithProfile = User & { profile: UserProfile | null };

type UserRequest = Request & {
  user: {
    id: string;
    email: string;
    role: string;
  };
};

function toPublicProfile(profile: UserProfile | null) {
  if (!profile) {
    return null;
  }

  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    bio: profile.bio,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    country: profile.country,
    pincode: profile.pincode,
    avatarUrl: profile.avatarUrl,
  };
}

function toPublicUser(user: UserWithProfile) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isVerified: user.isVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
    profile: toPublicProfile(user.profile),
  };
}

async function findActiveUserWithProfile(userId: string): Promise<UserWithProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });

  if (!user || user.deletedAt) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }

  if (!user.isActive) {
    throw new AppError(
      403,
      "ACCOUNT_SUSPENDED",
      "Your account has been suspended. Please contact support."
    );
  }

  return user;
}

export async function getMe(req: UserRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await findActiveUserWithProfile(req.user.id);
    res.status(200).json({ success: true, data: { user: toPublicUser(user) } });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(
  req: UserRequest & { body: UpdateProfileInput },
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await findActiveUserWithProfile(req.user.id);

    const input = req.body;
    const profileData: {
      firstName?: string;
      lastName?: string;
      bio?: string;
      dateOfBirth?: Date;
      gender?: UserProfile["gender"];
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      pincode?: string;
      avatarUrl?: string;
    } = {};

    if (input.firstName !== undefined) profileData.firstName = input.firstName;
    if (input.lastName !== undefined) profileData.lastName = input.lastName;
    if (input.bio !== undefined) profileData.bio = input.bio;
    if (input.dateOfBirth !== undefined) profileData.dateOfBirth = new Date(input.dateOfBirth);
    if (input.gender !== undefined) profileData.gender = input.gender;
    if (input.address !== undefined) profileData.address = input.address;
    if (input.city !== undefined) profileData.city = input.city;
    if (input.state !== undefined) profileData.state = input.state;
    if (input.country !== undefined) profileData.country = input.country;
    if (input.pincode !== undefined) profileData.pincode = input.pincode;
    if (input.avatarUrl !== undefined) profileData.avatarUrl = input.avatarUrl;

    await prisma.userProfile.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...profileData },
      update: profileData,
    });

    const updatedUser = await findActiveUserWithProfile(req.user.id);
    res.status(200).json({ success: true, data: { user: toPublicUser(updatedUser) } });
  } catch (error) {
    next(error);
  }
}
