/** Post comments (backend: /api/posts/:id/comments). */
import { apiDelete, apiGet, apiPost } from './client';
import { API_ROUTES, type CommentDto } from './types';

export async function listComments(postId: string): Promise<CommentDto[]> {
  return apiGet<CommentDto[]>(API_ROUTES.postComments(postId));
}

export async function addComment(postId: string, text: string): Promise<CommentDto> {
  return apiPost<CommentDto>(API_ROUTES.postComments(postId), { text });
}

export async function deleteComment(postId: string, commentId: string): Promise<void> {
  await apiDelete(API_ROUTES.postCommentById(postId, commentId));
}
