import type {
  Account,
  InfluencerProfile,
  Plan,
  PlanCategory,
  PlanContent,
  Video,
  ChatSession,
  ChatMessage,
  WorkoutLog,
  WorkoutExercise,
  MealLog,
  MealItem,
  Subscription,
  UserRole,
} from './entities.js';

// ============================================================
// AUTH
// ============================================================

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  role: Extract<UserRole, 'user' | 'influencer'>;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  account: Omit<Account, 'stripeCustomerId'>;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface MeResponse {
  account: Omit<Account, 'stripeCustomerId'>;
  influencerProfile?: InfluencerProfile;
  subscriptions: Subscription[];
}

// ============================================================
// INFLUENCER PROFILES
// ============================================================

export interface UpdateInfluencerProfileRequest {
  bio?: string;
  personaPrompt?: string;
  specialtyTags?: string[];
  displayName?: string;
}

export interface ListInfluencersQuery {
  page?: number;
  limit?: number;
  tags?: string[];
  search?: string;
}

export interface ListInfluencersResponse {
  influencers: (InfluencerProfile & { displayName: string; avatarUrl: string | null })[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================
// PLANS
// ============================================================

export interface CreatePlanRequest {
  title: string;
  description?: string;
  category: PlanCategory;
  content: PlanContent;
  coverImageUrl?: string;
}

export interface UpdatePlanRequest {
  title?: string;
  description?: string;
  category?: PlanCategory;
  content?: PlanContent;
  coverImageUrl?: string;
  isPublished?: boolean;
}

export interface ListPlansQuery {
  page?: number;
  limit?: number;
  category?: PlanCategory;
  influencerId?: string;
}

export interface ListPlansResponse {
  plans: Plan[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================
// VIDEOS
// ============================================================

export interface CreateVideoRequest {
  title: string;
  description?: string;
  relatedPlanId?: string;
  contentType: string; // MIME type for presigned URL
}

export interface CreateVideoResponse {
  video: Video;
  uploadUrl: string; // Presigned S3 URL
}

// ============================================================
// CHAT
// ============================================================

export interface CreateChatSessionRequest {
  influencerId: string;
}

export interface SendMessageRequest {
  content: string;
}

export interface ListChatSessionsResponse {
  sessions: ChatSession[];
}

export interface GetChatHistoryResponse {
  messages: ChatMessage[];
}

// ============================================================
// WORKOUT TRACKING
// ============================================================

export interface CreateWorkoutLogRequest {
  loggedAt?: string;
  notes?: string;
  planId?: string;
  exercises: Omit<WorkoutExercise, 'id' | 'logId'>[];
}

export interface UpdateWorkoutLogRequest {
  loggedAt?: string;
  notes?: string;
  exercises?: Omit<WorkoutExercise, 'id' | 'logId'>[];
}

export interface ListWorkoutLogsQuery {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

// ============================================================
// MEAL TRACKING
// ============================================================

export interface CreateMealLogRequest {
  loggedAt?: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  notes?: string;
  items: Omit<MealItem, 'id' | 'mealLogId'>[];
}

export interface UpdateMealLogRequest {
  loggedAt?: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  notes?: string;
  items?: Omit<MealItem, 'id' | 'mealLogId'>[];
}

export interface ListMealLogsQuery {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================

export interface CreateInfluencerSubscriptionResponse {
  checkoutUrl: string;
}

export interface CreateUserSubscriptionRequest {
  influencerId: string;
}

export interface CreateUserSubscriptionResponse {
  checkoutUrl: string;
}

export interface CreatePortalSessionResponse {
  portalUrl: string;
}

// ============================================================
// UPLOADS
// ============================================================

export interface PresignRequest {
  contentType: string;
  filename: string;
}

export interface PresignResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

// ============================================================
// GENERIC
// ============================================================

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
