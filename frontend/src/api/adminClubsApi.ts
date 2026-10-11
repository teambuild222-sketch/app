import { apiGet, apiPatch } from './client';
import { API_ROUTES } from './types';

export type ClubRequirement = { id: string; label: string; met: boolean };

export type AdminClub = {
  id: string;
  name: string;
  avatarUrl: string;
  memberCount: number;
  creatorId: string;
  verified: boolean;
  verifiedAt?: string | null;
  verificationNote: string;
  requirements: ClubRequirement[];
  notionStatus: string;
};

export async function listAdminClubs(): Promise<AdminClub[]> {
  return apiGet<AdminClub[]>(API_ROUTES.adminCommunities);
}

export async function setClubVerified(
  communityId: string,
  verified: boolean,
  note = '',
): Promise<AdminClub> {
  return apiPatch<AdminClub>(API_ROUTES.adminCommunityVerification(communityId), { verified, note });
}
