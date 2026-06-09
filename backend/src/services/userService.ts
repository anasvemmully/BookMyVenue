import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";

import type { UpdateProfileInput } from "../validators/userSchemas.js";
import type { User, UserProfile } from "@prisma/client";

type UserWithProfile = User & { profile: UserProfile | null };

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

function buildProfileData(input: UpdateProfileInput) {
  const data: {
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

  if (input.firstName !== undefined) {
    data.firstName = input.firstName;
  }
  if (input.lastName !== undefined) {
    data.lastName = input.lastName;
  }
  if (input.bio !== undefined) {
    data.bio = input.bio;
  }
  if (input.dateOfBirth !== undefined) {
    data.dateOfBirth = new Date(input.dateOfBirth);
  }
  if (input.gender !== undefined) {
    data.gender = input.gender;
  }
  if (input.address !== undefined) {
    data.address = input.address;
  }
  if (input.city !== undefined) {
    data.city = input.city;
  }
  if (input.state !== undefined) {
    data.state = input.state;
  }
  if (input.country !== undefined) {
    data.country = input.country;
  }
  if (input.pincode !== undefined) {
    data.pincode = input.pincode;
  }
  if (input.avatarUrl !== undefined) {
    data.avatarUrl = input.avatarUrl;
  }

  return data;
}

export async function getUserProfile(userId: string) {
  const user = await findActiveUserWithProfile(userId);

  return {
    user: toPublicUser(user),
  };
}

export async function updateUserProfile(userId: string, input: UpdateProfileInput) {
  await findActiveUserWithProfile(userId);

  const profileData = buildProfileData(input);

  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      ...profileData,
    },
    update: profileData,
  });

  const user = await findActiveUserWithProfile(userId);

  return {
    user: toPublicUser(user),
  };
}
