// Razorpay payment-related shared types

export type RazorpayMode = "Off" | "Test" | "Live";

export type PaymentLinkStatus =
  | "Created"
  | "Paid"
  | "Expired"
  | "Cancelled"
  | "PollFailed";

export interface CreateLinkResult {
  id: string;
  shortUrl: string;
  expiresAt: Date;
}

export interface CreateQrResult {
  id: string;
  imageUrl: string;
  expiresAt: Date;
}

export interface PaymentSnapshot {
  status: "created" | "paid" | "expired" | "cancelled";
  paidAt?: Date;
  amountPaise: number;
  paymentId?: string;
}

export interface ClassifiedError {
  retryable: boolean;
  userMessage: string;
  raw?: unknown;
}
