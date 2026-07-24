import { useMemo, useState, useEffect } from "react";
import {
  slotsAvailableOn,
  restrictionForSlots,
  type LabConfig,
  type ClosureRow,
  type Slot,
  type CollectionTimeRestriction,
} from "@portal/lib/lab-status";

interface Test {
  id: string;
  name: string;
  price: number;
  category: string;
  collectionTimeRestriction: CollectionTimeRestriction;
}

const ALL_SLOTS: readonly Slot[] = ["Morning", "Afternoon", "Evening"];

export function useBookingState(
  tests: Test[],
  blackoutDates: string[],
  cfg: LabConfig | null,
  closures: ClosureRow[]
) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<Slot>("Morning");
  const [notes, setNotes] = useState("");
  const [testIds, setTestIds] = useState<string[]>([]);
  
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);

  // Derived state
  const selectedTests = tests.filter((t) => testIds.includes(t.id));
  const total = selectedTests.reduce((s, t) => s + t.price, 0);
  const requiredSlots = restrictionForSlots(selectedTests);
  const restrictedTest = selectedTests.find((t) => t.collectionTimeRestriction);

  function isBlackedOut(d: string) {
    return blackoutDates.includes(d);
  }

  const availableSlots = useMemo<readonly Slot[]>(() => {
    if (!cfg || !date) return ALL_SLOTS;
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return ALL_SLOTS;
    let slots: readonly Slot[] = slotsAvailableOn(cfg, closures, parsed);
    if (requiredSlots) slots = slots.filter((s) => requiredSlots.includes(s));
    return slots;
  }, [cfg, closures, date, requiredSlots]);

  // Auto-correct slot if not available
  useEffect(() => {
    if (availableSlots.length === 0) return;
    if (!availableSlots.includes(slot)) {
      setSlot(availableSlots[0]!);
    }
  }, [availableSlots, slot]);

  // Actions
  function toggleTest(id: string) {
    setTestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submitBooking(captchaToken: string, captchaAnswer: string) {
    setError(null);
    if (testIds.length === 0) {
      setError("Please choose at least one test.");
      return false;
    }
    if (!date) {
      setError("Please pick a preferred date.");
      return false;
    }
    if (isBlackedOut(date)) {
      setError("The lab is closed on that date — please pick another.");
      return false;
    }
    if (availableSlots.length === 0) {
      setError("No slots are available on that date. Please pick another date.");
      return false;
    }

    const answerNum = parseInt(captchaAnswer, 10);
    if (!Number.isFinite(answerNum)) {
      setError("Please answer the question at the bottom.");
      return false;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: name,
          patientPhone: phone,
          patientEmail: email || null,
          address,
          pincode: pincode || null,
          testIds,
          preferredDate: date,
          preferredSlot: slot,
          notes: notes || null,
          captchaToken,
          captchaAnswer: answerNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "captcha_failed") {
          setError("That answer wasn't right. Please try the new question.");
        } else {
          setError(data.message ?? data.error ?? "Failed to create booking.");
        }
        setSubmitting(false);
        return null;
      }
      setBookingId(data.bookingId);
      return data.bookingId as string;
    } catch (err: any) {
      setError(err.message || "Failed to connect to server.");
      setSubmitting(false);
      return null;
    }
  }

  return {
    state: {
      name, phone, email, address, pincode, date, slot, notes, testIds,
      error, submitting, bookingId,
      selectedTests, total, requiredSlots, restrictedTest, availableSlots,
    },
    actions: {
      setName, setPhone, setEmail, setAddress, setPincode, setDate, setSlot, setNotes,
      toggleTest, isBlackedOut, submitBooking, setError
    }
  };
}
