import type { RowEncryptionState } from "../lib/encryption-state";
import type { EventCategory } from "../generated/prisma/index.js";

export type CategoryWithCount = EventCategory & { usageCount: number };

export type CategoryCreateInput = {
  userId: string;
  name: string;
  color: string;
  encryptedName?: string;
  blindIndexTokens?: string[];
  encryptionState?: RowEncryptionState;
  encryptionKeyVersion?: number;
};

export type CategoryUpdateInput = {
  userId: string;
  categoryId: string;
  name?: string;
  color?: string;
  encryptedName?: string;
  blindIndexTokens?: string[];
  encryptionState?: RowEncryptionState;
  encryptionKeyVersion?: number;
};

export type CategoryDeleteInput = {
  userId: string;
  categoryId: string;
};

export interface ICategoryService {
  list(userId: string): Promise<{ categories: CategoryWithCount[] }>;
  create(input: CategoryCreateInput): Promise<EventCategory>;
  update(input: CategoryUpdateInput): Promise<EventCategory>;
  delete(input: CategoryDeleteInput): Promise<{ success: boolean; message: string }>;
}
