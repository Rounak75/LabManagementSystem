import { domainEvents } from "./events";
import { audit } from "@main/services/audit.service";
import * as triggers from "@main/services/notifications/triggers";

domainEvents.on("VisitCreated", async (payload: { visit: any }) => {
  const { visit } = payload;
  await audit("CREATE", "Visit", visit.id);
  triggers.visitBooked(visit.id).catch(err =>
    console.error("[notifications] visitBooked trigger failed", err)
  );
});

domainEvents.on("OutsourcedTestSent", async (payload: { visitTest: any }) => {
  const { visitTest } = payload;
  await audit(
    "OUTSOURCED_SENT",
    "VisitTest",
    visitTest.id,
    JSON.stringify({ sentTo: visitTest.outsourcedSentTo })
  );
});
