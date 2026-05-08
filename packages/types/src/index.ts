export type Role = "Admin" | "Staff";
export type Sex = "Male" | "Female" | "Other";
export type VisitType = "WalkIn" | "HomeCollection";
export type VisitStatus = "Open" | "Completed" | "Cancelled";
export type TestCategory = "Blood" | "Urine" | "Stool" | "Other";
export type ResultType = "Numeric" | "Qualitative";
export type VisitTestStatus =
  | "Collected"
  | "Processing"
  | "Outsourced"
  | "ResultEntered"
  | "Verified"
  | "Ready";
export type PaymentMethod = "Cash" | "Online" | "Mixed";
export type PaymentStatus = "Pending" | "Partial" | "Paid";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

export interface IpcOk<T> { ok: true; data: T; }
export interface IpcErr   { ok: false; error: { code: string; message: string }; }
export type IpcResult<T>  = IpcOk<T> | IpcErr;
