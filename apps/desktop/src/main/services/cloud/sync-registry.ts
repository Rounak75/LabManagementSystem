import { syncEngine } from "./sync-engine";

import { pullPaymentEvents } from "./payment-events";
import { pullBookings } from "./pull-bookings";
import { pullDisputes } from "./pull-disputes";
import { pullPatients } from "./pull-patients";
import { pullVisits } from "./pull-visits";
import { pullResults } from "./pull-results";
import { pullPayments } from "./pull-payments";
import { pullVerifications } from "./pull-verifications";
import { pullPrintJobs } from "./pull-print-jobs";

// Phase 3d Plan A: push a heartbeat row on every tick so the patient portal
// can show "data may be out of date" when the desktop is offline.
async function tickHeartbeat(client: any): Promise<void> {
  await client.pushHeartbeat();
}

syncEngine.register({ name: "payment-events", pull: pullPaymentEvents, priority: 10 });
syncEngine.register({ name: "bookings", pull: pullBookings, priority: 10 });
syncEngine.register({ name: "disputes", pull: pullDisputes, priority: 10 });

// Admin-portal pull modules. Explicit dependencies guarantee correct execution order
// so foreign keys resolve properly (patients -> visits -> results -> payments/verifications).
syncEngine.register({ name: "patients", pull: pullPatients });
syncEngine.register({ name: "visits", pull: pullVisits, dependencies: ["patients"] });
syncEngine.register({ name: "results", pull: pullResults, dependencies: ["visits"] });
syncEngine.register({ name: "payments", pull: pullPayments, dependencies: ["visits"] });
syncEngine.register({ name: "verifications", pull: pullVerifications, dependencies: ["results"] });
syncEngine.register({ name: "print-jobs", pull: pullPrintJobs, dependencies: ["visits"] });

syncEngine.register({ name: "heartbeat", pull: tickHeartbeat, priority: -10 });
