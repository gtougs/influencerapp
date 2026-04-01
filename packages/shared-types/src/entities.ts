// ============================================================
// ENUMS
// ============================================================

export type UserRole = 'user' | 'influencer' | 'admin';

export type PlanCategory =
  | 'workout'
  | 'diet'
  | 'schedule'
  | 'habit'
  | 'mindset'
  | 'other';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid';

export type VideoStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type ChunkStatus = 'pending' | 'indexed' | 'failed';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type ChatRole = 'user' | 'assistant';

// ============================================================
// CORE ENTITIES
// ============================================================

export interface Account {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  avatarUrl: string | null;
  isEmailVerified: boolean;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InfluencerProfile {
  id: string;
  accountId: string;
  handle: string;
  bio: string | null;
  personaPrompt: string | null;
  specialtyTags: string[];
  followerCount: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  account?: Pick<Account, 'displayName' | 'avatarUrl' | 'email'>;
}

export interface Subscription {
  id: string;
  accountId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  influencerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  influencerId: string;
  title: string;
  description: string | null;
  category: PlanCategory;
  content: PlanContent;
  coverImageUrl: string | null;
  isPublished: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanSection {
  id: string;
  heading: string;
  body: string;
}

export interface PlanContent {
  sections: PlanSection[];
}

export interface Video {
  id: string;
  influencerId: string;
  title: string;
  description: string | null;
  s3Key: string;
  cdnUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  status: VideoStatus;
  relatedPlanId: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  influencerId: string;
  planId: string | null;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  status: ChunkStatus;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userAccountId: string;
  influencerId: string;
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
  // Joined
  influencer?: Pick<InfluencerProfile, 'handle'> & { displayName: string };
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  retrievedChunkIds: string[] | null;
  createdAt: string;
}

export interface WorkoutLog {
  id: string;
  accountId: string;
  loggedAt: string;
  notes: string | null;
  planId: string | null;
  exercises?: WorkoutExercise[];
}

export interface WorkoutExercise {
  id: string;
  logId: string;
  exerciseName: string;
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
  durationSecs: number | null;
  notes: string | null;
}

export interface MealLog {
  id: string;
  accountId: string;
  loggedAt: string;
  mealType: MealType | null;
  notes: string | null;
  items?: MealItem[];
}

export interface MealItem {
  id: string;
  mealLogId: string;
  foodName: string;
  quantityGrams: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}
