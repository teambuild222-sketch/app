import type { JoinFormField } from '../api/communitiesApi';
import { apiGet, apiPost, isBackendEnabled } from '../api/client';
import { API_ROUTES } from '../api/types';

export type JoinFormRequest = {
  eventId: string;
  communityName: string;
  fields: JoinFormField[];
};

type Handler = (request: JoinFormRequest) => Promise<Record<string, string> | null>;

let handler: Handler | null = null;

export function registerJoinFormHandler(next: Handler | null): void {
  handler = next;
}

export async function collectJoinAnswers(eventId: string): Promise<Record<string, string> | undefined> {
  if (!isBackendEnabled()) return undefined;
  const form = await apiGet<{
    verified: boolean;
    communityName: string;
    fields: JoinFormField[];
  }>(API_ROUTES.eventJoinForm(eventId));
  const required = (form.fields || []).filter((field) => field.required);
  if (!form.verified || (form.fields || []).length === 0) return {};
  if (!handler) {
    if (required.length) throw new Error('Join form is required for this official club event');
    return {};
  }
  const answers = await handler({
    eventId,
    communityName: form.communityName,
    fields: form.fields,
  });
  if (answers === null) throw new Error('Join cancelled');
  return answers;
}

export async function joinEventWithAnswers(
  eventId: string,
  answers: Record<string, string>,
): Promise<{ conversationId?: string }> {
  const res = await apiPost<{ joined: boolean; conversationId?: string | null }>(
    API_ROUTES.eventJoin(eventId),
    { answers },
  );
  return { conversationId: res.conversationId ?? undefined };
}
