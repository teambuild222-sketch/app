export type PeopleList = {
  id: string;
  name: string;
  memberIds: string[];
  updatedAt: number;
};

const STORAGE_KEY = 'simsor-people-lists-v1';
export const PEOPLE_LISTS_CHANGED_EVENT = 'simsor-people-lists-changed';

function notify(): void {
  window.dispatchEvent(new CustomEvent(PEOPLE_LISTS_CHANGED_EVENT));
}

import { getPeopleListsCache } from '../../api/peopleListsCache';
import { isBackendEnabled } from '../../api/client';

export function loadPeopleLists(): PeopleList[] {
  if (isBackendEnabled()) return getPeopleListsCache();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PeopleList[]) : [];
  } catch {
    return [];
  }
}

function saveLists(lists: PeopleList[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  notify();
}

export function getPeopleList(id: string): PeopleList | undefined {
  return loadPeopleLists().find((list) => list.id === id);
}

/** Load lists from API when backend is on (no-op in mock mode). */
export async function ensurePeopleListsHydrated(): Promise<void> {
  if (!isBackendEnabled()) return;
  const { fetchPeopleLists } = await import('../../api/peopleListsApi');
  await fetchPeopleLists();
}

export function createPeopleList(name: string, memberIds: string[] = []): PeopleList {
  const list: PeopleList = {
    id: `list-${Date.now()}`,
    name: name.trim() || '✨',
    memberIds: [...new Set(memberIds)],
    updatedAt: Date.now(),
  };
  saveLists([list, ...loadPeopleLists()]);
  return list;
}

export function updatePeopleList(
  id: string,
  patch: Partial<Pick<PeopleList, 'name' | 'memberIds'>>,
): PeopleList | undefined {
  let updated: PeopleList | undefined;
  const next = loadPeopleLists().map((list) => {
    if (list.id !== id) return list;
    updated = {
      ...list,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() || '✨' : list.name,
      memberIds:
        patch.memberIds !== undefined ? [...new Set(patch.memberIds)] : list.memberIds,
      updatedAt: Date.now(),
    };
    return updated;
  });
  if (updated) saveLists(next);
  return updated;
}

export function deletePeopleList(id: string): void {
  saveLists(loadPeopleLists().filter((list) => list.id !== id));
}

export function toggleListMember(listId: string, memberId: string): PeopleList | undefined {
  const list = getPeopleList(listId);
  if (!list) return undefined;
  const has = list.memberIds.includes(memberId);
  const memberIds = has
    ? list.memberIds.filter((mid) => mid !== memberId)
    : [...list.memberIds, memberId];
  return updatePeopleList(listId, { memberIds });
}

/** Union of all member IDs across the given people lists. */
export function resolveMemberIdsFromLists(listIds: string[]): string[] {
  const ids = new Set<string>();
  for (const listId of listIds) {
    getPeopleList(listId)?.memberIds.forEach((memberId) => ids.add(memberId));
  }
  return [...ids];
}
