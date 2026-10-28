import type { FileMetadata } from '../types';

export const pendingUploadedFileByChat: Record<string, FileMetadata | null> = {};
